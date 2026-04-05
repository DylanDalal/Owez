# Owez — Bill Splitting App: Build Plan

A bill-splitting app for iPhone + web. Take a photo of a receipt → parse line items → share a link → friends claim what they ate → they pay you via Venmo/Cashapp/Zelle deep links.

## Stack — Firebase end-to-end

- **Frontend (iOS + web):** Expo (React Native + React Native Web), TypeScript
- **Auth:** Firebase Auth — Apple/Google/email for owners, anonymous auth for friends so claims are tied to a real UID without a signup screen
- **DB:** Cloud Firestore — real-time listeners replace polling on the share page
- **Image storage:** Firebase Storage — receipt images
- **Backend logic:** Cloud Functions (2nd gen) — one callable function for the Mindee parse so the API key never ships to the client
- **Hosting:** Firebase Hosting — Expo web build deploys here
- **Production protection:** Firebase App Check — prevents anyone from hitting Firestore/Functions from outside your app
- **Receipt OCR:** Mindee (validated in Phase 0)

There is no separate backend server, no Postgres, no S3, no Fly.io. Just Firebase + one Cloud Function.

## Monorepo layout

```
owez/
├── apps/
│   └── mobile/             # Expo app (iOS + web target)
├── functions/              # Cloud Functions (just the Mindee callable)
├── packages/
│   └── shared/             # Shared TS types (Bill, LineItem, Claim, etc.)
├── firestore.rules         # Firestore security rules
├── storage.rules           # Firebase Storage security rules
├── firebase.json           # Firebase project config
├── package.json            # workspaces
└── parse.ts                # Phase 0 standalone script (delete after Phase 1)
```

Use **pnpm workspaces**. The `shared` package holds the TypeScript types for `Bill`, `LineItem`, `Claim`, `User` — both the Expo app and the Cloud Function import from it, so the data shape never drifts.

## Data model (Firestore)

Firestore is document-oriented, not relational. The schema below uses subcollections to keep related data close and queries cheap.

```
users/{uid}
  displayName:    string                    # cached from Firebase Auth, editable in-app
  email:          string                    # cached for support/search
  paymentMethods: { venmo, cashapp, zelle }  # lives on the user — carries across all their bills
  createdAt:      timestamp

bills/{shareSlug}                            # doc ID = the share slug — one read by URL, no index needed
  ownerId:           string                  # owner's firebase uid
  ownerPublic:       { displayName, paymentMethods }   # denormalized so friends can read without
                                                       # being able to see the owner's private user doc
  imageStoragePath:  string                  # gs://bucket/b/{slug}.jpg
  imageUrl:          string                  # signed download URL
  status:            'parsing' | 'ready' | 'error'   # so the share page can show a spinner
  subtotal, tax, tip, total: number
  currency:          string                  # default 'USD'
  createdAt:         timestamp
  expiresAt:         timestamp               # auto-cleanup after 30 days

  items/{itemId}                             # subcollection
    name:     string
    price:    number
    qty:      number                         # default 1
    position: number                         # preserves receipt order

  claims/{claimId}                           # subcollection
    lineItemId:  string                      # which item this claim is on
    claimerName: string                      # display name shown to others
    claimerUid:  string                      # anonymous Firebase uid — locks unclaim to creator
    share:       number                      # 1.0 = full, 0.5 = split with someone
    createdAt:   timestamp
```

Key decisions:
- **Doc ID is the share slug.** Looking up a bill by URL is one Firestore read with no query — `getDoc(doc(db, 'bills', slug))`. The slug is a 6-char base32 string (~1B possibilities, unguessable enough).
- **`ownerPublic` is denormalized.** Friends need to see the owner's display name and payment handles, but they can't read the private `users/{uid}` doc. We snapshot the public bits onto each bill at creation. If the owner updates their handles later, we can re-fan-out via a Cloud Function (or just accept that old bills show old handles — usually fine).
- **`claimerUid` uses anonymous auth.** When a friend opens the share page, the app silently signs them in with `signInAnonymously()` — no UI shown. This gives every claim a real `claimerUid`, which we use to enforce "you can only delete your own claims" in security rules. Way cleaner than session cookies.
- **No separate `claims` collection.** Subcollection on the bill, so reading a bill's claims is one query scoped to that bill.

## Firestore security rules

