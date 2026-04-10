'use client';

import { useState } from 'react';
import type { Claim, ReceiptItem, UnitState } from '@owez/shared';
import { formatMoney, initialsFromName } from '@owez/shared';

export interface ReceiptItemCardProps {
  item: ReceiptItem;
  itemIndex: number;
  /** One UnitState per unit of this item (length === item.quantity) */
  units: UnitState[];
  /** Current guest's name — empty until they've typed one */
  myName: string;
  /** Current guest's sessionId (for "is this my claim?") */
  mySessionId: string;
  onQuickClaim: (unitIndex: number) => void;
  onOpenDetail: (unitIndex: number) => void;
  onUnclaim: (claimId: string) => void;
  /** Map of uid -> photoURL for signed-in claimants, so we can show avatars */
  photoByUid: Record<string, string | undefined>;
}

export function ReceiptItemCard({
  item,
  itemIndex,
  units,
  myName,
  mySessionId,
  onQuickClaim,
  onOpenDetail,
  onUnclaim,
  photoByUid,
}: ReceiptItemCardProps) {
  const myInitials = initialsFromName(myName);

  // Totals across all units for the summary line
  const totalPortions = units.reduce((s, u) => s + (u.splitInto || 1), 0);
  const claimedPortions = units.reduce((s, u) => s + u.portionsClaimed, 0);
  const fullyClaimed = claimedPortions >= totalPortions;

  // The first unit with a free portion — where a plain tap will land.
  const nextAvailableUnit = units.findIndex(
    (u) => u.portionsClaimed < (u.splitInto || 1),
  );

  // All claims flattened for the "who's on this" rendering
  const allClaims = units.flatMap((u) => u.claims);
  const uniqueClaimants = dedupeClaimants(allClaims);

  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function startPress(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pressTimer) clearTimeout(pressTimer);
    const t = setTimeout(() => {
      onOpenDetail(nextAvailableUnit >= 0 ? nextAvailableUnit : 0);
    }, 450);
    setPressTimer(t);
  }
  function endPress() {
    if (pressTimer) clearTimeout(pressTimer);
    setPressTimer(null);
  }

  function handleClick() {
    if (!myName) return; // Name input will focus instead (handled by parent)
    if (nextAvailableUnit === -1) {
      // Fully claimed — a plain tap opens the detail so the user can see who
      // claimed what. A long-press can still "steal" via the detail sheet.
      onOpenDetail(0);
      return;
    }
    onQuickClaim(nextAvailableUnit);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onOpenDetail(nextAvailableUnit >= 0 ? nextAvailableUnit : 0);
  }

  return (
    <div
      className={
        'card p-4 relative select-none cursor-pointer transition ' +
        (fullyClaimed ? 'opacity-90' : 'hover:border-accent')
      }
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{item.name}</div>
          <div className="text-sm text-[color:var(--muted)] tabular-nums">
            {formatMoney(item.price)}
            {item.quantity > 1 && ` · ×${item.quantity}`}
          </div>
        </div>
        {item.quantity > 1 && (
          <div className="text-xs text-[color:var(--muted)] whitespace-nowrap">
            {Math.max(0, totalPortions - claimedPortions)} left
          </div>
        )}
      </div>

      {uniqueClaimants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {uniqueClaimants.map((c) => (
            <Stamp
              key={c.key}
              claim={c.claim}
              photoURL={c.claim.ownerUid ? photoByUid[c.claim.ownerUid] : c.claim.photoURL}
              mine={c.claim.sessionId === mySessionId || (!!myName && c.claim.guestName === myName)}
              onUnclaim={() => onUnclaim(c.claim.id)}
            />
          ))}
        </div>
      )}

      {/* "Preview" stamp in the bottom-right when the user is about to tap to
          claim their first portion on this item. */}
      {!fullyClaimed && myInitials && (
        <div className="absolute bottom-3 right-3 opacity-30">
          <div className="stamp !h-7 !min-w-7 !text-xs !p-0 !w-7">{myInitials}</div>
        </div>
      )}
    </div>
  );
}

function dedupeClaimants(claims: Claim[]) {
  // Show one stamp per (guestName+sessionId) combo. Multi-claims by the same
  // person collapse to a single chip so the card doesn't get noisy.
  const out: Array<{ key: string; claim: Claim }> = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const key = `${c.guestName}:${c.sessionId ?? ''}:${c.ownerUid ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, claim: c });
  }
  return out;
}

function Stamp({
  claim,
  photoURL,
  mine,
  onUnclaim,
}: {
  claim: Claim;
  photoURL?: string | null;
  mine: boolean;
  onUnclaim: () => void;
}) {
  const initials = claim.initials || initialsFromName(claim.guestName);
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {photoURL ? (
        <img
          src={photoURL}
          alt={claim.guestName}
          className="h-8 w-8 rounded-full border-2 border-accent-ink object-cover transform -rotate-6"
        />
      ) : (
        <span className="stamp !h-8 !min-w-8 !text-xs !p-0 !w-8 animate-stampIn">
          {initials}
        </span>
      )}
      {open && (
        <span className="absolute z-20 mt-1 left-0 top-full whitespace-nowrap rounded-md bg-[color:var(--card)] border border-[color:var(--border)] px-2 py-1 text-xs shadow">
          {claim.guestName}
          {mine && (
            <button
              className="ml-2 underline"
              onClick={(e) => {
                e.stopPropagation();
                onUnclaim();
                setOpen(false);
              }}
            >
              remove
            </button>
          )}
        </span>
      )}
    </span>
  );
}
