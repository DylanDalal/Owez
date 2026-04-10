"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Bill,
  BillItem,
  ParsedReceipt,
  PaymentMethods,
} from "@owez/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { AdSlot } from "@/components/AdSlot";
import { useAuth } from "@/lib/auth";
import { createBill, makeId, newBillId } from "@/lib/bills";
import { upsertProfile } from "@/lib/profiles";
import { centsToDisplay, dollarInputToCents } from "@/lib/format";

/**
 * Create flow, three stages:
 *   upload  — pick a photo (camera or file)
 *   parsing — waiting on Mindee
 *   edit    — show the parsed receipt, let the user correct mistakes
 *   saving  — in-flight Firestore write
 *
 * On save: also back-fills blank fields on the user's UserProfile so the
 * next receipt auto-populates its payment handles.
 */
export default function NewBillPage() {
  return (
    <SignInGate>
      <NewBillInner />
    </SignInGate>
  );
}

type Stage = "upload" | "parsing" | "edit" | "saving";

function NewBillInner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);

  // Editor state — lives across parse → edit → save.
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [taxCents, setTaxCents] = useState(0);
  const [tipCents, setTipCents] = useState(0);
  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [zellePhone, setZellePhone] = useState("");

  // Prefill payment handles from the user's profile (if any).
  useEffect(() => {
    if (!profile) return;
    if (!venmo && profile.venmo) setVenmo(profile.venmo);
    if (!cashapp && profile.cashapp) setCashapp(profile.cashapp);
    if (!zellePhone && profile.zellePhone) setZellePhone(profile.zellePhone);
    // Intentionally only runs when profile resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const subtotalCents = useMemo(
    () => items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0),
    [items],
  );
  const totalCents = subtotalCents + taxCents + tipCents;

  async function handleFilePicked(file: File) {
    setError(null);
    setStage("parsing");
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const parsed = (await res.json()) as ParsedReceipt;

      setTitle(parsed.merchant ?? "");
      setItems(
        parsed.items.map((it) => ({
          id: makeId(),
          name: it.name,
          priceCents: it.priceCents,
          quantity: it.quantity || 1,
        })),
      );
      setTaxCents(parsed.taxCents);
      setTipCents(parsed.tipCents);
      setStage("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read receipt");
      setStage("upload");
    }
  }

  function updateItem(id: string, patch: Partial<BillItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: makeId(), name: "", priceCents: 0, quantity: 1 },
    ]);
  }
  function setTipPercent(pct: number) {
    setTipCents(Math.round((subtotalCents * pct) / 100));
  }

  const paymentMethods: PaymentMethods = useMemo(() => {
    const m: PaymentMethods = {};
    if (venmo.trim()) m.venmo = venmo.trim().replace(/^@/, "");
    if (cashapp.trim()) m.cashapp = cashapp.trim().replace(/^\$/, "");
    if (zellePhone.trim()) m.zellePhone = zellePhone.trim();
    return m;
  }, [venmo, cashapp, zellePhone]);

  const hasPayment = !!(paymentMethods.venmo || paymentMethods.cashapp || paymentMethods.zellePhone);
  // NB: we intentionally don't include `stage === "edit"` here — using the
  // state value inside a `const` assignment would narrow `stage` in the rest
  // of the function body, which confuses the JSX checks below.
  const canSave =
    items.length > 0 &&
    items.every((it) => it.name.trim() && it.priceCents >= 0) &&
    hasPayment;

  async function save() {
    if (!user) return;
    setError(null);
    setStage("saving");
    try {
      // Back-fill the profile so next time we don't have to retype.
      if (hasPayment) {
        await upsertProfile(user.uid, {
          displayName: user.displayName ?? profile?.displayName ?? "",
          email: user.email ?? profile?.email ?? undefined,
          photoURL: user.photoURL ?? profile?.photoURL ?? undefined,
          venmo: profile?.venmo || paymentMethods.venmo,
          cashapp: profile?.cashapp || paymentMethods.cashapp,
          zellePhone: profile?.zellePhone || paymentMethods.zellePhone,
        });
      }

      const billId = newBillId();
      const bill: Bill = {
        id: billId,
        creatorId: user.uid,
        creatorName: user.displayName ?? profile?.displayName ?? undefined,
        creatorPhotoURL: user.photoURL ?? profile?.photoURL ?? undefined,
        createdAt: Date.now(),
        items,
        subtotalCents,
        taxCents,
        tipCents,
        totalCents,
        paymentMethods,
      };
      if (title.trim()) bill.title = title.trim();

      // Firestore rejects `undefined`, so strip missing optionals.
      if (!bill.creatorName) delete bill.creatorName;
      if (!bill.creatorPhotoURL) delete bill.creatorPhotoURL;

      await createBill(bill);
      router.replace(`/${billId}?owner=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save bill");
      setStage("edit");
    }
  }

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">New receipt</h1>

        {stage === "upload" && (
          <div className="mt-6 card p-8 text-center">
            <p className="text-[color:var(--muted)]">
              Snap a photo of your receipt and we'll read every line item.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFilePicked(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-primary mt-6"
            >
              Choose photo
            </button>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </div>
        )}

        {stage === "parsing" && (
          <div className="mt-6 card p-8 text-center">
            <p className="font-display text-xl">Reading your receipt…</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              This usually takes a couple seconds.
            </p>
            {/* Ad shown while Mindee processes the receipt */}
            <AdSlot
              slot={process.env.NEXT_PUBLIC_AD_SLOT_PARSING ?? ""}
              format="auto"
              className="mt-6"
            />
          </div>
        )}

        {(stage === "edit" || stage === "saving") && (
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dinner at Lucali"
                className="mt-1"
              />
            </label>

            <div className="card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Items</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={addItem}
                >
                  + Add
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="grid grid-cols-[1fr_90px_60px_auto] gap-2"
                  >
                    <input
                      value={it.name}
                      onChange={(e) =>
                        updateItem(it.id, { name: e.target.value })
                      }
                      placeholder="Item"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(it.priceCents / 100).toFixed(2)}
                      onChange={(e) =>
                        updateItem(it.id, {
                          priceCents: dollarInputToCents(e.target.value),
                        })
                      }
                      className="text-right tabular-nums"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(it.id, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="text-center"
                    />
                    <button
                      type="button"
                      aria-label="Delete row"
                      className="btn btn-ghost !px-3"
                      onClick={() => removeItem(it.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="receipt-divider my-4" />

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm">Tax</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(taxCents / 100).toFixed(2)}
                    onChange={(e) => setTaxCents(dollarInputToCents(e.target.value))}
                    className="mt-1 text-right tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Tip</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(tipCents / 100).toFixed(2)}
                    onChange={(e) => setTipCents(dollarInputToCents(e.target.value))}
                    className="mt-1 text-right tabular-nums"
                  />
                  <div className="mt-2 flex gap-2">
                    {[15, 18, 20].map((pct) => (
                      <button
                        type="button"
                        key={pct}
                        onClick={() => setTipPercent(pct)}
                        className="btn btn-ghost !py-1 !px-3 text-xs"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {centsToDisplay(totalCents)}
                </span>
              </div>
            </div>

            <div className="card space-y-3 p-4">
              <h2 className="font-display text-lg font-bold">
                How friends pay you
              </h2>
              <p className="text-xs text-[color:var(--muted)]">
                Pulled from your account. Fill in any blanks and we'll save
                them for next time.
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
              {stage === "saving" ? "Saving…" : "Create & get share link"}
            </button>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
