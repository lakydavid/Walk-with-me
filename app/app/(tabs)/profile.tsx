import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.email}>{email}</Text>
      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Kijelentkezés</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  email: { fontSize: 16, color: "#374151", marginBottom: 24 },
  signOut: {
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: { color: "white", fontWeight: "600" },
});
