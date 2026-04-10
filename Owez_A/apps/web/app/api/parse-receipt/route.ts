import { NextResponse } from 'next/server';
import { normalizeMindeeReceipt, normalizeMindeeV2Extraction } from '@owez/shared';
import { isMindeeV2ModelId, mindeeV2Extract } from '../../../lib/mindee-v2';

/**
 * Proxies receipt uploads to Mindee. We run this as a Next.js Route Handler
 * so the MVP works on Firebase Spark — Cloud Functions on Spark cannot make
 * outbound HTTPS requests. The /api/parse-receipt route runs on the same
 * Node.js server hosting the web app.
 *
 * Accepts multipart/form-data with a `file` field. Returns:
 *   { raw: <full Mindee json>, normalized: NormalizedReceipt }
 *
 * Local dev without Mindee: leave MINDEE_API_KEY unset in development and the
 * route returns a canned parse (see DEV_MOCK_MINDEE_RESPONSE). Set
 * MINDEE_DEV_MOCK=0 to disable that and get a 500 instead.
 */
export const runtime = 'nodejs';

/** Same shape as tests/integration/mindee.test.ts — valid Mindee v5-style payload. */
const DEV_MOCK_MINDEE_RESPONSE = {
  document: {
    inference: {
      prediction: {
        supplier_name: { value: 'Demo Cafe (local mock)' },
        total_amount: { value: 18.5 },
        total_tax: { value: 1.5 },
        line_items: [
          {
            description: 'Latte',
            quantity: 1,
            unit_price: 5.5,
            total_amount: 5.5,
          },
          {
            description: 'Bagel',
            quantity: 2,
            unit_price: 3.5,
            total_amount: 7,
          },
        ],
      },
    },
  },
};

export async function POST(req: Request) {
  const apiKey = process.env.MINDEE_API_KEY?.trim();
  const modelId = process.env.MINDEE_MODEL_ID;
  const devMockDisabled = process.env.MINDEE_DEV_MOCK === '0';

  if (!apiKey) {
    if (
      process.env.NODE_ENV === 'development' &&
      !devMockDisabled
    ) {
      const form = await req.formData();
      if (!(form.get('file') instanceof File)) {
        return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
      }
      const normalized = normalizeMindeeReceipt(DEV_MOCK_MINDEE_RESPONSE);
      return NextResponse.json({
        raw: DEV_MOCK_MINDEE_RESPONSE,
        normalized,
        _dev: {
          mock: true,
          hint: 'Set MINDEE_API_KEY in apps/web/.env.local to call real Mindee.',
        },
      });
    }
    return NextResponse.json(
      {
        error: 'Server is missing MINDEE_API_KEY',
        hint: 'Add MINDEE_API_KEY to .env.local, or run `next dev` without it to use the built-in mock.',
      },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  // UUID model_id = Mindee **v2** custom model (async api-v2.mindee.net). The old
  // v1 /predict URL does not accept v2 model IDs.
  if (isMindeeV2ModelId(modelId)) {
    try {
      const raw = await mindeeV2Extract(file, apiKey, modelId!);
      const normalized = normalizeMindeeV2Extraction(raw);
      return NextResponse.json({ raw, normalized });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 502;
      const authish = status === 401 || status === 403;
      return NextResponse.json(
        {
          error: err?.message ?? 'Mindee v2 request failed',
          body: typeof err?.body === 'string' ? err.body.slice(0, 2000) : undefined,
          hint: authish
            ? 'Mindee v2 uses a different API key than v1 — create an API key on app.mindee.com (v2 platform).'
            : 'See Mindee v2 docs: extraction enqueue + job polling. Check model_id and plan limits.',
        },
        { status: 502 },
      );
    }
  }

  const endpoint = modelId
    ? `https://api.mindee.net/v1/products/mindee/${modelId}/v1/predict`
    : 'https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict';

  const upstream = new FormData();
  upstream.append('document', file, file.name || 'receipt.jpg');

  let mindeeRes: Response;
  try {
    mindeeRes = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}` },
      body: upstream,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Failed to reach Mindee: ${err?.message ?? err}`,
        hint: 'Check network/DNS and that api.mindee.net is reachable from this machine.',
      },
      { status: 502 },
    );
  }

  const text = await mindeeRes.text();
  if (!mindeeRes.ok) {
    const authish = mindeeRes.status === 401 || mindeeRes.status === 403;
    return NextResponse.json(
      {
        error: `Mindee HTTP ${mindeeRes.status}`,
        body: text.slice(0, 2000),
        hint: authish
          ? 'Invalid or missing Mindee token — verify MINDEE_API_KEY in .env.local (v1 keys differ from v2).'
          : 'Mindee rejected the document — check MINDEE_MODEL_ID and your product/plan.',
      },
      { status: 502 },
    );
  }

  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Mindee returned non-JSON response' },
      { status: 502 },
    );
  }

  const normalized = normalizeMindeeReceipt(raw);
  return NextResponse.json({ raw, normalized });
}
