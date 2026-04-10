import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo } from "@/lib/purchases";
import { logger } from "@/lib/logger";

// ─── localStorage gem persistence ───

const GEMS_KEY = "wcw_gems";

/** Read persisted gem count from localStorage */
function getLocalGems(): number | null {
  const val = localStorage.getItem(GEMS_KEY);
  return val !== null ? (parseInt(val, 10) || 0) : null;
}

/** Persist gem count to localStorage */
function setLocalGems(count: number): void {
  localStorage.setItem(GEMS_KEY, String(Math.max(0, count)));
}

// ─── Context ───

interface SubscriptionContextType {
  isPremium: boolean;
  tier: "free" | "premium_monthly" | "premium_annual" | "premium_lifetime";
  expiresAt: Date | null;
  gems: number;
  isPaywallOpen: boolean;
  isNoGemsOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  openNoGemsDialog: () => void;
  closeNoGemsDialog: () => void;
  refreshGems: () => Promise<void>;
  onAICallSuccess: () => void;
  onAICallBlocked: (serverGems?: number) => void;
  showWelcomePro: boolean;
  dismissWelcomePro: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useProfile();
  const { userId } = useAuth();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isNoGemsOpen, setIsNoGemsOpen] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);

  const tier = (profile?.subscription_tier as SubscriptionContextType["tier"]) || "free";
  const expiresAt = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at)
    : null;
  const isPremium =
    tier !== "free" && (expiresAt === null || expiresAt > new Date());

  // Gems: localStorage-backed for instant UI, synced from DB as source of truth
  const [gems, setGemsState] = useState<number>(() => {
    const local = getLocalGems();
    if (local !== null) return local;
    return (profile as any)?.gems ?? 0;
  });

  // Wrapper that persists to localStorage on every set
  const setGems = useCallback((updater: number | ((prev: number) => number)) => {
    setGemsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const clamped = Math.max(0, next);
      try { setLocalGems(clamped); } catch { /* quota exceeded — state still updates */ }
      return clamped;
    });
  }, []);

  // Sync gems from profile: server is authoritative
  useEffect(() => {
    const serverGems = (profile as any)?.gems;
    if (serverGems === undefined) return;
    setGemsState(serverGems);
    setLocalGems(serverGems);
  }, [profile]);

  const wasPremiumRef = useRef(isPremium);

  // Show welcome dialog when user becomes premium
  useEffect(() => {
    if (isPremium) {
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

  // Clean up old rate-limit localStorage keys from previous system
  useEffect(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("wcw_ai_count_") || k.startsWith("wcw_ai_limit_")) {
        localStorage.removeItem(k);
      }
    });
  }, []);

  // Initialize RevenueCat when userId becomes available
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;

    const init = async () => {
      await initializePurchases(userId);

      const cleanup = await addCustomerInfoUpdateListener(async (customerInfo) => {
        const isNowPremium = isPremiumFromCustomerInfo(customerInfo);
        if (isNowPremium) {
          await new Promise(r => setTimeout(r, 2000));
          await refreshProfile();
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

  // Refresh gems from profile (DB is source of truth)
  const refreshGems = useCallback(async () => {
    if (userId) await refreshProfile();
  }, [userId, refreshProfile]);

  // Called after a successful AI call — optimistically deduct 1 gem, then sync from DB
  const onAICallSuccess = useCallback(() => {
    if (!isPremium) {
      setGems(prev => prev - 1);
      window.dispatchEvent(new Event('gem-consumed'));
      if (userId) refreshProfile();
    }
  }, [isPremium, userId, refreshProfile, setGems]);

  // Called when server returns 429 — sync gem count from server response
  const onAICallBlocked = useCallback((serverGems?: number) => {
    console.log("[onAICallBlocked]", { isPremium, gems, serverGems });
    if (!isPremium && serverGems !== undefined) {
      setGems(serverGems);
    }
  }, [isPremium, gems, setGems]);

  const openPaywall = useCallback(() => {
    if (isPremium) return;
    setIsPaywallOpen(true);
  }, [isPremium]);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);
  const openNoGemsDialog = useCallback(() => {
    if (isPremium) return;
    setIsNoGemsOpen(true);
  }, [isPremium]);
  const closeNoGemsDialog = useCallback(() => setIsNoGemsOpen(false), []);
  const dismissWelcomePro = useCallback(() => setShowWelcomePro(false), []);

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        tier,
        expiresAt,
        gems,
        isPaywallOpen,
        isNoGemsOpen,
        openPaywall,
        closePaywall,
        openNoGemsDialog,
        closeNoGemsDialog,
        refreshGems,
        onAICallSuccess,
        onAICallBlocked,
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
