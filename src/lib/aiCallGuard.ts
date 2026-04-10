import { supabase } from "@/integrations/supabase/client";

export interface AICallResult<T = any> {
  data: T | null;
  error: any;
  blocked: boolean;
}

/**
 * Wraps a supabase.functions.invoke call with subscription gating.
 *
 * - Pre-flight: checks local AI usage. If exhausted, opens paywall and returns blocked.
 * - Makes the actual edge function call.
 * - If 429 AI_LIMIT_REACHED, opens paywall and returns blocked.
 * - On success, increments local usage counter.
 *
 * The `subscriptionCtx` parameter should come from useSubscription() in the calling hook.
 */
export async function invokeAIFunction<T = any>(
  functionName: string,
  body: Record<string, any>,
  subscriptionCtx: {
    isPremium: boolean;
    checkAIAccess: () => boolean;
    openPaywall: () => void;
    incrementLocalUsage: () => void;
  },
  options?: { signal?: AbortSignal }
): Promise<AICallResult<T>> {
  // Pre-flight check
  if (!subscriptionCtx.checkAIAccess()) {
    subscriptionCtx.openPaywall();
    return { data: null, error: null, blocked: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      ...(options?.signal ? {} : {}),
    });

    // Check for 429 AI limit response
    if (error) {
      // supabase-js wraps non-2xx as FunctionsHttpError
      const errorBody = typeof error === "object" && error?.context?.body
        ? error.context.body
        : null;

      let parsed: any = null;
      if (typeof errorBody === "string") {
        try { parsed = JSON.parse(errorBody); } catch { /* ignore */ }
      } else if (errorBody && typeof errorBody === "object") {
        parsed = errorBody;
      }

      if (parsed?.code === "AI_LIMIT_REACHED") {
        if (!subscriptionCtx.isPremium) {
          subscriptionCtx.openPaywall();
          return { data: null, error: parsed, blocked: true };
        }
        // Premium user hit a spurious 429 — treat as transient error, not a block
        return { data: null, error: parsed, blocked: false };
      }

      return { data: null, error, blocked: false };
    }

    // Success — increment local counter
    subscriptionCtx.incrementLocalUsage();
    return { data: data as T, error: null, blocked: false };
  } catch (err) {
    return { data: null, error: err, blocked: false };
  }
}
