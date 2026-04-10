import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createReceipt } from '@/lib/db';
import {
  formatMoney,
  normalizeMindeeReceipt,
  round2,
  type ReceiptItem,
} from '@owez/shared';
import { theme } from '@/ui/theme';

const PARSE_ENDPOINT =
  process.env.EXPO_PUBLIC_PARSE_ENDPOINT ?? 'http://localhost:3000/api/parse-receipt';

type Stage = 'upload' | 'parsing' | 'edit' | 'saving';

export default function NewReceipt() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [stage, setStage] = useState<Stage>('upload');
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('Receipt');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [tax, setTax] = useState<string>('');
  const [tip, setTip] = useState<string>('');
  const [raw, setRaw] = useState<unknown>();

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: false,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setStage('parsing');
    try {
      const body = new FormData();
      // React Native's FormData accepts a file object with uri/type/name
      body.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any);
      const r = await fetch(PARSE_ENDPOINT, { method: 'POST', body });
      if (!r.ok) throw new Error(`Parse failed (${r.status})`);
      const data = await r.json();
      const normalized = normalizeMindeeReceipt(data.raw ?? data);
      setRaw(data.raw);
      setItems(normalized.items);
      setTitle(normalized.merchant ?? 'Receipt');
      setTax(normalized.tax?.toString() ?? '');
      setTip(normalized.tip?.toString() ?? '');
      setStage('edit');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not parse');
      setStage('upload');
    }
  }

  async function save() {
    if (!user || !profile) return;
    setStage('saving');
    try {
      const id = await createReceipt({
        ownerId: user.uid,
        title,
        items,
        tax: tax ? Number(tax) : undefined,
        tip: tip ? Number(tip) : undefined,
        raw,
        payment: {
          venmo: profile.venmo,
          cashapp: profile.cashapp,
          phone: profile.phone,
        },
      });
      router.replace(`/r/${id}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save');
      setStage('edit');
    }
  }

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const total = subtotal + (Number(tax) || 0) + (Number(tip) || 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color: theme.fg, fontSize: 24, fontWeight: '800' }}>
        New receipt
      </Text>

      {stage === 'upload' && (
        <View style={{ marginTop: 24, gap: 12 }}>
          <Pressable
            onPress={pickImage}
            style={{ backgroundColor: theme.accent, padding: 16, borderRadius: 12, alignItems: 'center' }}
          >
            <Text style={{ color: theme.accentInk, fontWeight: '800' }}>
              Choose receipt photo
            </Text>
          </Pressable>
          {err && <Text style={{ color: '#ff6b6b' }}>{err}</Text>}
        </View>
      )}

      {stage === 'parsing' && (
        <View style={{ marginTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.muted, marginTop: 12 }}>Reading receipt…</Text>
        </View>
      )}

      {(stage === 'edit' || stage === 'saving') && (
        <View style={{ marginTop: 16, gap: 10 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={inputStyle}
            placeholderTextColor={theme.muted}
          />
          {items.map((it, i) => (
            <View
              key={i}
              style={{
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 10,
                borderRadius: 12,
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <TextInput
                value={it.name}
                onChangeText={(v) => {
                  const next = [...items];
                  next[i] = { ...it, name: v };
                  setItems(next);
                }}
                style={{ ...inputStyle, flex: 1 }}
                placeholderTextColor={theme.muted}
              />
              <TextInput
                value={String(it.price)}
                keyboardType="decimal-pad"
                onChangeText={(v) => {
                  const next = [...items];
                  next[i] = { ...it, price: round2(Number(v) || 0) };
                  setItems(next);
                }}
                style={{ ...inputStyle, width: 80 }}
              />
              <TextInput
                value={String(it.quantity)}
                keyboardType="number-pad"
                onChangeText={(v) => {
                  const next = [...items];
                  next[i] = { ...it, quantity: Math.max(1, Math.round(Number(v) || 1)) };
                  setItems(next);
                }}
                style={{ ...inputStyle, width: 60 }}
              />
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              placeholder="Tax"
              value={tax}
              keyboardType="decimal-pad"
              onChangeText={setTax}
              style={{ ...inputStyle, flex: 1 }}
              placeholderTextColor={theme.muted}
            />
            <TextInput
              placeholder="Tip"
              value={tip}
              keyboardType="decimal-pad"
              onChangeText={setTip}
              style={{ ...inputStyle, flex: 1 }}
              placeholderTextColor={theme.muted}
            />
          </View>

          <Text style={{ color: theme.fg, fontWeight: '700', textAlign: 'right' }}>
            Total {formatMoney(total)}
          </Text>

          {err && <Text style={{ color: '#ff6b6b' }}>{err}</Text>}

          <Pressable
            onPress={save}
            disabled={stage === 'saving'}
            style={{ backgroundColor: theme.accent, padding: 14, borderRadius: 12, alignItems: 'center' }}
          >
            <Text style={{ color: theme.accentInk, fontWeight: '800' }}>
              {stage === 'saving' ? 'Saving…' : 'Create & share'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const inputStyle = {
  backgroundColor: theme.bg,
  color: theme.fg,
  borderColor: theme.border,
  borderWidth: 1,
  borderRadius: 10,
  padding: 10,
} as const;
