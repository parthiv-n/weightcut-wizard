import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo, getSubscriptionFromCustomerInfo, getCustomerInfo } from "@/lib/purchases";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "@/lib/logger";

// ─── localStorage persistence (per-user scoped) ───

const PREMIUM_KEY_PREFIX = "wcw_premium_";  // append userId
const LEGACY_PREMIUM_KEY = "wcw_premium_override"; // for one-time cleanup
const GEMS_KEY_PREFIX = "wcw_gems_"; // append userId
const LEGACY_GEMS_KEY = "wcw_gems"; // for one-time cleanup

function premiumKeyFor(userId: string): string { return `${PREMIUM_KEY_PREFIX}${userId}`; }
function gemsKeyFor(userId: string): string { return `${GEMS_KEY_PREFIX}${userId}`; }

/** Read persisted premium override from localStorage (survives WebView reloads) */
function getLocalPremium(userId: string | null): { tier: string; expiresAt: string | null } | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(premiumKeyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate expiry — don't serve expired overrides
    if (parsed.expiresAt && new Date(parsed.expiresAt) <= new Date()) {
      localStorage.removeItem(premiumKeyFor(userId));
      return null;
    }
    return parsed;
  } catch { return null; }
}

function setLocalPremium(userId: string, data: { tier: string; expiresAt: string | null } | null): void {
  try {
    if (data) localStorage.setItem(premiumKeyFor(userId), JSON.stringify(data));
    else localStorage.removeItem(premiumKeyFor(userId));
  } catch { /* quota / privacy mode — silently ignore */ }
}

/** Read persisted gem count from localStorage (per-user) */
function getLocalGems(userId: string | null): number | null {
  if (!userId) return null;
  try {
    const val = localStorage.getItem(gemsKeyFor(userId));
    return val !== null ? (parseInt(val, 10) || 0) : null;
  } catch { return null; }
}

/** Persist gem count to localStorage (per-user) */
function setLocalGems(userId: string, count: number): void {
  try {
    localStorage.setItem(gemsKeyFor(userId), String(Math.max(0, count)));
  } catch { /* quota / privacy mode — silently ignore */ }
}

/** Exported helper — called from UserContext signOut to scrub this user's local state */
export function clearLocalSubscriptionState(userId: string): void {
  try {
    localStorage.removeItem(premiumKeyFor(userId));
    localStorage.removeItem(gemsKeyFor(userId));
    localStorage.removeItem(`wcw_welcome_pro_shown_${userId}`);
  } catch { /* privacy mode — silently ignore */ }
}

/**
 * Nuke every per-user subscription key in localStorage regardless of which
 * userId owns it. Use on full logout flows where the active uid may already
 * have been cleared by the time signOut runs (or when switching accounts on
 * the same device and you want to guarantee no bleedover).
 *
 * Note: the active-user-only `clearLocalSubscriptionState(uid)` should still
 * be preferred when the uid is known; this is the belt-and-braces variant.
 *
 * TODO: wire into the BottomNav logout path once we can do so without
 * touching files owned by other agents in this swarm.
 */
export function clearAllSubscriptionState(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(GEMS_KEY_PREFIX) ||
        key.startsWith(PREMIUM_KEY_PREFIX) ||
        key.startsWith("wcw_welcome_pro_shown_")
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    // Legacy global keys too, in case the one-time cleanup hasn't run yet.
    localStorage.removeItem(LEGACY_PREMIUM_KEY);
    localStorage.removeItem(LEGACY_GEMS_KEY);
  } catch { /* privacy mode — silently ignore */ }
}

/** One-time cleanup of legacy GLOBAL keys that bled state across users */
function cleanupLegacyKeys(): void {
  try {
    localStorage.removeItem(LEGACY_PREMIUM_KEY);
    localStorage.removeItem(LEGACY_GEMS_KEY);
  } catch { /* privacy mode — silently ignore */ }
}

// Narrow shape we read off the profile snapshot in async callbacks.
// Avoids `as any` at the read site without coupling to UserContext internals.
type ProfileSubscriptionShape = {
  subscription_tier?: string | null;
  subscription_expires_at?: string | null;
  gems?: number | null;
} | null | undefined;

// ─── Context ───

