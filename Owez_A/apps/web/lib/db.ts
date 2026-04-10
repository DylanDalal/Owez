'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  assertClaimAllowed,
  type Claim,
  type Receipt,
  type UserProfile,
} from '@owez/shared';
import { getDb } from './firebase';

export async function upsertUserProfile(
  uid: string,
  data: Partial<UserProfile> & { email: string; displayName: string; photoURL: string },
): Promise<void> {
  const db = getDb();
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await setDoc(
      ref,
      { ...snap.data(), ...data, updatedAt: Date.now() },
      { merge: true },
    );
  } else {
    await setDoc(ref, {
      displayName: data.displayName,
      email: data.email,
      photoURL: data.photoURL,
      venmo: data.venmo ?? '',
      cashapp: data.cashapp ?? '',
      phone: data.phone ?? '',
      createdAt: Date.now(),
    });
  }
}

export async function createReceipt(
  receipt: Omit<Receipt, 'id' | 'createdAt'>,
): Promise<string> {
  const db = getDb();
  const ref = await addDoc(collection(db, 'receipts'), {
    ...receipt,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function updateReceipt(
  id: string,
  patch: Partial<Receipt>,
): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, 'receipts', id),
    { ...patch, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const snap = await getDoc(doc(getDb(), 'receipts', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Receipt, 'id'>) };
}

export function watchReceipt(
  id: string,
  onChange: (receipt: Receipt | null, meta: { pending: boolean }) => void,
): Unsubscribe {
  return onSnapshot(doc(getDb(), 'receipts', id), (snap) => {
    onChange(
      snap.exists()
        ? ({ id: snap.id, ...(snap.data() as Omit<Receipt, 'id'>) } as Receipt)
        : null,
      { pending: snap.metadata.hasPendingWrites },
    );
  });
}

export function watchClaims(
  receiptId: string,
  onChange: (claims: Claim[], meta: { pending: boolean }) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), 'receipts', receiptId, 'claims'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const claims = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Claim[];
    onChange(claims, { pending: snap.metadata.hasPendingWrites });
  });
}

export async function listMyReceipts(uid: string): Promise<Receipt[]> {
  const q = query(
    collection(getDb(), 'receipts'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Receipt[];
}

/**
 * Atomically claim part of a receipt item. Uses a transaction to re-read all
 * existing claims on that (itemIndex, unitIndex) pair and re-validates via
 * `assertClaimAllowed`, so two concurrent claimants can't over-subscribe.
 */
export async function claimItemUnit(
  receiptId: string,
  partial: Omit<Claim, 'id' | 'createdAt'>,
): Promise<void> {
  const db = getDb();
  const claimsCol = collection(db, 'receipts', receiptId, 'claims');
  await runTransaction(db, async (tx) => {
    const snap = await getDocs(claimsCol);
    const existing = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) })) as Claim[];
    const onUnit = existing.filter(
      (c) => c.itemIndex === partial.itemIndex && c.unitIndex === partial.unitIndex,
    );
    assertClaimAllowed(onUnit, {
      portions: partial.portions,
      splitInto: partial.splitInto,
    });
    const ref = doc(claimsCol);
    tx.set(ref, { ...partial, createdAt: Date.now() });
  });
}

export async function deleteClaim(
  receiptId: string,
  claimId: string,
): Promise<void> {
  await deleteDoc(doc(getDb(), 'receipts', receiptId, 'claims', claimId));
}
