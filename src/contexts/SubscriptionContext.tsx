import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { initializePurchases, addCustomerInfoUpdateListener, isPremiumFromCustomerInfo, getSubscriptionFromCustomerInfo, getCustomerInfo } from "@/lib/purchases";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "@/lib/logger";

// ─── localStorage persistence (per-user scoped) ───
//
// The premium override (`wcw_premium_<uid>`) that used to live here was the
// surface attackers (and the sandbox StoreKit echo bug) used to fake
// premium. It has been REMOVED. The Convex `profile.subscription_tier`
// reactive query is the only source of truth for premium — written
// exclusively by the RC webhook or by the server-verified
// `api.actions.activatePremium.run` action that hits the RC REST API.
//
// We still keep a per-user gem cache because that's display-only and the
// server enforces the actual gem balance via `enforceGemGate` server-side.

const PREMIUM_KEY_PREFIX = "wcw_premium_"; // legacy — cleaned up on mount
const LEGACY_PREMIUM_KEY = "wcw_premium_override"; // legacy GLOBAL key — cleaned up on mount
const GEMS_KEY_PREFIX = "wcw_gems_"; // append userId
const LEGACY_GEMS_KEY = "wcw_gems"; // for one-time cleanup

function gemsKeyFor(userId: string): string { return `${GEMS_KEY_PREFIX}${userId}`; }

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
    localStorage.removeItem(`${PREMIUM_KEY_PREFIX}${userId}`); // legacy
    localStorage.removeItem(gemsKeyFor(userId));
    localStorage.removeItem(`wcw_welcome_pro_shown_${userId}`);
  } catch { /* privacy mode — silently ignore */ }
}

/** One-time cleanup of legacy localStorage:
 *   - GLOBAL keys (`wcw_premium_override`, `wcw_gems`) that bled state across users
 *   - The removed per-user premium override (`wcw_premium_<uid>`) — installed by
 *     earlier versions of the app, now obsolete since `forcePremium` is gone.
 *     If we left them in place, an attacker (or a real user from before the
 *     fix) would continue to see a stale `isPremium=true` client-side display
 *     until the next sign-out. Sweep on every mount — cheap and idempotent.
 */
function cleanupLegacyKeys(): void {
  try {
    localStorage.removeItem(LEGACY_PREMIUM_KEY);
    localStorage.removeItem(LEGACY_GEMS_KEY);
    // Nuke every per-user premium override left behind by the old client.
    // We don't know which userIds we wrote for, so scan the keys.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREMIUM_KEY_PREFIX)) toRemove.push(key);
    }
    for (const k of toRemove) localStorage.removeItem(k);
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
  // `forcePremium` is intentionally removed. The Convex `profile.subscription_tier`
  // (written only by the server-verified `activatePremium` action or the RC
  // webhook) is the single source of truth for premium. Any future
  // contributor tempted to add an optimistic override here should remember
  // this surface is exactly how non-paying users got upgraded in sandbox.
  showWelcomePro: boolean;
  dismissWelcomePro: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useProfile();
  const { userId } = useAuth();
  const activatePremium = useAction(api.actions.activatePremium.run);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isNoGemsOpen, setIsNoGemsOpen] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);
  // `false` until profile has resolved at least once (undefined = loading, null/obj = resolved)
  const [isSubscriptionResolved, setIsSubscriptionResolved] = useState(false);

  // One-time cleanup of legacy localStorage on every mount. Sweeps the
  // removed `wcw_premium_<uid>` keys from any pre-fix install so a stale
  // override doesn't show non-paying users as premium until the next
  // sign-out. Idempotent and cheap.
  useEffect(() => {
    cleanupLegacyKeys();
  }, []);

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

  // Tier + expiry derive PURELY from the reactive Convex profile query.
  // No client override, no localStorage hydration, no optimistic flip.
  // The only writers to `profile.subscription_tier` are the server-verified
  // `activatePremium` action and the RC webhook — both of which require
  // a cryptographically-confirmed StoreKit payment via the RC platform.
  const tier = (profile?.subscription_tier || "free") as SubscriptionContextType["tier"];
  const expiresAt = profile?.subscription_expires_at
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

  // `forcePremium` and the `isNativePaywallActiveRef` paywall-guard were
  // removed together. The listener (further down) no longer grants premium
  // under any conditions, so there's nothing to guard. Keeping the ref
  // around would just be dead code that hints at the old footgun.

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

      // STRICT POLICY (do not weaken):
      //   - The `customerInfoUpdate` listener NEVER grants premium. Background
      //     RC events on iOS sandbox fire transient "active" entitlement reads
      //     right after the paywall is dismissed (compressed-time trial renews,
      //     residual receipts from prior TestFlight testing). Trusting them
      //     here is exactly how non-paying users were being upgraded.
      //   - The startup re-sync NEVER grants premium client-side either. The
      //     ONLY path that flips `profile.subscriptionTier` from "free" to a
      //     paid tier is `api.actions.activatePremium.run()` (which hits the
      //     RevenueCat REST API server-side with a project-scoped secret) or
      //     the RC server-to-server webhook.
      //   - This handler's only job is to call `refreshProfile()` so the
      //     reactive `useQuery(api.profiles.getMine)` re-fetches the row.
      //     Cleanup of the local optimistic override is also limited to the
      //     "RC says not-premium AND Convex profile says not-premium" case.
      const cleanup = await addCustomerInfoUpdateListener(async (customerInfo) => {
        const isNowPremium = isPremiumFromCustomerInfo(customerInfo);
        if (!isNowPremium) {
          // Clear local override only when RC AND Convex both say not-premium.
          // (Keeping the "server is premium → trust server" branch as a
          // defence against transient RC fetch failures.)
          const profileRefValue = profileRef.current as ProfileSubscriptionShape;
          const serverTier = profileRefValue?.subscription_tier ?? "free";
          const serverExpiresAt = profileRefValue?.subscription_expires_at;
          // Listener no longer writes premium under any condition — local
          // override has been removed entirely. We only nudge the reactive
          // profile query in case the webhook just landed.
          void serverTier;
          void serverExpiresAt;
        }
        // Either branch: refresh profile so the reactive query catches any
        // webhook-driven server state change. NEVER call activatePremium /
        // any premium-write here — those would re-introduce the bug.
        await refreshProfile();
      });
      removeListener = cleanup;

      // Cold-start reconcile: ask Convex to verify entitlement against RC
      // REST server-side. The action is idempotent and the SOLE legitimate
      // client-initiated write path. If the user is genuinely premium on RC
      // but Convex hasn't seen the webhook yet, this catches them up in one
      // round-trip. If RC says not-entitled, the action throws and we do
      // nothing — no local state flip.
      const info = await getCustomerInfo();
      if (info && isPremiumFromCustomerInfo(info)) {
        try {
          await activatePremium({});
          await refreshProfile();
        } catch (err) {
          // Expected: `RC_NOT_ENTITLED` for users who aren't actually paying,
          // or transient network errors. Either way, refrain from granting.
          logger.info("Startup: activatePremium did not confirm entitlement", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (info) {
        // RC says not premium. Nothing to clear locally — the reactive
        // profile query is the source of truth and updates on its own.
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
  }, [userId, refreshProfile, activatePremium]);

  // On app resume: nudge the reactive profile query so the UI catches any
  // webhook-driven tier change that arrived while the app was backgrounded.
  // Critically — we do NOT call `getCustomerInfo()` here to grant premium.
  // The Convex profile is the source of truth; webhook delivers expiry /
  // cancellation events server-side within seconds.
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshProfile();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, refreshProfile]);

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
