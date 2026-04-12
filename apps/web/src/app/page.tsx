"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LandingReceiptMock } from "@/components/LandingReceiptMock";
import { useAuth } from "@/lib/auth";

/**
 * Landing page. Hero + three-step explainer + two feature mocks + footer.
 * Visual design ported from the Owez_A reference; the CTAs route into the
 * existing auth flow (/me gates on SignInGate, which offers Google + Apple).
 */
export default function LandingPage() {
  const { user, isAnonymous, signInWithGoogle, signInWithApple } = useAuth();
  const signedIn = !!user && !isAnonymous;

  return (
    <main>
      <Header />

      {/* Hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-24 pt-16 md:grid-cols-2">
        <div>
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight md:text-6xl">
            Who Still
            <br />
            Owez&nbsp;You?
          </h1>
          <p className="mt-6 max-w-md text-lg text-[color:var(--muted)]">
            Upload your receipt and send a link. Your friends pick their stuff
            and pay you back. They don't need the app. They don't even need
            to sign up.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <>
                <Link href="/new" className="btn btn-primary text-base">
                  Snap a receipt
                </Link>
                <Link href="/me" className="btn">
                  Your dashboard
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="btn btn-primary text-base"
                >
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() => void signInWithApple()}
                  className="btn text-base"
                >
                  Continue with Apple
                </button>
              </>
            )}
          </div>
        </div>
        <div className="relative">
          <LandingReceiptMock />
        </div>
      </section>

      <div className="receipt-divider mx-auto max-w-5xl" />

      {/* Three steps */}
      <section id="how" className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Just send the link.
        </h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          <Step
            n={1}
            title="Scan the receipt"
            body="Upload a photo. Edit anything the parser got wrong before you share."
          />
          <Step
            n={2}
            title="Drop the link"
            body="Share the link with your table. They don't have to sign up, they just type their name and tap their items."
          />
          <Step
            n={3}
            title="Get paid"
            body="Each friend sees their exact total and options to pay you with your desired method."
          />
        </ol>

        <div className="mt-16 grid items-center gap-10 md:grid-cols-2">
          <div>
            <h3 className="font-display text-2xl font-bold">
              Items lock in real time.
            </h3>
            <p className="mt-2 text-[color:var(--muted)]">
              Everyone can see who's claimed which items. Duplicate items? Each order
              can be claimed by a different person. Splitting an appetizer
              five ways? Long-press it and pick your portion.
            </p>
          </div>
          <LandingLockMock />
        </div>

        <div className="mt-16 grid items-center gap-10 md:grid-cols-2">
          <LandingDashboardMock />
          <div>
            <h3 className="font-display text-2xl font-bold">
              See who still Owez you.
            </h3>
            <p className="mt-2 text-[color:var(--muted)]">
              Your dashboard shows every receipt with outstanding payments and
              the total you've recouped. No spreadsheet required.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="card list-none p-6">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color:var(--color-accent-ink)] bg-[color:var(--color-accent)] font-display font-bold text-[color:var(--color-accent-ink)]">
        {n}
      </div>
      <h4 className="mt-4 font-display text-xl font-bold">{title}</h4>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{body}</p>
    </li>
  );
}

function LandingLockMock() {
  return (
    <div className="card space-y-2 overflow-hidden p-4 font-mono text-sm">
      <MockRow name="Fried Chicken Sand." price="$24.00" who="SC" second="MR" />
      <MockRow name="Mac & Cheese" price="$12.00" who="GR" />
      <MockRow name="Catfish Strips" price="$22.00" who="AC" second="JH" />
      <MockRow name="Collard Greens" price="$10.00" who={null} ghost />
      <div className="receipt-divider" />
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>SC owes</span>
        <span>$12.00</span>
      </div>
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>MR owes</span>
        <span>$12.00</span>
      </div>
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>GR owes</span>
        <span>$12.00</span>
      </div>
    </div>
  );
}

function MockRow({
  name,
  price,
  who,
  second,
  ghost,
}: {
  name: string;
  price: string;
  who: string | null;
  second?: string;
  ghost?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between rounded-lg border border-[color:var(--border)] px-3 py-2 " +
        (ghost ? "opacity-50" : "")
      }
    >
      <span>{name}</span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{price}</span>
        {who && (
          <span className="stamp !h-7 !w-7 !min-w-7 !p-0 !text-xs">{who}</span>
        )}
        {second && (
          <span className="stamp !h-7 !w-7 !min-w-7 !p-0 !text-xs">
            {second}
          </span>
        )}
      </div>
    </div>
  );
}

function LandingDashboardMock() {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-lg font-bold">Dashboard</h4>
        <span className="text-xs text-[color:var(--muted)]">$142.18 saved</span>
      </div>
      <div className="mt-3 space-y-2">
        {[
          { name: "Radegast Biergarten", total: "$62.00", owed: "$22.00" },
          { name: "Costco", total: "$48.50", owed: "$0.00" },
          { name: "Qahwah House Coffee", total: "$91.25", owed: "$34.00" },
        ].map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between rounded-lg border border-[color:var(--border)] px-3 py-2"
          >
            <span className="font-medium">{r.name}</span>
            <div className="text-right">
              <div className="tabular-nums">{r.total}</div>
              <div className="text-xs text-[color:var(--muted)]">
                {r.owed === "$0.00" ? "Settled" : `Still owed ${r.owed}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