This is where the access control lives. With these rules in place, the Expo app talks to Firestore directly — no API server needed.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write only their own profile
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    match /bills/{slug} {
      allow read: if true;  // public — friends visit via share link

      // Only signed-in (non-anonymous) users can create bills
      allow create: if request.auth != null
                    && request.auth.token.firebase.sign_in_provider != 'anonymous'
                    && request.resource.data.ownerId == request.auth.uid;

      // Only the owner can edit/delete their bill
      allow update, delete: if request.auth != null
                            && resource.data.ownerId == request.auth.uid;

      match /items/{itemId} {
        allow read: if true;
        allow write: if request.auth != null
                     && get(/databases/$(database)/documents/bills/$(slug)).data.ownerId
                        == request.auth.uid;
      }

      match /claims/{claimId} {
        allow read: if true;
        // Anyone signed in (incl. anonymous friends) can claim — but the
        // claimerUid must match their own uid, so they can't impersonate.
        allow create: if request.auth != null
                      && request.resource.data.claimerUid == request.auth.uid;
        // Only the original claimer can delete their claim
        allow delete: if request.auth != null
                      && resource.data.claimerUid == request.auth.uid;
      }
    }
  }
}
```

Storage rules:

```
service firebase.storage {
  match /b/{slug}/{file} {
    allow read: if true;
    allow write: if request.auth != null
                 && request.auth.token.firebase.sign_in_provider != 'anonymous';
  }
}
```

## The one Cloud Function: `parseBill`

Mindee's API key cannot ship to the client. So we have exactly one server-side function.

```ts
// functions/src/parseBill.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { Client, product } from 'mindee'

const MINDEE_API_KEY = defineSecret('MINDEE_API_KEY')

