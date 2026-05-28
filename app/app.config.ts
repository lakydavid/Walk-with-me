import type { ExpoConfig } from "expo/config";

/**
 * Dynamic config. We read sensitive values from EXPO_PUBLIC_* env vars so we
 * never commit them. Locally: copy app/.env.example to app/.env and fill in.
 * In CI / EAS: define them as EAS secrets.
 *
 * The Supabase anon key is technically safe to ship in a public binary
 * (Row Level Security enforces all access), but we keep it out of git so a
 * leaked dev project key can't bleed into a prod build.
 */
export default (): ExpoConfig => ({
  name: "Walk With Me",
  slug: "walk-with-me",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "walkwithme",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.lakydavid.walkwithme",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Bejárt utcáid követéséhez engedélyezd a helymeghatározást.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Háttérben is követjük a sétáidat, hogy ne kelljen nyitva tartanod az appot.",
      UIBackgroundModes: ["location", "fetch"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.lakydavid.walkwithme",
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
    // Note: targetSdkVersion is set automatically by Expo SDK 52 (= 35).
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? "",
      },
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Háttérben is követjük a sétáidat.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    privacyPolicyUrl:
      process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
      "https://lakydavid.github.io/Walk-with-me/privacy",
  },
});
