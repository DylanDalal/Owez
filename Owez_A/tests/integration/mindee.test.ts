/**
 * Integration test for the Next.js /api/parse-receipt route, using a mocked
 * Mindee response. We don't hit the real Mindee API here — instead we stub
 * global fetch so we verify:
 *   1. The route forwards the file as multipart/form-data with the correct
 *      authorization header.
 *   2. The normalized response is what the shared utility produced.
 *
 * Kept isolated from the Next.js server: we import the POST handler directly
 * and hand it a synthesized `Request`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const MOCK_MINDEE = {
  document: {
    inference: {
      prediction: {
        supplier_name: { value: 'Test Cafe' },
        total_amount: { value: 42.5 },
        total_tax: { value: 3.5 },
        line_items: [
          { description: 'Espresso', quantity: 1, unit_price: 4, total_amount: 4 },
          { description: 'Croissant', quantity: 2, unit_price: 3.5, total_amount: 7 },
        ],
      },
    },
  },
};

describe('POST /api/parse-receipt (mocked Mindee)', () => {
  const origFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  beforeEach(() => {
    process.env.MINDEE_API_KEY = 'test-key';
    fetchCalls = [];
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify(MOCK_MINDEE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.MINDEE_API_KEY;
  });

  it('forwards the upload and returns normalized items', async () => {
    // Dynamically import after env vars and fetch stub are set up.
    const mod = await import('../../apps/web/app/api/parse-receipt/route.ts');

    const form = new FormData();
    form.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' }),
    );
    const req = new Request('http://localhost/api/parse-receipt', {
      method: 'POST',
      body: form,
    });

    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.normalized.merchant).toBe('Test Cafe');
    expect(json.normalized.items).toHaveLength(2);
    expect(json.normalized.items[0]).toEqual({
      name: 'Espresso',
      price: 4,
      quantity: 1,
    });
    expect(json.normalized.tax).toBe(3.5);

    // Confirms the route actually made an authorized upstream request
    expect(fetchCalls).toHaveLength(1);
    const headers = new Headers(fetchCalls[0].init!.headers as any);
    expect(headers.get('Authorization')).toMatch(/^Token /);
  });

  it('returns 500 when MINDEE_API_KEY is missing', async () => {
    delete process.env.MINDEE_API_KEY;
    vi.resetModules();
    const mod = await import('../../apps/web/app/api/parse-receipt/route.ts');
    const res = await mod.POST(
      new Request('http://localhost/api/parse-receipt', {
        method: 'POST',
        body: new FormData(),
      }),
    );
    expect(res.status).toBe(500);
  });
});
