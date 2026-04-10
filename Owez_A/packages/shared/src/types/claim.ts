/**
 * A claim represents one guest's stake on one (or part of one) line item on a
 * receipt. Stored as documents in `receipts/{receiptId}/claims` so Firestore
 * can power real-time updates across devices with minimal effort.
 *
 * How splitting works:
 *  - If a claimant wants the whole unit: { portions: 1 } and they consume a
 *    whole quantity unit.
 *  - If a claimant wants 1/N of a single unit (e.g. splitting an appetizer 4
 *    ways): the first claimant creates a claim with `splitInto: 4`, consuming
 *    ONE portion of that single unit. Subsequent claimants on that unit create
 *    their own documents with the same `itemIndex` and `unitIndex`, each
 *    consuming one portion until `splitInto` portions exist.
 *
 * `unitIndex` ranges from 0..quantity-1 and allows multiple *different* people
 * to each claim a separate unit of a duplicated item (e.g. two of the same
 * drink, claimed by two different people).
 */
export interface Claim {
  id: string;
  itemIndex: number;
  /** Which unit of a duplicated item this claim targets (0..quantity-1) */
  unitIndex: number;
  guestName: string;
  initials: string;
  /** Number of portions consumed on this unit by this claim */
  portions: number;
  /** Total number of equal portions this unit has been split into (default 1) */
  splitInto: number;
  /** If the claimant is a signed-in Owez user, their uid (for showing their pfp) */
  ownerUid?: string | null;
  photoURL?: string | null;
  /**
   * Anonymous session identifier — a random string persisted in localStorage
   * on the guest's device. Used so guests can only remove their own claims.
   */
  sessionId?: string;
  /** Firestore-safe timestamp for ordering (epoch ms) */
  createdAt: number;
}

/** Per-unit view of claim state used by the selection UI */
export interface UnitState {
  itemIndex: number;
  unitIndex: number;
  /** Split denominator currently applied to this unit (max of any claim) */
  splitInto: number;
  /** Sum of `portions` across all claims on this unit */
  portionsClaimed: number;
  claims: Claim[];
}
