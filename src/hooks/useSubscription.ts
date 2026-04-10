import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { useCallback } from "react";

export function useSubscription() {
  const ctx = useSubscriptionContext();

  // Gems are the sole limiter: premium = unlimited, free = 1 gem per AI call
  const checkAIAccess = (): boolean => {
    const allowed = ctx.isPremium || ctx.gems > 0;
    console.log("[AI Access Check]", {
      allowed,
      isPremium: ctx.isPremium,
      gems: ctx.gems,
    });
    return allowed;
  };

  /**
   * Handle a 429/rate-limit error from an edge function.
   * Parses the response body to sync gem count and show the right dialog.
   */
  const handleAILimitError = useCallback(async (error: any): Promise<boolean> => {
    if (ctx.isPremium) return false;
    const errBody = typeof error === "object" && "context" in error ? (error as any).context : null;
    const status = errBody?.status;
    console.log("[AI Limit Error]", { status, isPremium: ctx.isPremium, gems: ctx.gems });
    if (status !== 429) return false;

    // Parse the Response body
    let body: any = null;
    try {
      if (errBody && typeof errBody.json === "function") {
        body = await errBody.json();
      }
    } catch { /* body already consumed or not JSON */ }
    console.log("[AI Limit Error] Parsed body:", body);

    // Sync gem count from server
    const serverGems = typeof body?.gems === "number" ? body.gems : undefined;
    ctx.onAICallBlocked(serverGems);

    // Show no-gems dialog (the only reason a free user gets 429 in gem-only system)
    ctx.openNoGemsDialog();
    return true;
  }, [ctx]);

  return {
    isPremium: ctx.isPremium,
    tier: ctx.tier,
    expiresAt: ctx.expiresAt,
    gems: ctx.gems,
    checkAIAccess,
    openPaywall: ctx.openPaywall,
    openNoGemsDialog: ctx.openNoGemsDialog,
    closeNoGemsDialog: ctx.closeNoGemsDialog,
    isNoGemsOpen: ctx.isNoGemsOpen,
    handleAILimitError,
    refreshGems: ctx.refreshGems,
    onAICallSuccess: ctx.onAICallSuccess,
    onAICallBlocked: ctx.onAICallBlocked,
  };
}
