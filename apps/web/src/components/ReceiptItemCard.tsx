"use client";

import { useEffect, useRef, useState } from "react";
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
  const people = groupByPerson(allClaims);
  const visible = people.slice(0, MAX_VISIBLE_STAMPS);
  const hidden = people.slice(MAX_VISIBLE_STAMPS);
  const overflow = hidden.length;

  // Long-press state lives in refs so the pointer handlers never go stale
  // between renders. `longPressFired` lets us swallow the `click` the browser
  // fires on release after a long-press — without it, that click lands on
  // the freshly opened sheet's backdrop (for cards above it) and closes it.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const PRESS_MOVE_TOLERANCE_PX = 8;

  function clearPressTimer() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function startPress(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    clearPressTimer();
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = true;
      onOpenDetail(nextAvailableUnit >= 0 ? nextAvailableUnit : 0);
    }, 450);
  }
  function movePress(e: React.PointerEvent) {
    // Finger drifted — the user is scrolling, not pressing.
    const start = pressStart.current;
    if (!start || !pressTimer.current) return;
    if (
      Math.abs(e.clientX - start.x) > PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - start.y) > PRESS_MOVE_TOLERANCE_PX
    ) {
      clearPressTimer();
    }
  }
  function endPress() {
    clearPressTimer();
    pressStart.current = null;
  }

  useEffect(() => clearPressTimer, []);

  function handleClick() {
    if (longPressFired.current) {
      // Trailing click from a long-press release — the sheet is already open.
      longPressFired.current = false;
      return;
    }
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
      onPointerMove={movePress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
    >
      {/* The name gets the full card width; the stamp row is absolutely
          positioned bottom-right with its top on the price line, so showing
          who claimed an item never costs a row. min-h reserves the room. */}
      <div className="min-h-14">
        <div className="truncate font-semibold">{item.name}</div>
        <div className="pr-44 text-sm tabular-nums text-[color:var(--muted)]">
          {centsToDisplay(item.priceCents)}
          {item.quantity > 1 && ` · ×${item.quantity}`}
          {item.quantity > 1 &&
            ` · ${Math.max(0, totalPortions - claimedPortions)} left`}
        </div>

        <div className="absolute right-4 top-10 flex h-8 items-center gap-1.5">
          {visible.map((person) => (
            <Stamp
              key={person.claimerId}
              person={person}
              mine={person.claimerId === myClaimerId}
              onUnclaim={() => person.claimIds.forEach((id) => onUnclaim(id))}
            />
          ))}
          {overflow > 0 && (
            <OverflowStamp hidden={hidden} count={overflow} />
          )}
          {/* Faded preview stamp hints at what a tap will do. */}
          {!fullyClaimed && (myInitials || myPhotoURL) && (
            <div className="pointer-events-none opacity-30">
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
      </div>
    </div>
  );
}

/** One stamp per person, no matter how many units or portions they hold. */
const MAX_VISIBLE_STAMPS = 3;

interface StampPerson {
  claimerId: string;
  name: string;
  initials: string;
  photoURL?: string;
  claimIds: string[];
  /** True when they hold only part of what they've touched (a split). */
  partial: boolean;
  /** "2/3" style summary when every claim of theirs is the same split. */
  share: string | null;
}

function groupByPerson(claims: Claim[]): StampPerson[] {
  const byId = new Map<string, Claim[]>();
  for (const c of claims) {
    const list = byId.get(c.claimerId);
    if (list) list.push(c);
    else byId.set(c.claimerId, [c]);
  }
  return Array.from(byId.entries()).map(([claimerId, list]) => {
    const splits = list.filter((c) => !c.duplicate && c.splitInto > 1);
    const held = splits.reduce((s, c) => s + c.portions, 0);
    const of = splits.reduce((s, c) => s + c.splitInto, 0);
    const first = list[0]!;
    return {
      claimerId,
      name: first.name,
      initials: first.initials || initialsFromName(first.name),
      photoURL: list.find((c) => c.photoURL)?.photoURL || undefined,
      claimIds: list.map((c) => c.id),
      partial: splits.length === list.length && held < of,
      share:
        list.length === 1 && splits.length === 1
          ? `${held}/${of}`
          : list.length > 1
            ? `×${list.length}`
            : null,
    };
  });
}

/** Closes a tooltip when the user taps anywhere outside `ref`. */
function useCloseOnOutsidePointer(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open, ref, close]);
}

const tooltipClass =
  "absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-1 text-xs shadow";

function Stamp({
  person,
  mine,
  onUnclaim,
}: {
  person: StampPerson;
  mine: boolean;
  onUnclaim: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  useCloseOnOutsidePointer(rootRef, open, () => setOpen(false));

  return (
    <span
      ref={rootRef}
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {person.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.photoURL}
          alt={person.name}
          className={
            "h-8 w-8 -rotate-6 rounded-full border-2 border-[color:var(--color-accent-ink)] object-cover" +
            (person.partial ? " stamp-half" : "")
          }
        />
      ) : (
        <span
          className={
            "stamp animate-[stampIn_260ms_cubic-bezier(0.2,0.9,0.3,1.2)] !h-8 !w-8 !min-w-8 !p-0 !text-xs" +
            (person.partial ? " stamp-half" : "")
          }
        >
          {person.initials}
        </span>
      )}
      {open && (
        <span className={tooltipClass}>
          {person.name}
          {person.share && (
            <span className="text-[color:var(--muted)]"> ({person.share})</span>
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

/** "+2" chip for the people who didn't fit; tap to list their names. */
function OverflowStamp({
  hidden,
  count,
}: {
  hidden: StampPerson[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  useCloseOnOutsidePointer(rootRef, open, () => setOpen(false));

  return (
    <span
      ref={rootRef}
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[color:var(--border)] text-xs font-semibold tabular-nums text-[color:var(--muted)]">
        +{count}
      </span>
      {open && (
        <span className={tooltipClass}>
          {hidden.map((p) => p.name).join(", ")}
        </span>
      )}
    </span>
  );
}
