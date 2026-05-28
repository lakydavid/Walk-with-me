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
 *
 * Anti-cheat at the client edge:
 *   - Points reported with `mocked === true` (Android fake-GPS, Xposed) are
 *     dropped before they ever reach the buffer.
 *   - Points whose accuracy is worse than ACCURACY_DROP_M are dropped.
 *   - Points whose timestamp is in the future or far in the past are dropped.
 *   - A speed cap also runs server-side, so this is defence in depth.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const TRACKING_TASK = "walk-with-me-tracking";
const BUFFER_KEY = "walk-with-me:point-buffer";
const SESSION_KEY = "walk-with-me:session-id";
const PENDING_BATCH_KEY = "walk-with-me:pending-batch";
const MAX_BUFFER = 60;
const FLUSH_INTERVAL_MS = 30_000;
const ACCURACY_DROP_M = 30;
const MAX_BUFFER_HARD_CAP = 5000;   // refuse to grow past this — drop oldest

export type Point = { lat: number; lng: number; ts: string };

async function loadBuffer(): Promise<Point[]> {
  const s = await AsyncStorage.getItem(BUFFER_KEY);
  return s ? JSON.parse(s) : [];
}

async function saveBuffer(b: Point[]): Promise<void> {
  // Hard cap so a long offline period can't OOM AsyncStorage.
  const capped = b.length > MAX_BUFFER_HARD_CAP
    ? b.slice(b.length - MAX_BUFFER_HARD_CAP)
    : b;
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(capped));
}

async function getOrCreateSessionId(): Promise<string> {
  let id = await AsyncStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
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
  // Resume an in-flight batch first (network failure on a previous flush).
  const pending = await AsyncStorage.getItem(PENDING_BATCH_KEY);
  if (pending) {
    const { batchId, sessionId, points } = JSON.parse(pending) as {
      batchId: string; sessionId: string; points: Point[];
    };
    const { error } = await supabase.rpc("ingest_walk", {
      p_batch_id: batchId,
      p_session_id: sessionId,
      p_points: points,
    });
    if (error) {
      console.warn("ingest_walk (resume) failed:", error.message);
      return;
    }
    await AsyncStorage.removeItem(PENDING_BATCH_KEY);
  }

  const buf = await loadBuffer();
  if (buf.length === 0) return;
  const now = Date.now();
  if (!force && buf.length < MAX_BUFFER && now - lastFlushAt < FLUSH_INTERVAL_MS) {
    return;
  }
  const sessionId = await getOrCreateSessionId();
  const batchId = uuid();
  // Record the pending batch *before* the RPC; if the network dies we'll
  // retry the exact same batch_id, and the server-side idempotency key
  // makes the retry a no-op if the first attempt actually committed.
  await AsyncStorage.setItem(
    PENDING_BATCH_KEY,
    JSON.stringify({ batchId, sessionId, points: buf }),
  );
  await saveBuffer([]);

  const { error } = await supabase.rpc("ingest_walk", {
    p_batch_id: batchId,
    p_session_id: sessionId,
    p_points: buf,
  });
  if (error) {
    console.warn("ingest_walk failed:", error.message);
    // Leave the pending batch in place; we'll resume on next flush.
    return;
  }
  await AsyncStorage.removeItem(PENDING_BATCH_KEY);
  lastFlushAt = now;
}

function uuid(): string {
  // RFC 4122 v4. expo-crypto provides randomUUID on supported platforms;
  // fall back to a Math.random version for compatibility (still acceptable
  // since the server treats it as an opaque idempotency key).
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isAcceptablePoint(loc: Location.LocationObject): boolean {
  // 1. Reject fake-GPS apps. (Android only; iOS does not surface this.)
  if (loc.mocked) return false;
  // 2. Reject obviously bad fixes.
  if (loc.coords.accuracy != null && loc.coords.accuracy > ACCURACY_DROP_M) return false;
  // 3. Reject timestamps that look tampered.
  const ts = loc.timestamp;
  const now = Date.now();
  if (ts > now + 5 * 60 * 1000) return false;
  if (ts < now - 30 * 24 * 60 * 60 * 1000) return false;
  return true;
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
    if (!isAcceptablePoint(loc)) continue;
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
