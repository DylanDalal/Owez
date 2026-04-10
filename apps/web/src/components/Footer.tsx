import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[color:var(--border)] pt-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-[color:var(--muted)] sm:flex-row">
        <div className="flex items-center gap-2 font-display">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-4 w-4 rounded" />
          <span>Owez</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="https://www.linkedin.com/in/dylandalal/" target="_blank" rel="noopener">Made in NYC</a>
        </nav>
      </div>
    </footer>
  );
}
