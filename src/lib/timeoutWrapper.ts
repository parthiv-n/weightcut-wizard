// Utility to wrap database operations with timeout to prevent hanging
import { logger } from "./logger";

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000, // 10 second default timeout
  timeoutMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

// Specific wrapper for Supabase queries
export function withSupabaseTimeout<T>(
  supabaseQuery: PromiseLike<T>,
  timeoutMs: number = 8000, // 8 second timeout for database queries (increased for mobile stability)
  operation: string = "Database query"
): Promise<T> {
  return withTimeout(
    Promise.resolve(supabaseQuery),
    timeoutMs,
    `${operation} timed out after ${timeoutMs}ms`
  );
}

// Generic retry wrapper — takes a factory so each attempt issues a fresh query
export function withRetry<T>(
  factory: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 500
): Promise<T> {
  return factory().catch(async (err) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`withRetry: attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms`, { error: err?.message ?? err });
      await new Promise((r) => setTimeout(r, delay));
      try {
        return await factory();
      } catch (retryErr) {
        if (attempt === maxRetries) throw retryErr;
      }
    }
    throw err; // unreachable, satisfies TS
  });
}

// Creates an AbortController with a hard timeout safety net for AI calls.
// The overlay's 20s stuck detection provides the soft timeout UX;
// this hard timeout (default 30s) is the safety net.
export function createAIAbortController(hardTimeoutMs: number = 30000): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardTimeoutMs);

  const cleanup = () => clearTimeout(timer);

  // If the user (or anything else) aborts early, clear the timeout
  controller.signal.addEventListener("abort", cleanup, { once: true });

  return { controller, cleanup };
}

// Extracts the real error message from a Supabase FunctionsHttpError.
// When an edge function returns a non-2xx status, the Supabase client wraps it
// in FunctionsHttpError with a generic message. The actual error is in the
// Response body (error.context), which we read here.
export async function extractEdgeFunctionError(error: any, fallback = "Something went wrong"): Promise<string> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // body already consumed or not JSON — fall through
  }
  return error?.message || fallback;
}

// Wrapper for authentication operations
export function withAuthTimeout<T>(
  authOperation: Promise<T>,
  timeoutMs: number = 10000 // 10 second timeout for auth, increased for mobile stability
): Promise<T> {
  return withTimeout(
    authOperation,
    timeoutMs,
    "Authentication operation timed out"
  );
}

