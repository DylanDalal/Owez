"use client";

import { useEffect, useState } from "react";
import type { BillItem, UnitState } from "@owez/shared";
import { initialsFromName } from "@owez/shared";
import { centsToDisplay } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  item: BillItem;
  units: UnitState[];
  initialUnitIndex: number;
  myName: string;
  myClaimerId: string;
  isOwner: boolean;
  onClaim: (args: {
    unitIndex: number;
    portions: number;
    splitInto: number;
  }) => Promise<void>;
  onUnclaim: (claimId: string) => Promise<void>;
}

export function ItemDetailSheet({
  open,
  onClose,
  item,
  units,
  initialUnitIndex,
  myName,
  myClaimerId,
  isOwner,
  onClaim,
  onUnclaim,
}: Props) {
  const [unitIndex, setUnitIndex] = useState(initialUnitIndex);
  const [splitInto, setSplitInto] = useState(1);
  const [portions, setPortions] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unit = open ? units[unitIndex] : undefined;

  // When opening on a fully-claimed unit with no split, auto-propose a 2-way
  // split so the user can jump right in.
  useEffect(() => {
    if (!open || !unit) return;
    if (
      unit.claims.length > 0 &&
      unit.splitInto <= 1 &&
      unit.portionsClaimed >= 1
    ) {
      setSplitInto(2);
      setPortions(1);
    } else if (unit.claims.length === 0) {
      setSplitInto(1);
      setPortions(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unitIndex]);

  if (!open || !unit) return null;

  // If the unit already has claims with a set split, respect it. Otherwise
  // use whatever the user is proposing (which may be the auto-2 from above).
  const effectiveSplit =
    unit.claims.length > 0 && unit.splitInto > 1 ? unit.splitInto : splitInto;

  // My existing claim on this unit, if any.
  const myClaim = unit.claims.find((c) => c.claimerId === myClaimerId);

  // Portions available: total split minus claimed, but add back my own
  // portions since I can re-allocate them.
  const othersPortions = unit.claims
    .filter((c) => c.claimerId !== myClaimerId)
    .reduce((s, c) => s + c.portions, 0);
  const free = Math.max(0, effectiveSplit - othersPortions);

  const centsPerPortion = Math.round(
    item.priceCents / Math.max(1, effectiveSplit),
  );

  // The other person's name for the "split with X?" prompt.
  const otherClaim = unit.claims.find((c) => c.claimerId !== myClaimerId);

  async function confirm() {
    setErr(null);
    setBusy(true);
    try {
      if (!myName) throw new Error("Enter your name first.");
      if (portions < 1 || portions > free) {
        throw new Error(`Pick between 1 and ${free} portions.`);
      }
      await onClaim({
        unitIndex,
        portions,
        splitInto: effectiveSplit,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not claim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full rounded-b-none rounded-t-2xl p-5 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-display text-xl font-bold">
              {item.name}
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              {centsToDisplay(item.priceCents)} · {item.quantity} unit
              {item.quantity > 1 ? "s" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost !px-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Prompt when someone else already claimed the whole thing */}
        {otherClaim && unit.splitInto <= 1 && !myClaim && (
          <div className="card mt-4 border-[color:var(--color-accent)] p-3 text-sm">
            {otherClaim.name} already claimed this item. Split it with them?
          </div>
        )}

        {item.quantity > 1 && (
          <div className="mt-5">
            <div className="text-xs font-medium text-[color:var(--muted)]">
              Which unit?
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {units.map((u, i) => {
                const split = u.splitInto || 1;
                const left = Math.max(0, split - u.portionsClaimed);
                return (
                  <button
                    type="button"
                    key={i}
                    className={
                      "btn !py-2 text-sm " +
                      (i === unitIndex
                        ? "!border-[color:var(--color-accent-ink)] !bg-[color:var(--color-accent)] !text-[color:var(--color-accent-ink)]"
                        : "")
                    }
                    onClick={() => setUnitIndex(i)}
                  >
                    #{i + 1} · {left}/{split}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">
              Split into
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={unit.claims.length > 0 && unit.splitInto > 1}
              value={effectiveSplit}
              onChange={(e) =>
                setSplitInto(
                  Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                )
              }
              className="mt-1 text-right tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">
              My portions
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={portions}
              onChange={(e) =>
                setPortions(
                  Math.max(
                    1,
                    Math.min(free, Number(e.target.value) || 1),
                  ),
                )
              }
              className="mt-1 text-right tabular-nums"
            />
          </label>
        </div>

        <div className="mt-3 text-sm text-[color:var(--muted)]">
          You'd pay {centsToDisplay(centsPerPortion * portions)} ·{" "}
          {free - portions} portion{free - portions === 1 ? "" : "s"} free
          {myClaim ? " (updating your claim)" : ""}.
        </div>

        {unit.claims.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-[color:var(--muted)]">
              Already on this unit
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {unit.claims.map((c) => {
                const canRemove = isOwner || c.claimerId === myClaimerId;
                return canRemove ? (
                  <button
                    type="button"
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-sm"
                    onClick={() => void onUnclaim(c.id)}
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--color-accent-ink)] bg-[color:var(--color-accent)] text-[10px] font-bold text-[color:var(--color-accent-ink)]">
                      {c.initials || initialsFromName(c.name)}
                    </span>
                    <span>{c.name}</span>
                    <span className="text-[color:var(--muted)]">
                      ×{c.portions}
                    </span>
                    <span className="text-xs text-red-500">remove</span>
                  </button>
                ) : (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-sm"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--color-accent-ink)] bg-[color:var(--color-accent)] text-[10px] font-bold text-[color:var(--color-accent-ink)]">
                      {c.initials || initialsFromName(c.name)}
                    </span>
                    <span>{c.name}</span>
                    <span className="text-[color:var(--muted)]">
                      ×{c.portions}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy || !myName || portions < 1 || portions > free}
          className="btn btn-primary mt-5 w-full"
        >
          {busy
            ? "Saving…"
            : myClaim
              ? "Update my portion"
              : "Claim my portion"}
        </button>
      </div>
    </div>
  );
}
