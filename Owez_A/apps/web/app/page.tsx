'use client';

import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { LandingReceiptMock } from '@/components/LandingReceiptMock';

export default function LandingPage() {
  return (
    <main>
      <Header />

      {/* Hero — Who Still Owez You? */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-24 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-[0.95]">
            Who Still<br />Owez&nbsp;You?
          </h1>
          <p className="mt-6 text-lg text-[color:var(--muted)] max-w-md">
            Snap the receipt. Send one link. Your friends pick their stuff and
            pay you back. No group chat math. No app downloads for them.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href="/login" className="btn btn-primary text-base">
              Continue with Google
            </Link>
            <Link href="/login" className="btn">
              Continue with Apple
            </Link>
          </div>
          <p className="mt-3 text-xs text-[color:var(--muted)]">
            No account-setup wizard. You're in in about 10 seconds.
          </p>
        </div>
        <div className="relative">
          <LandingReceiptMock />
        </div>
      </section>

      <div className="receipt-divider max-w-5xl mx-auto" />

      {/* Just send the link */}
      <section id="how" className="max-w-5xl mx-auto px-4 py-20">
        <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
          Just send the link.
        </h2>
        <p className="mt-3 text-[color:var(--muted)] max-w-xl">
          Three steps, zero awkwardness. Owez handles the itemization, locking,
          and the payment handoff.
        </p>

        <ol className="mt-12 grid md:grid-cols-3 gap-6">
          <Step
            n={1}
            title="Scan the receipt"
            body="Upload a photo — we read every line item with Mindee. Edit anything the parser got wrong before you share."
          />
          <Step
            n={2}
            title="Drop the link"
            body="Text or DM it to your table. No sign-up for them — they just type their name and tap their items."
          />
          <Step
            n={3}
            title="Get paid"
            body="Each friend sees their exact total and a Venmo / Cash App / Zelle button. You watch the 'still owes' shrink."
          />
        </ol>

        <div className="mt-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h3 className="font-display text-2xl font-bold">Items lock in real time.</h3>
            <p className="mt-2 text-[color:var(--muted)]">
              When a friend claims the fries, the fries are gone from everyone
              else's screen — instantly. Duplicate items? Each order can be
              claimed by a different person. Splitting an appetizer five ways?
              Long-press it and pick your portion.
            </p>
          </div>
          <LandingLockMock />
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-10 items-center">
          <LandingDashboardMock />
          <div>
            <h3 className="font-display text-2xl font-bold">See who still Owez you.</h3>
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
    <li className="card p-6 list-none">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-accent text-accent-ink font-display font-bold border-2 border-accent-ink">
        {n}
      </div>
      <h4 className="mt-4 font-display text-xl font-bold">{title}</h4>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{body}</p>
    </li>
  );
}

function LandingLockMock() {
  return (
    <div className="card p-4 font-mono text-sm space-y-2 overflow-hidden">
      <MockRow name="Truffle Fries" price="$14.00" who="JC" />
      <MockRow name="Burger (×2)" price="$18.00" who="AM" second="SK" />
      <MockRow name="Margarita" price="$13.00" who="AM" />
      <MockRow name="Tiramisu" price="$9.00" who={null} ghost />
      <div className="receipt-divider" />
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>JC owes</span><span>$14.00</span>
      </div>
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>AM owes</span><span>$22.00</span>
      </div>
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>SK owes</span><span>$9.00</span>
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
        'flex items-center justify-between rounded-lg border border-[color:var(--border)] px-3 py-2 ' +
        (ghost ? 'opacity-50' : '')
      }
    >
      <span>{name}</span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{price}</span>
        {who && <span className="stamp !h-7 !min-w-7 !text-xs !p-0 !w-7">{who}</span>}
        {second && (
          <span className="stamp !h-7 !min-w-7 !text-xs !p-0 !w-7">{second}</span>
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
          { name: "Lucali", total: '$62.00', owed: '$22.00' },
          { name: "Dimes", total: '$48.50', owed: '$0.00' },
          { name: "Cervos", total: '$91.25', owed: '$34.00' },
        ].map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between rounded-lg border border-[color:var(--border)] px-3 py-2"
          >
            <span className="font-medium">{r.name}</span>
            <div className="text-right">
              <div className="tabular-nums">{r.total}</div>
              <div className="text-xs text-[color:var(--muted)]">
                {r.owed === '$0.00' ? 'Settled' : `Still owed ${r.owed}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
