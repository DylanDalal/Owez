/**
 * verify-phase1.ts — end-to-end test against the Firebase Local Emulator Suite.
 *
 * Prerequisites:
 *   1. Mindee secrets in functions/.secret.local:
 *        MINDEE_API_KEY=...
 *        MINDEE_MODEL_ID=...
 *   2. Emulators running in another terminal:
 *        firebase emulators:start
 *
 * Run from repo root:
 *   cd functions && npm run verify -- /path/to/receipt.jpg
 *
 * What it does:
 *   1. Connects to the Auth/Firestore/Storage/Functions emulators
 *   2. Creates (or signs in as) a test owner via email/password
 *   3. Generates a share slug, uploads the receipt image to Storage
 *   4. Creates the bills/{slug} doc with status: 'parsing'
 *   5. Calls the parseBill callable function
 *   6. Reads back the bill + items and prints them
 */

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore'
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  connectStorageEmulator,
} from 'firebase/storage'
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from 'firebase/functions'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const PROJECT_ID = 'demo-owez'
const TEST_EMAIL = 'test@owez.local'
const TEST_PASSWORD = 'testpassword123'

async function main() {
  const imagePath = process.argv[2]
  if (!imagePath) {
    console.error('Usage: npm run verify -- /path/to/receipt.jpg')
    process.exit(1)
  }
  const absPath = resolve(imagePath)
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`)
    process.exit(1)
  }

  // ── Initialize the client SDK pointed at the emulators
  const app = initializeApp({
    projectId: PROJECT_ID,
    apiKey: 'demo-key', // ignored by emulator but required by SDK
    storageBucket: `${PROJECT_ID}.appspot.com`, // emulator default; real project bucket set in Phase 2
  })

  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)
  const fns = getFunctions(app)

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(fns, '127.0.0.1', 5001)

  // ── Sign in as a test owner (create on first run)
  console.log('[1/6] Signing in as test owner...')
  let user
  try {
    user = (await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD)).user
  } catch {
    user = (await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD)).user
  }
  console.log(`      uid = ${user.uid}`)

  // ── Make sure the user doc exists (in real app, the mobile client does this)
  console.log('[2/6] Ensuring users/{uid} doc...')
  await setDoc(
    doc(db, 'users', user.uid),
    {
      displayName: 'Test Owner',
      email: TEST_EMAIL,
      paymentMethods: { venmo: 'testowner', cashapp: 'testowner', zelle: '555-0100' },
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )

  // ── Generate a slug and upload the image
  const slug = randomSlug()
  const storagePath = `b/${slug}/${basename(absPath)}`
  console.log(`[3/6] Uploading image to ${storagePath}...`)
  const buf = readFileSync(absPath)
  await uploadBytes(ref(storage, storagePath), buf, { contentType: 'image/jpeg' })

  // Get a download URL (in the emulator this is a local URL)
  const imageUrl = await getDownloadURL(ref(storage, storagePath))

  // ── Create the bill doc with status: 'parsing'
  console.log(`[4/6] Creating bills/${slug} (status: parsing)...`)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await setDoc(doc(db, 'bills', slug), {
    ownerId: user.uid,
    ownerPublic: {
      displayName: 'Test Owner',
      paymentMethods: { venmo: 'testowner', cashapp: 'testowner', zelle: '555-0100' },
    },
    imageStoragePath: storagePath,
    imageUrl,
    status: 'parsing',
    subtotal: 0,
    tax: 0,
    tip: 0,
    total: 0,
    currency: 'USD',
    createdAt: serverTimestamp(),
    expiresAt,
  })

  // ── Call the parseBill function
  console.log('[5/6] Calling parseBill...')
  const parseBill = httpsCallable<{ slug: string }, any>(fns, 'parseBill')
  const start = Date.now()
  const result = await parseBill({ slug })
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`      done in ${elapsed}s`)
  console.log(`      result:`, result.data)

  // ── Read everything back
  console.log(`[6/6] Reading bills/${slug} + items...`)
  const billSnap = await getDoc(doc(db, 'bills', slug))
  const itemsSnap = await getDocs(collection(db, `bills/${slug}/items`))
  const bill = billSnap.data()

  console.log('\n──────── Bill ────────')
  console.log(`status:    ${bill?.status}`)
  console.log(`subtotal:  $${(bill?.subtotal ?? 0).toFixed(2)}`)
  console.log(`tax:       $${(bill?.tax ?? 0).toFixed(2)}`)
  console.log(`tip:       $${(bill?.tip ?? 0).toFixed(2)}`)
  console.log(`total:     $${(bill?.total ?? 0).toFixed(2)}`)
  console.log(`currency:  ${bill?.currency}`)

  console.log(`\n──────── Items (${itemsSnap.size}) ────────`)
  const sortedItems = itemsSnap.docs
    .map((d) => d.data())
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
  for (const item of sortedItems) {
    const i = item as any
    console.log(`  ${i.qty}x  ${String(i.name).padEnd(40)} $${(i.price ?? 0).toFixed(2)}`)
  }

  // Sanity check vs the totals
  const itemSum = sortedItems.reduce((s: number, i: any) => s + (i.price ?? 0), 0)
  const diff = Math.abs(itemSum - (bill?.subtotal ?? 0))
  console.log(
    `\nItems sum: $${itemSum.toFixed(2)}  vs  bill.subtotal: $${(bill?.subtotal ?? 0).toFixed(2)}  →  diff $${diff.toFixed(2)} ${
      diff > 0.5 ? '[MISMATCH]' : '[OK]'
    }`,
  )

  console.log(`\nShare URL (would be): http://localhost/b/${slug}`)
  console.log('Phase 1 verification complete.')
}

function randomSlug(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/o/1/l/i
  let s = ''
  for (let i = 0; i < length; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return s
}

main().catch((err) => {
  console.error('\n[ERROR]', err.code ?? '', err.message ?? err)
  if (err.details) console.error('details:', err.details)
  process.exit(1)
})
