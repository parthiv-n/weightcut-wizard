// Mid-session wedge recovery. When the Supabase JS client's internal auth
// mutex gets stuck (stale websocket, in-flight refresh never resolves, iOS
// backgrounding etc.), every subsequent REST query queues behind it and
// eventually hits our 6-12s timeout wrappers. Cycling realtime + forcing a
// bounded refreshSession breaks the mutex without a full page reload.
//
// Callers: invoke `recoverSupabaseConnection("caller-name")` from any query
// timeout path. Debounced so a burst of timeouts only triggers one recovery.

import { supabase } from "@/integrations/supabase/client";
import { logger } from "./logger";

const RECOVERY_DEBOUNCE_MS = 15_000;
const REFRESH_TIMEOUT_MS = 4_000;

let lastRecoveryAt = 0;
let inFlight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Status broadcast
// ---------------------------------------------------------------------------
// Lightweight subscriber pattern so UI can render a "Reconnecting…" banner
// while a recovery is running, without coupling to React internals here.
// `recovering` is true from the moment a wedge is detected until the
// disconnect/refresh/reconnect cycle finishes.

export type ConnectionStatus = "ok" | "recovering";

const statusListeners = new Set<(s: ConnectionStatus) => void>();
let currentStatus: ConnectionStatus = "ok";

function setStatus(next: ConnectionStatus): void {
  if (next === currentStatus) return;
  currentStatus = next;
  for (const fn of statusListeners) {
    try {
      fn(next);
    } catch {
      // Listener errors must not break recovery.
    }
  }
}

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus;
}

export function subscribeConnectionStatus(
  listener: (s: ConnectionStatus) => void
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Attempt to unstick a wedged Supabase client. Idempotent and debounced —
 * safe to call liberally from every timeout handler. Returns the in-flight
 * recovery promise if one is already running.
 */
export function recoverSupabaseConnection(reason: string): Promise<void> {
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now - lastRecoveryAt < RECOVERY_DEBOUNCE_MS) {
    return Promise.resolve();
  }
  lastRecoveryAt = now;

  logger.warn("Supabase wedge detected — recovering", { reason });
  setStatus("recovering");

  inFlight = (async () => {
    let refreshOk = false;
    try {
      // 1. Disconnect realtime so the wedged auth mutex isn't holding a
      //    promise tied to the dead socket. This alone usually unblocks
      //    the next REST call.
      try {
        supabase.realtime.disconnect();
      } catch (e) {
        logger.warn("recoverSupabaseConnection: disconnect failed", { e: String(e) });
      }

      // 2. Try a bounded refreshSession. If the client is healthy this is
      //    the cheapest path back to a fresh JWT.
      try {
        await withHardTimeout(
          supabase.auth.refreshSession(),
          REFRESH_TIMEOUT_MS,
          "refreshSession"
        );
        refreshOk = true;
      } catch (e) {
        // Do NOT escalate to signOut on refresh failure — the persisted
        // session is still valid for the next attempt and signing the user
        // out for a transient network blip caused random mid-session
        // logouts. Just log and let the caller retry. The realtime cycle
        // below + the next REST attempt will recover the mutex.
        logger.warn("recoverSupabaseConnection: refreshSession failed (will retry on next request)", { e: String(e) });
      }

      // 3. Reconnect realtime so subsequent calls don't queue behind a
      //    dead socket. Reconnect happens regardless of refresh outcome.
      try {
        supabase.realtime.connect();
      } catch (e) {
        logger.warn("recoverSupabaseConnection: connect failed", { e: String(e) });
      }
    } finally {
      inFlight = null;
      // If the recovery itself failed, allow another attempt before the
      // debounce window expires — otherwise we'd be locked out for 15s
      // even though the user is staring at a wedged screen.
      if (!refreshOk) lastRecoveryAt = 0;
      setStatus("ok");
    }
  })();

  return inFlight;
}

/** Reset the debounce — used in tests or on fresh login. */
export function resetRecoveryDebounce(): void {
  lastRecoveryAt = 0;
  inFlight = null;
  setStatus("ok");
}
