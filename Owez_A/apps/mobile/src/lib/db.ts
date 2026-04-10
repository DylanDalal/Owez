import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
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
  data: Partial<UserProfile> & {
    email: string;
    displayName: string;
    photoURL: string;
  },
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

export async function listMyReceipts(uid: string): Promise<Receipt[]> {
  const q = query(
    collection(getDb(), 'receipts'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Receipt[];
}

export async function createReceipt(
  data: Omit<Receipt, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'receipts'), {
    ...data,
    createdAt: Date.now(),
  });
  return ref.id;
}

export function watchReceipt(
  id: string,
  onChange: (receipt: Receipt | null) => void,
): Unsubscribe {
  return onSnapshot(doc(getDb(), 'receipts', id), (snap) => {
    onChange(
      snap.exists()
        ? ({ id: snap.id, ...(snap.data() as Omit<Receipt, 'id'>) } as Receipt)
        : null,
    );
  });
}

export function watchClaims(
  receiptId: string,
  onChange: (claims: Claim[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), 'receipts', receiptId, 'claims'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const claims = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Claim[];
    onChange(claims);
  });
}

export async function claimItemUnit(
  receiptId: string,
  partial: Omit<Claim, 'id' | 'createdAt'>,
): Promise<void> {
  const db = getDb();
  const claimsCol = collection(db, 'receipts', receiptId, 'claims');
  await runTransaction(db, async (tx) => {
    const snap = await getDocs(claimsCol);
    const existing = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Claim[];
    const onUnit = existing.filter(
      (c) =>
        c.itemIndex === partial.itemIndex && c.unitIndex === partial.unitIndex,
    );
    assertClaimAllowed(onUnit, {
      portions: partial.portions,
      splitInto: partial.splitInto,
    });
    const ref = doc(claimsCol);
    tx.set(ref, { ...partial, createdAt: Date.now() });
  });
}
