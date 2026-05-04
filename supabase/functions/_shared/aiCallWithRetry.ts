/**
 * AI call wrapper with Zod validation + retry.
 *
 * Pattern:
 *   1. Caller supplies a thunk `groqRequest()` that returns the parsed JSON
 *      from a Groq response (you do the fetch + parseJSON yourself so this
 *      module stays transport-agnostic and Deno-friendly).
 *   2. We validate against the Zod schema.
 *   3. On failure we re-invoke `groqRequest`. The caller is expected to read
 *      `getLastValidationFeedback()` (or use the `onRetry` callback) to
 *      append the error list to its next prompt.
 *
 * Up to `maxRetries` retries (default 2 → total 3 attempts).
 */
import type { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export interface AICallResult<T> {
  ok: true;
  data: T;
  attempts: number;
}

export interface AICallFailure {
  ok: false;
  errors: string[];
  attempts: number;
}

export interface AICallOptions<T extends z.ZodTypeAny> {
  /** Thunk returning the parsed JSON. Receives the attempt index (0-based)
   *  and the previous attempt's validation errors (empty on first try) so the
   *  caller can re-prompt with the feedback. */
  groqRequest: (attempt: number, previousErrors: string[]) => Promise<unknown>;
  schema: T;
  maxRetries?: number;
  onRetry?: (attempt: number, errors: string[]) => void;
}

/**
 * Format Zod errors into short, actionable strings the LLM can correct.
 */
function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.slice(0, 12).map((e) => {
    const path = e.path.length ? e.path.join(".") : "(root)";
    return `${path}: ${e.message}`;
  });
}

export async function aiCallWithValidation<T extends z.ZodTypeAny>(
  opts: AICallOptions<T>,
): Promise<AICallResult<z.infer<T>> | AICallFailure> {
  const maxRetries = Math.max(0, opts.maxRetries ?? 2);
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let raw: unknown;
    try {
      raw = await opts.groqRequest(attempt, lastErrors);
    } catch (err) {
      lastErrors = [
        `request_error: ${err instanceof Error ? err.message : String(err)}`,
      ];
      if (attempt < maxRetries) {
        opts.onRetry?.(attempt + 1, lastErrors);
        continue;
      }
      return { ok: false, errors: lastErrors, attempts: attempt + 1 };
    }

    const parsed = opts.schema.safeParse(raw);
    if (parsed.success) {
      return { ok: true, data: parsed.data, attempts: attempt + 1 };
    }

    lastErrors = formatZodErrors(parsed.error);
    if (attempt < maxRetries) {
      opts.onRetry?.(attempt + 1, lastErrors);
    }
  }

  return { ok: false, errors: lastErrors, attempts: maxRetries + 1 };
}

/**
 * Helper: build a "your previous JSON had errors" appendix to inject into the
 * next system prompt on retry.
 */
export function buildRetryFeedback(errors: string[]): string {
  if (!errors.length) return "";
  return [
    "",
    "IMPORTANT: Your previous JSON had validation errors:",
    ...errors.map((e) => `  - ${e}`),
    "Return strict JSON that matches the schema exactly. Do not invent fields. Numbers must be within the allowed ranges.",
  ].join("\n");
}