interface SubscriptionContextType {
  isPremium: boolean;
  tier: "free" | "premium_monthly" | "premium_annual" | "premium_lifetime";
  expiresAt: Date | null;
  gems: number;
  isPaywallOpen: boolean;
  isNoGemsOpen: boolean;
  isSubscriptionResolved: boolean;
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
  // Kept as a no-op reference for now; the action is server-internal after
  // the security refactor. RevenueCat webhook owns the DB tier write.
  void useAction(api.actions.activatePremium.run);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isNoGemsOpen, setIsNoGemsOpen] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);
  // Local override: forcePremium sets this immediately without waiting for DB/profile.
  // Hydrated reactively from per-user localStorage once userId is known (see effect below).
  const [tierOverride, setTierOverride] = useState<{ tier: string; expiresAt: string | null } | null>(null);
  // `false` until profile has resolved at least once (undefined = loading, null/obj = resolved)
  const [isSubscriptionResolved, setIsSubscriptionResolved] = useState(false);

  // One-time cleanup of legacy GLOBAL localStorage keys (ran exactly once per mount)
  useEffect(() => {
    cleanupLegacyKeys();
  }, []);

  // Hydrate the override from per-user localStorage when userId becomes known.
  // Skip the transient "pending" sentinel — UserContext emits it while the
  // Convex profile is mid-load. Hydrating from `wcw_premium_pending` would
  // be a no-op write/read on a fake key and means returning premium users
  // would see a brief `isPremium=false` flash. Wait for the real id.
  useEffect(() => {
    if (!userId || userId === "pending") {
      // Don't wipe React state during the "pending" window — the auth
      // resolution will produce a real id in the next render.
      return;
    }
    const cached = getLocalPremium(userId);
    if (cached) setTierOverride(cached);
    else setTierOverride(null);
  }, [userId]);

  // Clear the override + cached gems when userId truly clears (signOut).
  // signOut already calls `clearLocalSubscriptionState(uid)` via UserContext,
  // but we also reset React state here so the UI updates immediately.
  useEffect(() => {
    if (userId === null) {
      setTierOverride(null);
    }
  }, [userId]);

  // Track whether profile has resolved (transitioned out of `undefined`) at least once
  useEffect(() => {
    if (profile !== undefined && !isSubscriptionResolved) {
      setIsSubscriptionResolved(true);
    }
  }, [profile, isSubscriptionResolved]);

  // Mirror latest profile into a ref so async callbacks (RC listener, startup check)
  // can read fresh server state without re-subscribing on every profile change.
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const tier = (tierOverride?.tier || profile?.subscription_tier || "free") as SubscriptionContextType["tier"];
  const expiresAt = tierOverride?.expiresAt
    ? new Date(tierOverride.expiresAt)
    : profile?.subscription_expires_at
      ? new Date(profile.subscription_expires_at)
      : null;
  const isPremium =
    tier !== "free" && (expiresAt === null || expiresAt > new Date());

  // Gems: localStorage-backed for instant UI, synced from DB as source of truth.
  // Initial render has no userId yet, so default to 0; the userId effect below hydrates.
  const [gems, setGemsState] = useState<number>(0);

  // Hydrate gems from per-user localStorage when userId becomes known.
  // Same "pending" guard as the premium override — don't reset to 0 during
  // the auth-resolution window, which would cause a brief flash.
  useEffect(() => {
    if (!userId) {
      setGemsState(0);
      return;
    }
    if (userId === "pending") return;
    const local = getLocalGems(userId);
    if (local !== null) {
      setGemsState(local);
    } else {
      const fromProfile = (profileRef.current as ProfileSubscriptionShape)?.gems;
      setGemsState(typeof fromProfile === "number" ? fromProfile : 0);
    }
  }, [userId]);

  // Wrapper that persists to per-user localStorage on every set
  const setGems = useCallback((updater: number | ((prev: number) => number)) => {
    setGemsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const clamped = Math.max(0, next);
      if (userId) setLocalGems(userId, clamped);
      return clamped;
    });
  }, [userId]);

  // Sync gems from profile — only accept server value if it's lower than local
  // (optimistic deductions should never be reverted by a stale profile fetch)
  const lastSyncRef = useRef(0);
  useEffect(() => {
    const serverGems = (profile as any)?.gems;
    if (serverGems === undefined) return;
    if (!userId) return;
    setGemsState(prev => {
      // If server reports fewer gems, always trust it (deduction confirmed or admin change)
      // If server reports more gems (ad reward, daily grant), also trust it
      // Only skip if we recently did an optimistic deduction and server is stale
      const timeSinceSync = Date.now() - lastSyncRef.current;
      if (timeSinceSync < 3000 && serverGems > prev) {
        // Stale server data arrived within 3s of an optimistic deduction — ignore
        return prev;
      }
      setLocalGems(userId, serverGems);
      return serverGems;
    });
  }, [profile, userId]);

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
  // Persisted to per-user localStorage so it survives WebView reloads
  const forcePremium = useCallback((newTier: string, newExpiresAt: string | null) => {
    logger.info("[forcePremium] Setting tier override + persisting to localStorage", { newTier, newExpiresAt });
    const data = { tier: newTier, expiresAt: newExpiresAt };
    setTierOverride(data);
    if (userId) setLocalPremium(userId, data);
  }, [userId]);

  // Track whether native paywall is currently open — prevents listener from
  // granting premium from stale data while user is browsing the paywall
  const isNativePaywallActiveRef = useRef(false);
  useEffect(() => {
    isNativePaywallActiveRef.current = isPaywallOpen && Capacitor.isNativePlatform();
  }, [isPaywallOpen]);

  // Initialize RevenueCat when userId becomes available.
  // Guard against the literal "pending" sentinel `UserContext` emits while the
  // Convex profile query is still hydrating — configuring RC with that string
  // would attribute the next purchase to a fake user-id until the effect
  // re-runs with the real Convex id.
  useEffect(() => {
    if (!userId || userId === "pending" || !Capacitor.isNativePlatform()) return;

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
          // Local force + reactive profile refresh. The client-callable
          // `activatePremium` action is locked down for security; the
          // RevenueCat webhook is the only authoritative DB writer.
          const sub = getSubscriptionFromCustomerInfo(customerInfo);
          if (sub) forcePremium(sub.tier, sub.expiresAt);
          await refreshProfile();
        } else {
          // RC reports not-premium. Only clear local override if Convex profile
          // ALSO indicates not premium (defensive against transient RC fetch issues
          // on cold start, network blips, or right after a purchase that hasn't fully synced).
          const profileRefValue = profileRef.current as ProfileSubscriptionShape;
          const serverTier = profileRefValue?.subscription_tier ?? "free";
          const serverExpiresAt = profileRefValue?.subscription_expires_at;
          const serverPremium =
            serverTier !== "free" &&
            (!serverExpiresAt || new Date(serverExpiresAt) > new Date());
          if (!serverPremium) {
            logger.info("RC + server both indicate not premium — clearing local override");
            if (userId) setLocalPremium(userId, null);
            setTierOverride(null);
          } else {
            logger.info("RC says not premium but server says premium — keeping local state, deferring to webhook");
          }
          await refreshProfile();
        }
      });
      removeListener = cleanup;

      // Startup check: always verify RevenueCat status and sync to DB
      const info = await getCustomerInfo();
      if (info && isPremiumFromCustomerInfo(info)) {
        const sub = getSubscriptionFromCustomerInfo(info);
        if (sub) {
          // Force premium locally (instant). DB tier is owned by the
          // RevenueCat webhook now; `refreshProfile` picks up the
          // server-side write the moment the webhook fires.
          forcePremium(sub.tier, sub.expiresAt);
          await refreshProfile();
        }
      } else if (info && !isPremiumFromCustomerInfo(info)) {
        // RC reports not-premium at startup. Same defensive rule as listener:
        // only clear when Convex profile also indicates not-premium. The Convex
        // webhook is authoritative — trust the server until it disagrees too.
        const profileRefValue = profileRef.current as ProfileSubscriptionShape;
        const serverTier = profileRefValue?.subscription_tier ?? "free";
        const serverExpiresAt = profileRefValue?.subscription_expires_at;
        const serverPremium =
          serverTier !== "free" &&
          (!serverExpiresAt || new Date(serverExpiresAt) > new Date());
        if (!serverPremium) {
          logger.info("Startup: RC + server both indicate not premium — clearing local override");
          if (userId) setLocalPremium(userId, null);
          setTierOverride(null);
        } else {
          logger.info("Startup: RC says not premium but server says premium — keeping local state, deferring to webhook");
        }
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
  // activatePremium is no longer in the dep array — see the security
  // refactor: the action is locked to the webhook and not called from here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshProfile, forcePremium]);

  // On app resume: re-validate premium via RevenueCat (catches expiry/cancellation)
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    const handler = async () => {
      const info = await getCustomerInfo();
      if (!info) return;
      if (!isPremiumFromCustomerInfo(info) && tierOverride) {
        // Same conservative rule: only clear when Convex profile also agrees
        const profileRefValue = profileRef.current as ProfileSubscriptionShape;
        const serverTier = profileRefValue?.subscription_tier ?? "free";
        const serverExpiresAt = profileRefValue?.subscription_expires_at;
        const serverPremium =
          serverTier !== "free" &&
          (!serverExpiresAt || new Date(serverExpiresAt) > new Date());
        if (!serverPremium) {
          logger.info("App resume: RC + server both indicate not premium, clearing override");
          setTierOverride(null);
          setLocalPremium(userId, null);
        } else {
          logger.info("App resume: RC says not premium but server says premium — keeping local state");
        }
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
        isSubscriptionResolved,
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
