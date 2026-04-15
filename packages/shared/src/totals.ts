import type { Bill, BillItem, Claim, ClaimerId, ItemId } from "./types.js";

/**
 * Money math for Owez. The tricky part is rounding: naive per-claimer
 * calculation with Math.round() can drift by ±1-2¢ from the true bill total
 * when multiple people are splitting, which is exactly the kind of
 * embarrassing glitch that makes a bill-splitter feel unprofessional.
 *
 * Solution: compute every claimer's owed amount in integer cents, and use
 * the "largest remainder" method to distribute tax/tip so the sum is exact.
 *
 * Splitting: each bill item has `quantity` units, each unit can be split
 * into `splitInto` portions. Claims record "N portions of unit X of item Y".
 * Unclaimed portions don't contribute to anyone's total (they're just gone
 * from the split, effectively).
 */

/** Aggregated state of one (item, unitIndex) pair. */
export interface UnitState {
  itemId: ItemId;
  unitIndex: number;
  /** 1 if no one has split it; otherwise the denominator of the split. */
  splitInto: number;
  /** Sum of `portions` across all claims on this unit. */
  portionsClaimed: number;
  claims: Claim[];
}

/**
 * Build a map keyed by `"itemId:unitIndex"` over every unit of every item,
 * seeded with empty UnitStates and then filled in from the claims list.
 * Iteration is guaranteed to cover the full items × quantity grid.
 */
export function groupClaimsByUnit(
  items: BillItem[],
  claims: Claim[],
): Map<string, UnitState> {
  const out = new Map<string, UnitState>();
  for (const item of items) {
    for (let u = 0; u < item.quantity; u++) {
      out.set(`${item.id}:${u}`, {
        itemId: item.id,
        unitIndex: u,
        splitInto: 1,
        portionsClaimed: 0,
        claims: [],
      });
    }
  }
  for (const c of claims) {
    const unit = out.get(`${c.itemId}:${c.unitIndex}`);
    if (!unit) continue; // stale claim pointing at a deleted item/unit
    unit.claims.push(c);
    // Duplicate claims sit alongside the split but don't influence its math.
    if (c.duplicate) continue;
    // The first claim sets the splitInto for the unit. Any later claim that
    // disagrees (shouldn't happen with rules + client validation) raises the
    // splitInto rather than lowering it.
    const splitClaims = unit.claims.filter((x) => !x.duplicate);
    if (splitClaims.length === 1) {
      unit.splitInto = c.splitInto;
    } else if (c.splitInto > unit.splitInto) {
      unit.splitInto = c.splitInto;
    }
    unit.portionsClaimed += c.portions;
  }
  return out;
}

/** Convenience: UnitState[] for a single item, length === item.quantity. */
export function unitsForItem(item: BillItem, claims: Claim[]): UnitState[] {
  const filtered = claims.filter((c) => c.itemId === item.id);
  const map = groupClaimsByUnit([item], filtered);
  return Array.from({ length: item.quantity }, (_, u) =>
    map.get(`${item.id}:${u}`)!,
  );
}

/**
 * Validate a proposed claim against the existing claims on the same unit.
 * Throws with a user-friendly message if the claim would over-subscribe the
 * unit or pick an incompatible split.
 */
export function assertClaimAllowed(
  existingOnUnit: Claim[],
  claim: { portions: number; splitInto: number; duplicate?: boolean },
): void {
  if (claim.portions < 1) {
    throw new Error("You need to claim at least one portion.");
  }
  if (claim.splitInto < 1) {
    throw new Error("Split must be at least 1.");
  }
  if (claim.portions > claim.splitInto) {
    throw new Error("You can't take more portions than the split allows.");
  }
  // Duplicate claims are independent charges, so they bypass the split
  // validation entirely.
  if (claim.duplicate) return;
  const splitOnly = existingOnUnit.filter((c) => !c.duplicate);
  if (splitOnly.length === 0) return;

  const existingSplit = splitOnly[0]!.splitInto;
  // Allow upgrading the split (e.g. 1→2 when someone wants to split with the
  // existing claimer). The new split must be >= the existing one so we don't
  // shrink anyone out.
  if (claim.splitInto < existingSplit) {
    throw new Error(
      `This unit is already split ${existingSplit} ways. Pick a matching or larger split.`,
    );
  }
  // Use the larger split as the effective denominator.
  const effectiveSplit = Math.max(existingSplit, claim.splitInto);
  const alreadyClaimed = splitOnly.reduce((s, c) => s + c.portions, 0);
  if (alreadyClaimed + claim.portions > effectiveSplit) {
    const left = effectiveSplit - alreadyClaimed;
    throw new Error(
      `Only ${left} portion${left === 1 ? "" : "s"} left on this unit.`,
    );
  }
}