export const parseBill = onCall(
  { secrets: [MINDEE_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'sign in required')
    const { slug } = request.data as { slug: string }

    const db = getFirestore()
    const billRef = db.doc(`bills/${slug}`)
    const bill = await billRef.get()
    if (!bill.exists) throw new HttpsError('not-found', 'bill not found')
    if (bill.data()!.ownerId !== request.auth.uid)
      throw new HttpsError('permission-denied', 'not your bill')

    // Download image from Storage to a temp buffer
    const [buf] = await getStorage()
      .bucket()
      .file(bill.data()!.imageStoragePath)
      .download()

    // Call Mindee
    const client = new Client({ apiKey: MINDEE_API_KEY.value() })
    const inputSource = client.docFromBuffer(buf, 'receipt.jpg')
    const response = await client.parse(product.ReceiptV5, inputSource)
    const p = response.document!.inference.prediction as any

    // Write items + totals to Firestore in a batch
    const batch = db.batch()
    const lineItems = p.lineItems ?? []
    lineItems.forEach((item: any, i: number) => {
      const itemRef = billRef.collection('items').doc()
      batch.set(itemRef, {
        name: item.description ?? 'Item',
        price: item.totalAmount ?? 0,
        qty: item.quantity ?? 1,
        position: i,
      })
    })
    batch.update(billRef, {
      subtotal: p.totalNet?.value ?? 0,
      tax:      p.totalTax?.value ?? 0,
      tip:      p.tip?.value ?? 0,
      total:    p.totalAmount?.value ?? 0,
      currency: p.locale?.currency ?? 'USD',
      status:   'ready',
      parsedAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()
  },
)
```

That's the entire backend. Set the secret once with `firebase functions:secrets:set MINDEE_API_KEY`.

## Key user flows

### Flow 0: Owner sign-up / sign-in
1. First launch → onboarding → **Sign in with Apple** (primary), **Continue with Google**, or **Email + password**
2. Firebase Auth handles the handshake and returns an ID token
3. App writes `users/{uid}` if it doesn't exist (display name + email from Firebase, empty `paymentMethods`)
4. If `paymentMethods` is empty, prompt to enter Venmo / Cashapp / Zelle handles (saved once, syncs across devices forever)
5. Land on home screen ("New Bill" + "My Bills")

Apple Sign In is required by the App Store any time you offer another social login. Email/password is the fallback.

### Flow 1: Owner creates a bill
1. Tap "New Bill" → take photo (or pick from library)
2. App generates a `shareSlug`, creates `bills/{slug}` with `status: 'parsing'`, uploads the image to `b/{slug}.jpg` in Firebase Storage
3. App calls `parseBill({ slug })` Cloud Function
4. Function downloads the image, calls Mindee, writes items + totals back to Firestore, sets `status: 'ready'`
5. App is already listening to `bills/{slug}` via `onSnapshot` → as soon as the function writes, items appear in the UI
6. Owner edits if needed (fix typos, merge items, add tip)
7. Tap share → native share sheet with `owez.app/b/{slug}`

### Flow 2: Friend claims items
1. Friend opens link → web page (no app install, no signup)
2. Page calls `signInAnonymously()` in the background — instant, no UI
3. Page subscribes to `bills/{slug}` and `bills/{slug}/items` and `bills/{slug}/claims` via `onSnapshot` — real-time updates for free
4. Friend types their name (saved in localStorage so they don't retype on revisit)
5. Friend taps items → writes a claim doc (`claimerUid` = their anonymous uid). Everyone listening sees it instantly.
6. Page shows "You owe Dylan $14.32" with three buttons:
   - **Venmo** → `venmo://paycharge?txn=pay&recipients=dylan&amount=14.32&note=Dinner`
   - **Cash App** → `https://cash.app/$dylan/14.32`
   - **Zelle** → modal with phone/email + copy button
7. Optionally tap "Mark as paid" → sets a flag on the claim so the owner can see who's settled

### Flow 3: Splitting an item between two people
- Tap an already-claimed item → "Split with [name]" → both parties' shares become 0.5 (or N-way split)

## Tax & tip math

Tax and tip are **prorated by each person's subtotal share**, not split evenly:

```
person_subtotal = sum(claimed_item_prices * share)
person_tax      = bill.tax * (person_subtotal / bill.subtotal)
person_tip      = bill.tip * (person_subtotal / bill.subtotal)
person_total    = person_subtotal + person_tax + person_tip
```

Edge case: if line items don't sum to the receipt subtotal (OCR errors, "service charge" line items, etc.), the share page shows a banner asking the owner to fix it. The Phase 0 script already prints this sanity check so you can see how often it happens in practice.

## Payment deep links — exact formats

```ts
// Venmo (works on iOS/Android — falls back to web URL on desktop)
`venmo://paycharge?txn=pay&recipients=${username}&amount=${amount}&note=${encodeURIComponent(note)}`
// Web fallback:
`https://venmo.com/${username}?txn=pay&amount=${amount}&note=...`

// Cash App (web URL, works everywhere)
`https://cash.app/$${cashtag}/${amount}`

// Zelle — no deep link exists. Display the phone/email + a "Copy" button.
// Some banks have proprietary zelle:// schemes but they're not standardized.
```

No money flows through Owez at any point — these are just deep links into the user's existing payment apps. This keeps you out of money-transmitter compliance hell entirely.

## Phases (build in this order)

**Phase 0 — Validate the hardest piece** ✅ DONE
- Standalone Mindee parsing script at `parse.ts`. Run on real receipts:
  ```
  cp .env.example .env  # then paste your Mindee key
  npm run parse -- ./receipt.jpg
  ```
- Try it on 5–10 different receipts (chain, mom-and-pop, faded, crumpled). Look at the sanity-check output: do line items sum to the subtotal? If accuracy is bad on a category you care about, swap to Veryfi before going further.

**Phase 1 — Firebase project + first end-to-end create**
- Create the Firebase project, enable Auth (Apple/Google/email + Anonymous), Firestore, Storage, Functions, App Check
- Initialize the monorepo: `apps/mobile`, `functions/`, `packages/shared`
- Drop in `firestore.rules` and `storage.rules` from this doc
- Write the `parseBill` Cloud Function (basically the Phase 0 script, refactored)
- Set the Mindee API key as a Functions secret: `firebase functions:secrets:set MINDEE_API_KEY`
- From a Node test script: sign in with Firebase Auth → upload an image to Storage → create a bill doc → call `parseBill` → verify items appear in Firestore

**Phase 2 — Web share page**
- Expo web target only (build to static, deploy to Firebase Hosting)
- `/b/:slug` route subscribes to the bill + items + claims via `onSnapshot`
- Anonymous sign-in on page load
- Claim/unclaim UI with payment deep link buttons
- Test end-to-end with a real friend

**Phase 3 — iOS app**
- Same Expo project, now targeting iOS
- Firebase Auth integration: `@react-native-firebase/auth` (recommended for native sign-in flows like Apple)
- Sign-in screen: Apple (primary), Google, email/password
- Home screen: "New Bill" + "My Bills" (`onSnapshot` on `bills` where `ownerId == currentUser.uid`)
- Camera screen with `expo-camera` or `expo-image-picker`
- Profile screen for editing display name + payment handles
- Native share sheet for the bill link
- Note: Apple Sign In requires a dev build (`expo prebuild` + EAS), not Expo Go

**Phase 4 — Polish & launch prep**
- Owner edit UI (fix OCR mistakes, add tip, split items)
- "Mark as paid" indicators
- Account deletion (`DELETE /me` flow that cascades — required by App Store for any signed-in app)
- Enable Firebase App Check in production (prevents API abuse from outside your app)
- Privacy policy + App Store screenshots + app icon
- TestFlight build via EAS

**Phase 5 — Optional next**
- Push notifications via Firebase Cloud Messaging (when someone claims/pays your bill)
- Receipt history search
- Multi-currency
- Android build (one EAS command since we're on Expo)

## Things I'm flagging for you to decide later

1. **Sign-in methods.** Apple Sign In is non-negotiable (App Store rule when you offer any social). Decide whether to also offer Google and/or email/password. My recommendation: Apple + Google only — passwordless is less support burden.
2. **Image privacy.** Receipts sometimes have your name or card last-4. Decide whether to show the photo to friends or only the parsed items. Probably show it (helps people remember what they ordered) but make it optional per-bill.
3. **Bill expiry.** Default is 30 days. Decide what happens after — soft delete? Email warning? Use a scheduled Cloud Function to clean up expired bills + their Storage images.
4. **Account deletion cascade.** When a user deletes their account, do their old bills get deleted too, or do they stay live so friends can still pay? My take: stay live for 30 days then auto-delete.
5. **Domain.** `owez.app` is just an example — grab the real one early so deep links work and you can set up Firebase Hosting + deep linking config.
6. **Cost model.** Firebase Spark (free) plan covers an enormous amount: 50k MAU auth, 1GB Firestore, 5GB Storage, 125k function invocations/mo. Mindee free tier is 250 pages/mo. Realistic monthly cost until you're meaningfully popular: **$0**. First service to charge will probably be Mindee at scale (~$0.10/page).

## Status

- **Phase 0** ✅ Done. Standalone Mindee v2 parser at `phase0/parse.ts`. Validated on real receipts.
- **Phase 1** ✅ Code written, ready to run against the Firebase Local Emulator Suite.

### Phase 1 layout (current)

```
owez/
├── BUILD_PLAN.md             ← this file
├── SETUP.md                  ← how to actually run things
├── firebase.json             ← Firebase project + emulator config
├── .firebaserc               ← project alias (demo-owez for emulator)
├── firestore.rules           ← security rules
├── firestore.indexes.json
├── storage.rules             ← Storage security rules
├── functions/                ← Cloud Functions
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          ← exports parseBill
│   │   ├── parseBill.ts      ← the function (Mindee v2 + Firestore batch write)
│   │   └── types.ts          ← Bill / LineItem / Claim / etc.
│   └── scripts/
│       └── verify-phase1.ts  ← end-to-end emulator test
└── phase0/                   ← archived Phase 0 (still runnable)
    ├── parse.ts
    └── ...
```

### Running Phase 1

See **SETUP.md** for the full sequence. TL;DR:

```bash
# one-time
npm install -g firebase-tools
echo "MINDEE_API_KEY=..." > functions/.secret.local
echo "MINDEE_MODEL_ID=..." >> functions/.secret.local

# every time
firebase emulators:start                              # terminal 1
cd functions && npm run verify -- ../phase0/test.jpg  # terminal 2
```

You'll see auth → upload → Firestore write → Mindee call → parsed items appear in Firestore. The Emulator UI at http://localhost:4000 lets you browse all of it visually.

### What Phase 1 deliberately does NOT include (yet)

- No Apple/Google sign-in setup — emulator uses email/password for the test owner. Real social auth comes in Phase 3 with the actual mobile app.
- No `apps/mobile` Expo project — that's Phase 3.
- No web share page — that's Phase 2.
- No real Firebase project — just the emulator. Phase 2 will deploy the function + hosting to a real project.
- No App Check — Phase 4.

When the verify script prints `Phase 1 verification complete.` with parsed items, Phase 1 is done and we can move to Phase 2 (the web share page).
