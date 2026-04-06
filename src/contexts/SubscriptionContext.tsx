import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo } from "@/lib/purchases";
import { logger } from "@/lib/logger";

interface AIUsage {
  used: number;
  limit: number;
}

interface SubscriptionContextType {
  isPremium: boolean;
  tier: "free" | "premium_monthly" | "premium_annual" | "premium_lifetime";
  expiresAt: Date | null;
  aiUsageToday: AIUsage;
  isPaywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  refreshAIUsage: () => Promise<void>;
  incrementLocalUsage: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useProfile();
  const { userId } = useAuth();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [aiUsageToday, setAiUsageToday] = useState<AIUsage>({ used: 0, limit: 1 });

  const tier = (profile?.subscription_tier as SubscriptionContextType["tier"]) || "free";
  const expiresAt = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at)
    : null;
  // Premium if tier is not free AND (no expiry = lifetime, or expiry is in the future)
  const isPremium =
    tier !== "free" && (expiresAt === null || expiresAt > new Date());

  // Initialize RevenueCat when userId becomes available
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;

    const init = async () => {
      await initializePurchases(userId);

      // Listen for real-time customer info changes (purchase, restore, expiry)
      const cleanup = await addCustomerInfoUpdateListener((customerInfo) => {
        const isNowPremium = isPremiumFromCustomerInfo(customerInfo);
        if (isNowPremium) {
          // Refresh profile from DB to get the webhook-updated subscription state
          refreshProfile();
        }
      });
      removeListener = cleanup;
    };

    init().catch((err) =>
      logger.warn("RevenueCat init failed", { error: String(err) })
    );

    return () => {
      removeListener?.();
    };
  }, [userId, refreshProfile]);

  // Fetch current AI usage from rate_limits on mount and when userId changes
  const refreshAIUsage = useCallback(async () => {
    if (!userId || isPremium) {
      setAiUsageToday({ used: 0, limit: isPremium ? -1 : 1 });
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("rate_limits")
        .select("request_count, window_start")
        .eq("function_name", "ai_daily")
        .eq("user_id", userId)
        .maybeSingle();

      if (data && data.window_start?.startsWith(today)) {
        setAiUsageToday({ used: data.request_count, limit: 1 });
      } else {
        setAiUsageToday({ used: 0, limit: 1 });
      }
    } catch {
      // Fail silently — server is source of truth
    }
  }, [userId, isPremium]);

  useEffect(() => {
    refreshAIUsage();
  }, [refreshAIUsage]);

  const incrementLocalUsage = useCallback(() => {
    if (!isPremium) {
      setAiUsageToday((prev) => ({ ...prev, used: prev.used + 1 }));
    }
  }, [isPremium]);

  const openPaywall = useCallback(() => setIsPaywallOpen(true), []);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        tier,
        expiresAt,
        aiUsageToday,
        isPaywallOpen,
        openPaywall,
        closePaywall,
        refreshAIUsage,
        incrementLocalUsage,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscriptionContext must be used within SubscriptionProvider");
  }
  return context;
}
