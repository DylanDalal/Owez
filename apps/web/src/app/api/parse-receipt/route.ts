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
 *        OPENAI_MODEL=gpt-4o-mini   (cheaper, lower accuracy)
 */

const OPENAI_URL = "https://api.openai.com/v1/responses";
// gpt-4o reads small receipt line-item text far more reliably than the mini
// model. Override with OPENAI_MODEL if you want to trade accuracy for cost.
const DEFAULT_MODEL = "gpt-4o";

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
  // Trust the sniffed bytes over the browser-provided type: a mislabeled
  // image (e.g. a WEBP sent as image/jpeg) makes the vision model misread or
  // reject it. Falls back to the declared type, then JPEG.
  const mime = sniffImageMime(buf) ?? file.type ?? "image/jpeg";

  // OpenAI vision does not accept HEIC/HEIF (the default iPhone photo format).
  // Convert it to JPEG server-side so those uploads parse instead of failing.
  if (mime === "image/heic" || mime === "image/heif") {
    const jpeg = await heicToJpeg(buf);
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }

  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Convert a HEIC/HEIF image to JPEG. Lazily loads the (wasm-backed) converter
 *  so it's only pulled in when an Apple photo actually arrives. */
async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const convert = (await import("heic-convert")).default;
  // NB: heic-convert's @types declare `buffer: ArrayBufferLike`, but at runtime
  // it requires a Buffer/Uint8Array (it calls array.slice and spreads it). An
  // ArrayBuffer throws, so we pass the Buffer and cast past the wrong type.
  const out = await convert({
    buffer: buf as unknown as ArrayBufferLike,
    format: "JPEG",
    quality: 0.92,
  });
  return Buffer.from(out);
}

/** Detect image type from magic bytes for the formats OpenAI vision accepts,
 *  plus HEIC/HEIF (which we convert before sending). */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "GIF8") {
    return "image/gif";
  }
  // ISO-BMFF (HEIC/HEIF): "ftyp" box at offset 4, brand at offset 8.
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    const heicBrands = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "heif"];
    if (heicBrands.includes(brand)) return "image/heic";
  }
  return null;
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
  const instructions = [
    "You are a meticulous receipt parser. Read the receipt image carefully and transcribe every line item exactly as printed.",
    "Rules:",
    "- Include EVERY line item, in order. Do not merge, skip, or invent items.",
    "- quantity is the count shown for that line (default 1 if none is shown).",
    "- unit_price is the price for a SINGLE unit. If the receipt shows a line total for quantity > 1, divide the line total by the quantity.",
    "- Capture subtotal, tax, tip, and total separately if present. Do not fold tax or tip into item prices.",
    "- All money amounts are in the receipt's main currency unit (e.g. dollars like 12.50), never cents.",
    "- Read digits precisely; double-check that your line items sum to the subtotal before answering.",
    "- Return null for any field you genuinely cannot read. Do not guess totals.",
  ].join("\n");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 4096,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instructions },
            // "high" detail sends the full-resolution image so the model can
            // read small line-item text — the single biggest accuracy lever.
            { type: "input_image", image_url: dataUrl, detail: "high" },
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
    return { items, warning: "Couldn't verify item prices. No subtotal on receipt." };
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
    return { items: corrected, warning: "Some item prices were auto-corrected. Double-check quantities." };
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
