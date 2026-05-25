"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Bill, ParsedReceipt } from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/lib/auth";
import { createBill, createTab, makeId, newBillId } from "@/lib/bills";
import { upsertProfile } from "@/lib/profiles";
import { centsToDisplay } from "@/lib/format";

type Stage = "details" | "parsing" | "saving";

export default function NewTabPage() {
  return (
    <SignInGate>
      <NewTabInner />
    </SignInGate>
  );
}

interface ParsedReceiptWithFile {
  file: File;
  parsed: ParsedReceipt;
}

function NewTabInner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const libraryRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>("details");
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [tabTitle, setTabTitle] = useState("");
  const [tabDescription, setTabDescription] = useState("");
  const [receipts, setReceipts] = useState<ParsedReceiptWithFile[]>([]);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsingTotal, setParsingTotal] = useState(0);

  // Payment methods (shared across all receipts on the tab)
  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [zellePhone, setZellePhone] = useState("");

  // Prefill payment methods from profile
  useEffect(() => {
    if (!profile) return;
    if (!venmo && profile.venmo) setVenmo(profile.venmo);
    if (!cashapp && profile.cashapp) setCashapp(profile.cashapp);
    if (!zellePhone && profile.zellePhone) setZellePhone(profile.zellePhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function handleFilesSelected(files: FileList) {
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setStage("parsing");
    setParsingProgress(0);
    setParsingTotal(fileArray.length);

    try {
      const parsed: ParsedReceiptWithFile[] = [];

      for (const file of fileArray) {
        const fd = new FormData();
        fd.append("receipt", file);
        const res = await fetch("/api/parse-receipt", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(await res.text());

        const parsedReceipt = (await res.json()) as ParsedReceipt;
        parsed.push({ file, parsed: parsedReceipt });
        setParsingProgress((n) => n + 1);
      }

      // Append to anything already added so "+ Add more photos" accumulates.
      setReceipts((prev) => [...prev, ...parsed]);
      setStage("details");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse receipts");
      setStage("details");
    }
  }

  const hasPayment = !!(venmo.trim() || cashapp.trim() || zellePhone.trim());
  const canSave = !!tabTitle.trim() && receipts.length > 0 && hasPayment;

  async function save() {
    if (!user) return;
    setError(null);
    setStage("saving");

    try {
      // Back-fill profile
      if (hasPayment) {
        await upsertProfile(user.uid, {
          displayName: user.displayName ?? profile?.displayName ?? "",
          email: user.email ?? profile?.email ?? undefined,
          photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          venmo: profile?.venmo || venmo.trim().replace(/^@/, ""),
          cashapp: profile?.cashapp || cashapp.trim().replace(/^\$/, ""),
          zellePhone: profile?.zellePhone || zellePhone.trim(),
        });
      }

      const tabId = newBillId();
      const billIds: string[] = [];
      const paymentMethods = {
        venmo: venmo.trim() ? venmo.trim().replace(/^@/, "") : undefined,
        cashapp: cashapp.trim() ? cashapp.trim().replace(/^\$/, "") : undefined,
        zellePhone: zellePhone.trim() ? zellePhone.trim() : undefined,
      };

      // Create all bill documents
      for (const receipt of receipts) {
        const billId = newBillId();
        billIds.push(billId);

        const bill: Bill = {
          id: billId,
          creatorId: user.uid,
          creatorName: user.displayName ?? profile?.displayName ?? undefined,
          creatorPhotoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          createdAt: Date.now(),
          items: receipt.parsed.items.map((it) => ({
            id: makeId(),
            name: it.name,
            priceCents: it.priceCents,
            quantity: it.quantity || 1,
          })),
          subtotalCents: receipt.parsed.subtotalCents,
          taxCents: receipt.parsed.taxCents,
          tipCents: receipt.parsed.tipCents,
          totalCents: receipt.parsed.totalCents,
          paymentMethods,
          tabId, // Link to the tab
          title: receipt.parsed.merchant,
        };

        if (!bill.creatorName) delete bill.creatorName;
        if (!bill.creatorPhotoURL) delete bill.creatorPhotoURL;

        await createBill(bill);
      }

      // Create tab document
      const tab = {
        id: tabId,
        creatorId: user.uid,
        creatorName: user.displayName ?? profile?.displayName ?? undefined,
        creatorPhotoURL: user.photoURL ?? profile?.photoURL ?? undefined,
        createdAt: Date.now(),
        title: tabTitle.trim(),
        description: tabDescription.trim() || undefined,
        members: [
          {
            userId: user.uid,
            name: user.displayName ?? profile?.displayName ?? "Creator",
            photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
            joinedAt: Date.now(),
          },
        ],
        receiptIds: billIds,
        status: "active" as const,
      };

      if (!tab.creatorName) delete tab.creatorName;
      if (!tab.creatorPhotoURL) delete tab.creatorPhotoURL;

      await createTab(tab);
      router.replace(`/tab/${tabId}?owner=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tab");
      setStage("details");
    }
  }

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">New tab</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Group a night out or a whole trip — add every receipt you paid for
          and your friends settle up once.
        </p>

        {(stage === "details" || stage === "saving") && (
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Tab name</span>
              <input
                value={tabTitle}
                onChange={(e) => setTabTitle(e.target.value)}
                placeholder="Friday night out"
                className="mt-1"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Description (optional)</span>
              <textarea
                value={tabDescription}
                onChange={(e) => setTabDescription(e.target.value)}
                placeholder="Drinks, dinner, and the cab home..."
                className="mt-1 min-h-20"
              />
            </label>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold">Receipts</h2>
                {receipts.length > 0 && (
                  <span className="text-sm text-[color:var(--muted)]">
                    {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />

              {receipts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[color:var(--muted)]">
                    Snap photos of your receipts and we'll read every line item.
                  </p>
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    className="btn btn-primary mt-4"
                  >
                    Choose Photos
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {receipts.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--border)] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {r.parsed.merchant || `Receipt ${i + 1}`}
                        </div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {r.parsed.items.length} item
                          {r.parsed.items.length === 1 ? "" : "s"} ·{" "}
                          {centsToDisplay(r.parsed.totalCents)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost !px-2"
                        onClick={() =>
                          setReceipts((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    className="btn btn-ghost w-full"
                  >
                    + Add more photos
                  </button>
                </div>
              )}
            </div>

            <div className="card p-4 text-sm border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5">
              <div className="text-sm">
                <strong>Only upload receipts that you paid for</strong> — your
                friends will be able to add items when you send them the link.
              </div>
            </div>

            <div className="card space-y-3 p-4">
              <h2 className="font-display text-lg font-bold">
                How friends pay you
              </h2>
              <p className="text-xs text-[color:var(--muted)]">
                Pulled from your account. Fill in any blanks and we'll save them
                for next time.
              </p>
              <label className="block">
                <span className="text-sm">Venmo</span>
                <input
                  value={venmo}
                  onChange={(e) => setVenmo(e.target.value)}
                  placeholder="@janedoe"
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-sm">Cash App</span>
                <input
                  value={cashapp}
                  onChange={(e) => setCashapp(e.target.value)}
                  placeholder="$janedoe"
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-sm">Phone (Zelle only)</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={zellePhone}
                  onChange={(e) => setZellePhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="mt-1"
                />
              </label>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave || stage === "saving"}
              className="btn btn-primary w-full"
            >
              {stage === "saving" ? "Creating tab…" : "Create & get share link"}
            </button>
          </div>
        )}

        {stage === "parsing" && (
          <div className="mt-6 card p-8 text-center">
            <p className="font-display text-xl">Reading your receipts…</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Processing {Math.min(parsingProgress + 1, parsingTotal)} of{" "}
              {parsingTotal}
            </p>
            <div className="mt-4 w-full bg-[color:var(--border)] rounded-full h-2 overflow-hidden">
              <div
                className="bg-[color:var(--color-accent)] h-full transition-all duration-300"
                style={{
                  width: `${
                    parsingTotal > 0
                      ? (parsingProgress / parsingTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
