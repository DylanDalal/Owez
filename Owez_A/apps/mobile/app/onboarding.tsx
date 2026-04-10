import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { upsertUserProfile } from '@/lib/db';
import { theme } from '@/ui/theme';

export default function Onboarding() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    if (profile) return void router.replace('/dashboard');
  }, [user, profile, loading, router]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await upsertUserProfile(user.uid, {
        displayName: user.displayName ?? '',
        email: user.email ?? '',
        photoURL: user.photoURL ?? '',
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
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 24 }}>
      <Text style={{ color: theme.fg, fontSize: 26, fontWeight: '800' }}>
        You're in, {user.displayName?.split(' ')[0]}.
      </Text>
      <Text style={{ color: theme.muted, marginTop: 8 }}>
        Add how you want to get paid — you can change this later.
      </Text>

      <View
        style={{
          marginTop: 24,
          backgroundColor: theme.card,
          borderRadius: 16,
          padding: 20,
          gap: 14,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {user.photoURL ? (
            <Image
              source={{ uri: user.photoURL }}
              style={{ width: 64, height: 64, borderRadius: 32, borderColor: theme.accent, borderWidth: 2 }}
            />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.border }} />
          )}
          <View>
            <Text style={{ color: theme.fg, fontWeight: '700' }}>{user.displayName}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{user.email}</Text>
          </View>
        </View>

        <Field label="Venmo" value={venmo} onChangeText={setVenmo} placeholder="@janedoe" />
        <Field label="Cash App" value={cashapp} onChangeText={setCashapp} placeholder="$janedoe" />
        <Field label="Phone (Zelle only)" value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" />
        <Text style={{ color: theme.muted, fontSize: 11 }}>
          We will never contact you by phone. It's only shown to friends paying
          you with Zelle.
        </Text>

        {error && <Text style={{ color: '#ff6b6b' }}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={busy}
          style={{ backgroundColor: theme.accent, padding: 14, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: theme.accentInk, fontWeight: '800' }}>
            {busy ? 'Saving…' : "Let's go"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View>
      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={{
          marginTop: 4,
          backgroundColor: theme.bg,
          color: theme.fg,
          padding: 12,
          borderRadius: 10,
          borderColor: theme.border,
          borderWidth: 1,
        }}
      />
    </View>
  );
}