export interface OwedBreakdown {
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

/**
 * Compute the exact amount owed by every claimer on a bill.
 *
 * For each unit we distribute its priceCents across its `splitInto` portions
 * using integer-cent math, then walk the unit's claims in createdAt order
 * and assign consecutive portion-shares to each claim. This guarantees that
 * the sum of claim shares on a unit equals the unit's priceCents exactly.
 *
 * Tax and tip are then distributed proportionally to each claimer's total
 * items cents via largest-remainder rounding.
 */
export function owedByAllClaimers(
  bill: Bill,
  claims: Claim[],
): Record<ClaimerId, OwedBreakdown> {
  const itemById = new Map(bill.items.map((it) => [it.id, it]));
  const unitMap = groupClaimsByUnit(bill.items, claims);
  const itemsCentsByClaimer = new Map<ClaimerId, number>();

  for (const unit of unitMap.values()) {
    if (unit.claims.length === 0) continue;
    const item = itemById.get(unit.itemId);
    if (!item) continue;

    // Duplicate claims sit outside the split: each one owes the full item
    // price independently (creator wants to be paid, over-collection is OK).
    const splitClaims = unit.claims.filter((c) => !c.duplicate);
    const duplicateClaims = unit.claims.filter((c) => c.duplicate);

    const shares = distributeCentsEvenly(item.priceCents, unit.splitInto);

    // Sort deterministically so assignment is stable across clients.
    const sorted = [...splitClaims].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );

    let cursor = 0;
    for (const claim of sorted) {
      const take = Math.min(claim.portions, shares.length - cursor);
      let cents = 0;
      for (let i = 0; i < take; i++) {
        cents += shares[cursor + i] ?? 0;
      }
      cursor += take;
      itemsCentsByClaimer.set(
        claim.claimerId,
        (itemsCentsByClaimer.get(claim.claimerId) ?? 0) + cents,
      );
    }

    for (const claim of duplicateClaims) {
      itemsCentsByClaimer.set(
        claim.claimerId,
        (itemsCentsByClaimer.get(claim.claimerId) ?? 0) + item.priceCents,
      );
    }
  }

  const claimerIds = Array.from(itemsCentsByClaimer.keys()).sort();
  if (claimerIds.length === 0) return {};
  const weights = claimerIds.map((id) => itemsCentsByClaimer.get(id) ?? 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const taxShares = distributeCentsProportional(bill.taxCents, weights, totalWeight);
  const tipShares = distributeCentsProportional(bill.tipCents, weights, totalWeight);

  const out: Record<ClaimerId, OwedBreakdown> = {};
  claimerIds.forEach((id, i) => {
    const itemsCents = weights[i] ?? 0;
    const taxCents = taxShares[i] ?? 0;
    const tipCents = tipShares[i] ?? 0;
    out[id] = {
      itemsCents,
      taxCents,
      tipCents,
      totalCents: itemsCents + taxCents + tipCents,
    };
  });
  return out;
}

/** Single-claimer convenience. */
export function claimerOwes(
  bill: Bill,
  claims: Claim[],
  claimerId: ClaimerId,
): OwedBreakdown {
  const all = owedByAllClaimers(bill, claims);
  return (
    all[claimerId] ?? {
      itemsCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    }
  );
}

/**
 * Cents already collected across all claimants. Used on the dashboard to show
 * "still owed" per receipt. NB: totalClaimedCents can be less than
 * bill.totalCents if some items are unclaimed — that's expected.
 */
export function totalClaimedCents(bill: Bill, claims: Claim[]): number {
  const all = owedByAllClaimers(bill, claims);
  return Object.values(all).reduce((s, b) => s + b.totalCents, 0);
}

export function sumItems(items: BillItem[]): number {
  return items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0);
}

/** Build the initials used on the claim stamp. "John Doe" → "JD", "Alex" → "A". */
export function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase().slice(0, 2);
}

/* ---------- rounding primitives ---------- */

/**
 * Split `total` cents across `n` people as evenly as possible. The first
 * `(total % n)` people each get one extra cent so the sum is exact.
 *
 * distributeCentsEvenly(100, 3) → [34, 33, 33]
 */
export function distributeCentsEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Distribute `total` cents across claimers in proportion to `weights`,
 * using the largest-remainder method so the result sums exactly to `total`.
 */
export function distributeCentsProportional(
  total: number,
  weights: number[],
  totalWeight: number,
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total === 0 || totalWeight === 0) return new Array(n).fill(0);

  const ideals = weights.map((w) => (total * w) / totalWeight);
  const floors = ideals.map(Math.floor);
  const sumOfFloors = floors.reduce((a, b) => a + b, 0);
  const remainder = total - sumOfFloors;

  const order = ideals
    .map((ideal, i) => ({ i, frac: ideal - floors[i]! }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (let k = 0; k < remainder; k++) {
    out[order[k]!.i] = (out[order[k]!.i] ?? 0) + 1;
  }
  return out;
}
