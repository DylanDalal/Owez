"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import type { UserProfile } from "@owez/shared";
import { appleProvider, getFirebase, googleProvider } from "./firebase";

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Central auth context. Two identities exist in Owez:
 *   - "creator"  — signed in with Google or Apple, owns bills they create.
 *   - "friend"   — signed in anonymously, owns one or more claim docs on a bill.
 *
 * Both use Firebase Auth so Firestore security rules can gate writes on
 * `request.auth.uid`. The creator's profile doc lives at `users/{uid}` and
 * is loaded here so the Header can show their avatar without re-fetching on
 * every page.
 */

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInAnon: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** How long to wait for Firebase auth to initialize before showing the user
 *  a retry prompt instead of an indefinite spinner. */
const AUTH_INIT_TIMEOUT_MS = 12_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track auth state. On mount, also pick up any pending redirect result
  // (from signInWithRedirect used on mobile).
  //
  // If Firebase fails to initialize, errors, or never calls us back (e.g. a
  // flaky connection or a blocked third-party-storage context), we surface a
  // retry prompt rather than leaving the whole app blank forever.
  useEffect(() => {
    let settled = false;
    const finish = (err?: string) => {
      settled = true;
      clearTimeout(timer);
      if (err) setError(err);
      setLoading(false);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        setError("Couldn't reach the server. Check your connection and try again.");
        setLoading(false);
      }
    }, AUTH_INIT_TIMEOUT_MS);

    let unsub: (() => void) | undefined;
    try {
      const { auth } = getFirebase();
      getRedirectResult(auth).catch(() => {});
      unsub = onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          finish();
        },
        () => finish("Something went wrong signing you in. Please try again."),
      );
    } catch {
      finish("Something went wrong loading the app. Please try again.");
    }

    return () => {
      clearTimeout(timer);
      unsub?.();
    };
  }, []);

  // Live-subscribe to the user's profile doc whenever a non-anonymous user
  // is signed in. Anonymous friends don't have profile docs.
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setProfile(null);
      return;
    }
    const { db } = getFirebase();
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      () => setProfile(null),
    );
    return unsub;
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    const { auth } = getFirebase();
    const provider = googleProvider();
    if (isMobile()) {
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    const { auth } = getFirebase();
    const provider = appleProvider();
    if (isMobile()) {
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  }, []);

  const signInAnon = useCallback(async () => {
    const { auth } = getFirebase();
    // If we already have a user (anon or real), reuse them — we don't want
    // friends to churn through anonymous uids every time they open the page.
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = getFirebase();
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      isAnonymous: !!user?.isAnonymous,
      signInWithGoogle,
      signInWithApple,
      signInAnon,
      signOut,
    }),
    [
      user,
      profile,
      loading,
      signInWithGoogle,
      signInWithApple,
      signInAnon,
      signOut,
    ],
  );

  // We intentionally do NOT block the whole app while auth initializes —
  // doing so blanked even auth-free pages (landing, privacy) behind the
  // Firebase SDK download. Children render immediately and read `loading`
  // from context; pages that require a resolved account gate themselves
  // (see SignInGate). A hard init failure still shows a retry screen.
  if (error) return <AuthErrorScreen message={error} />;

  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Shown when auth init fails or times out, so the app never hangs blank. */
function AuthErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-[color:var(--muted)]">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="btn btn-primary"
      >
        Try again
      </button>
    </main>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Load the user profile once — mostly for pages that need it on mount. */
export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}
