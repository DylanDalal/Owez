"use client";

import { useState } from "react";
import type { BillItem, UnitState } from "@owez/shared";
import { initialsFromName } from "@owez/shared";
import { centsToDisplay } from "@/lib/format";

/**
 * Bottom-sheet / modal that opens on long-press of a ReceiptItemCard. Lets
 * the current viewer:
 *   - pick which unit of the item to act on (if quantity > 1)
 *   - split a unit N ways and claim X portions of that split
 *   - remove another person's claim
 *
 * The first claim on a unit sets its splitInto; subsequent claims must
 * match. The sheet disables the split input once a unit already has claims
 * to reflect that constraint.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  item: BillItem;
  units: UnitState[];
  initialUnitIndex: number;
  myName: string;
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
  onClaim,
  onUnclaim,
}: Props) {
  const [unitIndex, setUnitIndex] = useState(initialUnitIndex);
  const [splitInto, setSplitInto] = useState(1);
  const [portions, setPortions] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const unit = units[unitIndex];
  // Once a unit has claims, its splitInto is fixed — echo that through the UI.
  const effectiveSplit =
    unit && unit.claims.length > 0 ? unit.splitInto : splitInto;
  const free = Math.max(0, effectiveSplit - (unit?.portionsClaimed ?? 0));
  const centsPerPortion = Math.round(item.priceCents / Math.max(1, effectiveSplit));

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
              type="number"
              min={1}
              max={50}
              disabled={!!unit && unit.claims.length > 0}
              value={effectiveSplit}
              onChange={(e) =>
                setSplitInto(
                  Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                )
              }
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">
              My portions
            </span>
            <input
              type="number"
              min={1}
              max={effectiveSplit}
              value={portions}
              onChange={(e) =>
                setPortions(
                  Math.max(
                    1,
                    Math.min(effectiveSplit, Number(e.target.value) || 1),
                  ),
                )
              }
              className="mt-1"
            />
          </label>
        </div>

        <div className="mt-3 text-sm text-[color:var(--muted)]">
          You'd pay {centsToDisplay(centsPerPortion * portions)} ·{" "}
          {free} portion{free === 1 ? "" : "s"} free on this unit.
        </div>

        {unit && unit.claims.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-[color:var(--muted)]">
              Already on this unit — tap to remove
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {unit.claims.map((c) => (
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
                  <span className="text-[color:var(--muted)]">×{c.portions}</span>
                  <span className="text-xs text-red-500">remove</span>
                </button>
              ))}
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
          {busy ? "Claiming…" : "Claim my portion"}
        </button>
      </div>
    </div>
  );
}
