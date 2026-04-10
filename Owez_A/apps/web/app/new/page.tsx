'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/lib/auth';
import { createReceipt, upsertUserProfile } from '@/lib/db';
import {
  formatMoney,
  round2,
  type NormalizedReceipt,
  type ReceiptItem,
} from '@owez/shared';

type Stage = 'upload' | 'parsing' | 'edit' | 'saving';

export default function NewReceiptPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [error, setError] = useState<string | null>(null);

  // Editable state once parsed
  const [title, setTitle] = useState('Receipt');
  const [merchant, setMerchant] = useState<string>('');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [tax, setTax] = useState<number | undefined>();
  const [tip, setTip] = useState<number | undefined>();
  const [raw, setRaw] = useState<unknown>();

  // Payment handles — prefilled from profile or captured here
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    if (profile) {
      setVenmo(profile.venmo ?? '');
      setCashapp(profile.cashapp ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [user, profile, loading, router]);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStage('parsing');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/parse-receipt', { method: 'POST', body });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Parse failed (${res.status}) ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        raw: unknown;
        normalized: NormalizedReceipt;
      };
      setRaw(data.raw);
      setItems(data.normalized.items);
      setMerchant(data.normalized.merchant ?? '');
      setTax(data.normalized.tax);
      setTip(data.normalized.tip);
      setTitle(data.normalized.merchant ?? 'Receipt');
      setStage('edit');
    } catch (err: any) {
      setError(err?.message ?? 'Could not parse');
      setStage('upload');
    }
  }

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const total = subtotal + (tax ?? 0) + (tip ?? 0);

  async function save() {
    if (!user) return;
    setError(null);
    setStage('saving');
    try {
      // Fill in account payment handles that were blank, so future receipts
      // auto-populate. Only hits the profile doc when something changed.
      if (
        profile &&
        ((profile.venmo === '' && venmo) ||
          (profile.cashapp === '' && cashapp) ||
          (profile.phone === '' && phone))
      ) {
        await upsertUserProfile(user.uid, {
          displayName: user.displayName ?? profile.displayName ?? '',
          email: user.email ?? profile.email ?? '',
          photoURL: profile.photoURL,
          venmo: profile.venmo || venmo,
          cashapp: profile.cashapp || cashapp,
          phone: profile.phone || phone,
        });
        await refreshProfile();
      }

      const id = await createReceipt({
        ownerId: user.uid,
        title,
        merchant: merchant || undefined,
        items: items.filter((it) => it.name.trim() && it.price >= 0),
        tax,
        tip,
        raw,
        payment: { venmo, cashapp, phone },
      });
      router.replace(`/r/${id}?owner=1`);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save');
      setStage('edit');
    }
  }

  if (!user) return null;

  return (
    <main>
      <Header />
      <section className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-display text-3xl font-bold">New receipt</h1>

        {stage === 'upload' && (
          <div className="mt-6 card p-8 text-center">
            <p className="text-[color:var(--muted)]">
              Snap a photo of your receipt and we'll read every line item.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={onFileChosen}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="btn btn-primary mt-6"
            >
              Choose file
            </button>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </div>
        )}

        {stage === 'parsing' && (
          <div className="mt-6 card p-8 text-center">
            <p className="font-display text-xl">Reading your receipt…</p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              This usually takes a couple seconds.
            </p>
          </div>
        )}

        {(stage === 'edit' || stage === 'saving') && (
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </label>

            <div className="card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Items</h2>
                <button
                  className="btn btn-ghost"
                  onClick={() => setItems([...items, { name: '', price: 0, quantity: 1 }])}
                >
                  + Add
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_60px_auto] gap-2">
                    <input
                      value={it.name}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...it, name: e.target.value };
                        setItems(next);
                      }}
                      placeholder="Item"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.price}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...it, price: round2(Number(e.target.value) || 0) };
                        setItems(next);
                      }}
                    />
                    <input
                      type="number"
                      step="1"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...it, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) };
                        setItems(next);
                      }}
                    />
                    <button
                      aria-label="Delete row"
                      className="btn btn-ghost !px-3"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
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
                    type="number"
                    step="0.01"
                    value={tax ?? ''}
                    onChange={(e) => setTax(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Tip</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tip ?? ''}
                    onChange={(e) => setTip(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="mt-1"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <h2 className="font-display text-lg font-bold">How friends pay you</h2>
              <p className="text-xs text-[color:var(--muted)]">
                Pulled from your account; fill any in that are blank to save
                them for next time.
              </p>
              <label className="block">
                <span className="text-sm">Venmo</span>
                <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@janedoe" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-sm">Cash App</span>
                <input value={cashapp} onChange={(e) => setCashapp(e.target.value)} placeholder="$janedoe" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-sm">Phone (Zelle only)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" className="mt-1" />
              </label>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={save}
              disabled={stage === 'saving' || items.length === 0}
              className="btn btn-primary w-full"
            >
              {stage === 'saving' ? 'Saving…' : 'Create & get share link'}
            </button>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
