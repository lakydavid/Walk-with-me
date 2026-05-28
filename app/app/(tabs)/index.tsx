import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Polyline, PROVIDER_DEFAULT, Region } from "react-native-maps";
import { fetchStreetsInBbox, type StreetFeature } from "@/lib/streets";
import { isTracking, startTracking, stopTracking } from "@/lib/tracking";

// Budapest centre.
const INITIAL_REGION: Region = {
  latitude: 47.4979,
  longitude: 19.0402,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Tints (gray → yellow → green) for unwalked → partial → completed.
function streetColor(s: StreetFeature): string {
  if (s.completed) return "#22c55e";
  if (s.coverage > 0) return "#eab308";
  return "#9ca3af";
}

export default function MapScreen() {
  const [streets, setStreets] = useState<StreetFeature[]>([]);
  const [tracking, setTracking] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    isTracking().then(setTracking);
  }, []);

  const onRegionChangeComplete = useCallback(async (region: Region) => {
    const minLng = region.longitude - region.longitudeDelta / 2;
    const maxLng = region.longitude + region.longitudeDelta / 2;
    const minLat = region.latitude  - region.latitudeDelta  / 2;
    const maxLat = region.latitude  + region.latitudeDelta  / 2;
    // Avoid hammering the API when zoomed too far out.
    if (region.latitudeDelta > 0.2) {
      setStreets([]);
      return;
    }
    try {
      const data = await fetchStreetsInBbox(minLng, minLat, maxLng, maxLat);
      setStreets(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  async function toggleTracking() {
    try {
      if (tracking) {
        await stopTracking();
        setTracking(false);
      } else {
        await startTracking();
        setTracking(true);
      }
    } catch (e) {
      Alert.alert("Tracking hiba", (e as Error).message);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton
      >
        {streets.map((s) => (
          <Polyline
            key={s.id}
            coordinates={s.geom.coordinates.map(([lng, lat]) => ({
              latitude: lat,
              longitude: lng,
            }))}
            strokeColor={streetColor(s)}
            strokeWidth={4}
          />
        ))}
      </MapView>

      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          style={[styles.trackButton, tracking && styles.trackButtonActive]}
          onPress={toggleTracking}
        >
          <Text style={styles.trackText}>
            {tracking ? "Séta vége" : "Indítsd a sétát"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  trackButton: {
    backgroundColor: "#3a86ff",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  trackButtonActive: { backgroundColor: "#ef4444" },
  trackText: { color: "white", fontWeight: "700", fontSize: 16 },
});
