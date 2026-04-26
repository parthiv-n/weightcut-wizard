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
    let refreshOk = false;
    try {
      // 1. Disconnect realtime so the wedged auth mutex isn't holding a
      //    promise tied to the dead socket.
      try {
        supabase.realtime.disconnect();
      } catch (e) {
        logger.warn("recoverSupabaseConnection: disconnect failed", { e: String(e) });
      }

      // 2. Try a bounded refreshSession FIRST. If the client is healthy this
      //    is the cheapest path back to a fresh JWT.
      try {
        await withHardTimeout(
          supabase.auth.refreshSession(),
          REFRESH_TIMEOUT_MS,
          "refreshSession"
        );
        refreshOk = true;
      } catch (e) {
        logger.warn("recoverSupabaseConnection: refreshSession failed — escalating", { e: String(e) });
      }

      // 3. If refresh failed the auth mutex is genuinely deadlocked.
      //    `signOut({ scope: 'local' })` clears the in-memory session and
      //    drops the stuck promise, then we re-read from persisted storage
      //    via getSession() which the caller's onAuthStateChange listener
      //    will pick up as INITIAL_SESSION/TOKEN_REFRESHED.
      if (!refreshOk) {
        try {
          await withHardTimeout(
            supabase.auth.signOut({ scope: "local" }),
            REFRESH_TIMEOUT_MS,
            "local signOut"
          );
        } catch (e) {
          logger.warn("recoverSupabaseConnection: local signOut failed", { e: String(e) });
        }
        // Brief breathing room before re-reading.
        await new Promise((r) => setTimeout(r, 200));
        try {
          await withHardTimeout(
            supabase.auth.getSession(),
            REFRESH_TIMEOUT_MS,
            "post-reset getSession"
          );
        } catch (e) {
          logger.warn("recoverSupabaseConnection: post-reset getSession failed", { e: String(e) });
        }
      }

      // 4. Reconnect realtime once auth is unstuck.
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
    }
  })();

  return inFlight;
}

/** Reset the debounce — used in tests or on fresh login. */
export function resetRecoveryDebounce(): void {
  lastRecoveryAt = 0;
  inFlight = null;
}
