import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import {
  assertClaimAllowed,
  type Bill,
  type BillId,
  type Claim,
  type ClaimId,
} from "@owez/shared";
import { getFirebase } from "./firebase";

/**
 * Mobile data layer — mirrors apps/web/src/lib/bills.ts. Kept as a local copy
 * rather than hoisted into @owez/shared because the helpers depend on
 * firebase/firestore runtime, which is already a direct dep of both apps.
 * Once a third consumer shows up we should lift this to shared.
 */

export function newBillId(): BillId {
  // React Native's crypto.randomUUID is available on Hermes 0.71+; the Expo
  // 52 runtime we're on includes it. Fall back to a Math.random UUID just in
  // case a user is on an older JS engine.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function createBill(bill: Bill): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "bills", bill.id), bill);
}

export function subscribeToBill(
  billId: BillId,
  onChange: (bill: Bill | null) => void,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(doc(db, "bills", billId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange(fromFirestore(snap.data()));
  });
}

export function subscribeToClaims(
  billId: BillId,
  onChange: (claims: Claim[]) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const q = query(
    collection(db, "bills", billId, "claims"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const claims: Claim[] = snap.docs.map((d) => claimFromDoc(d.id, d.data()));
    onChange(claims);
  });
}

/**
 * Create a new claim on a specific (itemId, unitIndex) pair. Validates
 * against existing claims on the same unit first so concurrent writes can't
 * over-subscribe. Not a true transaction — Firestore's web SDK can't
 * transactionally read a collection — but the race window is narrow enough
 * for the scale we care about.
 */
export async function claimItemUnit(
  billId: BillId,
  data: Omit<Claim, "id" | "createdAt">,
): Promise<ClaimId> {
  const { db } = getFirebase();
  const claimsCol = collection(db, "bills", billId, "claims");

  const snap = await getDocs(claimsCol);
  const onUnit = snap.docs
    .map((d) => claimFromDoc(d.id, d.data()))
    .filter(
      (c) => c.itemId === data.itemId && c.unitIndex === data.unitIndex,
    );
  assertClaimAllowed(onUnit, {
    portions: data.portions,
    splitInto: data.splitInto,
  });

  const payload: Record<string, unknown> = {
    itemId: data.itemId,
    unitIndex: data.unitIndex,
    portions: data.portions,
    splitInto: data.splitInto,
    claimerId: data.claimerId,
    name: data.name,
    initials: data.initials,
    createdAt: Date.now(),
  };
  if (data.photoURL) payload.photoURL = data.photoURL;

  const ref = await addDoc(claimsCol, payload);
  return ref.id;
}

export async function deleteClaimDoc(
  billId: BillId,
  claimId: ClaimId,
): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "bills", billId, "claims", claimId));
}

/* ---------- Firestore ↔ TS shape glue ---------- */

function fromFirestore(data: Record<string, unknown>): Bill {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toMillis()
      : typeof data.createdAt === "number"
        ? data.createdAt
        : Date.now();

  return {
    id: String(data.id ?? ""),
    creatorId: String(data.creatorId ?? ""),
    creatorName:
      typeof data.creatorName === "string" ? data.creatorName : undefined,
    creatorPhotoURL:
      typeof data.creatorPhotoURL === "string"
        ? data.creatorPhotoURL
        : undefined,
    createdAt,
    title: typeof data.title === "string" ? data.title : undefined,
    items: Array.isArray(data.items) ? (data.items as Bill["items"]) : [],
    subtotalCents: Number(data.subtotalCents ?? 0),
    taxCents: Number(data.taxCents ?? 0),
    tipCents: Number(data.tipCents ?? 0),
    totalCents: Number(data.totalCents ?? 0),
    paymentMethods:
      (data.paymentMethods as Bill["paymentMethods"] | undefined) ?? {},
  };
}

function claimFromDoc(id: string, data: Record<string, unknown>): Claim {
  return {
    id,
    itemId: String(data.itemId ?? ""),
    unitIndex: Number(data.unitIndex ?? 0),
    portions: Number(data.portions ?? 1),
    splitInto: Number(data.splitInto ?? 1),
    claimerId: String(data.claimerId ?? ""),
    name: typeof data.name === "string" ? data.name : "",
    initials: typeof data.initials === "string" ? data.initials : "",
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toMillis()
        : typeof data.createdAt === "number"
          ? data.createdAt
          : Date.now(),
    photoURL: typeof data.photoURL === "string" ? data.photoURL : undefined,
  };
}
