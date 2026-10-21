import type { ParsedReceipt } from "@owez/shared";
import { getFirebase } from "./firebase";

/**
 * Client wrapper for POST /api/parse-receipt.
 *
 * Attaches the signed-in user's Firebase ID token (the route rejects
 * anonymous and unauthenticated callers) and turns the route's JSON error
 * envelope into a plain Error with a message safe to show in the UI.
 */
export async function parseReceiptFile(file: File): Promise<ParsedReceipt> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error("Sign in with Google or Apple to scan receipts.");
  }
  const token = await user.getIdToken();

  const fd = new FormData();
  fd.append("receipt", file);

  let res: Response;
  try {
    res = await fetch("/api/parse-receipt", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let message = "We couldn't read that receipt. Try a clearer photo.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON body (e.g. a hosting-layer 413/504) — keep the generic copy
      if (res.status === 413) message = "That photo is too large. Try one under 10 MB.";
      if (res.status === 504) message = "That took too long. Try again with a smaller photo.";
    }
    throw new Error(message);
  }
  return (await res.json()) as ParsedReceipt;
}
