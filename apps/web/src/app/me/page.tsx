"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Bill, Tab } from "@owez/shared";
import { totalClaimedCents } from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/lib/auth";
import { deleteBill, getClaimsOnce, subscribeToMyBills, subscribeToMyTabs } from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";
import { SwipeToDelete } from "@/components/SwipeToDelete";

/**
 * Creator dashboard — lists single receipts and tabs the signed-in user has
 * created. Standalone receipts and tabs (multi-receipt groups for a night out
 * or a trip) are shown on separate views.
 */
export default function MyDashboardPage() {
  return (
    <SignInGate>
      <MyDashboardInner />
    </SignInGate>
  );
}

interface BillRow {
  bill: Bill;
  claimedCents: number;
  outstandingCents: number;
  overpaidCents: number;
}

function MyDashboardInner() {
  const { user } = useAuth();
  const [view, setView] = useState<"receipts" | "tabs">("receipts");
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [billRows, setBillRows] = useState<BillRow[] | null>(null);
  const [tabs, setTabs] = useState<Tab[] | null>(null);

  // Subscribe to user's bills (including those on tabs)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyBills(
      user.uid,
      setBills,
      () => setBills([]),
    );
    return unsub;
  }, [user]);

  // Subscribe to user's tabs
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyTabs(
      user.uid,
      setTabs,
      () => setTabs([]),
    );
    return unsub;
  }, [user]);

  // Filter bills to show only standalone (non-tab) bills on the Receipts view
  const standaloneBills = bills?.filter((b) => !b.tabId) ?? [];

  // Compute outstanding amounts for standalone bills
  useEffect(() => {
    if (!standaloneBills || standaloneBills.length === 0) {
      setBillRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const computed = await Promise.all(
        standaloneBills.map(async (bill) => {
          const claims = await getClaimsOnce(bill.id);
          const claimed = totalClaimedCents(bill, claims);
          return {
            bill,
            claimedCents: claimed,
            outstandingCents: Math.max(0, bill.totalCents - claimed),
            overpaidCents: Math.max(0, claimed - bill.totalCents),
          };
        }),
      );
      if (!cancelled) setBillRows(computed);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [standaloneBills]);

  const totalRecoupedCents =
    billRows?.reduce((s, r) => s + r.claimedCents, 0) ?? 0;

  const isLoading =
    (view === "receipts" && billRows === null) ||
    (view === "tabs" && tabs === null);

  if (isLoading) return null;

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-3xl px-4 py-10">
        {/* Tab buttons */}
        <div className="flex items-center justify-between gap-6 mb-8 border-b border-[color:var(--border)]">
          <div className="flex gap-8">
            <button
              type="button"
              onClick={() => setView("receipts")}
              className={`pb-3 font-semibold transition-colors ${
                view === "receipts"
                  ? "border-b-2 border-[color:var(--color-accent)] text-[color:var(--fg)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--fg)]"
              }`}
            >
              Your Receipts
            </button>
            <button
              type="button"
              onClick={() => setView("tabs")}
              className={`pb-3 font-semibold transition-colors ${
                view === "tabs"
                  ? "border-b-2 border-[color:var(--color-accent)] text-[color:var(--fg)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--fg)]"
              }`}
            >
              Your Tabs
            </button>
          </div>
        </div>

        {/* Receipts view */}
        {view === "receipts" && (
          <>
            <div className="flex items-center justify-between gap-3 mb-8">
              <div>
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

            <div className="space-y-3">
              {billRows && billRows.length === 0 && (
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
              {billRows?.map(({ bill, outstandingCents, overpaidCents, claimedCents }) => (
                <SwipeToDelete
                  key={bill.id}
                  onDelete={() => void deleteBill(bill.id)}
                  confirmMessage="Delete this receipt? This can't be undone."
                >
                  <div className="group card flex items-center p-4 hover:border-[color:var(--color-accent)]">
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
                    </Link>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Delete receipt"
                        className="hidden shrink-0 rounded-lg p-2 text-[color:var(--muted)] hover:text-red-500 group-hover:block"
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
                      <div className="text-right">
                        <div className="tabular-nums">
                          {centsToDisplay(bill.totalCents)}
                        </div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {overpaidCents > 0
                            ? `Paid ${centsToDisplay(claimedCents)} · +${centsToDisplay(overpaidCents)}`
                            : outstandingCents <= 0
                              ? "Settled"
                              : `Still owed ${centsToDisplay(outstandingCents)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeToDelete>
              ))}
            </div>
          </>
        )}

        {/* Tabs view */}
        {view === "tabs" && (
          <>
            <div className="flex items-center justify-between gap-3 mb-8">
              <div>
                <p className="text-sm text-[color:var(--muted)]">
                  Group multiple receipts from a night out or a trip — everyone
                  claims what's theirs and settles up once.
                </p>
              </div>
              <Link href="/new-tab" className="btn btn-primary">
                + New tab
              </Link>
            </div>

            <div className="space-y-3">
              {tabs && tabs.length === 0 && (
                <div className="card p-8 text-center">
                  <p className="text-[color:var(--muted)]">No tabs yet.</p>
                  <Link
                    href="/new-tab"
                    className="btn btn-primary mt-4 inline-flex"
                  >
                    Create your first tab
                  </Link>
                </div>
              )}
              {tabs?.map((t) => (
                <TabCard key={t.id} tab={t} />
              ))}
            </div>
          </>
        )}
      </section>
      <Footer />
    </main>
  );
}

function TabCard({ tab }: { tab: Tab }) {
  return (
    <div className="group card flex items-center p-4 hover:border-[color:var(--color-accent)]">
      <Link
        href={`/tab/${tab.id}?owner=1`}
        className="flex min-w-0 flex-1 items-center justify-between"
      >
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {tab.title}
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            {formatDate(tab.createdAt)} · {tab.members.length} member
            {tab.members.length === 1 ? "" : "s"} · {tab.receiptIds.length} receipt
            {tab.receiptIds.length === 1 ? "" : "s"}
          </div>
        </div>
      </Link>
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
