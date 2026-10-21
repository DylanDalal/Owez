"use client";

import { useEffect, useRef, useState } from "react";
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
    duplicate?: boolean;
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
  const [splitRaw, setSplitRaw] = useState<string | null>(null);
  const [portions, setPortions] = useState(1);
  const [portionsRaw, setPortionsRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The sheet is opened by a long-press; the browser then fires a `click`
  // on release, which lands on our backdrop and would close us immediately
  // (however long the finger was held). Only treat a backdrop click as a
  // dismissal if the pointer also went DOWN on the backdrop while we were
  // open — a trailing click from the press that opened us never did.
  const backdropArmed = useRef(false);

  const unit = open ? units[unitIndex] : undefined;

  useEffect(() => {
    backdropArmed.current = false;
  }, [open]);

  function handleBackdropPointerDown(e: React.PointerEvent) {
    if (e.target === e.currentTarget) backdropArmed.current = true;
  }
  function handleBackdropClick(e: React.MouseEvent) {
    const armed = backdropArmed.current;
    backdropArmed.current = false;
    if (e.target === e.currentTarget && armed) onClose();
  }

  // Seed split / portions from the unit's current state when opening.
  useEffect(() => {
    if (!open || !unit) return;
    setPortions(1);
    if (unit.claims.length > 0 && unit.splitInto > 1) {
      // Unit is genuinely already split — reflect that value so the user can
      // adjust it, not "default" them into a split.
      setSplitInto(unit.splitInto);
    } else {
      // Always default to 1 ("no split"). A long-press only opens this sheet;
      // it must never split a unit by accident. The user opts into splitting
      // by raising this themselves.
      setSplitInto(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unitIndex]);

  if (!open || !unit) return null;

  const effectiveSplit = splitInto;

  // My existing (non-duplicate) claim on this unit, if any — duplicates
  // are independent charges so we don't treat them as the "my portion" claim.
  const myClaim = unit.claims.find(
    (c) => c.claimerId === myClaimerId && !c.duplicate,
  );

  // Portions available: total split minus claimed, but add back my own
  // portions since I can re-allocate them. Duplicate claims are excluded
  // because they sit outside the split.
  const othersPortions = unit.claims
    .filter((c) => c.claimerId !== myClaimerId && !c.duplicate)
    .reduce((s, c) => s + c.portions, 0);
  const free = Math.max(0, effectiveSplit - othersPortions);

  const centsPerPortion = Math.round(
    item.priceCents / Math.max(1, effectiveSplit),
  );

  // The other person's name for the "split with X?" prompt.
  const otherClaim = unit.claims.find(
    (c) => c.claimerId !== myClaimerId && !c.duplicate,
  );
  const anyClaim = unit.claims.some((c) => !c.duplicate);
  // Others hold every portion and I have none to re-allocate.
  const nothingFree = free === 0 && !myClaim;

  async function confirm() {
    setErr(null);
    setBusy(true);
    try {
      if (!myName) throw new Error("Enter your name first.");
      if (nothingFree) {
        throw new Error("Every portion is taken. Raise the split to share it.");
      }
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

  async function confirmDuplicate() {
    setErr(null);
    setBusy(true);
    try {
      if (!myName) throw new Error("Enter your name first.");
      await onClaim({
        unitIndex,
        portions: 1,
        splitInto: 1,
        duplicate: true,
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
      className="fixed inset-0 z-50 flex select-none items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className="card w-full select-none rounded-b-none rounded-t-2xl p-5 sm:max-w-md sm:rounded-2xl"
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
          <div className="card mt-4 flex items-center justify-between gap-3 !border-[color:var(--color-accent)] p-3 text-sm">
            <span>{otherClaim.name} already claimed this item.</span>
            {splitInto <= 1 && (
              <button
                type="button"
                className="btn btn-primary shrink-0 !py-1.5 !px-3 text-sm"
                onClick={() => {
                  // Explicit opt-in to splitting — never defaulted.
                  setSplitInto(2);
                  setPortions(1);
                  setErr(null);
                }}
              >
                Split with {otherClaim.name.split(/\s+/)[0]}
              </button>
            )}
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
              value={splitRaw !== null ? splitRaw : effectiveSplit}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setSplitRaw(v);
              }}
              onFocus={() => setSplitRaw(String(effectiveSplit))}
              onBlur={() => {
                const n = Math.max(1, Math.min(50, Number(splitRaw) || 1));
                setSplitInto(n);
                setSplitRaw(null);
              }}
              className="mt-1 tabular-nums"
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
              value={portionsRaw !== null ? portionsRaw : portions}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setPortionsRaw(v);
              }}
              onFocus={() => setPortionsRaw(String(portions))}
              onBlur={() => {
                const n = Math.max(1, Math.min(free, Number(portionsRaw) || 1));
                setPortions(n);
                setPortionsRaw(null);
              }}
              className="mt-1 tabular-nums"
            />
          </label>
        </div>

        <div className="mt-3 text-sm text-[color:var(--muted)]">
          You'd pay {centsToDisplay(centsPerPortion * portions)} ·{" "}
          {Math.max(0, free - portions)} portion
          {Math.max(0, free - portions) === 1 ? "" : "s"} free
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
                      {c.duplicate ? "duplicate" : `×${c.portions}`}
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
                      {c.duplicate ? "duplicate" : `×${c.portions}`}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

        {nothingFree && (
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Every portion is taken. Raise &ldquo;Split into&rdquo; to share it,
            or add your own below.
          </p>
        )}

        <button
          type="button"
          onClick={() => void confirm()}
          disabled={
            busy || !myName || nothingFree || portions < 1 || portions > free
          }
          className="btn btn-primary mt-5 w-full"
        >
          {busy
            ? "Saving…"
            : myClaim
              ? "Update my portion"
              : splitInto <= 1
                ? "Claim whole item"
                : `Claim ${portions}/${splitInto}`}
        </button>

        {anyClaim && (
          <>
            <div className="receipt-divider my-4" />
            <button
              type="button"
              onClick={() => void confirmDuplicate()}
              disabled={busy || !myName}
              className="btn w-full"
            >
              I also ordered one of these
            </button>
            <p className="mt-2 text-xs text-[color:var(--muted)]">
              Adds a separate {centsToDisplay(item.priceCents)} charge for you —
              doesn&apos;t touch the existing split.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
