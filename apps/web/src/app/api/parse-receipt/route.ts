import { NextResponse } from "next/server";
import type { ParsedReceipt } from "@owez/shared";

/**
 * POST /api/parse-receipt
 *
 * Accepts a multipart upload (field "receipt") and parses it with the OpenAI
 * Responses API using a vision-capable model. We send the image as a base64
 * data URL and constrain the output with a JSON schema so the response is
 * directly mappable to ParsedReceipt.
 *
 * Setup:
 *   1. Create an API key at https://platform.openai.com/api-keys
 *   2. Put the key in .env.local:
 *        OPENAI_API_KEY=sk-...
 *   3. (Optional) Override the model:
 *        OPENAI_MODEL=gpt-4o-mini
 */

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set. Copy .env.example to .env.local" },
      { status: 500 },
    );
  }
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const form = await req.formData();
  const file = form.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'receipt' file" }, { status: 400 });
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    const parsed = await callOpenAI(dataUrl, model, apiKey);
    return NextResponse.json(normalize(parsed));
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"], description: "Pre-tax subtotal in the receipt's currency unit (e.g. dollars, not cents)." },
    tax: { type: ["number", "null"] },
    tip: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit_price: {
            type: ["number", "null"],
            description: "Price per single unit, not the line total.",
          },
        },
        required: ["name", "quantity", "unit_price"],
      },
    },
  },
  required: ["merchant", "subtotal", "tax", "tip", "total", "items"],
} as const;

interface OpenAIReceipt {
  merchant: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  items: Array<{ name: string; quantity: number; unit_price: number | null }>;
}

async function callOpenAI(dataUrl: string, model: string, apiKey: string): Promise<OpenAIReceipt> {
  const instructions =
    "You are a receipt parser. Extract the merchant name, line items, subtotal, tax, tip, and total from the receipt image. For each line item return the per-unit price (divide line total by quantity if the receipt only shows line totals). All money amounts must be in the receipt's main currency unit (e.g. dollars), not cents. Return null for any field you can't read.";

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instructions },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "receipt",
          schema: RECEIPT_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  // The Responses API exposes the concatenated text via output_text, but fall
  // back to walking the structured output if that helper isn't present.
  const text =
    json.output_text ??
    json.output?.[0]?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI response missing output text");
  return JSON.parse(text) as OpenAIReceipt;
}

/** Map the OpenAI output into our ParsedReceipt shape (cents-based). */
function normalize(parsed: OpenAIReceipt): ParsedReceipt {
  const merchant = parsed.merchant ?? undefined;
  const subtotalCents = toCents(parsed.subtotal);
  const taxCents = toCents(parsed.tax);
  const tipCents = toCents(parsed.tip);
  const totalCents = toCents(parsed.total);

  const items: ParsedReceipt["items"] = parsed.items.map((it) => ({
    name: it.name || "Item",
    priceCents: toCents(it.unit_price),
    quantity: it.quantity > 0 ? it.quantity : 1,
  }));

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

  const expected =
    subtotalCents > 0
      ? subtotalCents
      : totalCents > 0
        ? totalCents - taxCents - tipCents
        : 0;

  const computedSum = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);

  if (expected <= 0) {
    return { items, warning: "Couldn't verify item prices — no subtotal on receipt." };
  }
  if (computedSum <= 0) return { items };

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

function toCents(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}
