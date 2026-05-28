import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};
const url = extra.supabaseUrl as string;
const anonKey = extra.supabaseAnonKey as string;

if (!url || !anonKey) {
  console.warn(
    "Supabase nincs konfigurálva. Töltsd ki az app/.env-ben az EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY változókat.",
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
