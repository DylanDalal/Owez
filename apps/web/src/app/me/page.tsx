"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Bill, Trip } from "@owez/shared";
import { sumItems, totalClaimedCents } from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/lib/auth";
import { deleteBill, getClaimsOnce, subscribeToMyBills, subscribeToMyTrips } from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";
import { SwipeToDelete } from "@/components/SwipeToDelete";

/**
 * Creator dashboard — lists bills and trips the signed-in user has created.
 * Bills (single receipts) and Trips (multi-receipt groups) are shown on separate tabs.
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
  const [tab, setTab] = useState<"receipts" | "trips">("receipts");
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [billRows, setBillRows] = useState<BillRow[] | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);

  // Subscribe to user's bills (including those in trips)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyBills(
      user.uid,
      setBills,
      () => setBills([]),
    );
    return unsub;
  }, [user]);

  // Subscribe to user's trips
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyTrips(
      user.uid,
      setTrips,
      () => setTrips([]),
    );
    return unsub;
  }, [user]);

  // Filter bills to show only standalone (non-trip) bills on Receipts tab
  const standaloneBills = bills?.filter((b) => !b.tripId) ?? [];

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
    (tab === "receipts" && billRows === null) ||
    (tab === "trips" && trips === null);

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
              onClick={() => setTab("receipts")}
              className={`pb-3 font-semibold transition-colors ${
                tab === "receipts"
                  ? "border-b-2 border-[color:var(--color-accent)] text-[color:var(--fg)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--fg)]"
              }`}
            >
              Your Receipts
            </button>
            <button
              type="button"
              onClick={() => setTab("trips")}
              className={`pb-3 font-semibold transition-colors ${
                tab === "trips"
                  ? "border-b-2 border-[color:var(--color-accent)] text-[color:var(--fg)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--fg)]"
              }`}
            >
              Your Trips
            </button>
          </div>
        </div>

        {/* Receipts tab */}
        {tab === "receipts" && (
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

        {/* Trips tab */}
        {tab === "trips" && (
          <>
            <div className="flex items-center justify-between gap-3 mb-8">
              <div>
                <p className="text-sm text-[color:var(--muted)]">
                  Shared pages where everyone uploads their receipts and claims what's theirs.
                </p>
              </div>
              <Link href="/new-trip" className="btn btn-primary">
                + New trip
              </Link>
            </div>

            <div className="space-y-3">
              {trips && trips.length === 0 && (
                <div className="card p-8 text-center">
                  <p className="text-[color:var(--muted)]">No trips yet.</p>
                  <Link
                    href="/new-trip"
                    className="btn btn-primary mt-4 inline-flex"
                  >
                    Create your first trip
                  </Link>
                </div>
              )}
              {trips?.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </>
        )}
      </section>
      <Footer />
    </main>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <div className="group card flex items-center p-4 hover:border-[color:var(--color-accent)]">
      <Link
        href={`/trip/${trip.id}?owner=1`}
        className="flex min-w-0 flex-1 items-center justify-between"
      >
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {trip.title}
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            {formatDate(trip.createdAt)} · {trip.members.length} member
            {trip.members.length === 1 ? "" : "s"} · {trip.receiptIds.length} receipt
            {trip.receiptIds.length === 1 ? "" : "s"}
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
