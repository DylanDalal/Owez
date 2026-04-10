import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[color:var(--border)]">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
        <div className="flex items-center gap-2 font-display">
          <span className="inline-block h-4 w-4 rounded bg-accent border border-accent-ink" />
          <span>Owez</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <span>Made in NYC</span>
        </nav>
      </div>
    </footer>
  );
}
