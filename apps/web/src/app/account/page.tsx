"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/lib/auth";
import { upsertProfile } from "@/lib/profiles";

/**
 * Account settings page. The creator edits their default payment handles
 * here; /new pulls them in to auto-fill new bills. Profile photo is stored
 * on the Firestore doc as a base64 data URL (no Storage — Blaze-only), so
 * images are capped at 2 MB.
 */
export default function AccountPage() {
  return (
    <SignInGate>
      <AccountInner />
    </SignInGate>
  );
}

function AccountInner() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [zellePhone, setZellePhone] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setVenmo(profile.venmo ?? "");
    setCashapp(profile.cashapp ?? "");
    setZellePhone(profile.zellePhone ?? "");
    setPhotoURL(profile.photoURL ?? user?.photoURL ?? "");
  }, [profile, user?.photoURL]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      await upsertProfile(user.uid, {
        displayName: user.displayName ?? profile?.displayName ?? "",
        email: user.email ?? profile?.email ?? undefined,
        photoURL,
        venmo: venmo.replace(/^@/, "").trim(),
        cashapp: cashapp.replace(/^\$/, "").trim(),
        zellePhone: zellePhone.trim(),
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 * 2) {
      setMsg("Image must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoURL(String(reader.result));
    reader.readAsDataURL(file);
  }

  function verifyVenmo() {
    const h = venmo.replace(/^@/, "").trim();
    if (!h) return;
    window.open(
      `https://venmo.com/${encodeURIComponent(h)}`,
      "_blank",
      "noopener",
    );
  }
  function verifyCashApp() {
    const h = cashapp.replace(/^\$/, "").trim();
    if (!h) return;
    window.open(
      `https://cash.app/$${encodeURIComponent(h)}`,
      "_blank",
      "noopener",
    );
  }

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Account</h1>

        <div className="card mt-6 space-y-4 p-6">
          <div className="flex items-center gap-4">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoURL}
                alt=""
                className="h-20 w-20 rounded-full border-2 border-[color:var(--color-accent)] object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-[color:var(--border)]" />
            )}
            <label className="btn cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
              Upload photo
            </label>
          </div>

          <div>
            <div className="text-sm font-medium">Name</div>
            <div className="mt-1 text-[color:var(--muted)]">
              {user?.displayName ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Email</div>
            <div className="mt-1 text-[color:var(--muted)]">
              {user?.email ?? "—"}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Venmo username</label>
            <div className="mt-1 flex gap-2">
              <input
                value={venmo}
                onChange={(e) => setVenmo(e.target.value)}
                placeholder="@janedoe"
              />
              <button
                type="button"
                onClick={verifyVenmo}
                className="btn whitespace-nowrap"
              >
                Verify
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Cash App $cashtag</label>
            <div className="mt-1 flex gap-2">
              <input
                value={cashapp}
                onChange={(e) => setCashapp(e.target.value)}
                placeholder="$janedoe"
              />
              <button
                type="button"
                onClick={verifyCashApp}
                className="btn whitespace-nowrap"
              >
                Verify
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Phone (Zelle only)</label>
            <input
              value={zellePhone}
              onChange={(e) => setZellePhone(e.target.value)}
              placeholder="+1 555 123 4567"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              We will never contact you by phone. It's only shown as an option
              for friends paying you with Zelle.
            </p>
          </div>

          {msg && <p className="text-sm">{msg}</p>}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void signOut().then(() => router.replace("/"))}
              className="btn btn-ghost"
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
