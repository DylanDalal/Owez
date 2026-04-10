'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const { user, profile } = useAuth();
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-[color:var(--bg)]/80 border-b border-[color:var(--border)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
          <span className="inline-block h-6 w-6 rounded-md bg-accent border-2 border-accent-ink" />
          <span>Owez</span>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
              <Link href="/account" className="btn btn-ghost">
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt=""
                    className="h-7 w-7 rounded-full border-2 border-accent"
                  />
                ) : (
                  <span>Account</span>
                )}
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">Continue</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
