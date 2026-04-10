'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/lib/auth';
import { upsertUserProfile } from '@/lib/db';

export default function OnboardingPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [photoURL, setPhotoURL] = useState<string>('');
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    if (profile) return void router.replace('/dashboard');
    setPhotoURL(user.photoURL ?? '');
  }, [user, profile, loading, router]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await upsertUserProfile(user.uid, {
        displayName: user.displayName ?? '',
        email: user.email ?? '',
        photoURL: photoURL || user.photoURL || '',
        venmo,
        cashapp,
        phone,
      });
      await refreshProfile();
      router.replace('/dashboard');
    } catch (e: any) {
      setError(e?.message ?? 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <main>
      <Header />
      <section className="max-w-lg mx-auto px-4 py-12">
        <h1 className="font-display text-3xl font-bold">You're in, {user.displayName?.split(' ')[0]}.</h1>
        <p className="mt-2 text-[color:var(--muted)]">
          We pulled your name, email, and photo from your account. Add how you
          want to get paid — you can always change this later.
        </p>

        <div className="mt-8 card p-6 space-y-4">
          <div className="flex items-center gap-4">
            {photoURL ? (
              <img src={photoURL} alt="" className="h-16 w-16 rounded-full border-2 border-accent" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-[color:var(--border)]" />
            )}
            <div>
              <div className="font-semibold">{user.displayName}</div>
              <div className="text-sm text-[color:var(--muted)]">{user.email}</div>
            </div>
          </div>

          <Field label="Venmo username" value={venmo} onChange={setVenmo} placeholder="@janedoe" />
          <Field label="Cash App $cashtag" value={cashapp} onChange={setCashapp} placeholder="$janedoe" />
          <Field
            label="Phone (Zelle only)"
            value={phone}
            onChange={setPhone}
            placeholder="+1 555 123 4567"
          />
          <p className="text-xs text-[color:var(--muted)]">
            We will <strong>never</strong> contact you by phone. It's only shown
            as an option for friends paying you with Zelle.
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button onClick={save} disabled={busy} className="btn btn-primary w-full">
            {busy ? 'Saving…' : "Let's go"}
          </button>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
