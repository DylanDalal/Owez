import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error — getReactNativePersistence isn't in the main type defs,
  // but is exported at runtime from firebase/auth for RN targets.
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Firebase init for Expo / React Native.
 *
 * Two gotchas compared to the web init:
 *   1. Auth persistence has to be wired up explicitly via AsyncStorage,
 *      otherwise every app launch signs the user back out.
 *   2. initializeAuth() throws if called twice, so we guard with getApps()
 *      and a memoized auth instance.
 *
 * No Storage — same Spark-plan constraint as the web app.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebase() {
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(firebaseConfig);

    try {
      _auth = initializeAuth(_app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // initializeAuth throws if called twice (e.g. during Fast Refresh).
      // In that case the already-initialized instance is safe to reuse.
      _auth = getAuth(_app);
    }

    _db = getFirestore(_app);
  }
  return { app: _app!, auth: _auth!, db: _db! };
}
