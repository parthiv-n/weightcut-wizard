import { useSubscriptionContext, isLimitHitToday } from "@/contexts/SubscriptionContext";
import { useCallback } from "react";

export function useSubscription() {
  const ctx = useSubscriptionContext();

  // Synchronous check using localStorage — immune to stale React state
  const checkAIAccess = (): boolean => {
    if (ctx.isPremium) return true;
    return !isLimitHitToday();
  };

  /**
   * Handle a 429/rate-limit error from an edge function.
   * If the server says "no_gems", opens the NoGemsDialog; otherwise opens the paywall.
   */
  const handleAILimitError = useCallback((error: any) => {
    const errBody = typeof error === "object" && "context" in error ? (error as any).context : null;
    const status = errBody?.status;
    if (status !== 429) return false; // not a limit error

    ctx.markLimitReached();
    // Try to parse the response body for the reason
    try {
      const body = errBody?.body ? JSON.parse(errBody.body) : errBody;
      if (body?.code === "NO_GEMS" || body?.reason === "no_gems") {
        ctx.openNoGemsDialog();
        return true;
      }
    } catch {}
    ctx.openPaywall();
    return true;
  }, [ctx]);

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
    handleAILimitError,
    refreshAIUsage: ctx.refreshAIUsage,
    incrementLocalUsage: ctx.incrementLocalUsage,
    markLimitReached: ctx.markLimitReached,
  };
}
