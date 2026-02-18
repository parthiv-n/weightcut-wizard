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
  supabaseQuery: Promise<T>,
  timeoutMs: number = 8000, // 8 second timeout for database queries
  operation: string = "Database query"
): Promise<T> {
  return withTimeout(
    supabaseQuery,
    timeoutMs,
    `${operation} timed out after ${timeoutMs}ms`
  );
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

