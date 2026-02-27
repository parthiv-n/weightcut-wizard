// Utility to wrap database operations with timeout to prevent hanging
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
      console.warn(`withRetry: attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms`, err?.message ?? err);
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

