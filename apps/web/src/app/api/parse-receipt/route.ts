import { NextResponse } from "next/server";
import type { ParsedReceipt } from "@owez/shared";

/**
 * POST /api/parse-receipt
 *
 * Accepts a multipart upload (field "receipt") and parses it with OpenAI
 * vision + structured JSON output.
 */
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set. Copy .env.example to .env.local" },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'receipt' file" }, { status: 400 });
  }

  try {
    const parsed = await parseReceiptWithOpenAI(file, apiKey);
    const { items: fixed, warning } = reconcileItems(
      parsed.items,
      parsed.subtotalCents,
      parsed.taxCents,
      parsed.tipCents,
      parsed.totalCents,
    );

    const result: ParsedReceipt = {
      merchant: parsed.merchant,
      items: fixed,
      subtotalCents: parsed.subtotalCents,
      taxCents: parsed.taxCents,
      tipCents: parsed.tipCents,
      totalCents: parsed.totalCents,
    };
    if (warning) result.warning = warning;

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function parseReceiptWithOpenAI(file: File, apiKey: string): Promise<ParsedReceipt> {
  const dataUrl = await fileToDataUrl(file);

  const prompt = [
    "Extract this receipt into JSON.",
    "Return ONLY valid JSON with shape:",
    '{"merchant":string,"items":[{"name":string,"price":number,"quantity":number}],"subtotal":number,"tax":number,"tip":number,"total":number}',
    "Rules:",
    "- price/subtotal/tax/tip/total are in major currency units (e.g. dollars), as numbers.",
    "- quantity defaults to 1 when missing.",
    "- Use 0 for missing totals.",
    "- No markdown fences or extra text.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
      max_output_tokens: 1200,
    }),
  });

  if (!res.ok) {
    throw new Error(`openai parse failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as OpenAIResponse;
  const text = extractText(json);
  const payload = safeJsonParse(text);

  const merchant = typeof payload.merchant === "string" ? payload.merchant : "";
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  const items: ParsedReceipt["items"] = rawItems.map((it) => {
    const qty = typeof it?.quantity === "number" && it.quantity > 0 ? it.quantity : 1;
    return {
      name: typeof it?.name === "string" && it.name.trim() ? it.name : "Item",
      quantity: qty,
      priceCents: toCents(typeof it?.price === "number" ? it.price : 0),
    };
  });

  return {
    merchant,
    items,
    subtotalCents: toCents(numberOrZero(payload.subtotal)),
    taxCents: toCents(numberOrZero(payload.tax)),
    tipCents: toCents(numberOrZero(payload.tip)),
    totalCents: toCents(numberOrZero(payload.total)),
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function extractText(response: OpenAIResponse): string {
  const text = response.output_text?.trim();
  if (text) return text;

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  const joined = chunks.join("\n").trim();
  if (!joined) throw new Error("OpenAI returned no text output");
  return joined;
}

function safeJsonParse(value: string): Record<string, any> {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("OpenAI did not return valid JSON");
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toCents(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

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

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}
