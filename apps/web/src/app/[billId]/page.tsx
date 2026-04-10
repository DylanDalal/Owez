"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Bill, Claim } from "@owez/shared";
import {
  buildPayLinks,
  claimerOwes,
  groupClaimsByUnit,
  initialsFromName,
  unitsForItem,
} from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdSlot } from "@/components/AdSlot";
import { ReceiptItemCard } from "@/components/ReceiptItemCard";
import { ItemDetailSheet } from "@/components/ItemDetailSheet";
import { useAuth } from "@/lib/auth";
import {
  claimItemUnit,
  deleteClaimDoc,
  subscribeToBill,
  subscribeToClaims,
} from "@/lib/bills";
import { centsToDisplay } from "@/lib/format";

/**
 * Public claim page. Friends open this from the shared link.
 *
 * Flow:
 *   1. On mount: sign in anonymously (gives the friend a Firebase uid so
 *      claim writes pass the rules).
 *   2. Subscribe to the bill and its claims subcollection in realtime.
 *   3. Viewer types their name in the sticky bottom bar.
 *   4. Tap an item to claim one portion of the next available unit.
 *   5. Long-press to open the detail sheet and split / remove claims.
 *   6. Pay buttons at the bottom deep-link into Venmo / Cash App / Zelle.
 */
