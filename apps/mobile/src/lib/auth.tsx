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
  onAuthStateChanged,
  signInAnonymously,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebase } from "./firebase";

/**
 * Mobile auth is simpler than web for the MVP: everybody signs in
 * anonymously. Creators' bills are tied to an anon uid that persists via
 * AsyncStorage, so the same phone keeps the same identity until the app is
 * uninstalled.
 *
 * Real Google sign-in will come later via expo-auth-session — it's a lot of
 * native config we don't want to pay for until the core loop is proven.
 */

interface AuthState {
  user: User | null;
  loading: boolean;
  ensureSignedIn: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Auto-create an anonymous session on first boot — every screen in the
      // app assumes we have a uid to write claims / bills against.
      if (!u) {
        void signInAnonymously(auth).catch(() => {
          // Network failure — leave user null, screens will show a retry state.
        });
      }
    });
    return unsub;
  }, []);

  const ensureSignedIn = useCallback(async () => {
    const { auth } = getFirebase();
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = getFirebase();
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, ensureSignedIn, signOut }),
    [user, loading, ensureSignedIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
