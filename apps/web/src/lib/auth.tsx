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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Track auth state. On mount, also pick up any pending redirect result
  // (from signInWithRedirect used on mobile).
  useEffect(() => {
    const { auth } = getFirebase();
    getRedirectResult(auth).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
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

  if (loading) return null;

  return <AuthContext value={value}>{children}</AuthContext>;
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
