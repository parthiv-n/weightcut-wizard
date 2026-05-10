// Generic timeout / abort helpers.
//
// The Supabase-flavoured variants (withSupabaseTimeout, withAuthTimeout,
// withRetry, extractEdgeFunctionError) are now thin pass-throughs — Convex's
// client retries on its own and ctx-bound mutations return errors
// synchronously, but legacy callers across the codebase still import them.
// Keeping them as `withTimeout` proxies / no-ops lets the migration land in
// one PR without rippling through every file.

import { logger } from "./logger";

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 6000,
  timeoutMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Create an AbortSignal that auto-aborts after `timeoutMs` AND a paired
 * promise that rejects with the timeout error. Use this for `fetch` calls so
 * the underlying network request is actually cancelled on timeout.
 */
export function abortableFetch<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operation = "Network request"
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return run(controller.signal)
    .catch((err) => {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        throw new Error(`${operation} timed out after ${timeoutMs}ms`);
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

/**
 * @deprecated Convex queries do not need a timeout wrapper. Kept as a
 * pass-through with the legacy signature so unmigrated callers compile.
 */
export function withSupabaseTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number = 6000,
  operation: string = "Database query"
): Promise<T> {
  return withTimeout(Promise.resolve(promise), timeoutMs, `${operation} timed out after ${timeoutMs}ms`);
}

/**
 * @deprecated Convex's client handles retries. Kept as a single-shot
 * passthrough that ignores `maxRetries` / `baseDelayMs`.
 */
export function withRetry<T>(
  factory: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 500,
): Promise<T> {
  return factory().catch(async (err) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.debug(`withRetry: attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms`, { error: err?.message ?? err });
      await new Promise((r) => setTimeout(r, delay));
      try {
        return await factory();
      } catch (retryErr) {
        if (attempt === maxRetries) throw retryErr;
      }
    }
    throw err;
  });
}

/**
 * @deprecated Convex actions throw `Error` with `.message` directly. Kept as
 * a thin shim that surfaces `error.message` (or the fallback) so legacy
 * callers compile.
 */
export async function extractEdgeFunctionError(
  error: any,
  fallback = "Something went wrong",
): Promise<string> {
  if (typeof error?.message === "string" && error.message.length > 0) return error.message;
  return fallback;
}

/** @deprecated Convex Auth bootstraps via WebSocket — no auth timeout needed. */
export function withAuthTimeout<T>(
  authOperation: Promise<T>,
  timeoutMs: number = 15000,
): Promise<T> {
  return withTimeout(authOperation, timeoutMs, "Authentication operation timed out");
}

/** AbortController for user-cancellable AI calls (no auto-timeout). */
export function createAIAbortController(): AbortController {
  return new AbortController();
}
