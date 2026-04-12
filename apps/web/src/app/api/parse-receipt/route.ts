import { NextResponse } from "next/server";
import type { ParsedReceipt } from "@owez/shared";

/**
 * POST /api/parse-receipt
 *
 * Accepts a multipart upload (field "receipt") and parses it with the Mindee
 * V2 API. V2 is asynchronous-only: we enqueue the file, poll the job until
 * it finishes, then fetch the inference result. All of that happens inside
 * this single route handler so the client sees a normal synchronous request.
 *
 * Setup:
 *   1. Sign up at https://platform.mindee.com/
 *   2. Create/choose a receipt model — either the off-the-shelf "Expense
 *      Receipts" OTS model or a custom one — and copy its model_id (a UUID).
 *   3. Put the key + model_id in .env.local:
 *        MINDEE_API_KEY=...
 *        MINDEE_MODEL_ID=...
 */

const MINDEE_BASE = "https://api-v2.mindee.net/v2";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  const apiKey = process.env.MINDEE_API_KEY;
  const modelId = process.env.MINDEE_MODEL_ID;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MINDEE_API_KEY not set. Copy .env.example to .env.local" },
      { status: 500 },
    );
  }
  if (!modelId) {
    return NextResponse.json(
      { error: "MINDEE_MODEL_ID not set. Grab it from platform.mindee.com" },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'receipt' file" }, { status: 400 });
  }

  try {
    const jobId = await enqueue(file, modelId, apiKey);
    const resultUrl = await pollJob(jobId, apiKey);
    const inference = await fetchInference(resultUrl, apiKey);
    return NextResponse.json(normalize(inference));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mindee request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST the file + model_id to /inferences/enqueue. Returns the job id. */
async function enqueue(file: File, modelId: string, apiKey: string): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name || "receipt.jpg");
  body.append("model_id", modelId);

  const res = await fetch(`${MINDEE_BASE}/inferences/enqueue`, {
    method: "POST",
    // V2 auth is the raw key in the Authorization header — NOT "Token <key>".
    headers: { Authorization: apiKey },
    body,
  });

  if (!res.ok) {
    throw new Error(`enqueue failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { job?: { id?: string } };
  const id = json.job?.id;
  if (!id) throw new Error("enqueue response missing job.id");
  return id;
}

/**
 * Poll GET /jobs/{id} until the job resolves. When done, the endpoint returns
 * a 302 whose Location header points at the result URL — the exact path
 * varies by model type (e.g. /products/extraction/results/<id> for OTS
 * extraction models), so we just pass the full URL straight through to the
 * fetcher instead of trying to parse it.
 */
async function pollJob(jobId: string, apiKey: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const res = await fetch(`${MINDEE_BASE}/jobs/${jobId}`, {
      headers: { Authorization: apiKey },
      redirect: "manual",
    });

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get("location");
      if (!location) throw new Error("job redirect missing Location header");
      return location;
    }

    if (res.ok) {
      const body = (await res.json()) as {
        job?: { status?: string; error?: unknown };
      };
      const status = body.job?.status;
      if (status === "Failed") {
        throw new Error(`Mindee job failed: ${JSON.stringify(body.job?.error)}`);
      }
      // "Waiting" / "Processing" → keep polling.
    } else {
      throw new Error(`poll failed (${res.status}): ${await res.text()}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Mindee job did not finish within ${POLL_TIMEOUT_MS}ms`);
}

async function fetchInference(resultUrl: string, apiKey: string): Promise<MindeeInference> {
  const res = await fetch(resultUrl, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`inference fetch failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { inference?: MindeeInference };
  if (!json.inference) throw new Error("inference response missing .inference");
  return json.inference;
}

/**
 * Map the v2 inference into our ParsedReceipt shape. Field names here match
 * the Mindee "Expense Receipts" extraction model (document_type =
 * expense_receipt). The important quirks:
 *   - line item price is `total_price` (not `total_amount`)
 *   - subtotal is `total_net` (pre-tax amount)
 *   - tip is `tips_gratuity`
 *   - there's a top-level `total_tax` scalar, so we don't have to sum the
 *     `taxes.items[].fields.amount` array ourselves
 */
function normalize(inference: MindeeInference): ParsedReceipt {
  const fields = inference.result?.fields ?? {};

  const merchant = readString(fields["supplier_name"]);
  const subtotalCents = toCents(readNumber(fields["total_net"]));
  const totalCents = toCents(readNumber(fields["total_amount"]));
  const tipCents = toCents(readNumber(fields["tips_gratuity"]));
  const taxCents = toCents(readNumber(fields["total_tax"]));

  const lineField = fields["line_items"];
  const items: ParsedReceipt["items"] =
    Array.isArray(lineField?.items)
      ? lineField.items.map((li) => {
          const inner = (li.fields ?? {}) as Record<string, MindeeField | undefined>;
          const qty = readNumber(inner["quantity"]) ?? 1;
          const totalPrice = readNumber(inner["total_price"]);
          const unitPrice = readNumber(inner["unit_price"]);
          // Mindee's total_price is the line total (qty × unit). We store
          // per-unit price, so prefer unit_price when available, otherwise
          // divide total_price by quantity to avoid double-counting.
          const perUnit =
            unitPrice ?? (totalPrice != null && qty > 1 ? totalPrice / qty : totalPrice);
          return {
            name: readString(inner["description"]) ?? "Item",
            priceCents: toCents(perUnit),
            quantity: qty,
          };
        })
      : [];

  const { items: fixed, warning } = reconcileItems(items, subtotalCents, taxCents, tipCents, totalCents);

  const result: ParsedReceipt = { merchant, items: fixed, subtotalCents, taxCents, tipCents, totalCents };
  if (warning) result.warning = warning;
  return result;
}

/**
 * Sanity-check the parsed items against the receipt's known totals.
 *
 * 1. If the item sum is ~2× the expected subtotal, prices are almost certainly
 *    line totals that got multiplied by quantity again — divide them out.
 * 2. After any correction, if the item sum still diverges from the expected
 *    subtotal by more than 5%, return a warning so the UI can flag it.
 */
function reconcileItems(
  items: ParsedReceipt["items"],
  subtotalCents: number,
  taxCents: number,
  tipCents: number,
  totalCents: number,
): { items: ParsedReceipt["items"]; warning?: string } {
  if (items.length === 0) return { items };

  // Pick the best reference total — prefer subtotal, fall back to
  // total minus tax/tip.
  const expected =
    subtotalCents > 0
      ? subtotalCents
      : totalCents > 0
        ? totalCents - taxCents - tipCents
        : 0;

  const computedSum = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);

  // No reference total to compare against — can't verify.
  if (expected <= 0) {
    return { items, warning: "Couldn't verify item prices — no subtotal on receipt." };
  }
  if (computedSum <= 0) return { items };

  // If computed total is roughly double (within 10% tolerance of 2×), the
  // prices are almost certainly line totals that got multiplied again.
  const ratio = computedSum / expected;
  let corrected = items;
  let didCorrect = false;
  if (ratio >= 1.8 && ratio <= 2.2) {
    corrected = items.map((it) =>
      it.quantity > 1
        ? { ...it, priceCents: Math.round(it.priceCents / it.quantity) }
        : it,
    );
    didCorrect = true;
  }

  // Check if the (possibly corrected) sum matches the expected total.
  const finalSum = corrected.reduce((s, it) => s + it.priceCents * it.quantity, 0);
  const drift = Math.abs(finalSum - expected) / expected;

  if (didCorrect && drift <= 0.05) {
    return { items: corrected, warning: "Some item prices were auto-corrected — double-check quantities." };
  }
  if (didCorrect) {
    return { items: corrected, warning: "Item prices were auto-corrected but still don't match the receipt total. Please review all prices." };
  }
  if (drift > 0.05) {
    return { items, warning: "Item prices don't add up to the receipt total. Please review." };
  }
  return { items };
}

/* ---------- helpers ---------- */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toCents(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

function readNumber(field: MindeeField | undefined): number | undefined {
  if (!field) return undefined;
  const v = field.value;
  return typeof v === "number" ? v : undefined;
}

function readString(field: MindeeField | undefined): string | undefined {
  if (!field) return undefined;
  const v = field.value;
  return typeof v === "string" ? v : undefined;
}

/* ---------- minimal v2 response typings ---------- */

interface MindeeField {
  value?: string | number | null;
  items?: Array<MindeeField & { fields?: Record<string, MindeeField> }>;
}

interface MindeeInference {
  result?: {
    fields?: Record<string, MindeeField>;
  };
}
