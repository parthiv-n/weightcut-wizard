import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo } from "@/lib/purchases";
import { logger } from "@/lib/logger";

// ─── localStorage-backed limit tracking (synchronous, survives re-renders) ───

const FREE_DAILY_LIMIT = 2;
const AI_LIMIT_KEY_PREFIX = "wcw_ai_count_";

function getLimitKey(): string {
  return AI_LIMIT_KEY_PREFIX + new Date().toISOString().split("T")[0];
}

function getUsageCountToday(): number {
  const val = localStorage.getItem(getLimitKey());
  return val ? parseInt(val, 10) || 0 : 0;
}

export function isLimitHitToday(): boolean {
  return getUsageCountToday() >= FREE_DAILY_LIMIT;
}

function clearLimitFlag(): void {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(AI_LIMIT_KEY_PREFIX)) {
      localStorage.removeItem(k);
    }
  });
  // Also clear old boolean keys from previous format
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("wcw_ai_limit_")) {
      localStorage.removeItem(k);
    }
  });
}

function incrementUsageCount(): void {
  // Clear old dates
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(AI_LIMIT_KEY_PREFIX) && k !== getLimitKey()) {
      localStorage.removeItem(k);
    }
  });
  const current = getUsageCountToday();
  localStorage.setItem(getLimitKey(), String(current + 1));
}

function markLimitHitToday(): void {
  // Clear old dates
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(AI_LIMIT_KEY_PREFIX) && k !== getLimitKey()) {
      localStorage.removeItem(k);
    }
  });
  localStorage.setItem(getLimitKey(), String(FREE_DAILY_LIMIT));
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
  aiResetTime: Date | null;
  limitTimerVisible: boolean;
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
  const [limitTimerVisible, setLimitTimerVisible] = useState(false);
  const limitTimerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiUsageToday, setAiUsageToday] = useState<AIUsage>(() => ({
    used: getUsageCountToday(),
    limit: FREE_DAILY_LIMIT,
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
      setAiUsageToday({ used: 0, limit: isPremium ? -1 : FREE_DAILY_LIMIT });
      return;
    }

    // If localStorage says limit was hit today, don't let server reset it
    if (isLimitHitToday()) {
      setAiUsageToday({ used: FREE_DAILY_LIMIT, limit: FREE_DAILY_LIMIT });
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
        if (serverUsed >= FREE_DAILY_LIMIT) {
          markLimitHitToday();
        }
        setAiUsageToday({ used: serverUsed, limit: FREE_DAILY_LIMIT });
      } else {
        setAiUsageToday({ used: 0, limit: FREE_DAILY_LIMIT });
      }
    } catch {
      // Fail silently — server is source of truth
    }
  }, [userId, isPremium]);

  useEffect(() => {
    refreshAIUsage();
  }, [refreshAIUsage]);

  // Called after a successful AI call — increments usage count
  const incrementLocalUsage = useCallback(() => {
    if (!isPremium) {
      incrementUsageCount();
      const newCount = getUsageCountToday();
      setAiUsageToday({ used: newCount, limit: FREE_DAILY_LIMIT });
    }
  }, [isPremium]);

  // Called when server returns 429 — ensures client stays blocked
  const markLimitReached = useCallback(() => {
    if (!isPremium) {
      markLimitHitToday();
      setAiUsageToday({ used: FREE_DAILY_LIMIT, limit: FREE_DAILY_LIMIT });
    }
  }, [isPremium]);

  // Compute reset time: midnight tonight (local) when limit is hit
  const aiResetTime = useMemo<Date | null>(() => {
    if (isPremium || !isLimitHitToday()) return null;
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return midnight;
  }, [isPremium, aiUsageToday]);

  // Auto-unlock check every 30s — detects date rollover at midnight
  useEffect(() => {
    if (isPremium || !isLimitHitToday()) return;
    const interval = setInterval(() => {
      if (!isLimitHitToday()) {
        clearLimitFlag();
        setAiUsageToday({ used: 0, limit: FREE_DAILY_LIMIT });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isPremium, aiUsageToday]);

  // Flash the limit timer for 5s whenever a locked feature is tapped
  const flashLimitTimer = useCallback(() => {
    if (limitTimerTimeout.current) clearTimeout(limitTimerTimeout.current);
    setLimitTimerVisible(true);
    limitTimerTimeout.current = setTimeout(() => setLimitTimerVisible(false), 5000);
  }, []);

  const openPaywall = useCallback(() => {
    setIsPaywallOpen(true);
    // Also show the transient timer toast if limit is hit
    if (isLimitHitToday()) flashLimitTimer();
  }, [flashLimitTimer]);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);
  const dismissWelcomePro = useCallback(() => setShowWelcomePro(false), []);

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        tier,
        expiresAt,
        aiUsageToday,
        aiResetTime,
        limitTimerVisible,
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
