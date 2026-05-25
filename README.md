# Owez

> Snap a receipt. Split the bill. Get paid.

Take a photo of your restaurant receipt, share a link with your friends, and let them claim what they ordered and pay you via Venmo, Cash App, or Zelle. Free forever, no account needed for friends.

## Monorepo layout

```
owez/
├── apps/
│   ├── web/         # Next.js 15 + Tailwind 4, deployed on Vercel. Also a PWA.
│   └── mobile/      # Expo + expo-router, iOS first.
├── packages/
│   └── shared/      # @owez/shared — types, payment link builders, totals math
├── pnpm-workspace.yaml
└── package.json
```

All three consume `@owez/shared` so the bill data model lives in exactly one place.

## Stack (all free tier)

| Concern | Pick |
|---|---|
| Web + PWA | Next.js 15, Tailwind 4, deployed on Vercel |
| iOS app | Expo SDK 52, expo-router |
| Receipt parsing | [OpenAI Responses API](https://platform.openai.com/) — vision model (`gpt-4o-mini` by default) with a strict JSON schema |
| Auth / DB | Firebase Spark plan (Auth + Firestore only — Storage is Blaze-only, so we skip saving receipt images) |
| Payments | Deep links only — no processing (`venmo://`, `cash.app/$tag`, `sms:` for Zelle) |

Receipts are parsed by sending the image to a vision-capable OpenAI model constrained by a JSON schema, so the response maps directly onto `ParsedReceipt`. The `OPENAI_API_KEY` lives only on the Next.js server (`/api/parse-receipt`) — the Expo app posts images to that same route so the key never ships in the mobile bundle.

## Prereqs

- Node 20+ and pnpm 10+
- Xcode (for iOS simulator) or Expo Go on your phone
- A [Firebase project](https://console.firebase.google.com/) (Spark plan is fine)
- An [OpenAI API key](https://platform.openai.com/api-keys)

## First-time setup

```bash
# From the repo root
pnpm install
pnpm build:shared

# Web
cp apps/web/.env.example apps/web/.env.local
# …fill in OPENAI_API_KEY and NEXT_PUBLIC_FIREBASE_* values

# Mobile
cp apps/mobile/.env.example apps/mobile/.env.local
# …fill in EXPO_PUBLIC_* values. For EXPO_PUBLIC_API_BASE_URL in dev, use your
# Mac's LAN IP (not localhost) so your phone can reach the Next.js dev server.
```

## Running

```bash
# Terminal 1 — web + API routes
pnpm dev:web                  # → http://localhost:3000

# Terminal 2 — iOS
pnpm dev:mobile                # → opens Expo dev tools
#   press "i" for iOS simulator, or scan the QR in Expo Go
```

### Running on the iOS simulator

`pnpm dev:mobile`, then press `i` in the Expo terminal to launch the iOS simulator. The default `apps/mobile/.env.local` points at `http://localhost:3000`, which works out of the box because the simulator shares the Mac's network stack.

A few simulator-specific notes:

- **No camera.** Use the "Choose from library" button on the `/new` screen. To add receipt images to the simulator, drag an image file from Finder onto the simulator window — it lands in the Photos app.
- **Payment deep links.** `venmo.com` and `cash.app` links open in mobile Safari fine. `sms:` (Zelle) won't work because Messages isn't wired up in the sim — tapping it pops an alert with the URL instead of silently failing.
- **Auth persists across reloads.** Anonymous session is stored in AsyncStorage, so fast-refresh won't log you out.

### Running on a physical iPhone via Expo Go

Override the two localhost vars in `apps/mobile/.env.local`:

```bash
# Get your Mac's LAN IP
ipconfig getifaddr en0
# Then in .env.local:
EXPO_PUBLIC_API_BASE_URL=http://<that-ip>:3000
EXPO_PUBLIC_WEB_ORIGIN=http://<that-ip>:3000
```

The phone can't reach `localhost` — that means the phone itself. Your Mac and phone need to be on the same Wi-Fi network.

After changing anything in `packages/shared`, run `pnpm build:shared` (or leave `pnpm --filter @owez/shared dev` running in a separate terminal).

## Firebase local emulators

The Firestore port is `8181` (not 8080 — mitmproxy holds 8080 on this machine). Set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` in `apps/web/.env.local` and start the suite:

```bash
firebase emulators:start --only auth,firestore,storage
```

## Build order (MVP)

1. ✅ Monorepo scaffold
2. ✅ Receipt parse pipeline (OpenAI vision + JSON schema)
3. ✅ Firebase Auth (Google for creators, anonymous for friends)
4. ✅ Firestore write flow: parse → edit → save → share link
5. ✅ `/b/[billId]` public claim page with live item totals and pay buttons
6. 🚧 Polish pass + PWA install test on iPhone
7. 🚧 Mobile save flow (Expo currently parses only — add auth + save)
8. 🚧 TestFlight build for the Expo app

## Firebase setup checklist

One-time steps in the [Firebase Console](https://console.firebase.google.com/) before the save flow will work:

1. Create a new project (Spark plan is fine).
2. **Authentication → Sign-in method**: enable **Google** AND **Anonymous** providers.
   - Google → for bill creators
   - Anonymous → for friends claiming items (the `/b/[billId]` page calls `signInAnonymously` on load)
3. **Firestore Database** → Create database → production mode → any region. Rules deploy from `firestore.rules`.
4. **Project settings → General → Your apps → Add Web app** → copy the config into `apps/web/.env.local`.
5. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes` (or use the emulators for local dev).

> No Firebase Storage step — it's Blaze-only, so Owez skips receipt-image upload entirely. Friends only see the parsed line items, not the original photo.

Put your project id in `.firebaserc`:
```bash
cp .firebaserc.example .firebaserc
# then edit "your-firebase-project-id-here" to your actual project id
```
