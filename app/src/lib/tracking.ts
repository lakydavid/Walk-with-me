/**
 * Background location tracking.
 *
 * We use Expo's TaskManager to receive location updates while the app is in
 * the background. Each batch of points is buffered locally; the buffer is
 * flushed to Supabase via the `ingest_walk` RPC every FLUSH_INTERVAL_MS or
 * when MAX_BUFFER points accumulate.
 *
 * Why a buffer instead of one-call-per-point:
 *   - Saves battery and bandwidth.
 *   - Keeps the server-side map matching cheap by processing runs of points.
 *   - Survives short network drops (buffer lives in AsyncStorage).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const TRACKING_TASK = "walk-with-me-tracking";
const BUFFER_KEY = "walk-with-me:point-buffer";
const SESSION_KEY = "walk-with-me:session-id";
const MAX_BUFFER = 60;
const FLUSH_INTERVAL_MS = 30_000;

export type Point = { lat: number; lng: number; ts: string };

async function loadBuffer(): Promise<Point[]> {
  const s = await AsyncStorage.getItem(BUFFER_KEY);
  return s ? JSON.parse(s) : [];
}

async function saveBuffer(b: Point[]): Promise<void> {
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(b));
}

async function getOrCreateSessionId(): Promise<string> {
  let id = await AsyncStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    await AsyncStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function endSession(): Promise<void> {
  await flushBuffer(true);
  await AsyncStorage.removeItem(SESSION_KEY);
}

let lastFlushAt = 0;

async function flushBuffer(force: boolean): Promise<void> {
  const buf = await loadBuffer();
  if (buf.length === 0) return;
  const now = Date.now();
  if (!force && buf.length < MAX_BUFFER && now - lastFlushAt < FLUSH_INTERVAL_MS) {
    return;
  }
  const sessionId = await getOrCreateSessionId();
  const { error } = await supabase.rpc("ingest_walk", {
    p_session_id: sessionId,
    p_points: buf,
  });
  if (error) {
    // Leave the buffer in place; we'll retry on the next location update.
    console.warn("ingest_walk failed:", error.message);
    return;
  }
  await saveBuffer([]);
  lastFlushAt = now;
}

TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("Tracking task error:", error.message);
    return;
  }
  const { locations } = (data ?? {}) as { locations: Location.LocationObject[] };
  if (!locations?.length) return;
  const buf = await loadBuffer();
  for (const loc of locations) {
    buf.push({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      ts: new Date(loc.timestamp).toISOString(),
    });
  }
  await saveBuffer(buf);
  await flushBuffer(false);
});

export async function startTracking(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("Foreground location permission denied");
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    throw new Error("Background location permission denied");
  }
  const isRunning = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 5,           // meters
    timeInterval: 4000,            // ms; Android only
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Walk With Me",
      notificationBody: "A sétádat követjük…",
      notificationColor: "#3a86ff",
    },
    pausesUpdatesAutomatically: false,
  });
}

export async function stopTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
  await endSession();
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TRACKING_TASK);
}
