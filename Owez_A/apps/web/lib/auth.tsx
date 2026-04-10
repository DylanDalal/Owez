'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, googleProvider, appleProvider, getDb } from './firebase';
import type { UserProfile } from '@owez/shared';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  needsOnboarding: boolean;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadProfile(u.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function loadProfile(uid: string) {
    try {
      const snap = await getDoc(doc(getDb(), 'users', uid));
      setProfile((snap.exists() ? (snap.data() as UserProfile) : null));
    } catch {
      setProfile(null);
    }
  }

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    needsOnboarding: !!user && !profile,
    async signInGoogle() {
      await signInWithPopup(getFirebaseAuth(), googleProvider());
    },
    async signInApple() {
      await signInWithPopup(getFirebaseAuth(), appleProvider());
    },
    async signOut() {
      await fbSignOut(getFirebaseAuth());
    },
    async refreshProfile() {
      if (user) await loadProfile(user.uid);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
