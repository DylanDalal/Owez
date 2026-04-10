/** Brand accent color used across web, mobile, and marketing surfaces */
export const OWEZ_ACCENT = '#2EF2A3';

/** Ports used by the local Firebase emulators — kept in one place so web,
 *  mobile, functions, and tests all connect to the same set. Firestore uses
 *  8181 because mitmproxy occupies 8080 on the dev machine. */
export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8181,
  functions: 5001,
  hosting: 5000,
  ui: 4000,
} as const;

export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  receipts: 'receipts',
  claims: 'claims',
} as const;
