import type { Claim, UnitState } from '../types/claim';
import type { Receipt, ReceiptItem } from '../types/receipt';
import { round2 } from './money';

/**
 * Group raw claim documents by (itemIndex, unitIndex) so the UI can render
 * per-unit state (split denominator, who's on it, how many portions left).
 *
 * This is pure — no Firestore access — so it is trivially testable.
 */
export function groupClaimsByUnit(
  items: ReceiptItem[],
  claims: Claim[],
): Map<string, UnitState> {
  const out = new Map<string, UnitState>();

  items.forEach((it, itemIndex) => {
    for (let unitIndex = 0; unitIndex < it.quantity; unitIndex++) {
      out.set(keyOf(itemIndex, unitIndex), {
        itemIndex,
        unitIndex,
        splitInto: 1,
        portionsClaimed: 0,
        claims: [],
      });
    }
  });

  for (const claim of claims) {
    const key = keyOf(claim.itemIndex, claim.unitIndex);
    const state = out.get(key);
    if (!state) continue;
    state.splitInto = Math.max(state.splitInto, claim.splitInto || 1);
    state.portionsClaimed += claim.portions || 0;
    state.claims.push(claim);
  }

  return out;
}

export function keyOf(itemIndex: number, unitIndex: number): string {
  return `${itemIndex}:${unitIndex}`;
}

/**
 * Decide whether a new claim would be valid against the current unit state.
 * Returns an error string if rejected, or null if it's fine.
 *
 * Invariants enforced:
 *   1. `portions` must be >=1
 *   2. The new claim cannot over-subscribe the unit: portionsClaimed + portions <= splitInto
 *   3. `splitInto` must match the existing denominator *if any claims exist*
 *      (otherwise you'd be changing the split on other people). The first
 *      claimant sets the denominator.
 */
export function validateNewClaim(
  unit: UnitState,
  newClaim: Pick<Claim, 'portions' | 'splitInto'>,
): string | null {
  if (!newClaim.portions || newClaim.portions < 1) {
    return 'Must claim at least 1 portion';
  }
  const nextSplit =
    unit.claims.length === 0
      ? Math.max(1, newClaim.splitInto || 1)
      : unit.splitInto;

  if (unit.claims.length > 0 && (newClaim.splitInto || 1) !== unit.splitInto) {
    return `This item is already split ${unit.splitInto} ways`;
  }
  if (unit.portionsClaimed + newClaim.portions > nextSplit) {
    return `Only ${nextSplit - unit.portionsClaimed} portion(s) left`;
  }
  return null;
}

/**
 * Compute how much a named guest owes on a receipt. Item costs are divided
 * by (quantity * splitInto) per unit, and tax/tip are split proportionally
 * across everybody who claimed something.
 */
export function totalForGuest(
  receipt: Pick<Receipt, 'items' | 'tax' | 'tip'>,
  claims: Claim[],
  guestName: string,
): number {
  if (!guestName) return 0;
  const units = groupClaimsByUnit(receipt.items, claims);

  // Everybody's subtotals first so we can split tax/tip proportionally
  const subtotalByGuest = new Map<string, number>();
  const unitPrice = (itemIndex: number) => receipt.items[itemIndex]?.price ?? 0;

  for (const unit of units.values()) {
    for (const claim of unit.claims) {
      const split = unit.splitInto || 1;
      const per = (unitPrice(claim.itemIndex) / split) * (claim.portions || 0);
      subtotalByGuest.set(
        claim.guestName,
        (subtotalByGuest.get(claim.guestName) ?? 0) + per,
      );
    }
  }

  const grandSubtotal = Array.from(subtotalByGuest.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const mySub = subtotalByGuest.get(guestName) ?? 0;
  if (grandSubtotal <= 0 || mySub <= 0) return 0;

  const taxTip = (receipt.tax ?? 0) + (receipt.tip ?? 0);
  const share = mySub + (taxTip * mySub) / grandSubtotal;
  return round2(share);
}

/**
 * A transaction-time guard used on the server / in Firestore transactions:
 * given the existing claims on a unit and a proposed claim, throw if invalid.
 * Exposed as a utility so both the web and mobile apps can reuse it inside
 * their own Firestore `runTransaction` calls.
 */
export function assertClaimAllowed(
  existingClaimsOnUnit: Claim[],
  newClaim: Pick<Claim, 'portions' | 'splitInto'>,
): void {
  const unit: UnitState = {
    itemIndex: -1,
    unitIndex: -1,
    splitInto: existingClaimsOnUnit.reduce(
      (m, c) => Math.max(m, c.splitInto || 1),
      1,
    ),
    portionsClaimed: existingClaimsOnUnit.reduce(
      (s, c) => s + (c.portions || 0),
      0,
    ),
    claims: existingClaimsOnUnit,
  };
  const err = validateNewClaim(unit, newClaim);
  if (err) throw new Error(err);
}
