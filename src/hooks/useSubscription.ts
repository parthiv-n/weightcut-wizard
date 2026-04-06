import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

export function useSubscription() {
  const ctx = useSubscriptionContext();

  const checkAIAccess = (): boolean => {
    if (ctx.isPremium) return true;
    return ctx.aiUsageToday.used < ctx.aiUsageToday.limit;
  };

  return {
    isPremium: ctx.isPremium,
    tier: ctx.tier,
    expiresAt: ctx.expiresAt,
    aiUsage: ctx.aiUsageToday,
    checkAIAccess,
    openPaywall: ctx.openPaywall,
    refreshAIUsage: ctx.refreshAIUsage,
    incrementLocalUsage: ctx.incrementLocalUsage,
  };
}
