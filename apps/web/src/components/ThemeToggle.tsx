"use client";

import { useEffect, useState } from "react";

/**
 * Flips the `.dark` class on <html> and persists the choice to localStorage.
 * The initial class is set by the inline script in `layout.tsx` so this only
 * needs to read the current state on mount.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("owez-theme", next ? "dark" : "light");
    } catch {
      // Safari private mode etc. — the visual toggle still works.
    }
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="btn btn-ghost !px-3"
      onClick={toggle}
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
