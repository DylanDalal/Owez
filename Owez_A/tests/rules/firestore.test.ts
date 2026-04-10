/**
 * Emulator-backed Firestore rules test. Covers the invariants we rely on:
 *  - Only the authenticated owner can create/update their user doc
 *  - Receipts are world-readable but only owner-writable
 *  - Guests (unauthenticated) can create claims, but can't touch receipts
 *  - Claim schema validation rejects over-long names / weird types
 *
 * REQUIRES the Firestore emulator to be running (the test harness connects
 * via `@firebase/rules-unit-testing`).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  doc,
  setDoc,
  addDoc,
  collection,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { EMULATOR_PORTS } from '@owez/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

let env: RulesTestEnvironment;

beforeAll(async () => {
  const rules = readFileSync(
    resolve(__dirname, '../../firestore.rules'),
    'utf-8',
  );
  env = await initializeTestEnvironment({
    projectId: 'owez-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: EMULATOR_PORTS.firestore,
      rules,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('users collection', () => {
  it('lets a user create their own profile', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice'), {
        displayName: 'Alice',
        email: 'a@example.com',
        photoURL: '',
        venmo: '',
        cashapp: '',
        phone: '',
        createdAt: Date.now(),
      }),
    );
  });

  it('refuses to let bob write to alice', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(bob, 'users/alice'), {
        displayName: 'Not Alice',
        email: '',
        photoURL: '',
        venmo: '',
        cashapp: '',
        phone: '',
        createdAt: Date.now(),
      }),
    );
  });
});

describe('receipts', () => {
  async function seedReceipt(ownerUid: string) {
    // Use the privileged test context to bypass rules and seed setup data
    let receiptId = '';
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'receipts'), {
        ownerId: ownerUid,
        items: [{ name: 'Fries', price: 10, quantity: 1 }],
        title: 'Lunch',
        payment: { venmo: '@alice', cashapp: '', phone: '' },
        createdAt: Date.now(),
      });
      receiptId = ref.id;
    });
    return receiptId;
  }

  it('only lets the owner update a receipt', async () => {
    const rid = await seedReceipt('alice');
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(
      updateDoc(doc(bob, `receipts/${rid}`), { title: 'Hacked' }),
    );
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(alice, `receipts/${rid}`), { title: 'Updated' }),
    );
  });

  it('allows public reads of a receipt (guests need them to claim)', async () => {
    const rid = await seedReceipt('alice');
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guest, `receipts/${rid}`)));
  });
});

describe('claims', () => {
  async function seedReceipt(ownerUid: string) {
    let receiptId = '';
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'receipts'), {
        ownerId: ownerUid,
        items: [{ name: 'Fries', price: 10, quantity: 1 }],
        title: 'Lunch',
        payment: {},
        createdAt: Date.now(),
      });
      receiptId = ref.id;
    });
    return receiptId;
  }

  it('lets unauthenticated guests create a well-formed claim', async () => {
    const rid = await seedReceipt('alice');
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      addDoc(collection(guest, `receipts/${rid}/claims`), {
        itemIndex: 0,
        guestName: 'Jane',
        initials: 'J',
        portions: 1,
        splitInto: 1,
        unitIndex: 0,
        sessionId: 's1',
        createdAt: Date.now(),
      }),
    );
  });

  it('rejects claims with an empty or oversized guestName', async () => {
    const rid = await seedReceipt('alice');
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(guest, `receipts/${rid}/claims`), {
        itemIndex: 0,
        guestName: '',
        initials: 'J',
        portions: 1,
        splitInto: 1,
        unitIndex: 0,
        sessionId: 's1',
        createdAt: Date.now(),
      }),
    );
    await assertFails(
      addDoc(collection(guest, `receipts/${rid}/claims`), {
        itemIndex: 0,
        guestName: 'x'.repeat(200),
        initials: 'X',
        portions: 1,
        splitInto: 1,
        unitIndex: 0,
        sessionId: 's1',
        createdAt: Date.now(),
      }),
    );
  });

  it('rejects claims with non-integer portions', async () => {
    const rid = await seedReceipt('alice');
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(guest, `receipts/${rid}/claims`), {
        itemIndex: 0,
        guestName: 'Jane',
        initials: 'J',
        portions: 1.5,
        splitInto: 1,
        unitIndex: 0,
        sessionId: 's1',
        createdAt: Date.now(),
      }),
    );
  });
});
