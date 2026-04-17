"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Venmo-style dollar input. The user types normally — digits grow to the left
 * of the cursor, backspace deletes as expected, and decimals are just another
 * character. If no decimal is entered, ".00" is appended on blur.
 *
 * Value is stored as integer cents — no floating-point precision issues.
 */
interface CentsInputProps {
  cents: number;
  onChange: (cents: number) => void;
  className?: string;
}

export function CentsInput({ cents, onChange, className }: CentsInputProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When not focused, show the formatted value from the cents prop.
  const display = raw !== null ? raw : formatCents(cents);

  function handleFocus() {
    // On focus, show the current value as an editable string.
    // If it's 0, start empty so the user can just type.
    const formatted = cents === 0 ? "" : formatCents(cents);
    setRaw(formatted);

    // Put cursor at the end on next tick.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    // Allow empty string (user clearing the field).
    if (value === "") {
      setRaw("");
      return;
    }

    // Filter: only digits and at most one decimal point.
    // Allow at most 2 digits after the decimal.
    const cleaned = value.replace(/[^\d.]/g, "");

    // Prevent multiple decimal points.
    const parts = cleaned.split(".");
    if (parts.length > 2) return;

    // Limit to 2 decimal places.
    if (parts[1] !== undefined && parts[1].length > 2) return;

    // Cap at a reasonable maximum ($99,999.99).
    const num = Number(cleaned);
    if (num > 99999.99) return;

    setRaw(cleaned);
  }

  function handleBlur() {
    // Parse whatever the user typed into cents.
    const value = raw ?? "";
    let newCents = 0;
    if (value !== "" && value !== ".") {
      const num = Number(value);
      if (!Number.isNaN(num)) newCents = Math.round(num * 100);
    }
    onChange(newCents);
    // Show the formatted value immediately — don't wait for the parent's
    // cents prop to round-trip through re-render. This avoids a glitch where
    // ".2" stays visible after blur because the display string hadn't yet
    // flipped over to formatCents(cents).
    setRaw(formatCents(newCents));
  }

  // Once unfocused, drop our local raw display so the cents prop becomes the
  // source of truth again (e.g. the "18%" tip quick-button updates it).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (raw !== null && document.activeElement !== el) {
      setRaw(null);
    }
  }, [raw, cents]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={"text-right tabular-nums " + (className ?? "")}
    />
  );
}

function formatCents(cents: number): string {
  return (Math.abs(Math.round(cents)) / 100).toFixed(2);
}
