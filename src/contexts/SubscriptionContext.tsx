import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo, getSubscriptionFromCustomerInfo, getCustomerInfo } from "@/lib/purchases";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// ─── localStorage persistence ───

const GEMS_KEY = "wcw_gems";
const PREMIUM_KEY = "wcw_premium_override";

/** Read persisted premium override from localStorage (survives WebView reloads) */
function getLocalPremium(): { tier: string; expiresAt: string | null } | null {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate expiry — don't serve expired overrides
    if (parsed.expiresAt && new Date(parsed.expiresAt) <= new Date()) {
      localStorage.removeItem(PREMIUM_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function setLocalPremium(data: { tier: string; expiresAt: string | null } | null): void {
  try {
    if (data) localStorage.setItem(PREMIUM_KEY, JSON.stringify(data));
    else localStorage.removeItem(PREMIUM_KEY);
  } catch {}
}

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
  forcePremium: (tier: string, expiresAt: string | null) => void;
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
  // Local override: forcePremium sets this immediately without waiting for DB/profile
  // Initialized from localStorage so it survives WebView reloads (Capacitor restarts WebView frequently)
  const [tierOverride, setTierOverride] = useState<{ tier: string; expiresAt: string | null } | null>(getLocalPremium);

  const tier = (tierOverride?.tier || profile?.subscription_tier || "free") as SubscriptionContextType["tier"];
  const expiresAt = tierOverride?.expiresAt
    ? new Date(tierOverride.expiresAt)
    : profile?.subscription_expires_at
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

  // Sync gems from profile — only accept server value if it's lower than local
  // (optimistic deductions should never be reverted by a stale profile fetch)
  const lastSyncRef = useRef(0);
  useEffect(() => {
    const serverGems = (profile as any)?.gems;
    if (serverGems === undefined) return;
    setGemsState(prev => {
      // If server reports fewer gems, always trust it (deduction confirmed or admin change)
      // If server reports more gems (ad reward, daily grant), also trust it
      // Only skip if we recently did an optimistic deduction and server is stale
      const timeSinceSync = Date.now() - lastSyncRef.current;
      if (timeSinceSync < 3000 && serverGems > prev) {
        // Stale server data arrived within 3s of an optimistic deduction — ignore
        return prev;
      }
      setLocalGems(serverGems);
      return serverGems;
    });
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

  // Force premium state immediately — used after purchase before DB/profile syncs
  // Persisted to localStorage so it survives WebView reloads
  const forcePremium = useCallback((newTier: string, newExpiresAt: string | null) => {
    logger.info("[forcePremium] Setting tier override + persisting to localStorage", { newTier, newExpiresAt });
    const data = { tier: newTier, expiresAt: newExpiresAt };
    setTierOverride(data);
    setLocalPremium(data);
  }, []);

  // Track whether native paywall is currently open — prevents listener from
  // granting premium from stale data while user is browsing the paywall
  const isNativePaywallActiveRef = useRef(false);
  useEffect(() => {
    isNativePaywallActiveRef.current = isPaywallOpen && Capacitor.isNativePlatform();
  }, [isPaywallOpen]);

  // Initialize RevenueCat when userId becomes available
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;

    // Yield to first paint before initializing RevenueCat (~500ms native overhead).
    // The listener + startup verification still run, just deferred to idle time.
    const idle: (cb: () => void) => unknown =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
        : (cb) => setTimeout(cb, 500);

    const init = async () => {
      await initializePurchases(userId);

      const cleanup = await addCustomerInfoUpdateListener(async (customerInfo) => {
        const isNowPremium = isPremiumFromCustomerInfo(customerInfo);
        if (isNowPremium) {
          // Skip if the native paywall is currently open — PaywallOverlay
          // handles activation based on the actual paywallResult
          if (isNativePaywallActiveRef.current) {
            logger.info("RevenueCat listener: skipping forcePremium while paywall is open");
            return;
          }
          // Sync premium to DB via edge function (bypasses RLS trigger)
          const sub = getSubscriptionFromCustomerInfo(customerInfo);
          if (sub) {
            forcePremium(sub.tier, sub.expiresAt);
            try {
              await supabase.functions.invoke("activate-premium", {
                body: { tier: sub.tier, expiresAt: sub.expiresAt },
              });
              logger.info("RevenueCat listener: synced premium via edge function", sub);
            } catch (err) { logger.warn("Failed to sync premium in listener", err); }
          }
          await refreshProfile();
        } else {
          // User lost premium (cancelled/expired) — clear override, refresh from DB
          logger.info("RevenueCat: user no longer premium, clearing override");
          setTierOverride(null); setLocalPremium(null);
          await refreshProfile();
        }
      });
      removeListener = cleanup;

      // Startup check: always verify RevenueCat status and sync to DB
      const info = await getCustomerInfo();
      if (info && isPremiumFromCustomerInfo(info)) {
        const sub = getSubscriptionFromCustomerInfo(info);
        if (sub) {
          // Always force premium locally (instant, cheap)
          forcePremium(sub.tier, sub.expiresAt);
          // Always sync to DB via edge function (idempotent, ensures DB is correct)
          try {
            await supabase.functions.invoke("activate-premium", {
              body: { tier: sub.tier, expiresAt: sub.expiresAt },
            });
            logger.info("Startup: premium synced to DB", sub);
          } catch (err) {
            logger.warn("Startup: failed to sync premium to DB (will retry on next launch)", err);
          }
          await refreshProfile();
        }
      } else if (info && !isPremiumFromCustomerInfo(info)) {
        // RevenueCat says not premium — clear any stale localStorage override
        setTierOverride(null); setLocalPremium(null);
        await refreshProfile();
      }
    };

    let cancelled = false;
    idle(() => {
      if (cancelled) return;
      init().catch((err) =>
        logger.warn("RevenueCat init failed", { error: String(err) })
      );
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [userId, refreshProfile, forcePremium]);

  // On app resume: re-validate premium via RevenueCat (catches expiry/cancellation)
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    const handler = async () => {
      const info = await getCustomerInfo();
      if (!info) return;
      if (!isPremiumFromCustomerInfo(info) && tierOverride) {
        logger.info("App resume: premium expired, clearing override");
        setTierOverride(null);
        await refreshProfile();
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") handler(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, tierOverride, refreshProfile]);

  // Refresh gems from profile (DB is source of truth)
  const refreshGems = useCallback(async () => {
    if (userId) await refreshProfile();
  }, [userId, refreshProfile]);

  // Called after a successful AI call — optimistically deduct 1 gem immediately
  const onAICallSuccess = useCallback(() => {
    if (!isPremium) {
      lastSyncRef.current = Date.now(); // Mark optimistic deduction time
      setGems(prev => prev - 1);
      window.dispatchEvent(new Event('gem-consumed'));
      // Delay profile refresh so DB has time to process the server-side deduction
      if (userId) setTimeout(() => refreshProfile(), 3000);
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
        forcePremium,
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
