"use client";

import { useRef, useState, type ReactNode } from "react";

const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = 44;
const HORIZONTAL_INTENT_PX = 10;

/**
 * iOS-style swipe-to-delete row. Swipe left to reveal a red "Delete" action;
 * tap it to confirm. Swiping right or tapping elsewhere snaps the row back.
 * Requires a horizontal drag of >10px dominant over vertical to engage, so
 * vertical scrolling is unaffected.
 */
export function SwipeToDelete({
  children,
  onDelete,
  confirmMessage = "Delete? This can't be undone.",
}: {
  children: ReactNode;
  onDelete: () => void | Promise<void>;
  confirmMessage?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const baseOffset = useRef(0);
  const engaged = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    baseOffset.current = offset;
    engaged.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t || startX.current === null || startY.current === null) return;
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!engaged.current) {
      if (
        Math.abs(dx) > HORIZONTAL_INTENT_PX &&
        Math.abs(dx) > Math.abs(dy) * 1.5
      ) {
        engaged.current = true;
        setDragging(true);
      } else {
        return;
      }
    }
    const next = Math.min(0, Math.max(-ACTION_WIDTH, baseOffset.current + dx));
    setOffset(next);
  }

  function onTouchEnd() {
    startX.current = null;
    startY.current = null;
    if (!engaged.current) return;
    engaged.current = false;
    setDragging(false);
    setOffset(offset < -OPEN_THRESHOLD ? -ACTION_WIDTH : 0);
  }

  function handleDeleteClick() {
    if (confirm(confirmMessage)) {
      void onDelete();
    } else {
      setOffset(0);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={handleDeleteClick}
        aria-label="Delete"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-sm font-semibold text-white"
        style={{ width: ACTION_WIDTH }}
        tabIndex={offset < 0 ? 0 : -1}
      >
        Delete
      </button>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
