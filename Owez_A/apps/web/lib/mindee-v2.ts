/**
 * Mindee API v2 (api-v2.mindee.net) — async extraction for custom models (UUID model_id).
 * V1 synchronous predict on api.mindee.net does not apply to v2 custom models.
 * @see https://docs.mindee.com/getting-started/faq-v1-to-v2
 */

const V2_BASE = 'https://api-v2.mindee.net';

/** Mindee v2 model IDs are UUIDs; v1 product slugs are not. */
export function isMindeeV2ModelId(modelId: string | undefined): boolean {
  if (!modelId?.trim()) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    modelId.trim(),
  );
}

function authHeader(apiKey: string): string {
  const k = apiKey.trim();
  if (k.startsWith('Token ')) return k;
  return `Token ${k}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Enqueue document, poll job until Processed, fetch extraction JSON (inference wrapper).
 */
export async function mindeeV2Extract(
  file: File,
  apiKey: string,
  modelId: string,
): Promise<unknown> {
  const auth = authHeader(apiKey);
  const form = new FormData();
  form.append('model_id', modelId.trim());
  form.append('file', file, file.name || 'receipt.jpg');

  const enq = await fetch(`${V2_BASE}/v2/products/extraction/enqueue`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: form,
  });
  const enqText = await enq.text();
  if (!enq.ok) {
    const err = new Error(`Mindee v2 enqueue HTTP ${enq.status}`) as Error & {
      status: number;
      body: string;
    };
    err.status = enq.status;
    err.body = enqText.slice(0, 4000);
    throw err;
  }

  let enqJson: { job?: { id?: string } };
  try {
    enqJson = JSON.parse(enqText);
  } catch {
    throw new Error('Mindee v2 enqueue returned non-JSON');
  }

  const jobId = enqJson?.job?.id;
  if (!jobId || typeof jobId !== 'string') {
    throw new Error('Mindee v2 enqueue response missing job.id');
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const jobRes = await fetch(
      `${V2_BASE}/v2/jobs/${jobId}?redirect=false`,
      { headers: { Authorization: auth } },
    );
    const jobText = await jobRes.text();
    let jobJson: {
      job?: {
        status?: string;
        result_url?: string | null;
        error?: { detail?: string; title?: string };
      };
    };
    try {
      jobJson = JSON.parse(jobText);
    } catch {
      await sleep(450);
      continue;
    }

    const status = jobJson?.job?.status;
    if (status === 'Failed') {
      const detail =
        jobJson?.job?.error?.detail ??
        jobJson?.job?.error?.title ??
        jobText.slice(0, 800);
      throw new Error(`Mindee v2 job failed: ${detail}`);
    }

    if (status === 'Processed') {
      const resultUrl = jobJson?.job?.result_url;
      if (!resultUrl || typeof resultUrl !== 'string') {
        throw new Error('Mindee v2 job processed but result_url is missing');
      }
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: auth },
      });
      const resultText = await resultRes.text();
      if (!resultRes.ok) {
        const err = new Error(
          `Mindee v2 result HTTP ${resultRes.status}`,
        ) as Error & { status: number; body: string };
        err.status = resultRes.status;
        err.body = resultText.slice(0, 4000);
        throw err;
      }
      try {
        return JSON.parse(resultText);
      } catch {
        throw new Error('Mindee v2 result was not valid JSON');
      }
    }

    await sleep(450);
  }

  throw new Error('Mindee v2 job timed out after 120s');
}
