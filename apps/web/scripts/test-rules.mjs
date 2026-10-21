// Run with the emulators up: `node scripts/test-rules.mjs` (from apps/web).
// Exercise firestore.rules against the local emulator with the real client SDK.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, getDocs, collection, query, where, orderBy, addDoc, updateDoc, arrayUnion } from "firebase/firestore";

const PROJECT = "owez-c1520";
function client(name) {
  const app = initializeApp({ apiKey: "fake", projectId: PROJECT, appId: "1:1:web:1" }, name);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8181);
  return { auth, db };
}
const results = [];
async function expect(label, shouldPass, fn) {
  let ok = true, err = "";
  try { await fn(); } catch (e) { ok = false; err = (e.code || e.message || "").toString().slice(0, 60); }
  const pass = ok === shouldPass;
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}  (${shouldPass ? "allowed" : "denied"}${ok ? "" : ": " + err})`);
}

const creator = client("creator"), friend = client("friend"), stranger = client("stranger");
const cu = (await signInWithCredential(creator.auth, GoogleAuthProvider.credential(JSON.stringify({ sub: "rules-creator", email: "c@example.com", name: "Creator" })))).user;
const fu = (await signInAnonymously(friend.auth)).user;
const su = (await signInAnonymously(stranger.auth)).user;

const billId = "RULESBILL1", tabId = "RULESTAB1";
const bill = { id: billId, creatorId: cu.uid, createdAt: Date.now(), items: [{ id: "i1", name: "Pizza", priceCents: 1000, quantity: 1 }], subtotalCents: 1000, taxCents: 0, tipCents: 0, totalCents: 1000, paymentMethods: { venmo: "x" }, tabId };
await expect("creator creates bill", true, () => setDoc(doc(creator.db, "bills", billId), bill));
await expect("creator creates tab", true, () => setDoc(doc(creator.db, "tabs", tabId), { id: tabId, creatorId: cu.uid, createdAt: Date.now(), title: "T", members: [{ userId: cu.uid, name: "Creator", joinedAt: 1 }], receiptIds: [billId], status: "active" }));
await expect("creator writes own profile", true, () => setDoc(doc(creator.db, "users", cu.uid), { displayName: "Creator", email: "c@example.com", zellePhone: "+1555", createdAt: 1 }));

await expect("anon friend GETs bill", true, () => getDoc(doc(friend.db, "bills", billId)));
await expect("anon friend GETs tab", true, () => getDoc(doc(friend.db, "tabs", tabId)));
await expect("anon friend LISTs all bills", false, () => getDocs(collection(friend.db, "bills")));
await expect("anon friend LISTs all tabs", false, () => getDocs(collection(friend.db, "tabs")));
await expect("anon friend LISTs all users", false, () => getDocs(collection(friend.db, "users")));
await expect("anon friend reads creator profile", false, () => getDoc(doc(friend.db, "users", cu.uid)));
await expect("anon friend lists bills by tabId", true, () => getDocs(query(collection(friend.db, "bills"), where("tabId", "==", tabId), orderBy("createdAt", "asc"))));
await expect("anon friend lists bills by someone else's creatorId", false, () => getDocs(query(collection(friend.db, "bills"), where("creatorId", "==", cu.uid), orderBy("createdAt", "desc"))));
await expect("creator lists own bills", true, () => getDocs(query(collection(creator.db, "bills"), where("creatorId", "==", cu.uid), orderBy("createdAt", "desc"))));
await expect("creator lists own tabs", true, () => getDocs(query(collection(creator.db, "tabs"), where("creatorId", "==", cu.uid), orderBy("createdAt", "desc"))));

const claims = collection(friend.db, "bills", billId, "claims");
let claimRef;
await expect("friend creates own claim", true, async () => { claimRef = await addDoc(claims, { itemId: "i1", unitIndex: 0, portions: 1, splitInto: 2, claimerId: fu.uid, name: "Sam", initials: "S", createdAt: Date.now() }); });
await expect("friend creates claim as someone else", false, () => addDoc(claims, { itemId: "i1", unitIndex: 0, portions: 1, splitInto: 2, claimerId: su.uid, name: "Evil", initials: "E", createdAt: Date.now() }));
await expect("friend creates claim with extra field", false, () => addDoc(claims, { itemId: "i1", unitIndex: 0, portions: 1, splitInto: 2, claimerId: fu.uid, name: "Sam", initials: "S", createdAt: Date.now(), admin: true }));
await expect("friend creates claim with splitInto 500", false, () => addDoc(claims, { itemId: "i1", unitIndex: 0, portions: 1, splitInto: 500, claimerId: fu.uid, name: "Sam", initials: "S", createdAt: Date.now() }));
await expect("friend updates own portions", true, () => updateDoc(claimRef, { portions: 2, splitInto: 2 }));
await expect("friend updates own claim's itemId", false, () => updateDoc(claimRef, { itemId: "i2" }));
await expect("stranger updates friend's claim", false, () => updateDoc(doc(stranger.db, "bills", billId, "claims", claimRef.id), { portions: 1 }));
await expect("stranger lists claims on a known bill", true, () => getDocs(collection(stranger.db, "bills", billId, "claims")));

await expect("friend appends self to tab members", true, () => updateDoc(doc(friend.db, "tabs", tabId), { members: arrayUnion({ userId: fu.uid, name: "Sam", joinedAt: 2 }), updatedAt: Date.now() }));
await expect("friend wipes tab members", false, () => updateDoc(doc(friend.db, "tabs", tabId), { members: [], updatedAt: Date.now() }));
await expect("friend renames tab", false, () => updateDoc(doc(friend.db, "tabs", tabId), { title: "pwned" }));
await expect("friend edits bill", false, () => updateDoc(doc(friend.db, "bills", billId), { totalCents: 1 }));
await expect("friend reads parseUsage", false, () => getDoc(doc(friend.db, "parseUsage", fu.uid)));
await expect("creator reads parseUsage", false, () => getDoc(doc(creator.db, "parseUsage", cu.uid)));

console.log(results.join("\n"));
console.log(`\n${results.filter(r => r.startsWith("PASS")).length}/${results.length} passed`);
process.exit(0);
