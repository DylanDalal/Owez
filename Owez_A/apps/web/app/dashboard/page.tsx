'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/lib/auth';
import { listMyReceipts } from '@/lib/db';
import {
  formatMoney,
  groupClaimsByUnit,
  type Receipt,
  type Claim,
} from '@owez/shared';
import { collection, getDocs } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';

interface Row {
  receipt: Receipt;
  claims: Claim[];
  subtotal: number;
  claimed: number;
  outstanding: number;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    (async () => {
      const receipts = await listMyReceipts(user.uid);
      const withClaims = await Promise.all(
        receipts.map(async (r) => {
          const snap = await getDocs(
            collection(getDb(), 'receipts', r.id, 'claims'),
          );
          const claims = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as Claim[];
          const subtotal = r.items.reduce(
            (s, it) => s + it.price * it.quantity,
            0,
          );
          const units = groupClaimsByUnit(r.items, claims);
          let claimed = 0;
          for (const u of units.values()) {
            const price = r.items[u.itemIndex]?.price ?? 0;
            claimed +=
              (price / (u.splitInto || 1)) * (u.portionsClaimed || 0);
          }
          return {
            receipt: r,
            claims,
            subtotal,
            claimed,
            outstanding: Math.max(0, subtotal - claimed),
          };
        }),
      );
      setRows(withClaims);
    })().catch(console.error);
  }, [user, loading, router]);

  const totalSaved = rows?.reduce((s, r) => s + r.claimed, 0) ?? 0;

  return (
    <main>
      <Header />
      <section className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Your receipts</h1>
            <p className="text-sm text-[color:var(--muted)]">
              Total recouped: <span className="font-semibold">{formatMoney(totalSaved)}</span>
            </p>
          </div>
          <Link href="/new" className="btn btn-primary">+ New receipt</Link>
        </div>

        <div className="mt-8 space-y-3">
          {rows === null && <p className="text-[color:var(--muted)]">Loading…</p>}
          {rows && rows.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-[color:var(--muted)]">No receipts yet.</p>
              <Link href="/new" className="btn btn-primary mt-4 inline-flex">
                Snap your first receipt
              </Link>
            </div>
          )}
          {rows?.map(({ receipt: r, subtotal, outstanding }) => (
            <Link
              key={r.id}
              href={`/r/${r.id}`}
              className="card p-4 flex items-center justify-between hover:border-accent"
            >
              <div>
                <div className="font-semibold">{r.title || r.merchant || 'Receipt'}</div>
                <div className="text-xs text-[color:var(--muted)]">
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums">{formatMoney(subtotal)}</div>
                <div className="text-xs text-[color:var(--muted)]">
                  {outstanding <= 0.005 ? 'Settled' : `Still owed ${formatMoney(outstanding)}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
