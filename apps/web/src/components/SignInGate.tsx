"use client";

import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { useAuth } from "@/lib/auth";

/**
 * Wraps a subtree that requires a real (non-anonymous) creator account.
 * Anonymous users (who land here from a shared bill link) get the sign-in
 * prompt too, since creating a bill must be tied to a real account.
 *
 * This is a modal in spirit — rendered inline rather than as an overlay —
 * because the app's design language keeps it as a page-level gate rather
 * than a dedicated /login route.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const { user, loading, isAnonymous, signInWithGoogle, signInWithApple } =
    useAuth();

  if (loading) return null;

  if (!user || isAnonymous) {
    return (
      <main>
        <Header />
        <section className="mx-auto max-w-md px-6 pt-16">
          <h1 className="font-display text-4xl font-bold">Sign in to continue</h1>
          <p className="mt-4 text-sm text-[color:var(--muted)]">
            Bill creators sign in so we can tie receipts to you. Friends claim
            items without an account. They just open the share link.
          </p>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="btn btn-primary w-full"
            >
              <GoogleMark />
              Sign up with Google
            </button>
            <button
              type="button"
              onClick={() => void signInWithApple()}
              className="btn w-full"
            >
              <AppleMark />
              Sign up with Apple
            </button>
          </div>

          <p className="mt-6 text-xs text-[color:var(--muted)]">
            By continuing you agree to the{" "}
            <a href="/terms" className="underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  return <>{children}</>;
}

/* ---------- provider marks ---------- */

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 48 48"
      className="shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.8 32 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.8 6.9 29.1 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.7 19 13 24 13c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.8 6.9 29.1 5 24 5 16.3 5 9.6 9.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43c5 0 9.7-1.9 13.2-5l-6.1-5.1C29.2 34.3 26.7 35 24 35c-5.2 0-9.7-3-11.3-7.3l-6.5 5C9.5 38.6 16.2 43 24 43z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.5l6.1 5.1C41 34.8 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      className="shrink-0"
      fill="currentColor"
    >
      <path d="M16.365 1.43c0 1.14-.43 2.24-1.14 3.02-.72.81-1.89 1.43-2.86 1.36-.11-1.1.43-2.26 1.11-2.99.76-.82 2.02-1.44 2.89-1.39zM20.6 17.18c-.53 1.22-.79 1.76-1.48 2.84-.96 1.52-2.32 3.41-4 3.42-1.5.02-1.89-.99-3.93-.97-2.05.02-2.48.98-3.98.97-1.69-.02-2.97-1.72-3.93-3.24C.63 15.8-.02 9.9 3.8 7.4c1.38-.93 2.86-1.44 4.39-1.44 1.62 0 2.65.93 4 .93 1.29 0 2.08-.93 3.96-.93 1.41 0 2.9.78 3.97 2.12-3.48 1.9-2.92 6.87 1.18 8.75-.52.92-1.1 1.9-1.7 2.35z" />
    </svg>
  );
}
