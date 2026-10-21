"use client";

import { useState } from "react";

interface SplitEvenlyModalProps {
  open: boolean;
  onClose: () => void;
  /** Suggested head-count — usually the tab's member count. */
  defaultSplitCount: number;
  /** Receipt title, for the explanatory copy. */
  billTitle?: string;
  /**
   * Called with the chosen head-count. The caller claims 1/N of every unit
   * on the receipt for the *current viewer only* — rules don't let anyone
   * write claims on someone else's behalf.
   */
  onApply: (splitCount: number) => Promise<void>;
}

export function SplitEvenlyModal({
  open,
  onClose,
  defaultSplitCount,
  billTitle,
  onApply,
}: SplitEvenlyModalProps) {
  const [splitCount, setSplitCount] = useState(String(defaultSplitCount));
  const [isLoading, setIsLoading] = useState(false);

  const count = Math.max(
    2,
    Math.min(50, Number(splitCount) || defaultSplitCount),
  );

  const handleApply = async () => {
    setIsLoading(true);
    try {
      await onApply(count);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:items-end">
        <div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-[color:var(--bg)] border border-[color:var(--border)] shadow-lg">
          <div className="p-4 sm:p-6">
            <h2 className="font-display text-lg font-bold mb-1">
              Split evenly
            </h2>
            <p className="text-sm text-[color:var(--muted)] mb-4">
              Split {billTitle ? `"${billTitle}"` : "this receipt"} between a
              group and take your share of every item.
            </p>

            <label className="block mb-4">
              <div className="text-sm font-medium mb-2">
                How many people are splitting it?
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={splitCount}
                onChange={(e) =>
                  setSplitCount(e.target.value.replace(/\D/g, ""))
                }
                onBlur={() => setSplitCount(String(count))}
                className="tabular-nums"
              />
            </label>

            <p className="text-xs text-[color:var(--muted)] mb-6">
              You&apos;ll be put down for 1/{count} of each item that
              isn&apos;t already yours. Items someone has already split more
              ways keep their split. Everyone else does the same from their
              own phone.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="btn flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={isLoading}
                className="btn btn-primary flex-1"
              >
                {isLoading ? "Splitting…" : `Take my 1/${count}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
