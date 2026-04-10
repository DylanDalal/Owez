import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import type { Bill, Claim } from "@owez/shared";
import {
  buildPayLinks,
  claimerOwes,
  groupClaimsByUnit,
  initialsFromName,
} from "@owez/shared";
import { useAuth } from "@/lib/auth";
import {
  claimItemUnit,
  deleteClaimDoc,
  subscribeToBill,
  subscribeToClaims,
} from "@/lib/bills";
import { centsToDisplay, colors } from "@/lib/format";

/**
 * Mobile claim page — the RN counterpart to apps/web/src/app/b/[billId]/page.tsx.
 *
 * Mobile uses a simplified claim model: tap to claim one whole unit (no
 * splitting). The detail-sheet / portion-splitting UX is web-only.
 *
 * Flow:
 *   1. Anonymous auth is set up at app boot via AuthProvider.
 *   2. Subscribe to bill + claims in realtime.
 *   3. Show name modal if the user hasn't entered a name yet.
 *   4. Tap items to claim the next available unit (portions=1, splitInto=1).
 *   5. Tap a claimed item to remove your claim.
 *   6. Bottom bar shows live owed total and pay buttons that open Venmo /
 *      Cash App / SMS via Linking.openURL.
 */
export default function MobileClaimPage() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { user } = useAuth();

  const [bill, setBill] = useState<Bill | null | undefined>(undefined);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [myName, setMyName] = useState("");
  const [showNameGate, setShowNameGate] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Realtime subscriptions.
  useEffect(() => {
    if (!billId) return;
    const u1 = subscribeToBill(billId, setBill);
    const u2 = subscribeToClaims(billId, setClaims);
    return () => {
      u1();
      u2();
    };
  }, [billId]);

  // Show the name gate on first load if the user hasn't named themselves.
  useEffect(() => {
    if (!bill || myName) return;
    setShowNameGate(true);
  }, [bill, myName]);

  const unitMap = useMemo(
    () => (bill ? groupClaimsByUnit(bill.items, claims) : new Map()),
    [bill, claims],
  );

  const myTotals = useMemo(() => {
    if (!bill || !user) return null;
    return claimerOwes(bill, claims, user.uid);
  }, [bill, claims, user]);

  /** Tap an item: if I already claimed a unit on it, remove that claim;
   *  otherwise claim the next available unit. */
  async function toggleItem(itemId: string) {
    if (!user || !bill || !billId || !myName) return;

    // Already have a claim on this item? Remove the first one.
    const myClaim = claims.find(
      (c) => c.itemId === itemId && c.claimerId === user.uid,
    );
    if (myClaim) {
      try {
        await deleteClaimDoc(bill.id, myClaim.id);
      } catch (e) {
        Alert.alert(
          "Couldn't unclaim",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
      return;
    }

    // Find the next available unit on this item.
    const item = bill.items.find((it) => it.id === itemId);
    if (!item) return;
    for (let u = 0; u < item.quantity; u++) {
      const unit = unitMap.get(`${itemId}:${u}`);
      if (!unit || unit.portionsClaimed < (unit.splitInto || 1)) {
        try {
          await claimItemUnit(bill.id, {
            itemId,
            unitIndex: u,
            portions: 1,
            splitInto: 1,
            claimerId: user.uid,
            name: myName,
            initials: initialsFromName(myName),
          });
        } catch (e) {
          Alert.alert(
            "Couldn't claim",
            e instanceof Error ? e.message : "Unknown error",
          );
        }
        return;
      }
    }
    // No unit available.
    Alert.alert("Fully claimed", "Every unit of this item has been claimed.");
  }

  function submitName() {
    if (!nameDraft.trim()) return;
    setMyName(nameDraft.trim());
    setShowNameGate(false);
  }

  async function openPayLink(url: string) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Can't open link", url);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Can't open link", url);
    }
  }

  // --- Loading state ---
  if (bill === undefined || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // --- Not found ---
  if (bill === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
        <View style={{ padding: 24, paddingTop: 64 }}>
          <Text
            style={{ color: colors.paper, fontSize: 28, fontWeight: "300" }}
          >
            Bill not found
          </Text>
          <Text style={{ color: colors.mutedInk, marginTop: 8 }}>
            Double-check the link, or ask whoever sent it to re-share.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const payLinks = myTotals
    ? buildPayLinks({
        methods: bill.paymentMethods,
        amountCents: myTotals.totalCents,
        note: bill.title ? `Owez — ${bill.title}` : "Owez bill",
        creatorName: bill.creatorName,
      })
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 180 }}>
        <Text style={styles.eyebrow}>
          {bill.creatorName
            ? `${bill.creatorName} is collecting`
            : "Bill"}
        </Text>
        <Text
          style={{
            color: colors.paper,
            fontSize: 32,
            fontWeight: "300",
            marginTop: 6,
          }}
        >
          {bill.title ?? "Split the bill"}
        </Text>
        <Text style={{ color: colors.mutedInk, marginTop: 8, fontSize: 13 }}>
          Tap an item to claim it. Tap again to unclaim.
        </Text>

        <View
          style={{
            marginTop: 24,
            backgroundColor: colors.paperDim,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {bill.items.map((item, idx) => {
            const mine = claims.some(
              (c) =>
                c.itemId === item.id && c.claimerId === user.uid,
            );
            const otherNames = [
              ...new Set(
                claims
                  .filter(
                    (c) =>
                      c.itemId === item.id &&
                      c.claimerId !== user.uid,
                  )
                  .map((c) => c.name),
              ),
            ];
            return (
              <Pressable
                key={item.id}
                onPress={() => void toggleItem(item.id)}
                disabled={!myName}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  borderBottomWidth:
                    idx === bill.items.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(247,251,249,0.1)",
                  backgroundColor: mine
                    ? "rgba(46,242,163,0.1)"
                    : "transparent",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: mine
                      ? colors.paper
                      : "rgba(247,251,249,0.3)",
                    backgroundColor: mine
                      ? colors.paper
                      : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {mine && (
                    <Text style={{ color: colors.ink, fontSize: 12 }}>
                      ✓
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.paper, fontSize: 14 }}>
                    {item.quantity > 1 && (
                      <Text style={{ color: colors.dimInk }}>
                        {item.quantity}×{" "}
                      </Text>
                    )}
                    {item.name}
                  </Text>
                  {otherNames.length > 0 && (
                    <Text
                      style={{
                        color: colors.dimInk,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      also {otherNames.join(", ")}
                    </Text>
                  )}
                </View>
                <Text style={{ color: colors.paper, fontSize: 14 }}>
                  {centsToDisplay(item.priceCents * item.quantity)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Fixed bottom bar */}
      {myTotals && (
        <View style={styles.bottomBar}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.dimInk, fontSize: 11 }}>
                You owe
              </Text>
              <Text
                style={{
                  color: colors.paper,
                  fontSize: 28,
                  fontWeight: "300",
                }}
              >
                {centsToDisplay(myTotals.totalCents)}
              </Text>
              {(myTotals.taxCents > 0 || myTotals.tipCents > 0) && (
                <Text style={{ color: colors.dimInk, fontSize: 10 }}>
                  includes{" "}
                  {centsToDisplay(
                    myTotals.taxCents + myTotals.tipCents,
                  )}{" "}
                  tax + tip
                </Text>
              )}
            </View>
            {payLinks.length > 0 && myTotals.totalCents > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  justifyContent: "flex-end",
                  flex: 1,
                }}
              >
                {payLinks.map((link) => (
                  <Pressable
                    key={link.kind}
                    onPress={() => void openPayLink(link.url)}
                    style={({ pressed }) => ({
                      backgroundColor: colors.accent,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {labelFor(link.kind)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Name gate modal */}
      <Modal
        visible={showNameGate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNameGate(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.ink,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                color: colors.paper,
                fontSize: 24,
                fontWeight: "300",
              }}
            >
              What&apos;s your name?
            </Text>
            <Text
              style={{
                color: colors.mutedInk,
                fontSize: 13,
                marginTop: 6,
              }}
            >
              So {bill.creatorName ?? "the bill creator"} knows who had
              what.
            </Text>
            <TextInput
              autoFocus
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Alex"
              placeholderTextColor="rgba(247,251,249,0.3)"
              style={{
                marginTop: 20,
                backgroundColor: colors.paperDim,
                color: colors.paper,
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderRadius: 12,
                fontSize: 16,
              }}
              onSubmitEditing={submitName}
            />
            <Pressable
              disabled={!nameDraft.trim()}
              onPress={submitName}
              style={({ pressed }) => ({
                marginTop: 16,
                backgroundColor: colors.accent,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: !nameDraft.trim()
                  ? 0.4
                  : pressed
                    ? 0.85
                    : 1,
              })}
            >
              <Text
                style={{
                  color: colors.ink,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                Join bill
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function labelFor(kind: "venmo" | "cashapp" | "zelle"): string {
  switch (kind) {
    case "venmo":
      return "Venmo";
    case "cashapp":
      return "Cash App";
    case "zelle":
      return "Zelle";
  }
}

const styles = {
  eyebrow: {
    color: colors.dimInk,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
  },
  bottomBar: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(11,15,13,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(247,251,249,0.1)",
    padding: 20,
    paddingBottom: 32,
  },
};
