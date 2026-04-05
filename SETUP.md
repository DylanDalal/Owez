# Owez — Setup & Run

How to get the Phase 1 stack running locally against the Firebase Local Emulator Suite. No real Firebase project, no billing, no internet (except the Mindee API call) required.

## One-time setup

### 1. Install Firebase CLI globally

```bash
npm install -g firebase-tools
```

Verify:
```bash
firebase --version
```

If you don't already have a Firebase account on this machine, you DO NOT need to log in for emulator-only use. `firebase login` only matters when you want to deploy to a real project (Phase 2+).

### 2. Add Mindee secrets for the local emulator

The `parseBill` Cloud Function reads `MINDEE_API_KEY` and `MINDEE_MODEL_ID` from secrets. For deployment these are stored in Google Secret Manager, but for the **emulator** you put them in a local file:

```bash
cat > functions/.secret.local <<EOF
MINDEE_API_KEY=your_v2_api_key
MINDEE_MODEL_ID=your_receipt_model_id
EOF
```

This file is in `.gitignore` and never gets committed or deployed. (You can copy these from `phase0/.env` since they're the same key + model ID.)

### 3. Install Java (one-time, if you don't have it)

The Firestore and Storage emulators are JVM processes. If you don't already have Java:

```bash
brew install openjdk@21
```

Verify:
```bash
java -version
```

## Daily run

Two terminals.

**Terminal 1 — emulators:**

```bash
cd /Users/Dylan/Documents/DA/Owez
firebase emulators:start
```

You'll see:
```
┌────────────────┬────────────────┬─────────────────────────────────┐
│ Emulator       │ Host:Port      │ View in Emulator UI              │
├────────────────┼────────────────┼─────────────────────────────────┤
│ Authentication │ localhost:9099 │ http://localhost:4000/auth       │
│ Functions      │ localhost:5001 │ http://localhost:4000/functions  │
│ Firestore      │ localhost:8080 │ http://localhost:4000/firestore  │
│ Storage        │ localhost:9199 │ http://localhost:4000/storage    │
└────────────────┴────────────────┴─────────────────────────────────┘
```

Open **http://localhost:4000** in your browser — that's the Emulator UI. You can browse Firestore data, see auth users, inspect storage, and view function logs there in real time.

**Terminal 2 — verify the full flow:**

```bash
cd /Users/Dylan/Documents/DA/Owez/functions
npm run verify -- ../phase0/your-test-receipt.jpg
```

(Use whatever receipt image you used in Phase 0.)

You should see something like:

```
[1/6] Signing in as test owner...
      uid = abc123...
[2/6] Ensuring users/{uid} doc...
[3/6] Uploading image to b/x7k2p/receipt.jpg...
[4/6] Creating bills/x7k2p (status: parsing)...
[5/6] Calling parseBill...
      done in 4.21s
      result: { itemCount: 7, subtotal: 42.85, total: 48.92, status: 'ready' }
[6/6] Reading bills/x7k2p + items...

──────── Bill ────────
status:    ready
subtotal:  $42.85
tax:       $3.00
tip:       $3.07
total:     $48.92
currency:  USD

──────── Items (7) ────────
  1x  Burger                                   $12.00
  2x  Fries                                    $8.00
  ...

Items sum: $42.85  vs  bill.subtotal: $42.85  →  diff $0.00 [OK]

Phase 1 verification complete.
```

Open the Emulator UI at http://localhost:4000/firestore to see the same data in the Firestore browser.

## Iterating on the function

The `firebase emulators:start` command auto-rebuilds the function when you change `functions/src/*.ts`. If you want a watch process for type errors specifically, run a third terminal:

```bash
cd functions
npm run build:watch
```

## Troubleshooting

**`Error: secrets.local file not found`** — you skipped step 2. Create `functions/.secret.local`.

**`Error: Could not start Firestore Emulator, port taken`** — you have something on 8080. Edit `firebase.json` and change the port, OR `lsof -ti:8080 | xargs kill`.

**`firebase: command not found`** — `npm install -g firebase-tools` didn't put npm's global bin on your PATH. Try `npx firebase emulators:start` from the project root instead.

**`Error: java: command not found`** — install Java (step 3).

**Mindee returns the v2 token error** — your `.secret.local` has the wrong key. Make sure you're using your v2 API key, not a v1 one.

**Function runs but `itemCount: 0` and totals are 0** — the defensive field-name lookups in `parseBill.ts` didn't find anything. Mindee's model uses different field names than the common ones I guessed. Check the Emulator UI Functions logs for the parsed shape, or run `cd phase0 && npm run parse -- /path/to/receipt.jpg` to see Mindee's pretty-printed output and identify the actual field names — then add them to the `tryNumber` / `tryListField` candidate lists in `functions/src/parseBill.ts`.
