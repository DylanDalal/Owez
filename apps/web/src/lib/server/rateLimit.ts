/**
 * Rate limiting for the receipt parser.
 *
 * Two layers, both best-effort and intentionally simple:
 *
 *  1. In-memory sliding windows (per uid + global). These live for the life
 *     of one serverless instance, so they're a speed bump rather than a
 *     wall — but they stop a single warm instance from being hammered and
 *     cost nothing to run.
 *
 *  2. A durable per-uid daily counter in Firestore (`parseUsage/{uid}`),
 *     written through the REST API with a service account. This only
 *     activates when FIREBASE_SERVICE_ACCOUNT_JSON is set; without it we
 *     silently fall back to layer 1. Clients can't touch this collection —
 *     there's no matching rule in firestore.rules, so the default deny applies.
 *
 * Limits are deliberately generous for a real person (a receipt or two per
 * meal) and tight for a script.
 */

import { SignJWT, importPKCS8 } from "jose";

export const LIMITS = {
  /** Parses per user per 10 minutes (burst protection). */
  perUserBurst: 12,
  perUserBurstWindowMs: 10 * 60 * 1000,
  /** Parses per user per calendar day (UTC). */
  perUserDaily: 60,
  /** Parses across all users per hour on this instance (circuit breaker). */
  globalHourly: 300,
} as const;

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message: string, public readonly retryAfterSec: number) {
    super(message);
  }
}

/* ---------- layer 1: in-memory ---------- */

const userHits = new Map<string, number[]>();
let globalHits: number[] = [];

function prune(times: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  // Hits are appended in order, so find the first one still inside the window.
  let i = 0;
  while (i < times.length && (times[i] ?? 0) < cutoff) i++;
  return i === 0 ? times : times.slice(i);
}

function checkMemory(uid: string): void {
  const now = Date.now();

  globalHits = prune(globalHits, 60 * 60 * 1000, now);
  if (globalHits.length >= LIMITS.globalHourly) {
    throw new RateLimitError(
      "Owez is unusually busy right now. Try again in a few minutes.",
      300,
    );
  }

  const mine = prune(userHits.get(uid) ?? [], LIMITS.perUserBurstWindowMs, now);
  if (mine.length >= LIMITS.perUserBurst) {
    const oldest = mine[0] ?? now;
    const retry = Math.ceil((oldest + LIMITS.perUserBurstWindowMs - now) / 1000);
    throw new RateLimitError(
      "You've scanned a lot of receipts in a row. Take a short break and try again.",
      Math.max(retry, 30),
    );
  }

  mine.push(now);
  userHits.set(uid, mine);
  globalHits.push(now);

  // Keep the map from growing forever on a long-lived instance.
  if (userHits.size > 5000) {
    for (const [k, v] of userHits) {
      if (prune(v, LIMITS.perUserBurstWindowMs, now).length === 0) userHits.delete(k);
    }
  }
}

/* ---------- layer 2: Firestore daily counter (optional) ---------- */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let serviceAccount: ServiceAccount | null | undefined;
let accessToken: { value: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return (serviceAccount = null);
  try {
    // Accept either raw JSON or base64-encoded JSON (easier to paste into
    // hosting dashboards that mangle newlines).
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      throw new Error("missing fields");
    }
    return (serviceAccount = parsed);
  } catch (e) {
    console.error("[rateLimit] FIREBASE_SERVICE_ACCOUNT_JSON is not valid:", e);
    return (serviceAccount = null);
  }
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && accessToken.expiresAt - 60 > now) return accessToken.value;

  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Read today's count for the uid, reject if over the daily cap, otherwise
 * increment. Not transactional — two simultaneous requests can overshoot by
 * one, which is fine for an abuse brake.
 */
async function checkFirestore(uid: string): Promise<void> {
  const sa = loadServiceAccount();
  if (!sa) return;

  const token = await getAccessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const docPath = `parseUsage/${encodeURIComponent(uid)}`;
  const field = `d${todayKey()}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const getRes = await fetch(`${base}/${docPath}?mask.fieldPaths=${field}`, { headers });
  if (getRes.ok) {
    const doc = (await getRes.json()) as {
      fields?: Record<string, { integerValue?: string }>;
    };
    const count = Number(doc.fields?.[field]?.integerValue ?? 0);
    if (count >= LIMITS.perUserDaily) {
      throw new RateLimitError(
        "You've hit today's receipt limit. It resets at midnight UTC.",
        3600,
      );
    }
  } else if (getRes.status !== 404) {
    // Firestore hiccup — don't block real users over it.
    console.error("[rateLimit] usage read failed:", getRes.status);
    return;
  }

  const commitRes = await fetch(`${base}:commit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: `projects/${sa.project_id}/databases/(default)/documents/${docPath}`,
            fieldTransforms: [
              { fieldPath: field, increment: { integerValue: "1" } },
              { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
            ],
          },
        },
      ],
    }),
  });
  if (!commitRes.ok) {
    console.error("[rateLimit] usage write failed:", commitRes.status);
  }
}

/** Run both layers. Throws RateLimitError when the caller should back off. */
export async function enforceParseRateLimit(uid: string): Promise<void> {
  checkMemory(uid);
  await checkFirestore(uid);
}
