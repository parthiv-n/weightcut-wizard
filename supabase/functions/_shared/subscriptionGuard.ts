import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AIUsageResult {
  allowed: boolean;
  is_premium: boolean;
  used: number;
  limit: number;
}

/**
 * Check AI usage limits for a user. Premium users get unlimited access.
 * Free users are limited to 1 AI call per day (shared across all AI functions).
 * Uses a SECURITY DEFINER Postgres function for atomic check-and-increment.
 */
export async function checkAIUsage(
  userId: string
): Promise<AIUsageResult> {
  // Use service role to call the SECURITY DEFINER function
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data, error } = await adminClient.rpc('check_ai_usage_and_increment', {
    p_user_id: userId,
    p_max_requests: 2,
  });

  if (error) {
    // On error, allow the request (fail open) but log
    console.error('[subscriptionGuard] RPC error:', error);
    return { allowed: true, is_premium: false, used: 0, limit: 1 };
  }

  return data as AIUsageResult;
}

/**
 * Returns a 429 response when AI usage limit is reached.
 */
export function aiLimitResponse(
  req: Request,
  usage: AIUsageResult,
  corsHeadersFn: (r: Request) => Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: 'AI usage limit reached',
      code: 'AI_LIMIT_REACHED',
      used: usage.used,
      limit: usage.limit,
      is_premium: false,
      message: 'You\'ve used your free AI analysis for today. Upgrade to Premium for unlimited access.',
    }),
    {
      status: 429,
      headers: { ...corsHeadersFn(req), 'Content-Type': 'application/json' },
    }
  );
}
