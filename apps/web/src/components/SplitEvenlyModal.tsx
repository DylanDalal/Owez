"use client";

import { useState } from "react";

interface SplitEvenlyModalProps {
  open: boolean;
  onClose: () => void;
  defaultSplitCount: number;
  onApply: (splitCount: number, autoAssignOthers: boolean) => Promise<void>;
}

export function SplitEvenlyModal({
  open,
  onClose,
  defaultSplitCount,
  onApply,
}: SplitEvenlyModalProps) {
  const [splitCount, setSplitCount] = useState(String(defaultSplitCount));
  const [autoAssign, setAutoAssign] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleApply = async () => {
    const count = Math.max(1, Math.min(50, Number(splitCount) || defaultSplitCount));
    setIsLoading(true);
    try {
      await onApply(count, autoAssign);
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
            <h2 className="font-display text-lg font-bold mb-4">
              Split evenly
            </h2>

            <label className="block mb-4">
              <div className="text-sm font-medium mb-2">
                Number of people
              </div>
              <input
                type="number"
                min="1"
                max="50"
                value={splitCount}
                onChange={(e) => setSplitCount(e.target.value)}
                className=""
              />
            </label>

            <label className="flex items-center gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="h-5 w-5 rounded border border-[color:var(--border)]"
              />
              <span className="text-sm">
                Automatically assign other users
              </span>
            </label>

            {autoAssign && (
              <p className="text-xs text-[color:var(--muted)] mb-4">
                This will create claims for all tab members with an equal split of each item.
              </p>
            )}

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
                {isLoading ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
