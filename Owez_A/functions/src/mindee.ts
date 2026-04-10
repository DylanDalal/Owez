/**
 * Thin wrapper around the Mindee Generated Parsing API. We call the "v1"
 * product endpoint with a base64-encoded document and return the raw JSON
 * body so `@owez/shared` can normalize it.
 *
 * The MVP is intentionally HTTP-only (no Mindee SDK) to keep the functions
 * cold start small and to avoid Node version coupling.
 */

const MINDEE_ENDPOINT = 'https://api.mindee.net/v1/products/mindee/generated/v1/predict';

export interface MindeeParseArgs {
  apiKey: string;
  modelId?: string;
  /** Raw binary bytes of the receipt image / pdf */
  fileBytes: Uint8Array | Buffer;
  fileName?: string;
  contentType?: string;
}

export async function parseReceiptWithMindee(
  args: MindeeParseArgs,
): Promise<any> {
  const { apiKey, fileBytes, fileName = 'receipt.jpg' } = args;
  if (!apiKey) throw new Error('Missing Mindee API key');

  const endpoint = args.modelId
    ? `https://api.mindee.net/v1/products/mindee/${args.modelId}/v1/predict`
    : MINDEE_ENDPOINT;

  const form = new FormData();
  // Convert Buffer/Uint8Array into a Blob the runtime can serialize
  const blob = new Blob([new Uint8Array(fileBytes)], {
    type: args.contentType ?? 'image/jpeg',
  });
  form.append('document', blob, fileName);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mindee API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}
