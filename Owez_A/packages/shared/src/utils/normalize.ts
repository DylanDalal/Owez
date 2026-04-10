import type { ReceiptItem } from '../types/receipt';
import { round2 } from './money';

/**
 * Normalize a raw Mindee receipt response into our app's `ReceiptItem[]` plus
 * any extracted top-level metadata. Mindee's shape for the receipt-parser
 * product is:
 *
 *   {
 *     document: {
 *       inference: {
 *         prediction: {
 *           supplier_name: { value },
 *           total_amount: { value },
 *           total_tax: { value },
 *           total_tip: { value },
 *           line_items: [
 *             { description, quantity, total_amount, unit_price }
 *           ]
 *         }
 *       }
 *     }
 *   }
 *
 * We tolerate unusual shapes: falsy names become "Item", missing prices fall
 * back to 0, non-integer quantities round up (we can't claim a fractional
 * item). If a row has a `total_amount` but no `unit_price`, we derive the
 * unit price by dividing.
 */
export interface NormalizedReceipt {
  merchant?: string;
  items: ReceiptItem[];
  tax?: number;
  tip?: number;
  total?: number;
}

export function normalizeMindeeReceipt(raw: any): NormalizedReceipt {
  const prediction =
    raw?.document?.inference?.prediction ??
    raw?.inference?.prediction ??
    raw?.prediction ??
    raw ??
    {};

  const merchant: string | undefined =
    prediction.supplier_name?.value ??
    prediction.merchant_name?.value ??
    prediction.supplier?.value ??
    undefined;

  const tax = toNumber(
    prediction.total_tax?.value ?? prediction.taxes?.[0]?.value,
  );
  const tip = toNumber(prediction.total_tip?.value ?? prediction.tip?.value);
  const total = toNumber(
    prediction.total_amount?.value ?? prediction.total?.value,
  );

  const rawLineItems: any[] = prediction.line_items ?? prediction.items ?? [];

  const items: ReceiptItem[] = rawLineItems
    .map((li) => {
      const name = String(
        li.description ?? li.name ?? li.title ?? 'Item',
      ).trim() || 'Item';

      const quantityRaw = toNumber(li.quantity);
      const quantity =
        quantityRaw && quantityRaw > 0 ? Math.max(1, Math.round(quantityRaw)) : 1;

      let unitPrice = toNumber(li.unit_price);
      const totalAmount = toNumber(li.total_amount ?? li.amount ?? li.price);

      if (!unitPrice && totalAmount && quantity) {
        unitPrice = totalAmount / quantity;
      }
      if (!unitPrice && totalAmount) {
        unitPrice = totalAmount;
      }

      return {
        name,
        price: round2(unitPrice ?? 0),
        quantity,
      } satisfies ReceiptItem;
    })
    // Drop junk rows that have neither a real name nor a price
    .filter((it) => it.name && it.price >= 0);

  return {
    merchant,
    items,
    tax: tax ? round2(tax) : undefined,
    tip: tip ? round2(tip) : undefined,
    total: total ? round2(total) : undefined,
  };
}

/**
 * Normalize Mindee **API v2** extraction output (`inference.result.fields`).
 * Field shapes: SimpleField `{ value }`, ListField `{ items: [...] }`,
 * ObjectField `{ fields: { ... } }`. Heuristics map common receipt-like schemas.
 */
export function normalizeMindeeV2Extraction(raw: any): NormalizedReceipt {
  const fields = raw?.inference?.result?.fields;
  if (!fields || typeof fields !== 'object') {
    return { items: [] };
  }

  const merchant = pickV2String(fields, [
    'supplier_name',
    'merchant_name',
    'store_name',
    'vendor',
    'merchant',
    'shop_name',
  ]);

  const tax = pickV2Number(fields, [
    'total_tax',
    'tax',
    'taxes',
    'sales_tax',
  ]);
  const tip = pickV2Number(fields, ['total_tip', 'tip', 'gratuity']);
  const total = pickV2Number(fields, [
    'total_amount',
    'total',
    'amount_due',
    'balance',
  ]);

  const items = collectV2LineItems(fields);

  return {
    merchant,
    items,
    tax: tax != null ? round2(tax) : undefined,
    tip: tip != null ? round2(tip) : undefined,
    total: total != null ? round2(total) : undefined,
  };
}

function v2SimpleValue(node: unknown): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.items)) return undefined;
  if (o.fields && typeof o.fields === 'object') return undefined;
  if ('value' in o) return o.value;
  return undefined;
}

function pickV2String(
  fields: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = v2SimpleValue(fields[k]);
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function pickV2Number(
  fields: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const n = toNumber(v2SimpleValue(fields[k]));
    if (n != null) return n;
  }
  return undefined;
}

function isV2ListField(node: unknown): node is { items: unknown[] } {
  return (
    !!node &&
    typeof node === 'object' &&
    Array.isArray((node as { items?: unknown }).items)
  );
}

function isV2ObjectField(node: unknown): node is { fields: Record<string, unknown> } {
  return (
    !!node &&
    typeof node === 'object' &&
    !!(node as { fields?: unknown }).fields &&
    typeof (node as { fields: unknown }).fields === 'object' &&
    !Array.isArray((node as { items?: unknown }).items)
  );
}

function v2ObjectToLineItem(obj: { fields: Record<string, unknown> }): ReceiptItem | null {
  const f = obj.fields;
  const nameRaw =
    v2SimpleValue(f.description) ??
    v2SimpleValue(f.name) ??
    v2SimpleValue(f.product_name) ??
    v2SimpleValue(f.item) ??
    v2SimpleValue(f.title);
  const name = String(nameRaw ?? 'Item').trim() || 'Item';

  const quantityRaw = toNumber(
    v2SimpleValue(f.quantity) ?? v2SimpleValue(f.qty),
  );
  const quantity =
    quantityRaw && quantityRaw > 0 ? Math.max(1, Math.round(quantityRaw)) : 1;

  let unitPrice = toNumber(
    v2SimpleValue(f.unit_price) ?? v2SimpleValue(f.price),
  );
  const totalAmount = toNumber(
    v2SimpleValue(f.total_amount) ??
      v2SimpleValue(f.amount) ??
      v2SimpleValue(f.line_total),
  );

  if (!unitPrice && totalAmount && quantity) {
    unitPrice = totalAmount / quantity;
  }
  if (!unitPrice && totalAmount) {
    unitPrice = totalAmount;
  }

  const price = round2(unitPrice ?? 0);
  if (!name && price <= 0) return null;
  return { name, price, quantity };
}

function collectV2LineItems(fields: Record<string, unknown>): ReceiptItem[] {
  const out: ReceiptItem[] = [];
  const listKeys = [
    'line_items',
    'items',
    'products',
    'purchases',
    'rows',
    'details',
  ];

  const tryList = (node: unknown) => {
    if (!isV2ListField(node)) return;
    for (const entry of node.items) {
      if (isV2ObjectField(entry)) {
        const li = v2ObjectToLineItem(entry);
        if (li && (li.name !== 'Item' || li.price > 0)) out.push(li);
      }
    }
  };

  for (const k of listKeys) {
    tryList(fields[k]);
  }

  if (out.length === 0) {
    for (const node of Object.values(fields)) {
      tryList(node);
    }
  }

  return out.filter((it) => it.name && it.price >= 0);
}

function toNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
