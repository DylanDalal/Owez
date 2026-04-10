import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/format";

/**
 * Home screen — mirrors the web's SignInGate visual style but uses the
 * landing-page hero copy. Tapping either auth button signs in anonymously
 * for now (real Google / Apple sign-in requires native OAuth config via
 * expo-auth-session that isn't wired up yet) and navigates to /new.
 */
export default function HomeScreen() {
  const { ensureSignedIn } = useAuth();
  const router = useRouter();

  async function continueWithAuth() {
    await ensureSignedIn();
    router.push("/new");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          padding: 24,
          paddingTop: 48,
        }}
      >
        {/* Logo */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: "#053A24",
            }}
          />
          <Text
            style={{
              color: colors.paper,
              fontSize: 18,
              fontWeight: "700",
              fontFamily: "Menlo",
              letterSpacing: -0.5,
            }}
          >
            Owez
          </Text>
        </View>

        {/* Hero copy */}
        <View style={{ marginTop: 48, flex: 1 }}>
          <Text
            style={{
              color: colors.paper,
              fontSize: 48,
              fontWeight: "700",
              fontFamily: "Menlo",
              lineHeight: 50,
              letterSpacing: -1.5,
            }}
          >
            Who Still{"\n"}Owez You?
          </Text>
          <Text
            style={{
              color: "rgba(247,251,249,0.6)",
              fontSize: 16,
              marginTop: 20,
              lineHeight: 24,
              maxWidth: 320,
            }}
          >
            Upload your receipt. Send one link. Your friends pick their stuff
            and pay you back. They don't need the app. They don't even need
            to sign up.
          </Text>
        </View>

        {/* Auth buttons */}
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => void continueWithAuth()}
            style={({ pressed }) => ({
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1,
              borderColor: "#053A24",
            })}
          >
            <GoogleMark />
            <Text
              style={{ color: "#053A24", fontSize: 16, fontWeight: "600" }}
            >
              Continue with Google
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void continueWithAuth()}
            style={({ pressed }) => ({
              backgroundColor: "rgba(247,251,249,0.06)",
              borderRadius: 12,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1,
              borderColor: "rgba(247,251,249,0.1)",
            })}
          >
            <AppleMark />
            <Text
              style={{ color: colors.paper, fontSize: 16, fontWeight: "600" }}
            >
              Continue with Apple
            </Text>
          </Pressable>

          <Text
            style={{
              color: "rgba(247,251,249,0.35)",
              fontSize: 11,
              textAlign: "center",
              marginTop: 4,
              lineHeight: 16,
            }}
          >
            By continuing you agree to the Terms and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function GoogleMark() {
  return (
    <Text style={{ fontSize: 14 }}>G</Text>
  );
}

function AppleMark() {
  return (
    <Text style={{ fontSize: 16, color: colors.paper, marginTop: -2 }}></Text>
  );
}
