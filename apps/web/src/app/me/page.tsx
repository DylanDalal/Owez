"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Bill } from "@owez/shared";
import { sumItems, totalClaimedCents } from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/lib/auth";
import { deleteBill, getClaimsOnce, subscribeToMyBills } from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";

/**
 * Creator dashboard — lists every bill the signed-in user has created, with
 * per-bill outstanding totals computed from the claims subcollection. Bills
 * update in realtime; claims are fetched once per bill on load (they refresh
 * on each dashboard visit, which is fine for the scale).
 */
export default function MyBillsPage() {
  return (
    <SignInGate>
      <MyBillsInner />
    </SignInGate>
  );
}

interface Row {
  bill: Bill;
  subtotalCents: number;
  claimedCents: number;
  outstandingCents: number;
}

function MyBillsInner() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    // On error (most commonly the composite index still building after a
    // fresh deploy) fall back to the empty state so the page doesn't show
    // a loading spinner forever.
    const unsub = subscribeToMyBills(
      user.uid,
      setBills,
      () => setBills([]),
    );
    return unsub;
  }, [user]);

  // Whenever the bill list changes, (re)fetch claims for each and compute
  // outstanding. Runs in parallel so it's fast for a handful of bills.
  useEffect(() => {
    if (!bills) {
      setRows(null);
      return;
    }
    if (bills.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const computed = await Promise.all(
        bills.map(async (bill) => {
          const claims = await getClaimsOnce(bill.id);
          const subtotal = sumItems(bill.items);
          const claimed = totalClaimedCents(bill, claims);
          return {
            bill,
            subtotalCents: subtotal,
            claimedCents: claimed,
            outstandingCents: Math.max(0, bill.totalCents - claimed),
          };
        }),
      );
      if (!cancelled) setRows(computed);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [bills]);

  const totalRecoupedCents =
    rows?.reduce((s, r) => s + r.claimedCents, 0) ?? 0;

  if (rows === null) return null;

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Your receipts</h1>
            <p className="text-sm text-[color:var(--muted)]">
              Total recouped:{" "}
              <span className="font-semibold">
                {centsToDisplay(totalRecoupedCents)}
              </span>
            </p>
          </div>
          <Link href="/new" className="btn btn-primary">
            + New receipt
          </Link>
        </div>

        <div className="mt-8 space-y-3">
          {rows.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-[color:var(--muted)]">No receipts yet.</p>
              <Link
                href="/new"
                className="btn btn-primary mt-4 inline-flex"
              >
                Snap your first receipt
              </Link>
            </div>
          )}
          {rows?.map(({ bill, outstandingCents }) => (
            <div
              key={bill.id}
              className="group card flex items-center justify-between p-4 hover:border-[color:var(--color-accent)]"
            >
              <Link
                href={`/${bill.id}?owner=1`}
                className="flex min-w-0 flex-1 items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {bill.title || "Untitled"}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {formatDate(bill.createdAt)} · {bill.items.length} item
                    {bill.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">
                    {centsToDisplay(bill.totalCents)}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {outstandingCents <= 0
                      ? "Settled"
                      : `Still owed ${centsToDisplay(outstandingCents)}`}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label="Delete receipt"
                className="ml-3 hidden shrink-0 rounded-lg p-2 text-[color:var(--muted)] hover:text-red-500 group-hover:block"
                onClick={() => {
                  if (confirm("Delete this receipt? This can't be undone.")) {
                    void deleteBill(bill.id);
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 4h12M5.3 4V2.7a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1V4M6.5 7v4.5M9.5 7v4.5M3.5 4l.7 9a1.5 1.5 0 0 0 1.5 1.3h4.6a1.5 1.5 0 0 0 1.5-1.3l.7-9" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
