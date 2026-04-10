import { describe, it, expect } from 'vitest';
import { normalizeMindeeReceipt } from '@owez/shared';

// Faux Mindee response matching the shape we care about — documented in
// normalize.ts. Each test bakes in the edge cases that burned us when we
// tried to trust the raw Mindee payload directly.
const MINDEE_RESPONSE = {
  document: {
    inference: {
      prediction: {
        supplier_name: { value: 'Lucali' },
        total_tax: { value: 8.25 },
        total_tip: { value: 15 },
        total_amount: { value: 103.5 },
        line_items: [
          {
            description: 'Margherita',
            quantity: 1,
            unit_price: 24,
            total_amount: 24,
          },
          {
            description: 'Caesar Salad',
            quantity: 2,
            total_amount: 28, // no unit_price -> derived 14
          },
          {
            description: '   ', // junk row with a price
            total_amount: 0.99,
          },
          {
            // no description at all -> becomes "Item"
            unit_price: 5,
            quantity: 1,
          },
        ],
      },
    },
  },
};

describe('normalizeMindeeReceipt', () => {
  it('pulls merchant, tax, tip, total', () => {
    const out = normalizeMindeeReceipt(MINDEE_RESPONSE);
    expect(out.merchant).toBe('Lucali');
    expect(out.tax).toBe(8.25);
    expect(out.tip).toBe(15);
    expect(out.total).toBe(103.5);
  });

  it('derives unit_price from total_amount / quantity when missing', () => {
    const out = normalizeMindeeReceipt(MINDEE_RESPONSE);
    const salad = out.items.find((i) => i.name === 'Caesar Salad');
    expect(salad).toBeDefined();
    expect(salad!.price).toBe(14);
    expect(salad!.quantity).toBe(2);
  });

  it('falls back to "Item" for rows with no description', () => {
    const out = normalizeMindeeReceipt(MINDEE_RESPONSE);
    const named = out.items.filter((i) => i.name === 'Item');
    expect(named.length).toBeGreaterThan(0);
  });

  it('tolerates alternate shapes: items[] at the root', () => {
    const out = normalizeMindeeReceipt({
      items: [{ name: 'Coffee', unit_price: 4.5, quantity: 1 }],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toEqual({ name: 'Coffee', price: 4.5, quantity: 1 });
  });

  it('empty/garbage input produces empty items list', () => {
    expect(normalizeMindeeReceipt(null).items).toEqual([]);
    expect(normalizeMindeeReceipt({}).items).toEqual([]);
    expect(normalizeMindeeReceipt({ document: {} }).items).toEqual([]);
  });

  it('rounds unit_price to 2 decimals', () => {
    const out = normalizeMindeeReceipt({
      line_items: [{ description: 'Split dish', quantity: 3, total_amount: 10 }],
    });
    expect(out.items[0].price).toBe(3.33);
  });
});
