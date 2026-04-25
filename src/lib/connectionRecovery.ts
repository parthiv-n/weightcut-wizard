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

  inFlight = (async () => {
    try {
      // 1. Force-cycle the realtime websocket so the auth mutex releases.
      try {
        supabase.realtime.disconnect();
      } catch (e) {
        logger.warn("recoverSupabaseConnection: disconnect failed", { e: String(e) });
      }
      try {
        supabase.realtime.connect();
      } catch (e) {
        logger.warn("recoverSupabaseConnection: connect failed", { e: String(e) });
      }

      // 2. Bounded token refresh — if this also hangs we bail and let the
      //    next user action retry. No infinite awaits.
      try {
        await withHardTimeout(
          supabase.auth.refreshSession(),
          REFRESH_TIMEOUT_MS,
          "refreshSession"
        );
      } catch (e) {
        logger.warn("recoverSupabaseConnection: refreshSession failed", { e: String(e) });
      }
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Reset the debounce — used in tests or on fresh login. */
export function resetRecoveryDebounce(): void {
  lastRecoveryAt = 0;
  inFlight = null;
}
