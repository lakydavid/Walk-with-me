import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function sendLink() {
    if (!email.includes("@")) {
      Alert.alert("Adj meg egy érvényes email címet.");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: "walkwithme://auth" },
    });
    setSending(false);
    if (error) {
      Alert.alert("Hiba", error.message);
    } else {
      Alert.alert("Küldtem egy belépési linket az emailedre.");
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Walk With Me</Text>
      <Text style={styles.subtitle}>
        Sétálj végig minden utcán. Teljesítsd kerületenként.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="email@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Pressable
        style={[styles.button, sending && { opacity: 0.6 }]}
        disabled={sending}
        onPress={sendLink}
      >
        <Text style={styles.buttonText}>
          {sending ? "Küldés…" : "Küldj egy belépési linket"}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#3a86ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
