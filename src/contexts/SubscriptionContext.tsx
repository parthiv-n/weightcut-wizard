import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo } from "@/lib/purchases";
import { logger } from "@/lib/logger";

// ─── localStorage-backed limit tracking (synchronous, survives re-renders) ───

const AI_LIMIT_KEY_PREFIX = "wcw_ai_limit_";

function getLimitKey(): string {
  return AI_LIMIT_KEY_PREFIX + new Date().toISOString().split("T")[0];
}

export function isLimitHitToday(): boolean {
  return localStorage.getItem(getLimitKey()) === "true";
}

function clearLimitFlag(): void {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(AI_LIMIT_KEY_PREFIX)) {
      localStorage.removeItem(k);
    }
  });
}

function markLimitHitToday(): void {
  // Clear old dates to avoid localStorage bloat
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(AI_LIMIT_KEY_PREFIX) && k !== getLimitKey()) {
      localStorage.removeItem(k);
    }
  });
  localStorage.setItem(getLimitKey(), "true");
}

// ─── Context ───

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
  markLimitReached: () => void;
  showWelcomePro: boolean;
  dismissWelcomePro: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useProfile();
  const { userId } = useAuth();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);
  const [aiUsageToday, setAiUsageToday] = useState<AIUsage>(() => ({
    used: isLimitHitToday() ? 1 : 0,
    limit: 1,
  }));

  const tier = (profile?.subscription_tier as SubscriptionContextType["tier"]) || "free";
  const expiresAt = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at)
    : null;
  const isPremium =
    tier !== "free" && (expiresAt === null || expiresAt > new Date());

  const wasPremiumRef = useRef(isPremium);

  // Clear stale AI limit flags and show welcome dialog when user becomes premium
  useEffect(() => {
    if (isPremium) {
      clearLimitFlag();
      // Show welcome only on transition from free → premium (not on app reload when already premium)
      if (!wasPremiumRef.current && userId) {
        const welcomeKey = `wcw_welcome_pro_shown_${userId}`;
        if (!localStorage.getItem(welcomeKey)) {
          setShowWelcomePro(true);
          localStorage.setItem(welcomeKey, "true");
        }
      }
    }
    wasPremiumRef.current = isPremium;
  }, [isPremium, userId]);

  // Initialize RevenueCat when userId becomes available
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;

    const init = async () => {
      await initializePurchases(userId);

      const cleanup = await addCustomerInfoUpdateListener(async (customerInfo) => {
        const isNowPremium = isPremiumFromCustomerInfo(customerInfo);
        if (isNowPremium) {
          // Wait for RevenueCat webhook to update Supabase profile
          await new Promise(r => setTimeout(r, 2000));
          await refreshProfile();
          refreshAIUsage();
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

  // Fetch current AI usage on mount — but respect localStorage flag
  const refreshAIUsage = useCallback(async () => {
    if (!userId || isPremium) {
      if (isPremium) clearLimitFlag();
      setAiUsageToday({ used: 0, limit: isPremium ? -1 : 1 });
      return;
    }

    // If localStorage says limit was hit today, don't let server reset it
    if (isLimitHitToday()) {
      setAiUsageToday({ used: 1, limit: 1 });
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
        const serverUsed = data.request_count;
        if (serverUsed >= 1) {
          markLimitHitToday();
        }
        setAiUsageToday({ used: serverUsed, limit: 1 });
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

  // Called after a successful AI call — marks limit as hit in localStorage + state
  const incrementLocalUsage = useCallback(() => {
    if (!isPremium) {
      markLimitHitToday();
      setAiUsageToday({ used: 1, limit: 1 });
    }
  }, [isPremium]);

  // Called when server returns 429 — ensures client stays blocked
  const markLimitReached = useCallback(() => {
    if (!isPremium) {
      markLimitHitToday();
      setAiUsageToday({ used: 1, limit: 1 });
    }
  }, [isPremium]);

  const openPaywall = useCallback(() => setIsPaywallOpen(true), []);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);
  const dismissWelcomePro = useCallback(() => setShowWelcomePro(false), []);

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
        markLimitReached,
        showWelcomePro,
        dismissWelcomePro,
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
