import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AIUsageResult {
  allowed: boolean;
  is_premium: boolean;
  used: number;
  limit: number;
  reason?: string;
  gems?: number;
}

/**
 * Check AI usage limits for a user. Premium users get unlimited access.
 * Free users consume gems (1 per AI call). Falls back to rate_limits table.
 * Uses SECURITY DEFINER Postgres functions for atomic operations.
 */
export async function checkAIUsage(
  userId: string
): Promise<AIUsageResult> {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // 1. Grant daily free gem (idempotent)
  try {
    await adminClient.rpc('grant_daily_free_gem', { p_user_id: userId });
  } catch (e) {
    console.error('[subscriptionGuard] grant_daily_free_gem error:', e);
  }

  // 2. Try the existing rate limit check (handles premium detection)
  const { data, error } = await adminClient.rpc('check_ai_usage_and_increment', {
    p_user_id: userId,
    p_max_requests: 2,
  });

  if (error) {
    console.error('[subscriptionGuard] RPC error:', error);
    // Default to DENY on failure — never degrade to open access
    return { allowed: false, is_premium: false, used: 0, limit: 1, reason: 'service_error' };
  }

  const result = data as AIUsageResult;

  // Premium users bypass everything
  if (result.is_premium) return result;

  // 3. If rate limit says blocked, try gem deduction as fallback
  if (!result.allowed) {
    const { data: gemsLeft, error: gemErr } = await adminClient.rpc('deduct_gem', {
      p_user_id: userId,
    });

    if (gemErr || gemsLeft === -1) {
      // No gems either — truly blocked
      const { data: profile } = await adminClient
        .from('profiles')
        .select('gems')
        .eq('id', userId)
        .single();
      return {
        ...result,
        allowed: false,
        reason: 'no_gems',
        gems: profile?.gems ?? 0,
      };
    }

    // Gem deducted successfully — allow the request
    return { ...result, allowed: true, gems: gemsLeft as number };
  }

  return result;
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
      code: usage.reason === 'no_gems' ? 'NO_GEMS' : 'AI_LIMIT_REACHED',
      used: usage.used,
      limit: usage.limit,
      gems: usage.gems ?? 0,
      reason: usage.reason || 'rate_limit',
      is_premium: false,
      message: usage.reason === 'no_gems'
        ? 'You\'re out of AI gems. Watch an ad or upgrade to Pro for unlimited access.'
        : 'You\'ve used your free AI analysis for today. Upgrade to Premium for unlimited access.',
    }),
    {
      status: 429,
      headers: { ...corsHeadersFn(req), 'Content-Type': 'application/json' },
    }
  );
}
