import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
// Metro resolves `firebase/auth` to the React Native build, which exports
// `getReactNativePersistence`. TypeScript resolves to the web build, which
// doesn't declare it, so we pull the symbol dynamically with a cast.
import * as firebaseAuth from 'firebase/auth';
const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence: (storage: unknown) => unknown;
  }
).getReactNativePersistence;
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import Constants from 'expo-constants';
import { EMULATOR_PORTS } from '@owez/shared';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const firebaseConfig = {
  apiKey: extra.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    extra.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:
    extra.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    extra.firebaseStorageBucket ||
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    extra.firebaseMessagingSenderId ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: extra.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getAuthInstance(): Auth {
  if (_auth) return _auth;
  _auth = initializeAuth(getFirebaseApp(), {
    persistence: getReactNativePersistence(AsyncStorage) as any,
  });
  if (process.env.EXPO_PUBLIC_USE_EMULATORS === 'true') {
    connectAuthEmulator(_auth, `http://localhost:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
  }
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  if (process.env.EXPO_PUBLIC_USE_EMULATORS === 'true') {
    connectFirestoreEmulator(_db, 'localhost', EMULATOR_PORTS.firestore);
  }
  return _db;
}
