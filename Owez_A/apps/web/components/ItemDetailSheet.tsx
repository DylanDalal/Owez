'use client';

import { useState } from 'react';
import type { ReceiptItem, UnitState, Claim } from '@owez/shared';
import { formatMoney, initialsFromName } from '@owez/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  item: ReceiptItem;
  itemIndex: number;
  units: UnitState[];
  myName: string;
  mySessionId: string;
  onClaim: (args: {
    unitIndex: number;
    portions: number;
    splitInto: number;
  }) => Promise<void>;
  onUnclaim: (claimId: string) => Promise<void>;
}

/**
 * Opens on long-press / right-click. Lets the user split a single unit N
 * ways, claim multiple portions of an N-way split, or remove other people's
 * claims (the brief says "allows them to claim items that have already been
 * claimed" and provides a "remove" screen from the same menu).
 */
export function ItemDetailSheet({
  open,
  onClose,
  item,
  itemIndex,
  units,
  myName,
  mySessionId,
  onClaim,
  onUnclaim,
}: Props) {
  const [unitIndex, setUnitIndex] = useState(0);
  const [splitInto, setSplitInto] = useState(1);
  const [portions, setPortions] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const unit = units[unitIndex];
  const effectiveSplit =
    unit && unit.claims.length > 0 ? unit.splitInto : splitInto;
  const free = Math.max(
    0,
    effectiveSplit - (unit?.portionsClaimed ?? 0),
  );
  const perPortion = item.price / Math.max(1, effectiveSplit);

  async function confirm() {
    setErr(null);
    setBusy(true);
    try {
      if (!myName) throw new Error('Enter your name first');
      await onClaim({
        unitIndex,
        portions,
        splitInto: effectiveSplit,
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not claim');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md p-5 sm:rounded-2xl rounded-t-2xl rounded-b-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xl font-bold">{item.name}</div>
            <div className="text-sm text-[color:var(--muted)]">
              {formatMoney(item.price)} · {item.quantity} unit{item.quantity > 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3">✕</button>
        </div>

        {item.quantity > 1 && (
          <div className="mt-5">
            <div className="text-xs font-medium text-[color:var(--muted)]">Which unit?</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {units.map((u, i) => {
                const free = Math.max(0, (u.splitInto || 1) - u.portionsClaimed);
                return (
                  <button
                    key={i}
                    className={
                      'btn !py-2 text-sm ' +
                      (i === unitIndex ? '!bg-accent !text-accent-ink !border-accent-ink' : '')
                    }
                    onClick={() => setUnitIndex(i)}
                  >
                    #{i + 1} · {free}/{u.splitInto || 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">Split into</span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={!!unit && unit.claims.length > 0}
              value={effectiveSplit}
              onChange={(e) => setSplitInto(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">My portions</span>
            <input
              type="number"
              min={1}
              max={effectiveSplit}
              value={portions}
              onChange={(e) => setPortions(Math.max(1, Math.min(effectiveSplit, Number(e.target.value) || 1)))}
              className="mt-1"
            />
          </label>
        </div>

        <div className="mt-3 text-sm text-[color:var(--muted)]">
          I pay {formatMoney(perPortion * portions)} · {free} portion
          {free === 1 ? '' : 's'} free on this unit.
        </div>

        {unit && unit.claims.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-[color:var(--muted)]">
              Already on this unit — tap to remove
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {unit.claims.map((c) => (
                <button
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-sm"
                  onClick={() => onUnclaim(c.id)}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent border-2 border-accent-ink text-[10px] font-bold text-accent-ink">
                    {c.initials || initialsFromName(c.guestName)}
                  </span>
                  <span>{c.guestName}</span>
                  <span className="text-[color:var(--muted)]">×{c.portions}</span>
                  <span>→</span>
                  <span className="text-xs text-red-500">remove</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

        <button
          onClick={confirm}
          disabled={busy || !myName || portions < 1 || portions > free}
          className="btn btn-primary w-full mt-5"
        >
          {busy ? 'Claiming…' : 'Claim my portion'}
        </button>
      </div>
    </div>
  );
}
