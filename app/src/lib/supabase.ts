import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};
const url = extra.supabaseUrl as string;
const anonKey = extra.supabaseAnonKey as string;

if (!url || !anonKey || url.startsWith("REPLACE_")) {
  console.warn(
    "Supabase nincs konfigurálva. Töltsd ki az app.json extra.supabaseUrl / supabaseAnonKey mezőit.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
