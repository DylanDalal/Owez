'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, profile, loading, signInGoogle, signInApple } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    router.replace(profile ? '/dashboard' : '/onboarding');
  }, [user, profile, loading, router]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Header />
      <section className="max-w-sm mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-bold">Continue</h1>
        <p className="mt-3 text-[color:var(--muted)]">
          We'll create your account automatically. No sign-up forms.
        </p>
        <div className="mt-8 space-y-3">
          <button
            disabled={busy}
            onClick={() => run(signInGoogle)}
            className="btn btn-primary w-full"
          >
            Continue with Google
          </button>
          <button
            disabled={busy}
            onClick={() => run(signInApple)}
            className="btn w-full"
          >
            Continue with Apple
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </section>
      <Footer />
    </main>
  );
}
