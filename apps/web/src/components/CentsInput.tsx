"use client";

/**
 * Calculator-style dollar input. The user types raw digits and they fill in
 * from the right:
 *   type "1"    → 0.01
 *   type "2"    → 0.12
 *   type "3"    → 1.23
 *   backspace   → 0.12
 *
 * Value is stored as integer cents — no floating-point parsing needed.
 */
interface CentsInputProps {
  cents: number;
  onChange: (cents: number) => void;
  className?: string;
}

export function CentsInput({ cents, onChange, className }: CentsInputProps) {
  const display = formatCents(cents);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      onChange(Math.floor(cents / 10));
      return;
    }

    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const next = cents * 10 + Number(e.key);
      if (next <= 9999999) onChange(next);
      return;
    }

    // Block anything else that would mutate the field
    if (e.key.length === 1) {
      e.preventDefault();
    }
  }

  // Mobile virtual keyboards often don't fire usable keyDown events (key is
  // "Unidentified"). beforeinput always carries the real data.
  function handleBeforeInput(e: React.FormEvent<HTMLInputElement>) {
    const ie = e.nativeEvent as InputEvent;

    // Deletion — only handle if keyDown didn't already (i.e. mobile path)
    if (ie.inputType === "deleteContentBackward" || ie.inputType === "deleteContentForward") {
      e.preventDefault();
      onChange(Math.floor(cents / 10));
      return;
    }

    // Insertion — extract digits from whatever the keyboard sent
    if (ie.data) {
      e.preventDefault();
      let current = cents;
      for (const ch of ie.data) {
        if (ch >= "0" && ch <= "9") {
          const next = current * 10 + Number(ch);
          if (next <= 9999999) current = next;
        }
      }
      if (current !== cents) onChange(current);
      return;
    }

    // Block anything unexpected
    e.preventDefault();
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onKeyDown={handleKeyDown}
      onBeforeInput={handleBeforeInput}
      onChange={() => {}}
      className={"text-right tabular-nums " + (className ?? "")}
    />
  );
}

function formatCents(cents: number): string {
  return (Math.abs(Math.round(cents)) / 100).toFixed(2);
}
