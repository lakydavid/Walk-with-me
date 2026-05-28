import Constants from "expo-constants";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearTrackingConsent } from "@/lib/consent";
import { supabase } from "@/lib/supabase";
import { stopTracking } from "@/lib/tracking";

const PRIVACY_URL =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string) ?? "";

export default function ProfileScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await stopTracking();
    await supabase.auth.signOut();
  }

  /**
   * In-app account deletion, required by Play Store. We use a two-step
   * confirmation (initial press → typed confirmation) so a fat-finger tap
   * can't nuke months of progress. After the RPC returns we sign out and
   * the auth listener bounces the user back to the sign-in screen.
   */
  function confirmDelete() {
    Alert.alert(
      "Biztosan törlöd a fiókodat?",
      "Ez véglegesen eltávolítja az összes bejárt utcádat, sétaelőzményedet és " +
        "achievementedet. A művelet nem visszavonható.",
      [
        { text: "Mégse", style: "cancel" },
        {
          text: "Tovább",
          style: "destructive",
          onPress: () =>
            Alert.prompt(
              "Megerősítés",
              'Írd be: "TÖRLÖM" a fiókod végleges törléséhez.',
              async (input) => {
                if (input?.trim().toUpperCase() !== "TÖRLÖM") {
                  Alert.alert("Mégse", "Megerősítés nem egyezik. A fiók nem lett törölve.");
                  return;
                }
                await deleteAccount();
              },
            ),
        },
      ],
    );
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      await stopTracking();
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await clearTrackingConsent();
      await supabase.auth.signOut();
    } catch (e) {
      Alert.alert("Hiba", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.email}>{email}</Text>

      <View style={styles.section}>
        <Link href="/consent" style={styles.linkRow}>
          Adatvédelmi beállítások felülvizsgálata
        </Link>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.linkRow}>Adatkezelési tájékoztató</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.btn, styles.signOut]} onPress={signOut} disabled={busy}>
        <Text style={styles.btnText}>Kijelentkezés</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.danger, busy && { opacity: 0.5 }]}
        onPress={confirmDelete}
        disabled={busy}
      >
        <Text style={styles.btnText}>{busy ? "Törlés…" : "Fiók törlése"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title:    { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  email:    { fontSize: 16, color: "#374151", marginBottom: 24 },
  section:  { marginBottom: 32 },
  linkRow:  { fontSize: 15, color: "#3a86ff", paddingVertical: 12 },
  btn:      { padding: 14, borderRadius: 8, alignItems: "center", marginBottom: 12 },
  btnText:  { color: "white", fontWeight: "600" },
  signOut:  { backgroundColor: "#6b7280" },
  danger:   { backgroundColor: "#dc2626" },
});
