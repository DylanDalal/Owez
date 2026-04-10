'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  return (
    <button
      aria-label="Toggle theme"
      className="btn btn-ghost !px-3"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try { localStorage.setItem('owez-theme', next ? 'dark' : 'light'); } catch {}
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
