"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Bill, Claim, Tab } from "@owez/shared";
import {
  buildPayLinks,
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
  addMemberToTab,
  claimItemUnit,
  deleteClaimDoc,
  updateClaimDoc,
  subscribeToTab,
  subscribeToBillsInTab,
  subscribeToClaims,
  tabSettlement,
} from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";
import { SplitEvenlyModal } from "@/components/SplitEvenlyModal";

export default function PublicTabPage({
  params,
}: {
  params: Promise<{ tabId: string }>;
}) {
  const { tabId } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const isOwnerView = search.get("owner") === "1";

  const { user, profile, loading: authLoading, signInAnon } = useAuth();

  const [tab, setTab] = useState<Tab | null | undefined>(undefined);
  const [bills, setBills] = useState<Bill[]>([]);
  const [claimsByBill, setClaimsByBill] = useState<Map<string, Claim[]>>(
    new Map(),
  );
  const [myName, setMyName] = useState("");
  const [detail, setDetail] = useState<{
    billId: string;
    itemId: string;
    unitIndex: number;
  } | null>(null);
  const [splitEvenlyBill, setSplitEvenlyBill] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  // Open receipts by default so the page isn't a wall of collapsed rows on
  // arrival: all of them when there are only a few, otherwise just the first.
  const seededExpand = useRef(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameBarRef = useRef<HTMLDivElement | null>(null);

  // Give friends an anonymous uid so their claims pass the rules — but only
  // once Firebase has finished restoring any persisted session. Calling
  // signInAnonymously while `user` is still null-because-loading replaced
  // the creator's Google session with an anonymous one on every reload.
  useEffect(() => {
    if (!authLoading && !user) void signInAnon();
  }, [authLoading, user, signInAnon]);

  // Friends (anonymous viewers) never see the owner view, even if they got
  // the ?owner=1 link forwarded to them.
  useEffect(() => {
    if (user?.isAnonymous && isOwnerView) {
      router.replace(`/tab/${tabId}`);
    }
  }, [user, isOwnerView, tabId, router]);

  // Subscribe to tab and its bills
  useEffect(() => {
    const u1 = subscribeToTab(tabId, setTab);
    const u2 = subscribeToBillsInTab(tabId, setBills);
    return () => {
      u1();
      u2();
    };
  }, [tabId]);

  useEffect(() => {
    if (seededExpand.current || bills.length === 0) return;
    seededExpand.current = true;
    setExpandedBills(
      new Set(bills.length <= 3 ? bills.map((b) => b.id) : [bills[0]!.id]),
    );
  }, [bills]);

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
      }),
    );

    return () => unsubscribes.forEach((u) => u());
  }, [bills]);

  // Restore name from localStorage or profile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("owez-guest-name") ?? "";
    if (saved) setMyName(saved);
  }, []);

  // Signed-in users shouldn't have to type a name (see the bill page for the
  // same fallback chain).
  useEffect(() => {
    if (myName.trim()) return;
    if (!user || user.isAnonymous) return;
    const fallback =
      profile?.displayName?.trim() ||
      user.displayName?.trim() ||
      (tab && tab.creatorId === user.uid ? tab.creatorName?.trim() : "") ||
      user.email?.split("@")[0] ||
      "";
    if (fallback) setMyName(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName, user, tab?.creatorName]);

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
    if (!tab || !user) return null;
    return tabSettlement(tab, bills, allClaims, user.uid);
  }, [tab, bills, allClaims, user]);

  const hasClaims = !!user && allClaims.some((c) => c.claimerId === user.uid);

  /**
   * Persist the current viewer onto the tab's member list so they show up in
   * everyone's settlement. arrayUnion makes this idempotent and concurrency
   * safe — see addMemberToTab.
   */
  async function ensureMember() {
    if (!tab || !user || !myName.trim()) return;
    if (tab.members.some((m) => m.userId === user.uid)) return;
    try {
      // Firestore rejects `undefined` inside arrayUnion payloads, so only
      // attach photoURL when we actually have one.
      const photoURL = user.photoURL ?? profile?.photoURL ?? undefined;
      await addMemberToTab(tab.id, {
        userId: user.uid,
        name: myName.trim(),
        ...(photoURL ? { photoURL } : {}),
        joinedAt: Date.now(),
      });
    } catch {
      // Non-fatal: the claim still landed; settlement will pick them up once
      // the membership write succeeds on a later claim.
    }
  }

  async function quickClaim(billId: string, itemId: string, unitIndex: number) {
    if (!tab || !user) return;
    if (!myName.trim()) {
      focusName();
      return;
    }

    // Match the unit's existing split so we take one portion of it rather
    // than trying to overwrite it with splitInto=1.
    const bill = bills.find((b) => b.id === billId);
    const item = bill?.items.find((it) => it.id === itemId);
    const unit = item
      ? unitsForItem(item, claimsByBill.get(billId) ?? [])[unitIndex]
      : undefined;
    const splitInto = unit && unit.splitInto > 1 ? unit.splitInto : 1;

    try {
      await claimItemUnit(billId, {
        itemId,
        unitIndex,
        portions: 1,
        splitInto,
        claimerId: user.uid,
        name: myName.trim(),
        initials: initialsFromName(myName),
        photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
      }, claimsByBill.get(billId) ?? []);
      await ensureMember();
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
    },
  ) {
    if (!tab || !user || !detail) return;
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
            !c.duplicate,
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
        }, claimsByBill.get(billId) ?? []);
      }
      await ensureMember();
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

  /**
   * "Split evenly": put the current viewer down for 1/N of every unit on
   * the receipt they haven't already claimed. Only the viewer's own claims
   * are written — rules reject claims on anyone else's behalf — so each
   * friend taps this from their own phone and the splits line up.
   */
  async function applySplitEvenly(billId: string, splitCount: number) {
    if (!tab || !user || !myName.trim()) {
      focusName();
      return;
    }
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    const billClaims = claimsByBill.get(billId) ?? [];
    const unitMap = groupClaimsByUnit(bill.items, billClaims);

    let claimed = 0;
    let skipped = 0;
    try {
      for (const item of bill.items) {
        for (let unitIdx = 0; unitIdx < item.quantity; unitIdx++) {
          const unit = unitMap.get(`${item.id}:${unitIdx}`);
          if (!unit) continue;
          const splitClaims = unit.claims.filter((c) => !c.duplicate);
          if (splitClaims.some((c) => c.claimerId === user.uid)) continue;

          // Keep an existing larger split; otherwise split N ways. Skip units
          // that are already full.
          const existingSplit = splitClaims.length > 0 ? unit.splitInto : 1;
          const splitInto = Math.max(existingSplit, splitCount);
          const taken = splitClaims.reduce((sum, c) => sum + c.portions, 0);
          if (taken >= splitInto) {
            skipped++;
            continue;
          }

          await claimItemUnit(billId, {
            itemId: item.id,
            unitIndex: unitIdx,
            portions: 1,
            splitInto,
            claimerId: user.uid,
            name: myName.trim(),
            initials: initialsFromName(myName),
            photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          }, claimsByBill.get(billId) ?? []);
          claimed++;
        }
      }
      await ensureMember();
      setSplitEvenlyBill(null);
      const summary =
        claimed === 0
          ? "Nothing left to split on this receipt"
          : `Split ${claimed} item${claimed === 1 ? "" : "s"} ${splitCount} ways`;
      flashToast(skipped > 0 ? `${summary} · ${skipped} already full` : summary, 2200);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not split", 2600);
    }
  }

  if (tab === undefined) {
    return (
      <main>
        <Header />
        <section className="mx-auto w-full max-w-2xl px-4 pt-6">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[color:var(--border)]" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-[color:var(--border)]" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-[18px] bg-[color:var(--border)]"
              />
            ))}
          </div>
        </section>
        <Footer />
      </main>
    );
  }
  if (tab === null) {
    return (
      <main>
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Tab not found</h1>
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
      ? `${window.location.origin}/tab/${tab.id}`
      : "";
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const detailBill = detail ? bills.find((b) => b.id === detail.billId) : null;
  const detailItem =
    detailBill && detail
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
              {canNativeShare && (
                <button
                  type="button"
                  className="btn btn-primary whitespace-nowrap"
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: tab.title,
                        text: `Claim what you had on "${tab.title}"`,
                        url: shareUrl,
                      });
                    } catch {
                      // user dismissed the share sheet — nothing to do
                    }
                  }}
                >
                  Share
                </button>
              )}
              <button
                type="button"
                className={
                  "btn whitespace-nowrap" + (canNativeShare ? "" : " btn-primary")
                }
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    flashToast("Copied!", 1500);
                  } catch {
                    flashToast("Copy failed, select and copy manually");
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
            {tab.title}
          </h1>
          {tab.description && (
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {tab.description}
            </p>
          )}
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            {tab.members.length} member{tab.members.length === 1 ? "" : "s"}
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
                        {bill.items.length} item
                        {bill.items.length === 1 ? "" : "s"} ·{" "}
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
                          const units = unitsForItem(item, billClaims);

                          return (
                            <ReceiptItemCard
                              key={item.id}
                              item={item}
                              units={units}
                              myName={myName}
                              myClaimerId={user?.uid ?? ""}
                              myPhotoURL={
                                user && !user.isAnonymous
                                  ? user.photoURL ??
                                    profile?.photoURL ??
                                    undefined
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
          isOwner={!!user && user.uid === tab.creatorId}
          onClaim={(args) => detailClaim(detail.billId, args)}
          onUnclaim={(claimId) => unclaim(detail.billId, claimId)}
        />
      )}

      {splitEvenlyBill && (
        <SplitEvenlyModal
          open
          onClose={() => setSplitEvenlyBill(null)}
          defaultSplitCount={Math.max(2, tab.members.length)}
          billTitle={bills.find((b) => b.id === splitEvenlyBill)?.title}
          onApply={(splitCount) => applySplitEvenly(splitEvenlyBill, splitCount)}
        />
      )}

      {/* Sticky bottom bar: name input or settlement */}
      {/* Creators usually haven't claimed anything themselves, but they are
          exactly who needs to see "X owes you". Show the settlement whenever
          there is one, not only once the viewer has claims. */}
      {mySettlement && Object.keys(mySettlement).length > 0 ? (
        <div className="sticky-name-bar">
          <div className="mx-auto max-w-2xl">
            <div className="text-sm font-semibold mb-3">Settlement</div>

            <div className="grid gap-2">
              {Object.entries(mySettlement).map(
                ([userId, { owesYou, youOwe }]) => {
                  const member = tab.members.find((m) => m.userId === userId);
                  if (!member) return null;

                  // When I owe this member, deep-link into their payment app
                  // using the payment handles on a receipt they created.
                  const theirBill = bills.find((b) => b.creatorId === userId);
                  const payLinks =
                    youOwe > 0 && theirBill
                      ? buildPayLinks({
                          methods: theirBill.paymentMethods,
                          amountCents: youOwe,
                          note: tab.title
                            ? `Owez - ${tab.title}`
                            : "Owez tab",
                          creatorName: member.name,
                        })
                      : [];

                  return (
                    <div
                      key={userId}
                      className="rounded-lg border border-[color:var(--border)] p-3"
                    >
                      <div className="flex items-center justify-between">
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
                                  : owesYou > 0 || youOwe > 0
                                    ? `net: you owe ${centsToDisplay(
                                        youOwe,
                                      )}, they owe ${centsToDisplay(owesYou)}`
                                    : "settled"}
                            </div>
                          </div>
                        </div>

                        {owesYou > 0 && (
                          <div className="text-right ml-2 text-sm font-semibold tabular-nums">
                            {centsToDisplay(owesYou)}
                          </div>
                        )}
                      </div>

                      {payLinks.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {payLinks.map((link) => (
                            <a
                              key={link.kind}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-primary !h-8 !px-3 text-xs"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                },
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
              maxLength={80}
                className="w-full"
              />
            </label>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
          <div className="rounded-full bg-black/85 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}
