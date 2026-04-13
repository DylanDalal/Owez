"use client";

import { useState } from "react";
import type { BillItem, Claim, UnitState } from "@owez/shared";
import { initialsFromName } from "@owez/shared";
import { centsToDisplay } from "@/lib/format";

/**
 * A single receipt line-item card on the claim page.
 *
 * Interaction model:
 *   - Plain tap   → claim one whole portion of the next available unit.
 *                    If fully claimed, opens detail sheet to split.
 *   - Long-press / right-click → open ItemDetailSheet for splitting or
 *                                 removing someone else's claim.
 *   - Taps on an existing stamp → pop a name tooltip; if it's yours, offer
 *                                 a "remove" action.
 */
export interface ReceiptItemCardProps {
  item: BillItem;
  /** One UnitState per unit of this item (length === item.quantity). */
  units: UnitState[];
  /** Current viewer's typed name (empty until they've entered it). */
  myName: string;
  /** Current viewer's Firebase uid, used to detect "this claim is mine". */
  myClaimerId: string;
  /** Current viewer's profile photo, if they're signed in with Google/Apple. */
  myPhotoURL?: string;
  onQuickClaim: (unitIndex: number) => void;
  onOpenDetail: (unitIndex: number) => void;
  onUnclaim: (claimId: string) => void;
}

export function ReceiptItemCard({
  item,
  units,
  myName,
  myClaimerId,
  myPhotoURL,
  onQuickClaim,
  onOpenDetail,
  onUnclaim,
}: ReceiptItemCardProps) {
  const myInitials = initialsFromName(myName);

  const totalPortions = units.reduce((s, u) => s + (u.splitInto || 1), 0);
  const claimedPortions = units.reduce((s, u) => s + u.portionsClaimed, 0);
  const fullyClaimed = claimedPortions >= totalPortions;

  const nextAvailableUnit = units.findIndex(
    (u) => u.portionsClaimed < (u.splitInto || 1),
  );

  const allClaims = units.flatMap((u) => u.claims);
  const uniqueClaimants = dedupeClaimants(allClaims);

  const [pressTimer, setPressTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  function startPress(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
    if (!myName) return; // parent focuses the name input instead
    if (nextAvailableUnit === -1) {
      // Fully claimed — open the detail sheet so user can split with the
      // existing claimer.
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
        "card relative cursor-pointer select-none p-4 transition " +
        (fullyClaimed
          ? "opacity-90"
          : "hover:border-[color:var(--color-accent)]")
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
          <div className="truncate font-semibold">{item.name}</div>
          <div className="text-sm tabular-nums text-[color:var(--muted)]">
            {centsToDisplay(item.priceCents)}
            {item.quantity > 1 && ` · ×${item.quantity}`}
          </div>
        </div>
        {item.quantity > 1 && (
          <div className="whitespace-nowrap text-xs text-[color:var(--muted)]">
            {Math.max(0, totalPortions - claimedPortions)} left
          </div>
        )}
      </div>

      {uniqueClaimants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {uniqueClaimants.map((c) => {
            const isPartial =
              c.claim.splitInto > 1 &&
              c.claim.portions < c.claim.splitInto;
            return (
              <Stamp
                key={c.key}
                claim={c.claim}
                mine={c.claim.claimerId === myClaimerId}
                partial={isPartial}
                onUnclaim={() => onUnclaim(c.claim.id)}
              />
            );
          })}
        </div>
      )}

      {/* Faded preview stamp in the bottom-right hints at what a tap will do. */}
      {!fullyClaimed && (myInitials || myPhotoURL) && (
        <div className="pointer-events-none absolute bottom-3 right-3 opacity-30">
          {myPhotoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={myPhotoURL}
              alt=""
              className="h-7 w-7 -rotate-6 rounded-full border-2 border-[color:var(--color-accent-ink)] object-cover"
            />
          ) : (
            <div className="stamp !h-7 !w-7 !min-w-7 !p-0 !text-xs">
              {myInitials}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function dedupeClaimants(claims: Claim[]) {
  const out: Array<{ key: string; claim: Claim }> = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const key = `${c.claimerId}:${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, claim: c });
  }
  return out;
}

function Stamp({
  claim,
  mine,
  partial,
  onUnclaim,
}: {
  claim: Claim;
  mine: boolean;
  partial: boolean;
  onUnclaim: () => void;
}) {
  const initials = claim.initials || initialsFromName(claim.name);
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {claim.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={claim.photoURL}
          alt={claim.name}
          className={
            "h-8 w-8 -rotate-6 rounded-full border-2 border-[color:var(--color-accent-ink)] object-cover" +
            (partial ? " stamp-half" : "")
          }
        />
      ) : (
        <span
          className={
            "stamp animate-[stampIn_260ms_cubic-bezier(0.2,0.9,0.3,1.2)] !h-8 !w-8 !min-w-8 !p-0 !text-xs" +
            (partial ? " stamp-half" : "")
          }
        >
          {initials}
        </span>
      )}
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-1 text-xs shadow">
          {claim.name}
          {claim.splitInto > 1 && (
            <span className="text-[color:var(--muted)]">
              {" "}
              ({claim.portions}/{claim.splitInto})
            </span>
          )}
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
