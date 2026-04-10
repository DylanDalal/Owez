import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import type { Bill, BillItem, ParsedReceipt, PaymentMethods } from "@owez/shared";
import { useAuth } from "@/lib/auth";
import { createBill, makeId, newBillId } from "@/lib/bills";
import { centsToDisplay, colors, dollarInputToCents } from "@/lib/format";

/**
 * Mobile create flow — mirrors apps/web/src/app/new/page.tsx. Four stages:
 *   pick → parsing → edit → saving → done.
 *
 * The editor is inline instead of a separate component: it's a one-off
 * screen, the file stays readable at ~500 lines, and lifting state to an
 * extracted editor would mean duplicating state syncing on top.
 */

type Stage =
  | { kind: "pick" }
  | { kind: "parsing" }
  | { kind: "edit"; parsed: ParsedReceipt }
  | { kind: "saving"; parsed: ParsedReceipt }
  | { kind: "done"; billId: string };

export default function NewBillScreen() {
  const { user, ensureSignedIn } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  // Editor state lives at the screen level so the save stage can keep the
  // same values while disabling inputs.
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [taxCents, setTaxCents] = useState(0);
  const [tipCents, setTipCents] = useState(0);
  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [zellePhone, setZellePhone] = useState("");

  const subtotalCents = items.reduce(
    (acc, it) => acc + it.priceCents * it.quantity,
    0,
  );
  const totalCents = subtotalCents + taxCents + tipCents;

  async function pickFromCamera() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission denied");
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]) return;
      void parseReceipt(result.assets[0].uri);
    } catch (e) {
      // iOS simulator has no camera — point the user at the library picker.
      setError(
        e instanceof Error
          ? `${e.message}. Try "Choose from library" instead.`
          : "Camera unavailable — try the library picker.",
      );
    }
  }

  async function pickFromLibrary() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: false,
      mediaTypes: ["images"],
    });
    if (result.canceled || !result.assets[0]) return;
    void parseReceipt(result.assets[0].uri);
  }

  async function parseReceipt(uri: string) {
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!apiBase) {
      setError("EXPO_PUBLIC_API_BASE_URL not set");
      return;
    }
    setStage({ kind: "parsing" });
    try {
      const fd = new FormData();
      // @ts-expect-error — RN's FormData accepts this shape
      fd.append("receipt", { uri, name: "receipt.jpg", type: "image/jpeg" });
      const res = await fetch(`${apiBase}/api/parse-receipt`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const parsed = (await res.json()) as ParsedReceipt;

      // Seed editor state with parsed values.
      setTitle(parsed.merchant ?? "");
      setItems(
        parsed.items.map((it) => ({
          id: makeId(),
          name: it.name,
          priceCents: it.priceCents,
          quantity: it.quantity || 1,
        })),
      );
      setTaxCents(parsed.taxCents);
      setTipCents(parsed.tipCents);
      setStage({ kind: "edit", parsed });
    } catch (e) {
      setStage({ kind: "pick" });
      setError(e instanceof Error ? e.message : "Failed to read receipt");
    }
  }

  async function handleSave() {
    if (stage.kind !== "edit") return;
    if (!creatorName.trim()) {
      Alert.alert("Your name is required", "So friends know who to pay.");
      return;
    }
    if (!venmo.trim() && !cashapp.trim() && !zellePhone.trim()) {
      Alert.alert(
        "Add a payment method",
        "Enter Venmo, Cash App, or a Zelle phone number so friends can pay you.",
      );
      return;
    }
    setError(null);
    setStage({ kind: "saving", parsed: stage.parsed });
    try {
      const creator = await ensureSignedIn();
      const billId = newBillId();
      const paymentMethods: PaymentMethods = {};
      if (venmo.trim()) paymentMethods.venmo = venmo.trim();
      if (cashapp.trim()) paymentMethods.cashapp = cashapp.trim();
      if (zellePhone.trim()) paymentMethods.zellePhone = zellePhone.trim();

      const bill: Bill = {
        id: billId,
        creatorId: creator.uid,
        creatorName: creatorName.trim(),
        createdAt: Date.now(),
        items,
        subtotalCents,
        taxCents,
        tipCents,
        totalCents,
        paymentMethods,
      };
      if (title.trim()) bill.title = title.trim();

      await createBill(bill);
      setStage({ kind: "done", billId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save bill");
      setStage({ kind: "edit", parsed: stage.parsed });
    }
  }

  function updateItem(id: string, patch: Partial<BillItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: makeId(), name: "", priceCents: 0, quantity: 1 },
    ]);
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function setTipPercent(pct: number) {
    setTipCents(Math.round((subtotalCents * pct) / 100));
  }

  // ----- Render -----
  if (stage.kind === "done") {
    return <DoneScreen billId={stage.billId} onNew={() => router.replace("/new")} />;
  }

  if (stage.kind === "pick" || stage.kind === "parsing") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text style={{ color: colors.paper, fontSize: 36, fontWeight: "300" }}>
            New bill
          </Text>
          {stage.kind === "parsing" ? (
            <View
              style={{
                marginTop: 32,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: "rgba(247,251,249,0.2)",
                borderRadius: 16,
                padding: 40,
                alignItems: "center",
              }}
            >
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.mutedInk, marginTop: 12 }}>
                Reading receipt…
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 32, gap: 12 }}>
              <Pressable
                onPress={pickFromCamera}
                style={({ pressed }) => ({
                  backgroundColor: colors.accent,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>
                  Take a photo
                </Text>
              </Pressable>
              <Pressable
                onPress={pickFromLibrary}
                style={({ pressed }) => ({
                  backgroundColor: colors.paperDim,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: colors.mutedInk, fontSize: 15 }}>
                  Choose from library
                </Text>
              </Pressable>
              <Text style={{ color: colors.dimInk, fontSize: 11, textAlign: "center" }}>
                On the iOS simulator, use the library picker — there&apos;s no
                camera. Drop a receipt image into the sim window first.
              </Text>
            </View>
          )}
          {error && (
            <Text style={{ color: colors.danger, marginTop: 16 }}>{error}</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // stage.kind === "edit" | "saving"
  const saving = stage.kind === "saving";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: colors.paper, fontSize: 32, fontWeight: "300" }}>
          Edit bill
        </Text>

        {/* Title + name */}
        <Field label="Bill name" value={title} onChangeText={setTitle} placeholder="Dinner at Nobu" />
        <Field
          label="Your name (shown to friends)"
          value={creatorName}
          onChangeText={setCreatorName}
          placeholder="Dylan"
        />

        {/* Items */}
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.sectionLabel}>Items</Text>
            <Pressable onPress={addItem}>
              <Text style={{ color: colors.accent, fontSize: 12 }}>+ Add item</Text>
            </Pressable>
          </View>
          <View style={{ backgroundColor: colors.paperDim, borderRadius: 16 }}>
            {items.map((item, idx) => (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  borderBottomWidth: idx === items.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(247,251,249,0.1)",
                }}
              >
                <TextInput
                  style={{ flex: 1, color: colors.paper, fontSize: 14 }}
                  value={item.name}
                  onChangeText={(t) => updateItem(item.id, { name: t })}
                  placeholder="Item"
                  placeholderTextColor="rgba(247,251,249,0.3)"
                />
                <TextInput
                  style={styles.numInput}
                  value={String(item.quantity)}
                  onChangeText={(t) =>
                    updateItem(item.id, { quantity: Math.max(1, Number(t) || 1) })
                  }
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.numInput, { width: 72, textAlign: "right" }]}
                  value={(item.priceCents / 100).toFixed(2)}
                  onChangeText={(t) =>
                    updateItem(item.id, { priceCents: dollarInputToCents(t) })
                  }
                  keyboardType="decimal-pad"
                />
                <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
                  <Text style={{ color: colors.dimInk, fontSize: 20 }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {/* Totals */}
        <View style={{ marginTop: 24, backgroundColor: colors.paperDim, borderRadius: 16, padding: 16 }}>
          <TotalRow label="Subtotal" value={centsToDisplay(subtotalCents)} />
          <AmountRow label="Tax" cents={taxCents} onChange={setTaxCents} />
          <AmountRow label="Tip" cents={tipCents} onChange={setTipCents} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            {[15, 18, 20].map((pct) => (
              <Pressable
                key={pct}
                onPress={() => setTipPercent(pct)}
                style={{
                  backgroundColor: "rgba(247,251,249,0.08)",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 100,
                }}
              >
                <Text style={{ color: colors.mutedInk, fontSize: 11 }}>{pct}%</Text>
              </Pressable>
            ))}
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(247,251,249,0.1)",
            }}
          >
            <Text style={{ color: colors.paper, fontSize: 16, fontWeight: "600" }}>Total</Text>
            <Text style={{ color: colors.paper, fontSize: 16, fontWeight: "600" }}>
              {centsToDisplay(totalCents)}
            </Text>
          </View>
        </View>

        {/* Payment methods */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>How friends pay you</Text>
        <Field label="Venmo" value={venmo} onChangeText={setVenmo} placeholder="@dylan" />
        <Field label="Cash App" value={cashapp} onChangeText={setCashapp} placeholder="$dylan" />
        <Field label="Zelle phone" value={zellePhone} onChangeText={setZellePhone} placeholder="+14155551234" />

        <Pressable
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => ({
            marginTop: 24,
            backgroundColor: colors.accent,
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: "center",
            opacity: saving ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          {saving ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>
              Create share link
            </Text>
          )}
        </Pressable>

        {error && <Text style={{ color: colors.danger, marginTop: 16 }}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------ sub-components ------------ */

function DoneScreen({ billId, onNew }: { billId: string; onNew: () => void }) {
  const shareUrl = `${process.env.EXPO_PUBLIC_WEB_ORIGIN ?? "https://owez.me"}/${billId}`;

  async function copy() {
    await Clipboard.setStringAsync(shareUrl);
    Alert.alert("Copied", "Share link copied to clipboard.");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.paper, fontSize: 32, fontWeight: "300" }}>
          Ready to share
        </Text>
        <Text style={{ color: colors.mutedInk, marginTop: 12, fontSize: 14 }}>
          Send this link to your friends. They&apos;ll pick what they had and pay you
          back with one tap.
        </Text>
        <View style={{ marginTop: 24, backgroundColor: colors.paperDim, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.paper, fontSize: 13 }}>{shareUrl}</Text>
        </View>
        <Pressable
          onPress={copy}
          style={({ pressed }) => ({
            marginTop: 16,
            backgroundColor: colors.accent,
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>
            Copy link
          </Text>
        </Pressable>
        <Pressable
          onPress={onNew}
          style={{
            marginTop: 8,
            backgroundColor: colors.paperDim,
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.mutedInk, fontSize: 14 }}>Snap another</Text>
        </Pressable>
      </View>
    </SafeAreaView>
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
    <View style={{ marginTop: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(247,251,249,0.3)"
        style={{
          marginTop: 6,
          backgroundColor: colors.paperDim,
          color: colors.paper,
          paddingHorizontal: 14,
          paddingVertical: 14,
          borderRadius: 12,
          fontSize: 15,
        }}
      />
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.mutedInk, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.paper, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

function AmountRow({
  label,
  cents,
  onChange,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: colors.mutedInk, fontSize: 14 }}>{label}</Text>
      <TextInput
        style={{
          width: 80,
          color: colors.paper,
          fontSize: 14,
          textAlign: "right",
          backgroundColor: "rgba(247,251,249,0.08)",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        }}
        value={(cents / 100).toFixed(2)}
        onChangeText={(t) => onChange(dollarInputToCents(t))}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

const styles = {
  sectionLabel: {
    color: colors.dimInk,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  },
  fieldLabel: {
    color: colors.dimInk,
    fontSize: 11,
    fontWeight: "500" as const,
  },
  numInput: {
    color: colors.paper,
    fontSize: 13,
    backgroundColor: "rgba(247,251,249,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 48,
    textAlign: "center" as const,
  },
};
