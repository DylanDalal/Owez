/**
 * Core data model for Owez.
 * Web, mobile, and API routes all import from @owez/shared — this file is the
 * single source of truth for bill shapes.
 *
 * Firestore layout:
 *   bills/{billId}                    — bill doc, owned by creator
 *   bills/{billId}/claims/{claimId}   — one doc per unit-level claim
 *   users/{uid}                       — user profile w/ default payment handles
 *
 * A single "bill item" can have quantity > 1 — each integer index from 0 to
 * quantity-1 is a "unit" that can be claimed independently, and each unit can
 * further be split N ways (e.g. an appetizer split between 3 friends). Each
 * Claim doc represents "user X takes Y portions of unit Z of item W", so
 * multiple claims per user per bill are expected.
 *
 * Receipt images are NOT stored — Firebase Storage requires the paid Blaze
 * plan and friends only need the parsed line items, not the original photo.
 */

export type BillId = string;
export type ItemId = string;
export type ClaimId = string;
/** Firebase Auth uid — anonymous for friends, Google/Apple for creators. */
export type ClaimerId = string;

/** A single line item parsed from the receipt (or added manually). */
export interface BillItem {
  id: ItemId;
  name: string;
  /** Unit price in cents. All money values are integer cents to avoid float drift. */
  priceCents: number;
  /** Quantity on the receipt. Defaults to 1. */
  quantity: number;
}

/** Payment handles the bill creator has filled in. All optional. */
export interface PaymentMethods {
  /** Venmo username, without the leading @. */
  venmo?: string;
  /** Cash App cashtag, without the leading $. */
  cashapp?: string;
  /** E.164 phone number for Zelle (e.g. "+14155551234"). */
  zellePhone?: string;
}

export interface Bill {
  id: BillId;
  /** Firebase Auth uid of whoever took the photo. */
  creatorId: string;
  /** Display name shown to friends on the claim page ("Pay Dylan"). */
  creatorName?: string;
  /** Creator's profile photo URL (from Google/Apple), shown next to their name. */
  creatorPhotoURL?: string;
  createdAt: number;
  /** Human-friendly title ("Dinner at Nobu"). Optional. */
  title?: string;
  items: BillItem[];
  /** Subtotal pulled from the receipt (before tax/tip). In cents. */
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  paymentMethods: PaymentMethods;
}

/**
 * A single unit-level claim on a bill. Each claim says "claimer takes
 * `portions` of `splitInto` portions of unit `unitIndex` of item `itemId`".
 *
 * The doc ID is auto-generated (not the claimer's uid) because one claimer
 * can own multiple claims on a single bill — e.g. they had a salad AND half
 * of the shared appetizer. Security rules enforce that the `claimerId` on
 * each doc matches `request.auth.uid`.
 */
export interface Claim {
  id: ClaimId;
  itemId: ItemId;
  /** 0..(item.quantity - 1). For an item with quantity 3, three units exist. */
  unitIndex: number;
  /** How many portions out of splitInto this claim takes. */
  portions: number;
  /** Total split count for this unit. 1 means "whole unit". */
  splitInto: number;
  /** Firebase auth uid of the claimer. */
  claimerId: ClaimerId;
  /** Display name the claimant typed. */
  name: string;
  /** Two-character initials shown on the stamp. */
  initials: string;
  /** Epoch ms when the claim was created. */
  createdAt: number;
  /** Optional profile photo for Google/Apple-authed claimants. */
  photoURL?: string;
  /**
   * Marks a claim as an independent full-price duplicate rather than part of
   * the unit's split. A duplicate claim owes the full item price, does not
   * consume a portion of the split, and can coexist with existing claims on
   * the same unit. Used for "I also ordered one of these" situations where
   * the receipt under-counted the quantity.
   */
  duplicate?: boolean;
}

/** Response shape from /api/parse-receipt — Mindee output normalized. */
export interface ParsedReceipt {
  merchant?: string;
  items: Array<{
    name: string;
    priceCents: number;
    quantity: number;
  }>;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  /** Set when the parser had to auto-correct item prices to match the receipt total. */
  warning?: string;
}

/**
 * User profile doc at users/{uid}. Stores default payment handles so new
 * bills can auto-fill the creator's Venmo / Cash App / Zelle without the
 * creator retyping them each time.
 */
export interface UserProfile {
  displayName: string;
  email?: string;
  photoURL?: string;
  venmo?: string;
  cashapp?: string;
  zellePhone?: string;
  createdAt: number;
  updatedAt?: number;
}
