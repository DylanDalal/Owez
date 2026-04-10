import { doc, getDoc, setDoc } from "firebase/firestore";
import type { UserProfile } from "@owez/shared";
import { getFirebase } from "./firebase";

/**
 * Profile doc at `users/{uid}`. Stores default payment handles so new
 * bills auto-fill without the creator retyping their Venmo / Cash App
 * each time.
 */

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/**
 * Create-or-update the user's profile. Merges partial updates so a page
 * that only wants to set, say, the Venmo handle doesn't wipe the photoURL.
 */
export async function upsertProfile(
  uid: string,
  patch: Partial<UserProfile> & { displayName: string },
): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);

  // Strip `undefined`s — Firestore rejects them, and partial merges should
  // leave untouched fields alone rather than complain about undefineds.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) cleaned[k] = v;
  }

  if (existing.exists()) {
    await setDoc(
      ref,
      { ...cleaned, updatedAt: Date.now() },
      { merge: true },
    );
  } else {
    await setDoc(ref, {
      displayName: patch.displayName,
      email: patch.email ?? "",
      photoURL: patch.photoURL ?? "",
      venmo: patch.venmo ?? "",
      cashapp: patch.cashapp ?? "",
      zellePhone: patch.zellePhone ?? "",
      createdAt: Date.now(),
    });
  }
}
