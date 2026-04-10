import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { theme } from '@/ui/theme';

export default function Login() {
  const {
    user,
    profile,
    loading,
    googleSignInAvailable,
    devAuthBypassAvailable,
    signInGoogle,
    signInApple,
    signInDevBypass,
  } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    router.replace(profile ? '/dashboard' : '/onboarding');
  }, [user, profile, loading, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg,
        padding: 24,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.fg, fontSize: 40, fontWeight: '800' }}>
        Who Still{'\n'}Owez You?
      </Text>
      <Text style={{ color: theme.muted, marginTop: 12, fontSize: 16 }}>
        Scan a receipt. Send one link. Get paid.
      </Text>

      <View style={{ marginTop: 40, gap: 12 }}>
        <Pressable
          disabled={busy || !googleSignInAvailable}
          onPress={() => run(signInGoogle)}
          style={{
            backgroundColor: googleSignInAvailable ? theme.accent : theme.border,
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: googleSignInAvailable ? 1 : 0.6,
          }}
        >
          <Text
            style={{
              color: googleSignInAvailable ? theme.accentInk : theme.muted,
              fontWeight: '700',
              fontSize: 16,
            }}
          >
            Continue with Google
          </Text>
        </Pressable>
        {!googleSignInAvailable && (
          <Text style={{ color: theme.muted, fontSize: 13, marginTop: -4 }}>
            Add Google OAuth client env vars in apps/mobile/.env to enable.
          </Text>
        )}
        <Pressable
          disabled={busy}
          onPress={() => run(signInApple)}
          style={{
            borderColor: theme.border,
            borderWidth: 1,
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.fg, fontWeight: '700', fontSize: 16 }}>
            Continue with Apple
          </Text>
        </Pressable>
        {devAuthBypassAvailable && (
          <Pressable
            disabled={busy}
            onPress={() => run(signInDevBypass)}
            style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.muted,
              borderStyle: 'dashed',
            }}
          >
            <Text style={{ color: theme.muted, fontWeight: '600', fontSize: 14 }}>
              Skip sign-in (dev · Auth emulator)
            </Text>
          </Pressable>
        )}
      </View>

      {busy && <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />}
      {error && (
        <Text style={{ color: '#ff6b6b', marginTop: 16 }}>{error}</Text>
      )}
    </View>
  );
}
