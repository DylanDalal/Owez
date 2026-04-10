/**
 * A normalized line item on a receipt. `quantity` represents the number of
 * distinct, individually-claimable units of this item (e.g. a "2 x Coke" row
 * from Mindee becomes quantity: 2). `price` is always the per-unit price in
 * dollars.
 */
export interface ReceiptItem {
  /** Display name of the item */
  name: string;
  /** Per-unit price in dollars (not cents) */
  price: number;
  /** Number of individually-claimable units */
  quantity: number;
}

/**
 * A receipt as stored in Firestore. `raw` is the untouched Mindee response for
 * future re-processing or debugging; `items` is the normalized, editable list
 * used everywhere else in the app.
 */
export interface Receipt {
  id: string;
  ownerId: string;
  title: string;
  merchant?: string;
  /** Raw Mindee response kept verbatim for debugging / re-parsing */
  raw?: unknown;
  items: ReceiptItem[];
  /** Optional tax, in dollars, split proportionally across claims */
  tax?: number;
  /** Optional tip, in dollars, split proportionally across claims */
  tip?: number;
  /** Payment handles populated from the owner's profile on create */
  payment: PaymentHandles;
  createdAt: number; // epoch ms
  updatedAt?: number;
}

export interface PaymentHandles {
  venmo?: string;
  cashapp?: string;
  /** Phone number for Zelle only; never used for contact */
  phone?: string;
}
