'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/lib/auth';
import { upsertUserProfile } from '@/lib/db';

export default function AccountPage() {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    if (profile) {
      setVenmo(profile.venmo ?? '');
      setCashapp(profile.cashapp ?? '');
      setPhone(profile.phone ?? '');
      setPhotoURL(profile.photoURL ?? '');
    }
  }, [user, profile, loading, router]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      await upsertUserProfile(user.uid, {
        displayName: user.displayName ?? profile?.displayName ?? '',
        email: user.email ?? profile?.email ?? '',
        photoURL,
        venmo,
        cashapp,
        phone,
      });
      await refreshProfile();
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 * 2) {
      setMsg('Image must be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoURL(String(reader.result));
    reader.readAsDataURL(file);
  }

  function verifyVenmo() {
    const handle = venmo.replace(/^@/, '').trim();
    if (!handle) return;
    window.open(`https://venmo.com/${encodeURIComponent(handle)}`, '_blank', 'noopener');
  }
  function verifyCashApp() {
    const handle = cashapp.replace(/^\$/, '').trim();
    if (!handle) return;
    window.open(`https://cash.app/$${encodeURIComponent(handle)}`, '_blank', 'noopener');
  }

  if (!user) return null;

  return (
    <main>
      <Header />
      <section className="max-w-lg mx-auto px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Account</h1>

        <div className="mt-6 card p-6 space-y-4">
          <div className="flex items-center gap-4">
            {photoURL ? (
              <img src={photoURL} alt="" className="h-20 w-20 rounded-full border-2 border-accent object-cover" />
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
            <div className="mt-1 text-[color:var(--muted)]">{user.displayName}</div>
          </div>
          <div>
            <div className="text-sm font-medium">Email</div>
            <div className="mt-1 text-[color:var(--muted)]">{user.email}</div>
          </div>

          <div>
            <label className="text-sm font-medium">Venmo username</label>
            <div className="mt-1 flex gap-2">
              <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@janedoe" />
              <button type="button" onClick={verifyVenmo} className="btn whitespace-nowrap">Verify</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Cash App $cashtag</label>
            <div className="mt-1 flex gap-2">
              <input value={cashapp} onChange={(e) => setCashapp(e.target.value)} placeholder="$janedoe" />
              <button type="button" onClick={verifyCashApp} className="btn whitespace-nowrap">Verify</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Phone (Zelle only)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
            <button onClick={save} disabled={busy} className="btn btn-primary">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => signOut().then(() => router.replace('/'))} className="btn btn-ghost">
              Sign out
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
