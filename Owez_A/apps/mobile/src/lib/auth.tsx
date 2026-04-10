import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthInstance, getDb } from './firebase';
import type { UserProfile } from '@owez/shared';

WebBrowser.maybeCompleteAuthSession();

function googleClientIdForPlatform(): string {
  return (
    Platform.select({
      ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    }) ?? ''
  );
}

function isGoogleSignInConfigured(): boolean {
  return googleClientIdForPlatform().length > 0;
}

/** Email/password dev user for Auth emulator — no Google/Apple setup required. */
const DEV_BYPASS_EMAIL = 'dev@owez.local';
const DEV_BYPASS_PASSWORD = 'owez-local-dev';

function isDevAuthBypassAvailable(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_USE_EMULATORS === 'true'
  );
}

interface AuthValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** False until the matching `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` is set for this platform. */
  googleSignInAvailable: boolean;
  /** `__DEV__` + `EXPO_PUBLIC_USE_EMULATORS=true`: sign in via Auth emulator (email/password). */
  devAuthBypassAvailable: boolean;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signInDevBypass: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // expo-auth-session throws if the platform client id is `undefined`; use `''` so
  // dev builds boot without Google Cloud setup. `signInGoogle` checks configuration.
  const [, googleResponse, promptGoogle] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  });

  useEffect(() => {
    return onAuthStateChanged(getAuthInstance(), async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(getDb(), 'users', u.uid));
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.authentication?.idToken;
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        signInWithCredential(getAuthInstance(), credential).catch(() => undefined);
      }
    }
  }, [googleResponse]);

  const value: AuthValue = {
    user,
    profile,
    loading,
    googleSignInAvailable: isGoogleSignInConfigured(),
    devAuthBypassAvailable: isDevAuthBypassAvailable(),
    async signInGoogle() {
      if (!isGoogleSignInConfigured()) {
        const key =
          Platform.OS === 'ios'
            ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
            : Platform.OS === 'android'
              ? 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'
              : 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
        throw new Error(
          `Google sign-in is not configured. Add ${key} to apps/mobile/.env (OAuth client ID from Google Cloud Console).`
        );
      }
      await promptGoogle();
    },
    async signInApple() {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No Apple identity token');
      const provider = new OAuthProvider('apple.com');
      const oauth = provider.credential({
        idToken: credential.identityToken,
      });
      await signInWithCredential(getAuthInstance(), oauth);
    },
    async signInDevBypass() {
      if (!isDevAuthBypassAvailable()) {
        throw new Error('Dev bypass is only available in __DEV__ with EXPO_PUBLIC_USE_EMULATORS=true.');
      }
      const auth = getAuthInstance();
      try {
        await createUserWithEmailAndPassword(
          auth,
          DEV_BYPASS_EMAIL,
          DEV_BYPASS_PASSWORD
        );
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === 'auth/email-already-in-use') {
          await signInWithEmailAndPassword(
            auth,
            DEV_BYPASS_EMAIL,
            DEV_BYPASS_PASSWORD
          );
          return;
        }
        throw e;
      }
    },
    async signOut() {
      await fbSignOut(getAuthInstance());
    },
    async refreshProfile() {
      if (!user) return;
      const snap = await getDoc(doc(getDb(), 'users', user.uid));
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
