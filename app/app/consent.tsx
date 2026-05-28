import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setTrackingConsent } from "@/lib/consent";

const PRIVACY_URL =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string) ?? "";

/**
 * Tracking disclosure shown before the OS-level background location prompt.
 *
 * Play Store policy requires that "prominent disclosure" — what we collect
 * and why — appears in the app BEFORE the system permission dialog. The
 * disclosure must mention background access explicitly.
 */
export default function ConsentScreen() {
  async function accept() {
    await setTrackingConsent(true);
    router.back();
  }

  async function decline() {
    await setTrackingConsent(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Helymeghatározás engedélyezése</Text>

        <Text style={styles.p}>
          A Walk With Me a <Text style={styles.b}>háttérben is</Text> követi a
          tartózkodási helyedet, amíg a séta-tracking aktív, hogy ki tudjuk
          számolni, mely utcákat jártad már be.
        </Text>

        <Text style={styles.h2}>Mit gyűjtünk</Text>
        <Text style={styles.li}>• GPS koordinátáid és időbélyeg, kb. 4 mp-enként, amíg tracking-elsz</Text>
        <Text style={styles.li}>• A mozgásod elejéből származó nyers útvonal (Supabase-en titkosított csatornán át tárolva)</Text>
        <Text style={styles.li}>• Az utcánkénti haladásod és achievementjeid</Text>

        <Text style={styles.h2}>Mit nem gyűjtünk</Text>
        <Text style={styles.li}>• Nem követünk, ha nincs aktív séta</Text>
        <Text style={styles.li}>• Nem osztjuk meg az adataidat harmadik féllel</Text>
        <Text style={styles.li}>• Nem használunk reklámazonosítót, fingerprinting-et</Text>

        <Text style={styles.h2}>A jogaid</Text>
        <Text style={styles.li}>• A Profil képernyőről bármikor töröltetheted az összes adatodat (account + sétaelőzmények)</Text>
        <Text style={styles.li}>• Bármikor kikapcsolhatod a tracking-et a térkép gombbal</Text>
        <Text style={styles.li}>• A háttér-helymeghatározást a rendszerbeállításokban is visszavonhatod</Text>

        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.link}>Teljes adatkezelési tájékoztató →</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={decline}>
          <Text style={styles.btnSecondaryText}>Elutasít</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={accept}>
          <Text style={styles.btnPrimaryText}>Elfogadom</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 0 },
  h1: { fontSize: 26, fontWeight: "700", marginBottom: 16 },
  h2: { fontSize: 17, fontWeight: "700", marginTop: 18, marginBottom: 6 },
  p:  { fontSize: 15, color: "#111827", lineHeight: 22 },
  li: { fontSize: 14, color: "#374151", lineHeight: 22, marginLeft: 4 },
  b:  { fontWeight: "700" },
  link: { color: "#3a86ff", marginTop: 18, marginBottom: 24, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  btn: { flex: 1, padding: 14, borderRadius: 8, alignItems: "center" },
  btnPrimary: { backgroundColor: "#3a86ff" },
  btnSecondary: { backgroundColor: "#f3f4f6" },
  btnPrimaryText: { color: "white", fontWeight: "700" },
  btnSecondaryText: { color: "#374151", fontWeight: "600" },
});
