# Owez

**Who still Owez you?** — a bill-splitting monorepo: Next.js web, Expo iOS app, Firebase backend.

- Snap a receipt (Mindee reads the line items).
- Edit the parse, then get a single share link.
- Friends open the link, type their name, tap the items they bought.
- Each friend sees their own total + deep-links to pay via Venmo / Cash App / Zelle.
- Items lock in real time across devices. Works offline and reconciles on reconnect.

---

## Repository layout

```
packages/shared      @owez/shared — types, utils, constants (single source of truth)
apps/web             Next.js 14 website (landing, auth, dashboard, /r/[id] selection)
apps/mobile          Expo / React Native iOS app
functions            Firebase Cloud Functions (Mindee wrapper — Blaze-only, kept for future)
tests                Vitest: unit + Firestore rules (emulator) + mocked Mindee integration
firestore.rules      Security rules enforcing owner-only writes + claim schema
firestore.indexes.json
firebase.json        Emulator ports (Firestore is on 8181, not 8080)
```

## Prerequisites

- Node 20+ and `pnpm` 10+
- Firebase CLI (`npm i -g firebase-tools`)
- Xcode + iOS Simulator (for the Expo iOS target)

## First-time setup

```bash
pnpm install
pnpm build:shared
```

> `build:shared` compiles `@owez/shared` so the web/mobile/functions TS projects
> resolve against its emitted `.d.ts` files. Re-run this any time you touch a
> type in `packages/shared/src/`.

## Running locally

Open three terminals:

```bash
# 1. Firebase emulators (Firestore + Auth + UI). Port 8181 for Firestore.
pnpm emulators:firestore

# 2. Web app (Next.js on :3000). Connects to emulators automatically when
#    it sees localhost. Uses /api/parse-receipt to call Mindee.
pnpm dev:web

# 3. iOS simulator (Expo). When the receipt is created from the phone, the
#    share link (/r/<id>) works in the iOS simulator's Safari too.
pnpm dev:mobile
# then press `i` to launch the iOS simulator
```

The web app ships with `.env.local` preconfigured against your Firebase
project. The mobile app uses `.env` (`EXPO_PUBLIC_*` prefix).

### Dev flow

1. Visit http://localhost:3000 — lands on the marketing page ("Who Still Owez You?").
2. **Continue with Google/Apple** — the Firebase Auth emulator lets you sign in as
   any email you type. Apple will require a real client config in prod.
3. You land on `/onboarding` to add your Venmo / Cash App / phone.
4. Hit **+ New receipt**, upload any receipt photo, edit the parse, save.
5. You land on `/r/<id>?owner=1` with a **Copy share link** button at the top.
6. Open that link (or send it to the iPhone sim) — it opens the guest view.
7. Type any name at the sticky bottom bar, tap items to claim them.
8. Open the same link in another window to see the claims update live.

## Running the tests

```bash
# Unit tests only (no emulator required)
pnpm test:unit        # normalize + locking utilities

# Firestore rules tests — requires the emulator running
pnpm emulators:firestore &
pnpm test:rules

# Mocked Mindee integration against the Next.js /api route (no emulator)
pnpm test:integration

# Everything
pnpm test
```

Current status: **28 / 28 passing** (19 unit, 7 rules, 2 integration).

## Notable architecture notes

- **Item locking** — claim creation runs inside a Firestore transaction
  (`apps/web/lib/db.ts :: claimItemUnit`) that re-reads the unit's existing
  claims and calls the shared `assertClaimAllowed` guard. Two people racing on
  the same fries can't both claim them.
- **Splitting** — each line-item unit has a `splitInto` denominator set by the
  first claimant; later claimants on the same unit must agree with that
  denominator. Long-press on the item card opens a sheet where the user can
  enter any number (1–50) and take multiple portions.
- **Duplicate items** — quantity > 1 items spawn N "units"; each unit can be
  claimed independently, so two diners can each take a different burger
  without the other's claim interfering.
- **Offline** — `enableIndexedDbPersistence()` is turned on for the web app,
  so guests can claim while offline. The `● live / ⟳ pending` badge at the
  top of the receipt page reflects `snapshot.metadata.hasPendingWrites`.
- **Rules** — `firestore.rules` enforces: owner-only writes on `users/*` and
  `receipts/*`, world-readable receipts so guests can view, schema validation
  on new `claims/*` documents, immutable guest claims (owner-overridable).
- **Mindee on Spark** — the Spark plan cannot make outbound HTTPS from Cloud
  Functions. The `/api/parse-receipt` Next.js route handler does the Mindee
  call server-side instead. The `functions/` package is kept wired up (and
  builds cleanly) so the project can flip to `httpsCallable('parseReceipt')`
  with no client changes once you're on Blaze.
- **Deep linking to the app** — the brief asked for links to open in the iOS
  app if it's installed, falling back to web otherwise. Standard web links
  can't do this without Apple Universal Links, which require a hosted
  `apple-app-site-association` file and an Apple Developer Team ID. The app
  is wired with `scheme: "owez"` and `associatedDomains: ["applinks:owez.me"]`
  in `app.json`, so once the site publishes the AASA file, Universal Links
  will "just work". **Until then, all /r/[id] links open in the browser** —
  this is the explicit trade-off the brief asked us to note.

## Deploying

The Next.js app is static-exportable in theory, but uses API route handlers
(`/api/parse-receipt`) and server components, so production hosting wants a
Node.js target. Firebase Hosting on Spark can't serve Node SSR either — the
lightest path is to deploy the Next.js app somewhere that supports Node (Vercel,
Cloudflare Workers) while leaving Firestore + Auth on Firebase Spark.

For a Firebase-only static demo you can swap to Next's static export (remove
the `/api/*` route and move parsing to the callable function on Blaze).

## Accent color & design

The brand accent is `#2EF2A3` everywhere: web (Tailwind `accent`), mobile
(`src/ui/theme.ts`), and landing mocks. Dark mode is the default on mobile;
web respects the system preference and can be toggled from the header.
