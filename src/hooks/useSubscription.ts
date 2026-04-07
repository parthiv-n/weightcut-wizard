import { useSubscriptionContext, isLimitHitToday } from "@/contexts/SubscriptionContext";

export function useSubscription() {
  const ctx = useSubscriptionContext();

  // Synchronous check using localStorage — immune to stale React state
  const checkAIAccess = (): boolean => {
    if (ctx.isPremium) return true;
    return !isLimitHitToday();
  };

  return {
    isPremium: ctx.isPremium,
    tier: ctx.tier,
    expiresAt: ctx.expiresAt,
    aiUsage: ctx.aiUsageToday,
    checkAIAccess,
    openPaywall: ctx.openPaywall,
    openNoGemsDialog: ctx.openNoGemsDialog,
    closeNoGemsDialog: ctx.closeNoGemsDialog,
    isNoGemsOpen: ctx.isNoGemsOpen,
    refreshAIUsage: ctx.refreshAIUsage,
    incrementLocalUsage: ctx.incrementLocalUsage,
    markLimitReached: ctx.markLimitReached,
  };
}
