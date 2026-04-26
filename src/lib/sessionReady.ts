// Session-readiness gate.
//
// The Supabase JS client emits `INITIAL_SESSION` once on boot, after which the
// in-memory session is authoritative. Any code that fires a request *before*
// that event lands races with the client's auth bootstrap — on cold iOS
// Capacitor launches this routinely produces 401s on edge-function calls
// because the JWT hadn't been hydrated yet.
//
// `ensureSessionReady()` resolves with the current session as soon as the
// client has bootstrapped (or immediately if it already has). Returns `null`
// if no user is signed in, or the timeout fires.
//
// Use it before any edge function call or any query that *must* see a fresh
// JWT — typically the AI invocations (`fight-week-analysis`, `meal-planner`,
// `training-insights`, etc.).

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let cachedSession: Session | null | undefined; // undefined = not yet bootstrapped
let waiters: Array<(s: Session | null) => void> = [];

// Subscribe once at module load. The Supabase client emits INITIAL_SESSION
// immediately after construction (synchronously fires the listener with the
// persisted session, if any).
const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    cachedSession = session ?? null;
    // Drain any waiters that were queued before bootstrap completed.
    const drained = waiters;
    waiters = [];
    for (const w of drained) w(cachedSession);
  } else if (event === "SIGNED_OUT") {
    cachedSession = null;
    const drained = waiters;
    waiters = [];
    for (const w of drained) w(null);
  }
});

// Best-effort cleanup if the module is HMR-replaced in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => authSub?.subscription?.unsubscribe?.());
}

/**
 * Resolve when the auth client has bootstrapped (INITIAL_SESSION fired). If
 * the session is already known, returns immediately. On timeout, returns
 * `null` and the caller can degrade gracefully (e.g. show a cached fallback
 * instead of attempting a likely-401 fetch).
 */
export function ensureSessionReady(timeoutMs = 8000): Promise<Session | null> {
  if (cachedSession !== undefined) return Promise.resolve(cachedSession);

  return new Promise<Session | null>((resolve) => {
    const onReady = (s: Session | null) => {
      clearTimeout(timer);
      resolve(s);
    };
    const timer = setTimeout(() => {
      // Remove this waiter so it doesn't fire twice.
      waiters = waiters.filter((w) => w !== onReady);
      // Fall back to whatever supabase.auth.getSession() reports — if even
      // that hangs, the caller has bigger problems.
      supabase.auth.getSession().then(
        ({ data }) => resolve(data.session ?? null),
        () => resolve(null)
      );
    }, timeoutMs);
    waiters.push(onReady);
  });
}

/** Lightweight check: do we have a non-expired JWT in memory right now? */
export function hasFreshAccessToken(): boolean {
  if (!cachedSession?.access_token) return false;
  if (!cachedSession.expires_at) return true;
  // Treat anything within 60s of expiry as not fresh.
  return cachedSession.expires_at * 1000 - Date.now() > 60_000;
}
