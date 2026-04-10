'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  enableIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore';
import { EMULATOR_PORTS } from '@owez/shared';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _authEmulatorConnected = false;
let _firestoreEmulatorConnected = false;

function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  wireEmulators();
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  wireEmulators();
  // Enable offline persistence — fire-and-forget. Safari private mode will
  // throw; we swallow so the app still loads.
  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(_db).catch(() => {
      // multi-tab or unsupported — offline mode degraded but app still works
    });
  }
  return _db;
}

function wireEmulators() {
  if (typeof window === 'undefined') return;
  const useEmulators =
    process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' ||
    (typeof location !== 'undefined' && location.hostname === 'localhost');
  if (!useEmulators) return;

  // Connect each service once, independently. A single global flag breaks the
  // other service if e.g. getDb() runs before getFirebaseAuth() (Auth would
  // never attach to the emulator → mixed prod/emulator state and token errors).
  try {
    if (_auth && !_authEmulatorConnected) {
      connectAuthEmulator(_auth, `http://localhost:${EMULATOR_PORTS.auth}`, {
        disableWarnings: true,
      });
      _authEmulatorConnected = true;
    }
  } catch {
    _authEmulatorConnected = true;
  }
  try {
    if (_db && !_firestoreEmulatorConnected) {
      connectFirestoreEmulator(_db, 'localhost', EMULATOR_PORTS.firestore);
      _firestoreEmulatorConnected = true;
    }
  } catch {
    _firestoreEmulatorConnected = true;
  }
}

export const googleProvider = () => new GoogleAuthProvider();
export const appleProvider = () => {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  return p;
};
