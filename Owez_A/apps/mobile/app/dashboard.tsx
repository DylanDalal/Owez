import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { listMyReceipts } from '@/lib/db';
import { formatMoney, type Receipt } from '@owez/shared';
import { theme } from '@/ui/theme';

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace('/login');
    load();
  }, [user, loading]);

  async function load() {
    if (!user) return;
    setRefreshing(true);
    try {
      const rs = await listMyReceipts(user.uid);
      setReceipts(rs);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          padding: 20,
          paddingTop: 60,
          borderBottomColor: theme.border,
          borderBottomWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.fg, fontSize: 24, fontWeight: '800' }}>
          Your receipts
        </Text>
        <Link href="/new" asChild>
          <Pressable
            style={{
              backgroundColor: theme.accent,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: theme.accentInk, fontWeight: '800' }}>+ New</Text>
          </Pressable>
        </Link>
      </View>

      <FlatList
        data={receipts}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.accent} />}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: theme.muted }}>No receipts yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/r/${item.id}`)}
            style={{
              backgroundColor: theme.card,
              borderRadius: 14,
              padding: 16,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: theme.border,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text style={{ color: theme.fg, fontWeight: '700' }}>
                {item.title || item.merchant || 'Receipt'}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={{ color: theme.fg, fontVariant: ['tabular-nums'] }}>
              {formatMoney(item.items.reduce((s, it) => s + it.price * it.quantity, 0))}
            </Text>
          </Pressable>
        )}
      />

      <Pressable
        onPress={() => signOut().then(() => router.replace('/'))}
        style={{ padding: 16, alignItems: 'center' }}
      >
        <Text style={{ color: theme.muted }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
