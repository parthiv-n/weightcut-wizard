import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AIUsageResult {
  allowed: boolean;
  is_premium: boolean;
  gems?: number;
  reason?: string;
}

/**
 * Check AI usage limits for a user.
 * Premium users get unlimited access.
 * Free users spend 1 gem per AI call. No separate rate limit.
 */
export async function checkAIUsage(
  userId: string
): Promise<AIUsageResult> {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // 1. Grant daily free gem (idempotent — caps at 2 gems)
  try {
    await adminClient.rpc('grant_daily_free_gem', { p_user_id: userId });
  } catch (e) {
    console.error('[subscriptionGuard] grant_daily_free_gem error:', e);
  }

  // 2. Check if premium
  try {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('subscription_tier, subscription_expires_at, gems')
      .eq('id', userId)
      .single();

    if (
      profile?.subscription_tier &&
      profile.subscription_tier !== 'free' &&
      (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date())
    ) {
      return { allowed: true, is_premium: true };
    }

    console.log('[subscriptionGuard] Free user, gems in DB:', profile?.gems, 'userId:', userId);

    // 3. Free user — deduct 1 gem
    const { data: gemsLeft, error: gemErr } = await adminClient.rpc('deduct_gem', {
      p_user_id: userId,
    });

    console.log('[subscriptionGuard] deduct_gem result:', { gemsLeft, gemErr: gemErr?.message });

    if (gemErr || gemsLeft === -1) {
      // No gems — blocked
      return {
        allowed: false,
        is_premium: false,
        reason: 'no_gems',
        gems: profile?.gems ?? 0,
      };
    }

    // Gem deducted — allow
    console.log('[subscriptionGuard] Gem deducted, allowing. Gems remaining:', gemsLeft);
    return { allowed: true, is_premium: false, gems: gemsLeft as number };
  } catch (e) {
    console.error('[subscriptionGuard] Error:', e);
    return { allowed: false, is_premium: false, reason: 'service_error', gems: 0 };
  }
}

/**
 * Returns a 429 response when AI usage limit is reached (no gems).
 */
export function aiLimitResponse(
  req: Request,
  usage: AIUsageResult,
  corsHeadersFn: (r: Request) => Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: 'No gems remaining',
      code: 'NO_GEMS',
      gems: usage.gems ?? 0,
      reason: usage.reason || 'no_gems',
      is_premium: false,
      message: 'You\'re out of AI gems. Watch an ad or upgrade to Pro for unlimited access.',
    }),
    {
      status: 429,
      headers: { ...corsHeadersFn(req), 'Content-Type': 'application/json' },
    }
  );
}
