import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  connectAuthEmulator,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { FIRESTORE_EMULATOR_PORT } from "@owez/shared";

/**
 * Client-side Firebase init. Env vars are all NEXT_PUBLIC_* because they run
 * in the browser — these are not secrets, they're public identifiers that
 * Firebase security rules and App Check are meant to protect.
 *
 * No Storage here: Firebase Storage requires the paid Blaze plan, so Owez
 * sticks to Auth + Firestore only and skips saving receipt images.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebase() {
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);

    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
      connectAuthEmulator(_auth, "http://localhost:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(_db, "localhost", FIRESTORE_EMULATOR_PORT);
    }
  }
  return { app: _app!, auth: _auth!, db: _db! };
}

/** Fresh GoogleAuthProvider per sign-in — Firebase prefers new instances. */
export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

/** Apple sign-in via OAuthProvider. Requires Apple provider enabled in the
 *  Firebase Console (Authentication → Sign-in method → Apple) and an Apple
 *  developer setup (Services ID + Sign in with Apple capability). */
export function appleProvider(): OAuthProvider {
  const p = new OAuthProvider("apple.com");
  p.addScope("email");
  p.addScope("name");
  return p;
}
