'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ReceiptItemCard } from '@/components/ReceiptItemCard';
import { ItemDetailSheet } from '@/components/ItemDetailSheet';
import { useAuth } from '@/lib/auth';
import {
  claimItemUnit,
  deleteClaim,
  watchClaims,
  watchReceipt,
} from '@/lib/db';
import { getDb } from '@/lib/firebase';
import { getSessionId, getSavedGuestName, saveGuestName } from '@/lib/session';
import {
  formatMoney,
  groupClaimsByUnit,
  initialsFromName,
  totalForGuest,
  type Claim,
  type Receipt,
} from '@owez/shared';

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const search = useSearchParams();
  const isOwnerView = search.get('owner') === '1';

  const { user, profile } = useAuth();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pending, setPending] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [detail, setDetail] = useState<{ itemIndex: number; unitIndex: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [photoByUid, setPhotoByUid] = useState<Record<string, string | undefined>>({});
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const sessionId = typeof window !== 'undefined' ? getSessionId() : '';

  useEffect(() => {
    setGuestName(getSavedGuestName());
  }, []);

  // Signed-in Owez users: use their profile name/initials automatically.
  useEffect(() => {
    if (profile?.displayName && !guestName) {
      setGuestName(profile.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Firestore subscriptions — receipt doc + claims subcollection.
  useEffect(() => {
    if (!id) return;
    const un1 = watchReceipt(id, (r, meta) => {
      setReceipt(r);
      setPending(meta.pending);
    });
    const un2 = watchClaims(id, (cs) => setClaims(cs));
    return () => {
      un1();
      un2();
    };
  }, [id]);

  // Fetch photoURLs for any Owez-signed-in claimants so we can swap their
  // stamp for their avatar.
  useEffect(() => {
    const uids = Array.from(
      new Set(claims.map((c) => c.ownerUid).filter((x): x is string => !!x)),
    );
    const missing = uids.filter((u) => !(u in photoByUid));
    if (missing.length === 0) return;
    (async () => {
      const next: Record<string, string | undefined> = { ...photoByUid };
      await Promise.all(
        missing.map(async (u) => {
          try {
            const snap = await getDoc(doc(getDb(), 'users', u));
            next[u] = snap.exists() ? (snap.data() as any).photoURL : undefined;
          } catch {
            next[u] = undefined;
          }
        }),
      );
      setPhotoByUid(next);
    })();
  }, [claims, photoByUid]);

  const unitMap = useMemo(
    () => (receipt ? groupClaimsByUnit(receipt.items, claims) : new Map()),
    [receipt, claims],
  );

  const myTotal = receipt ? totalForGuest(receipt, claims, guestName) : 0;
  const myInitials = initialsFromName(guestName);

  async function quickClaim(itemIndex: number, unitIndex: number) {
    if (!receipt) return;
    if (!guestName) {
      focusName();
      return;
    }
    try {
      await claimItemUnit(receipt.id, {
        itemIndex,
        unitIndex,
        guestName,
        initials: myInitials,
        portions: 1,
        splitInto: 1,
        ownerUid: user?.uid ?? null,
        photoURL: profile?.photoURL ?? null,
        sessionId,
      });
    } catch (e: any) {
      setToast(e?.message ?? 'Could not claim');
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function detailClaim({
    unitIndex,
    portions,
    splitInto,
  }: {
    unitIndex: number;
    portions: number;
    splitInto: number;
  }) {
    if (!receipt || detail == null) return;
    await claimItemUnit(receipt.id, {
      itemIndex: detail.itemIndex,
      unitIndex,
      guestName,
      initials: myInitials,
      portions,
      splitInto,
      ownerUid: user?.uid ?? null,
      photoURL: profile?.photoURL ?? null,
      sessionId,
    });
  }

  async function unclaim(claimId: string) {
    if (!receipt) return;
    try {
      await deleteClaim(receipt.id, claimId);
    } catch (e: any) {
      setToast(e?.message ?? 'Could not remove');
      setTimeout(() => setToast(null), 2500);
    }
  }

  function focusName() {
    nameInputRef.current?.focus();
    nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setToast('Enter your name first');
    setTimeout(() => setToast(null), 1800);
  }

  function saveName(n: string) {
    setGuestName(n);
    saveGuestName(n);
  }

  if (receipt === null) {
    return (
      <main>
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-[color:var(--muted)]">
          Loading receipt…
        </div>
      </main>
    );
  }

  const shareUrl = typeof window !== 'undefined' ? `${location.origin}/r/${receipt.id}` : '';

  return (
    <main className="pb-40">
      <Header />

      <section className="max-w-2xl mx-auto px-4 pt-6">
        {isOwnerView && (
          <div className="card p-4 mb-5">
            <div className="text-xs font-medium text-[color:var(--muted)]">
              SHARE THIS LINK
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
              <button
                className="btn btn-primary whitespace-nowrap"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setToast('Copied!');
                  setTimeout(() => setToast(null), 1500);
                }}
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted)]">
              Anyone with this link can claim items. They don't need an account.
            </p>
          </div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">
              {receipt.title || receipt.merchant || 'Receipt'}
            </h1>
            {receipt.merchant && receipt.merchant !== receipt.title && (
              <div className="text-sm text-[color:var(--muted)]">{receipt.merchant}</div>
            )}
          </div>
          <SyncBadge pending={pending} />
        </div>

        <div className="mt-6 grid gap-3">
          {receipt.items.map((item, i) => {
            const units = [];
            for (let u = 0; u < item.quantity; u++) {
              units.push(
                unitMap.get(`${i}:${u}`) ?? {
                  itemIndex: i,
                  unitIndex: u,
                  splitInto: 1,
                  portionsClaimed: 0,
                  claims: [],
                },
              );
            }
            return (
              <ReceiptItemCard
                key={i}
                item={item}
                itemIndex={i}
                units={units}
                myName={guestName}
                mySessionId={sessionId}
                photoByUid={photoByUid}
                onQuickClaim={(unitIndex) => quickClaim(i, unitIndex)}
                onOpenDetail={(unitIndex) => setDetail({ itemIndex: i, unitIndex })}
                onUnclaim={(claimId) => unclaim(claimId)}
              />
            );
          })}
        </div>

        {(receipt.tax || receipt.tip) && (
          <div className="mt-6 card p-4 text-sm">
            {receipt.tax != null && (
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">Tax (split by share)</span>
                <span>{formatMoney(receipt.tax)}</span>
              </div>
            )}
            {receipt.tip != null && (
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">Tip (split by share)</span>
                <span>{formatMoney(receipt.tip)}</span>
              </div>
            )}
          </div>
        )}

        {guestName && (
          <div className="mt-6 card p-5">
            <div className="flex items-center justify-between">
              <div className="font-display text-xl font-bold">Your total</div>
              <div className="font-display text-2xl tabular-nums">{formatMoney(myTotal)}</div>
            </div>
            {myTotal > 0 && (
              <PaymentButtons payment={receipt.payment} amount={myTotal} />
            )}
          </div>
        )}
      </section>

      {detail && receipt && (
        <ItemDetailSheet
          open={true}
          onClose={() => setDetail(null)}
          item={receipt.items[detail.itemIndex]}
          itemIndex={detail.itemIndex}
          units={Array.from({ length: receipt.items[detail.itemIndex].quantity }).map(
            (_, u) =>
              unitMap.get(`${detail.itemIndex}:${u}`) ?? {
                itemIndex: detail.itemIndex,
                unitIndex: u,
                splitInto: 1,
                portionsClaimed: 0,
                claims: [],
              },
          )}
          myName={guestName}
          mySessionId={sessionId}
          onClaim={detailClaim}
          onUnclaim={unclaim}
        />
      )}

      {/* Sticky name input */}
      <div className="sticky-name-bar">
        <div className="max-w-2xl mx-auto">
          <label className="text-xs font-medium text-[color:var(--muted)]">
            Your name
          </label>
          <input
            ref={nameInputRef}
            value={guestName}
            onChange={(e) => saveName(e.target.value)}
            placeholder="Type your name to start claiming"
            className="mt-1"
          />
        </div>
      </div>

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-black text-white text-sm px-4 py-2 shadow">
          {toast}
        </div>
      )}

      <Footer />
    </main>
  );
}

function SyncBadge({ pending }: { pending: boolean }) {
  return (
    <div
      className={
        'text-xs rounded-full px-2 py-1 border ' +
        (pending
          ? 'border-amber-400 text-amber-500'
          : 'border-[color:var(--border)] text-[color:var(--muted)]')
      }
      title={pending ? 'Changes pending sync (offline?)' : 'Live'}
    >
      {pending ? '⟳ pending' : '● live'}
    </div>
  );
}

function PaymentButtons({
  payment,
  amount,
}: {
  payment: { venmo?: string; cashapp?: string; phone?: string };
  amount: number;
}) {
  const fixed = amount.toFixed(2);
  const buttons: Array<[string, string]> = [];
  if (payment.venmo) {
    const v = payment.venmo.replace(/^@/, '');
    buttons.push([
      'Pay with Venmo',
      `https://venmo.com/${encodeURIComponent(v)}?txn=pay&amount=${fixed}&note=${encodeURIComponent('Owez')}`,
    ]);
  }
  if (payment.cashapp) {
    const c = payment.cashapp.replace(/^\$/, '');
    buttons.push([
      'Pay with Cash App',
      `https://cash.app/$${encodeURIComponent(c)}/${fixed}`,
    ]);
  }
  if (payment.phone) {
    // Zelle doesn't have a web deep-link — we surface the phone number to copy.
    buttons.push([`Zelle: ${payment.phone}`, 'javascript:void(0)']);
  }
  if (buttons.length === 0) {
    return (
      <p className="mt-3 text-xs text-[color:var(--muted)]">
        The owner hasn't set up any payment methods yet.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-2">
      {buttons.map(([label, href]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener"
          className="btn btn-primary w-full"
        >
          {label}
        </a>
      ))}
    </div>
  );
}
