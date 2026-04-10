"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Sticky top nav. Shows Dashboard + Account links when signed in, or a
 * single "Continue" CTA that opens the sign-in modal when not. The sign-in
 * modal is owned by SignInGate — we just link to /me (which gates itself).
 */
export function Header() {
  const { user, profile, isAnonymous } = useAuth();
  const signedIn = !!user && !isAnonymous;

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-md" />
          <span>Owez</span>
        </Link>

        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <>
              <Link href="/me" className="btn btn-ghost !h-9 !py-0 text-sm">
                Dashboard
              </Link>
              <Link
                href="/account"
                className="btn btn-ghost !h-9 !w-9 !p-0"
                aria-label="Account"
              >
                {profile?.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.photoURL}
                    alt=""
                    className="h-7 w-7 rounded-full border-2 border-[color:var(--color-accent)] object-cover"
                  />
                ) : (
                  <span className="text-sm">Account</span>
                )}
              </Link>
            </>
          ) : (
            <Link href="/me" className="btn btn-primary !h-9 !py-0 text-sm">
              Continue
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
