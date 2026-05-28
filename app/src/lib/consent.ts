import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSENT_KEY = "walk-with-me:tracking-consent-v1";

/**
 * Persisted record that the user has read and accepted our tracking
 * disclosure. We version the key so a future material change to the
 * disclosure can re-trigger the screen.
 */
export async function hasTrackingConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONSENT_KEY)) === "true";
}

export async function setTrackingConsent(accepted: boolean): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, accepted ? "true" : "false");
}

export async function clearTrackingConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_KEY);
}
