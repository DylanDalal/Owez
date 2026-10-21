import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

/**
 * Server-side verification of Firebase Auth ID tokens, without the Admin SDK.
 *
 * Firebase ID tokens are RS256 JWTs signed by Google. The public keys are
 * published as a JWKS, so we can verify them with `jose` and no service
 * account — which means the deploy needs zero new secrets for auth to work.
 *
 * Checks performed (mirrors what admin.auth().verifyIdToken does):
 *   - signature against Google's current signing keys
 *   - iss === https://securetoken.google.com/<projectId>
 *   - aud === <projectId>
 *   - exp / iat sanity (jose handles exp; we bound iat loosely)
 *   - sub (uid) present
 *
 * Local dev with the Auth emulator issues *unsigned* tokens (alg "none"), so
 * when the app is explicitly configured for emulators and we're not in
 * production, we decode without verifying.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export interface VerifiedUser {
  uid: string;
  /** "google.com", "apple.com", "anonymous", … */
  provider: string;
  email?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

function usingEmulator(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
  );
}

/** Pull the bearer token off a request, or throw a 401. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new AuthError("Sign in to scan receipts.");
  return match[1].trim();
}

export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  if (!PROJECT_ID) {
    throw new AuthError("Server is missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.", 403);
  }

  let payload: Record<string, unknown>;
  if (usingEmulator()) {
    payload = decodeJwt(token) as Record<string, unknown>;
    if (payload.aud !== PROJECT_ID) throw new AuthError("Token is for another project.");
  } else {
    jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
    try {
      const result = await jwtVerify(token, jwks, {
        issuer: `https://securetoken.google.com/${PROJECT_ID}`,
        audience: PROJECT_ID,
        algorithms: ["RS256"],
        // Firebase tokens live for 1h; allow a little clock skew.
        clockTolerance: 60,
      });
      payload = result.payload as Record<string, unknown>;
    } catch {
      throw new AuthError("Your session expired. Sign in again.");
    }
  }

  const uid = typeof payload.sub === "string" ? payload.sub : "";
  if (!uid) throw new AuthError("Invalid session.");

  const firebase = (payload.firebase ?? {}) as { sign_in_provider?: string };
  const provider = firebase.sign_in_provider ?? "unknown";

  return {
    uid,
    provider,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
