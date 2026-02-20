/**
 * Retries an async operation with exponential-ish delay.
 * Use for first DB fetch after login to handle flaky network on cold start.
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.debug(`[retry] Attempt ${attempt + 1}/${retries + 1} failed`, error);

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
