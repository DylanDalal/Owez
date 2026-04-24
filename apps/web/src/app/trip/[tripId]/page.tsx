"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Bill, Claim, Trip } from "@owez/shared";
import {
  buildPayLinks,
  claimerOwes,
  groupClaimsByUnit,
  initialsFromName,
  unitsForItem,
} from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReceiptItemCard } from "@/components/ReceiptItemCard";
import { ItemDetailSheet } from "@/components/ItemDetailSheet";
import { useAuth } from "@/lib/auth";
import {
  claimItemUnit,
  deleteClaimDoc,
  updateClaimDoc,
  subscribeToTrip,
  subscribeToBillsInTrip,
  subscribeToClaims,
  getClaimsOnce,
  tripSettlement,
} from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";
import { SplitEvenlyModal } from "@/components/SplitEvenlyModal";

export default function PublicTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const isOwnerView = search.get("owner") === "1";

  const { user, profile, signInAnon } = useAuth();

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [bills, setBills] = useState<Bill[]>([]);
  const [claimsByBill, setClaimsByBill] = useState<Map<string, Claim[]>>(new Map());
  const [myName, setMyName] = useState("");
  const [detail, setDetail] = useState<{
    billId: string;
    itemId: string;
    unitIndex: number;
  } | null>(null);
  const [splitEvenlyBill, setSplitEvenlyBill] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameBarRef = useRef<HTMLDivElement | null>(null);

  // Redirect anonymous users to sign in
  useEffect(() => {
    if (!user) void signInAnon();
  }, [user, signInAnon]);

  useEffect(() => {
    if (user?.isAnonymous && !isOwnerView) {
      router.replace(`/trip/${tripId}`);
    }
  }, [user, isOwnerView, tripId, router]);

  // Subscribe to trip and bills
  useEffect(() => {
    const u1 = subscribeToTrip(tripId, setTrip);
    const u2 = subscribeToBillsInTrip(tripId, setBills);
    return () => {
      u1();
      u2();
    };
  }, [tripId]);

  // Subscribe to claims for all bills
  useEffect(() => {
    if (bills.length === 0) {
      setClaimsByBill(new Map());
      return;
    }

    const unsubscribes = bills.map((bill) =>
      subscribeToClaims(bill.id, (claims) => {
        setClaimsByBill((prev) => {
          const next = new Map(prev);
          next.set(bill.id, claims);
          return next;
        });
      })
    );

    return () => unsubscribes.forEach((u) => u());
  }, [bills]);

  // Restore name from localStorage or profile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("owez-guest-name") ?? "";
    if (saved) setMyName(saved);
  }, []);

  useEffect(() => {
    if (profile?.displayName && !myName) setMyName(profile.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

  // Ensure user is added to trip members on first claim
  useEffect(() => {
    if (!trip || !user || !myName.trim()) return;
    const isMember = trip.members.some((m) => m.userId === user.uid);
    if (!isMember && allClaims.some((c) => c.claimerId === user.uid)) {
      // User is a member if they have claims
      return;
    }
  }, [trip, user, allClaims, myName]);

  function saveMyName(name: string) {
    setMyName(name);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("owez-guest-name", name);
      } catch {
        // ignored
      }
    }
  }

  function focusName() {
    nameInputRef.current?.focus();
    nameInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const bar = nameBarRef.current;
    if (bar) {
      bar.classList.remove("pulse");
      void bar.offsetWidth;
      bar.classList.add("pulse");
    }
  }

  function flashToast(msg: string, ms = 2000) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }

  // Flatten all claims from all bills for settlement calculation
  const allClaims = useMemo(() => {
    return Array.from(claimsByBill.values()).flat();
  }, [claimsByBill]);

  const mySettlement = useMemo(() => {
    if (!trip || !user) return null;
    return tripSettlement(trip, bills, allClaims, user.uid);
  }, [trip, bills, allClaims, user]);

  const hasClaims = !!user && allClaims.some((c) => c.claimerId === user.uid);

  async function quickClaim(billId: string, itemId: string, unitIndex: number) {
    if (!trip || !user) return;
    if (!myName.trim()) {
      focusName();
      return;
    }

    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;

    const billClaims = allClaims.filter(
      (c) =>
        bills.find((b) => b.id === billId)?.id &&
        c.itemId === itemId
    );

    try {
      await claimItemUnit(billId, {
        itemId,
        unitIndex,
        portions: 1,
        splitInto: 1,
        claimerId: user.uid,
        name: myName.trim(),
        initials: initialsFromName(myName),
        photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
      });

      // Add user to trip members if not already there
      if (!trip.members.find((m) => m.userId === user.uid)) {
        trip.members.push({
          userId: user.uid,
          name: myName.trim(),
          photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          joinedAt: Date.now(),
        });
        // Update trip (this should be done via a function, but for now we update locally)
      }
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not claim", 2600);
    }
  }

  async function detailClaim(
    billId: string,
    args: {
      unitIndex: number;
      portions: number;
      splitInto: number;
      duplicate?: boolean;
    }
  ) {
    if (!trip || !user || !detail) return;
    if (!myName.trim()) {
      focusName();
      throw new Error("Enter your name first");
    }

    const existing = args.duplicate
      ? undefined
      : allClaims.find(
          (c) =>
            c.itemId === detail.itemId &&
            c.unitIndex === args.unitIndex &&
            c.claimerId === user.uid &&
            !c.duplicate
        );

    try {
      if (existing) {
        await updateClaimDoc(billId, existing.id, {
          portions: args.portions,
          splitInto: args.splitInto,
        });
      } else {
        await claimItemUnit(billId, {
          itemId: detail.itemId,
          unitIndex: args.unitIndex,
          portions: args.portions,
          splitInto: args.splitInto,
          claimerId: user.uid,
          name: myName.trim(),
          initials: initialsFromName(myName),
          photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          duplicate: args.duplicate,
        });
      }

      // Add user to trip members if not already there
      if (!trip.members.find((m) => m.userId === user.uid)) {
        trip.members.push({
          userId: user.uid,
          name: myName.trim(),
          photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          joinedAt: Date.now(),
        });
      }
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not claim", 2600);
      throw e;
    }
  }

  async function unclaim(billId: string, claimId: string) {
    try {
      await deleteClaimDoc(billId, claimId);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not remove", 2600);
    }
  }

  async function applySplitEvenly(billId: string, splitCount: number, autoAssign: boolean) {
    if (!trip || !user || !myName.trim()) return;

    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;

    try {
      if (autoAssign && trip.members.length > 0) {
        // Auto-assign to all trip members
        for (const member of trip.members) {
          for (const item of bill.items) {
            for (let unitIdx = 0; unitIdx < item.quantity; unitIdx++) {
              const existingClaim = allClaims.find(
                (c) =>
                  c.billId === billId &&
                  c.itemId === item.id &&
                  c.unitIndex === unitIdx &&
                  c.claimerId === member.userId
              );

              if (!existingClaim) {
                await claimItemUnit(billId, {
                  itemId: item.id,
                  unitIndex: unitIdx,
                  portions: 1,
                  splitInto: trip.members.length,
                  claimerId: member.userId,
                  name: member.name,
                  initials: initialsFromName(member.name),
                  photoURL: member.photoURL,
                });
              }
            }
          }
        }
      }
      setSplitEvenlyBill(null);
      flashToast("Receipt split among members", 1500);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not split", 2600);
    }
  }

  if (trip === undefined || !bills) return null;
  if (trip === null) {
    return (
      <main>
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Trip not found</h1>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Double-check the link, or ask whoever sent it to re-share.
          </p>
        </div>
        <Footer />
      </main>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/trip/${trip.id}`
      : "";

  const detailBill = detail ? bills.find((b) => b.id === detail.billId) : null;
  const detailItem = detailBill
    ? detailBill.items.find((it) => it.id === detail.itemId)
    : null;
  const detailBillClaims = detail ? (claimsByBill.get(detail.billId) ?? []) : [];

  const billUnits = detailItem ? unitsForItem(detailItem, detailBillClaims) : [];

  return (
    <main className={hasClaims ? "pb-56" : "pb-40"}>
      <Header />

      <section className="mx-auto max-w-2xl px-4 pt-6">
        {isOwnerView && (
          <div className="card mb-5 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-[color:var(--muted)]">
              Share this link
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="btn btn-primary whitespace-nowrap"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    flashToast("Copied!", 1500);
                  } catch {
                    flashToast("Copy failed");
                  }
                }}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">
            {trip.title}
          </h1>
          {trip.description && (
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {trip.description}
            </p>
          )}
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            {trip.members.length} member{trip.members.length === 1 ? "" : "s"}
          </p>
        </div>

        {!myName.trim() && (
          <div className="card mt-6 !border-[color:var(--color-accent)] p-3 text-center text-sm">
            Enter your name below to start claiming items
          </div>
        )}

        {/* Receipts */}
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold mb-4">Receipts</h2>
          <div className="space-y-3">
            {bills.map((bill) => {
              const isExpanded = expandedBills.has(bill.id);
              const billClaims = claimsByBill.get(bill.id) ?? [];

              return (
                <div key={bill.id} className="card overflow-hidden">
                  {/* Collapsed/Header */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedBills((prev) => {
                        const next = new Set(prev);
                        if (next.has(bill.id)) {
                          next.delete(bill.id);
                        } else {
                          next.add(bill.id);
                        }
                        return next;
                      });
                    }}
                    className="w-full p-4 text-left hover:bg-[color:var(--muted)]/5 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">
                        {bill.title || "Receipt"}
                      </div>
                      <div className="text-xs text-[color:var(--muted)]">
                        {bill.items.length} item{bill.items.length === 1 ? "" : "s"} ·{" "}
                        {centsToDisplay(bill.totalCents)}
                      </div>
                    </div>
                    <div className="text-2xl text-[color:var(--muted)]">
                      {isExpanded ? "−" : "+"}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-[color:var(--border)] p-4 space-y-4">
                      {/* Items */}
                      <div
                        className={
                          "grid gap-3 transition-opacity" +
                          (myName.trim() ? "" : " opacity-40")
                        }
                        onClick={myName.trim() ? undefined : () => focusName()}
                      >
                        {bill.items.map((item) => {
                          const units = Array.from(
                            { length: item.quantity },
                            (_, u) => {
                              const itemClaims = billClaims.filter(
                                (c) => c.itemId === item.id && c.unitIndex === u
                              );
                              return {
                                itemId: item.id,
                                unitIndex: u,
                                splitInto: 1,
                                portionsClaimed: itemClaims.length,
                                claims: itemClaims,
                              };
                            }
                          );

                          return (
                            <ReceiptItemCard
                              key={item.id}
                              item={item}
                              units={units}
                              myName={myName}
                              myClaimerId={user?.uid ?? ""}
                              myPhotoURL={
                                user && !user.isAnonymous
                                  ? user.photoURL ?? profile?.photoURL ?? undefined
                                  : undefined
                              }
                              onQuickClaim={(unitIndex) =>
                                void quickClaim(bill.id, item.id, unitIndex)
                              }
                              onOpenDetail={(unitIndex) =>
                                setDetail({
                                  billId: bill.id,
                                  itemId: item.id,
                                  unitIndex,
                                })
                              }
                              onUnclaim={(claimId) =>
                                void unclaim(bill.id, claimId)
                              }
                            />
                          );
                        })}
                      </div>

                      {/* Tax/Tip */}
                      {(bill.taxCents > 0 || bill.tipCents > 0) && (
                        <div className="card mt-4 p-4 text-sm">
                          {bill.taxCents > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[color:var(--muted)]">
                                Tax
                              </span>
                              <span className="tabular-nums">
                                {centsToDisplay(bill.taxCents)}
                              </span>
                            </div>
                          )}
                          {bill.tipCents > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[color:var(--muted)]">
                                Tip
                              </span>
                              <span className="tabular-nums">
                                {centsToDisplay(bill.tipCents)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Split Evenly Button */}
                      <button
                        type="button"
                        onClick={() => setSplitEvenlyBill(bill.id)}
                        className="btn btn-ghost w-full"
                      >
                        Split Evenly
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {detail && detailBill && detailItem && (
        <ItemDetailSheet
          open
          onClose={() => setDetail(null)}
          item={detailItem}
          units={billUnits}
          initialUnitIndex={detail.unitIndex}
          myName={myName}
          myClaimerId={user?.uid ?? ""}
          isOwner={!!user && user.uid === trip.creatorId}
          onClaim={(args) => void detailClaim(detail.billId, args)}
          onUnclaim={(claimId) => void unclaim(detail.billId, claimId)}
        />
      )}

      {splitEvenlyBill && (
        <SplitEvenlyModal
          open
          onClose={() => setSplitEvenlyBill(null)}
          defaultSplitCount={trip.members.length}
          onApply={(splitCount, autoAssign) =>
            void applySplitEvenly(splitEvenlyBill, splitCount, autoAssign)
          }
        />
      )}

      {/* Sticky bottom bar: name input or settlement */}
      {hasClaims && mySettlement ? (
        <div className="sticky-name-bar">
          <div className="mx-auto max-w-2xl">
            <div className="text-sm font-semibold mb-3">Settlement</div>

            {/* Settlement grid */}
            <div className="grid gap-2">
              {Object.entries(mySettlement).map(
                ([userId, { owesYou, youOwe }]) => {
                  const member = trip.members.find((m) => m.userId === userId);
                  if (!member) return null;

                  return (
                    <div
                      key={userId}
                      className="flex items-center justify-between p-3 rounded-lg border border-[color:var(--border)]"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {member.photoURL && (
                          <img
                            src={member.photoURL}
                            alt={member.name}
                            className="h-8 w-8 rounded-full"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {member.name}
                          </div>
                          <div className="text-xs text-[color:var(--muted)]">
                            {owesYou > 0 && youOwe === 0
                              ? `owes you ${centsToDisplay(owesYou)}`
                              : youOwe > 0 && owesYou === 0
                                ? `you owe ${centsToDisplay(youOwe)}`
                                : "settled"}
                          </div>
                        </div>
                      </div>

                      {owesYou > 0 && (
                        <div className="text-right ml-2">
                          <div className="text-sm font-semibold tabular-nums">
                            {centsToDisplay(owesYou)}
                          </div>
                          {/* Payment buttons would go here */}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      ) : (
        <div ref={nameBarRef} className="sticky-name-bar">
          <div className="mx-auto max-w-2xl flex items-center gap-3">
            <label className="flex-1">
              <input
                ref={nameInputRef}
                type="text"
                value={myName}
                onChange={(e) => saveMyName(e.target.value)}
                placeholder="Your name"
                className="w-full"
              />
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
