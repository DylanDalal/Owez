import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Share,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { watchClaims, watchReceipt, claimItemUnit } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import {
  formatMoney,
  groupClaimsByUnit,
  initialsFromName,
  totalForGuest,
  type Claim,
  type Receipt,
} from '@owez/shared';
import { theme } from '@/ui/theme';

export default function ReceiptView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);

  useEffect(() => {
    if (!id) return;
    const un1 = watchReceipt(id, setReceipt);
    const un2 = watchClaims(id, setClaims);
    return () => {
      un1();
      un2();
    };
  }, [id]);

  const guestName = profile?.displayName ?? '';
  const myTotal = receipt ? totalForGuest(receipt, claims, guestName) : 0;
  const units = useMemo(
    () => (receipt ? groupClaimsByUnit(receipt.items, claims) : new Map()),
    [receipt, claims],
  );

  if (!receipt) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
        <Text style={{ color: theme.muted }}>Loading…</Text>
      </View>
    );
  }

  async function claim(itemIndex: number, unitIndex: number) {
    if (!user || !profile) return;
    try {
      await claimItemUnit(receipt!.id, {
        itemIndex,
        unitIndex,
        guestName,
        initials: initialsFromName(guestName),
        portions: 1,
        splitInto: 1,
        ownerUid: user.uid,
        photoURL: profile.photoURL ?? null,
        sessionId: user.uid,
      });
    } catch {
      // UI could surface this; keeping MVP mobile simple.
    }
  }

  async function share() {
    await Share.share({
      message: `Split this receipt with Owez: https://owez.me/r/${receipt!.id}`,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60 }}>
      <Text style={{ color: theme.fg, fontSize: 22, fontWeight: '800' }}>
        {receipt.title || receipt.merchant || 'Receipt'}
      </Text>
      <Pressable
        onPress={share}
        style={{
          marginTop: 12,
          backgroundColor: theme.accent,
          padding: 12,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.accentInk, fontWeight: '800' }}>Share link</Text>
      </Pressable>

      <FlatList
        data={receipt.items}
        keyExtractor={(_, i) => String(i)}
        style={{ marginTop: 16 }}
        renderItem={({ item, index }) => {
          const itemUnits = [];
          for (let u = 0; u < item.quantity; u++) {
            itemUnits.push(
              units.get(`${index}:${u}`) ?? {
                itemIndex: index,
                unitIndex: u,
                splitInto: 1,
                portionsClaimed: 0,
                claims: [],
              },
            );
          }
          const free = itemUnits.reduce(
            (s, u) => s + ((u.splitInto || 1) - u.portionsClaimed),
            0,
          );
          const nextFree = itemUnits.findIndex(
            (u) => u.portionsClaimed < (u.splitInto || 1),
          );
          const allClaims = itemUnits.flatMap((u) => u.claims);
          return (
            <Pressable
              onPress={() => nextFree >= 0 && claim(index, nextFree)}
              style={{
                backgroundColor: theme.card,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                marginBottom: 10,
                opacity: free === 0 ? 0.55 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.fg, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: theme.fg }}>{formatMoney(item.price)}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginTop: 6, gap: 6 }}>
                {allClaims.map((c) => (
                  <View
                    key={c.id}
                    style={{
                      backgroundColor: theme.accent,
                      borderColor: theme.accentInk,
                      borderWidth: 2,
                      borderRadius: 14,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: theme.accentInk, fontWeight: '800', fontSize: 11 }}>
                      {c.initials || initialsFromName(c.guestName)}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        }}
      />

      <View
        style={{
          padding: 14,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: theme.muted }}>Your total</Text>
        <Text style={{ color: theme.fg, fontWeight: '800' }}>{formatMoney(myTotal)}</Text>
      </View>
    </View>
  );
}