export default function PublicBillPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  const { billId } = use(params);
  const search = useSearchParams();
  const isOwnerView = search.get("owner") === "1";

  const { user, profile, signInAnon } = useAuth();

  const [bill, setBill] = useState<Bill | null | undefined>(undefined); // undefined = loading
  const [claims, setClaims] = useState<Claim[]>([]);
  const [myName, setMyName] = useState("");
  const [detail, setDetail] = useState<{
    itemId: string;
    unitIndex: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Ensure we have a uid before writing any claims.
  useEffect(() => {
    if (!user) void signInAnon();
  }, [user, signInAnon]);

  // Real-time subscriptions.
  useEffect(() => {
    const u1 = subscribeToBill(billId, setBill);
    const u2 = subscribeToClaims(billId, setClaims);
    return () => {
      u1();
      u2();
    };
  }, [billId]);

  // Dynamic page title: "Pay {first name} back for {Receipt Name}"
  useEffect(() => {
    if (!bill) return;
    const firstName = bill.creatorName?.split(/\s+/)[0];
    const receiptName = bill.title || "a Receipt";
    document.title = firstName
      ? `Pay ${firstName} back for ${receiptName}`
      : `Pay back for ${receiptName}`;
  }, [bill]);

  // Restore saved name from localStorage, or prefer the signed-in profile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("owez-guest-name") ?? "";
    if (saved) setMyName(saved);
  }, []);
  useEffect(() => {
    if (profile?.displayName && !myName) setMyName(profile.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

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

  function focusName(reason?: string) {
    nameInputRef.current?.focus();
    nameInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    flashToast(reason ?? "Enter your name first");
  }

  function flashToast(msg: string, ms = 2000) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }

  const unitMap = useMemo(
    () => (bill ? groupClaimsByUnit(bill.items, claims) : new Map()),
    [bill, claims],
  );

  const myTotals = useMemo(() => {
    if (!bill || !user) return null;
    return claimerOwes(bill, claims, user.uid);
  }, [bill, claims, user]);

  async function quickClaim(itemId: string, unitIndex: number) {
    if (!bill || !user) return;
    if (!myName.trim()) {
      focusName();
      return;
    }
    try {
      await claimItemUnit(bill.id, {
        itemId,
        unitIndex,
        portions: 1,
        splitInto: 1,
        claimerId: user.uid,
        name: myName.trim(),
        initials: initialsFromName(myName),
        photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
      });
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not claim", 2600);
    }
  }

  async function detailClaim(args: {
    unitIndex: number;
    portions: number;
    splitInto: number;
  }) {
    if (!bill || !user || !detail) return;
    if (!myName.trim()) {
      focusName();
      throw new Error("Enter your name first");
    }
    await claimItemUnit(bill.id, {
      itemId: detail.itemId,
      unitIndex: args.unitIndex,
      portions: args.portions,
      splitInto: args.splitInto,
      claimerId: user.uid,
      name: myName.trim(),
      initials: initialsFromName(myName),
      photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
    });
  }

  async function unclaim(claimId: string) {
    if (!bill) return;
    try {
      await deleteClaimDoc(bill.id, claimId);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : "Could not remove", 2600);
    }
  }

  if (bill === undefined) return null;
  if (bill === null) {
    return (
      <main>
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Bill not found</h1>
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
      ? `${window.location.origin}/${bill.id}`
      : "";

  const detailItem = detail
    ? bill.items.find((it) => it.id === detail.itemId)
    : null;
  const detailUnits = detailItem ? unitsForItem(detailItem, claims) : [];

  const payLinks = myTotals
    ? buildPayLinks({
        methods: bill.paymentMethods,
        amountCents: myTotals.totalCents,
        note: bill.title ? `Owez - ${bill.title}` : "Owez bill",
        creatorName: bill.creatorName,
      })
    : [];

  return (
    <main className="pb-40">
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
                    flashToast("Copy failed, select and copy manually");
                  }
                }}
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted)]">
              Anyone with this link can claim items. No account needed.
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {bill.creatorName ? `${bill.creatorName} is collecting` : "Bill"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold leading-tight">
              {bill.title ?? "Split the bill"}
            </h1>
          </div>
        </div>

        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Tap an item to claim it. Long-press to split a single item between
          multiple people.
        </p>

        {/* Small banner ad for visitors */}
        <AdSlot
          slot={process.env.NEXT_PUBLIC_AD_SLOT_CLAIM_BANNER ?? ""}
          format="fluid"
          className="mt-4"
        />

        <div className="mt-6 grid gap-3">
          {bill.items.map((item) => {
            const units = Array.from({ length: item.quantity }, (_, u) =>
              unitMap.get(`${item.id}:${u}`) ?? {
                itemId: item.id,
                unitIndex: u,
                splitInto: 1,
                portionsClaimed: 0,
                claims: [],
              },
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
                onQuickClaim={(unitIndex) => void quickClaim(item.id, unitIndex)}
                onOpenDetail={(unitIndex) =>
                  setDetail({ itemId: item.id, unitIndex })
                }
                onUnclaim={(claimId) => void unclaim(claimId)}
              />
            );
          })}
        </div>

        {(bill.taxCents > 0 || bill.tipCents > 0) && (
          <div className="card mt-6 p-4 text-sm">
            {bill.taxCents > 0 && (
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">
                  Tax (split by share)
                </span>
                <span className="tabular-nums">
                  {centsToDisplay(bill.taxCents)}
                </span>
              </div>
            )}
            {bill.tipCents > 0 && (
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">
                  Tip (split by share)
                </span>
                <span className="tabular-nums">
                  {centsToDisplay(bill.tipCents)}
                </span>
              </div>
            )}
            <div className="receipt-divider my-3" />
            <div className="flex justify-between font-semibold">
              <span>Bill total</span>
              <span className="tabular-nums">
                {centsToDisplay(bill.totalCents)}
              </span>
            </div>
          </div>
        )}

        {myName && myTotals && (
          <div className="card mt-6 p-5">
            <div className="flex items-center justify-between">
              <div className="font-display text-xl font-bold">Your total</div>
              <div className="font-display text-2xl tabular-nums">
                {centsToDisplay(myTotals.totalCents)}
              </div>
            </div>
            {(myTotals.taxCents > 0 || myTotals.tipCents > 0) && (
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                includes{" "}
                {centsToDisplay(myTotals.taxCents + myTotals.tipCents)} tax +
                tip
              </div>
            )}
            {myTotals.totalCents > 0 && payLinks.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {payLinks.map((link) => (
                  <a
                    key={link.kind}
                    href={link.url}
                    target="_blank"
                    rel="noopener"
                    className="btn btn-primary w-full"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
            {myTotals.totalCents > 0 && payLinks.length === 0 && (
              <p className="mt-3 text-xs text-[color:var(--muted)]">
                The creator hasn't set up any payment methods yet.
              </p>
            )}
          </div>
        )}
      </section>

      {detail && detailItem && (
        <ItemDetailSheet
          open
          onClose={() => setDetail(null)}
          item={detailItem}
          units={detailUnits}
          initialUnitIndex={detail.unitIndex}
          myName={myName}
          onClaim={detailClaim}
          onUnclaim={unclaim}
        />
      )}

      {/* Sticky name input */}
      <div className="sticky-name-bar">
        <div className="mx-auto max-w-2xl">
          <label className="text-xs font-medium text-[color:var(--muted)]">
            Your name
          </label>
          <input
            ref={nameInputRef}
            value={myName}
            onChange={(e) => saveMyName(e.target.value)}
            placeholder="Type your name to start claiming"
            className="mt-1"
          />
        </div>
      </div>

      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}

      <Footer />
    </main>
  );
}
