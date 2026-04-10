// Utility to wrap database operations with timeout to prevent hanging
import { logger } from "./logger";

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 6000, // 6 second default timeout
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
  timeoutMs: number = 6000, // 6 second timeout for database queries
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

// Creates an AbortController for AI calls.
// No auto-timeout — the user cancels manually via the overlay's Cancel button.
export function createAIAbortController(): AbortController {
  return new AbortController();
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
  timeoutMs: number = 10000 // 10 second timeout for auth operations (mobile can be slow)
): Promise<T> {
  return withTimeout(
    authOperation,
    timeoutMs,
    "Authentication operation timed out"
  );
}

