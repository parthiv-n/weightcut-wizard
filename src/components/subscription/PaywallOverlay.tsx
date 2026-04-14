import { useState, useEffect, useCallback } from "react";
import { X, Zap, Check, Loader2, RotateCcw, Clock, Crown } from "lucide-react";
import { useNextGemCountdown } from "@/components/subscription/AILimitTimer";
import { Button } from "@/components/ui/button";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { useProfile } from "@/contexts/UserContext";
import {
  isPremiumFromCustomerInfo,
  getSubscriptionFromCustomerInfo,
  getOfferings,
  purchasePackage,
  restorePurchases,
  presentPaywall,
  getCustomerInfo,
} from "@/lib/purchases";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { isNativePlatform } from "@/hooks/useIsNative";

/** Update Supabase profile directly from RevenueCat customerInfo */
async function syncPremiumToDb(customerInfo: any): Promise<{ tier: string; expiresAt: string | null } | null> {
  const sub = getSubscriptionFromCustomerInfo(customerInfo);
  if (!sub) {
    logger.warn("syncPremiumToDb: could not extract subscription from customerInfo");
    return null;
  }
  logger.info("syncPremiumToDb: attempting to write", sub);

  // Attempt 1: Direct update via user's auth
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("profiles").update({
        subscription_tier: sub.tier,
        subscription_expires_at: sub.expiresAt,
      }).eq("id", user.id);

      if (!error) {
        // Verify the update took effect (RLS can silently block writes)
        const { data: check } = await supabase.from("profiles")
          .select("subscription_tier").eq("id", user.id).single();
        if (check?.subscription_tier === sub.tier) {
          logger.info("syncPremiumToDb: direct update verified", { tier: check.subscription_tier });
          return sub;
        }
        logger.warn("syncPremiumToDb: direct update didn't persist (RLS?)", { expected: sub.tier, got: check?.subscription_tier });
      } else {
        logger.warn("syncPremiumToDb: direct update error", { code: error.code, message: error.message });
      }
    }
  } catch (err) {
    logger.warn("syncPremiumToDb: direct update exception", err);
  }

  // Attempt 2: Edge function with SERVICE_ROLE_KEY (bypasses RLS)
  try {
    logger.info("syncPremiumToDb: falling back to activate-premium edge function");
    const { data, error } = await supabase.functions.invoke("activate-premium", {
      body: { tier: sub.tier, expiresAt: sub.expiresAt },
    });
    if (error) {
      logger.error("syncPremiumToDb: edge function error", error);
      return null;
    }
    logger.info("syncPremiumToDb: edge function success", data);
    return sub;
  } catch (err) {
    logger.error("syncPremiumToDb: edge function exception", err);
    return null;
  }
}

// ─── Activating Pro Loading Screen ───

function ActivatingProScreen() {
  const [step, setStep] = useState(0);
  const steps = ["Confirming purchase", "Activating Pro", "Unlocking features"];

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 800);
    const t2 = setTimeout(() => setStep(2), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed inset-0 z-[10005] flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 px-8">
        {/* Animated icon */}
        <div className="relative">
          <div className="h-20 w-20 rounded-[22px] bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/30 animate-in zoom-in-75 duration-500">
            <Crown className="h-10 w-10 text-primary-foreground" />
          </div>
          <div className="absolute inset-0 rounded-[22px] bg-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">Activating Pro</h2>
          <p className="text-sm text-muted-foreground mt-1">Just a moment...</p>
        </div>

        {/* Progress steps */}
        <div className="space-y-3 w-full max-w-[240px]">
          {steps.map((label, i) => (
            <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${i <= step ? "opacity-100" : "opacity-30"}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                i < step ? "bg-primary" : i === step ? "bg-primary/20 border-2 border-primary" : "bg-muted border border-border"
              }`}>
                {i < step ? (
                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                ) : i === step ? (
                  <Loader2 className="h-3 w-3 text-primary animate-spin" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <span className={`text-sm ${i <= step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Paywall Overlay ───

const FEATURES = [
  "Unlimited AI meal analysis",
  "AI Coach chat",
  "Fight week protocols",
  "Rehydration plans",
  "Diet analysis & meal planning",
  "Training load analytics",
  "Weight trend AI insights",
];

export function PaywallOverlay() {
  const { isPaywallOpen, closePaywall, refreshGems, forcePremium } = useSubscriptionContext();
  const { refreshProfile } = useProfile();
  const [activating, setActivating] = useState(false);

  const activatePro = useCallback(async (customerInfo: any) => {
    setActivating(true);
    try {
      // Step 1: Force premium in client state IMMEDIATELY — no DB roundtrip needed
      const sub = getSubscriptionFromCustomerInfo(customerInfo);
      if (sub) {
        forcePremium(sub.tier, sub.expiresAt);
        logger.info("activatePro: forced premium locally", sub);
      }
      // Step 2: Write to DB and WAIT for it to persist
      const dbResult = await syncPremiumToDb(customerInfo);
      logger.info("activatePro: DB sync result", { success: !!dbResult });

      // Step 3: Verify the DB actually has the new tier (retry up to 3 times)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: verifyData } = await supabase.from("profiles").select("subscription_tier").eq("id", authUser.id).single();
          if (verifyData?.subscription_tier && verifyData.subscription_tier !== "free") {
            logger.info("activatePro: DB verified premium", { tier: verifyData.subscription_tier, attempt });
            break;
          }
          // DB hasn't caught up yet — wait and retry
          await new Promise(r => setTimeout(r, 800));
        }
      }

      await refreshGems();
      // Small delay so user sees the "Unlocking features" step complete
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      logger.error("Pro activation error", err);
    } finally {
      setActivating(false);
      closePaywall();
    }
  }, [refreshProfile, refreshGems, closePaywall, forcePremium]);

  useEffect(() => {
    if (!isPaywallOpen || !isNativePlatform) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await presentPaywall();
        logger.info("Native paywall closed", { result: JSON.stringify(result) });
        if (cancelled) return;

        const paywallResult = result?.paywallResult;

        // Only activate if the user actually purchased or restored
        if (paywallResult === "PURCHASED" || paywallResult === "RESTORED") {
          // Prefer customerInfo from presentPaywall result; fall back to fresh fetch
          const info = result?.customerInfo ?? await getCustomerInfo();
          if (info && isPremiumFromCustomerInfo(info)) {
            await activatePro(info);
            return;
          }
        }

        logger.info("Paywall dismissed without purchase", { paywallResult });
      } catch (err) {
        logger.error("Native paywall error", err);
      }
      if (!cancelled) closePaywall();
    })();
    return () => { cancelled = true; };
  }, [isPaywallOpen, closePaywall, activatePro]);

  // Show activating screen (full-screen, above everything)
  if (activating) return <ActivatingProScreen />;

  if (!isPaywallOpen) return null;
  if (isNativePlatform) return null;
  return <WebFallbackPaywall activatePro={activatePro} />;
}

/**
 * Custom paywall for web/non-native platforms.
 */
function WebFallbackPaywall({ activatePro }: { activatePro: (info: any) => Promise<void> }) {
  const { closePaywall, refreshGems } = useSubscriptionContext();
  const { refreshProfile } = useProfile();
  const { toast } = useToast();
  const { gems, isPremium } = useSubscriptionContext();
  const countdown = useNextGemCountdown(gems, isPremium);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [offerings, setOfferings] = useState<any>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getOfferings().then(setOfferings).catch(() => {});
  }, []);

  const monthlyPackage = offerings?.availablePackages?.find(
    (p: any) => p.identifier === "$rc_monthly" || p.product?.identifier === "com.weightcutwizard.premium.monthly"
  );
  const yearlyPackage = offerings?.availablePackages?.find(
    (p: any) => p.identifier === "$rc_annual" || p.product?.identifier === "com.weightcutwizard.premium.yearly"
  );

  const monthlyPrice = monthlyPackage?.product?.priceString || "£7.99";
  const yearlyPrice = yearlyPackage?.product?.priceString || "£49.99";

  const handlePurchase = async () => {
    const pkg = selectedPlan === "monthly" ? monthlyPackage : yearlyPackage;

    if (!pkg) {
      toast({
        title: "Subscriptions available on iOS",
        description: "Open the app on your iPhone to subscribe.",
      });
      return;
    }

    setPurchasing(true);
    try {
      const { customerInfo, cancelled } = await purchasePackage(pkg);
      if (cancelled) return;
      if (customerInfo && isPremiumFromCustomerInfo(customerInfo)) {
        await activatePro(customerInfo);
      }
    } catch (err: any) {
      logger.error("Purchase failed", err);
      toast({ title: "Purchase failed", description: "Please try again or contact support.", variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      if (customerInfo && isPremiumFromCustomerInfo(customerInfo)) {
        await activatePro(customerInfo);
      } else {
        toast({ title: "No active subscription found", description: "If you believe this is an error, contact support." });
      }
    } catch {
      toast({ title: "Restore failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10003] flex flex-col bg-background animate-in fade-in duration-300">
      <button
        onClick={closePaywall}
        className="absolute right-4 z-10 h-11 w-11 flex items-center justify-center rounded-full bg-muted/50 border border-border/30 active:scale-90 transition-transform"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 flex items-center justify-center mb-5">
          <Zap className="h-8 w-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center">Go Pro</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-[280px]">
          {countdown ? (
            <>Next free gem in <span className="inline-flex items-center gap-1 font-bold text-foreground tabular-nums"><Clock className="h-3.5 w-3.5 inline" /> {countdown}</span></>
          ) : (
            "Unlock unlimited AI access."
          )}
        </p>

        <div className="w-full max-w-sm mt-7 space-y-3">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-foreground">{feature}</span>
            </div>
          ))}
        </div>

        <div className="w-full max-w-sm mt-8 grid grid-cols-2 gap-3">
          <button
            onClick={() => setSelectedPlan("monthly")}
            className={`relative rounded-2xl border p-4 text-left transition-all active:scale-[0.97] ${
              selectedPlan === "monthly"
                ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-lg shadow-primary/10"
                : "border-border/50 bg-muted/20 dark:bg-white/5"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">Monthly</p>
            <p className="text-lg font-bold text-foreground mt-1">{monthlyPrice}</p>
            <p className="text-xs text-muted-foreground">/month</p>
          </button>

          <button
            onClick={() => setSelectedPlan("yearly")}
            className={`relative rounded-2xl border p-4 text-left transition-all active:scale-[0.97] ${
              selectedPlan === "yearly"
                ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-lg shadow-primary/10"
                : "border-border/50 bg-muted/20 dark:bg-white/5"
            }`}
          >
            <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              SAVE 48%
            </div>
            <p className="text-xs font-medium text-muted-foreground">Yearly</p>
            <p className="text-lg font-bold text-foreground mt-1">£4.17</p>
            <p className="text-xs text-muted-foreground">/month</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{yearlyPrice} billed annually</p>
          </button>
        </div>

        <Button
          onClick={handlePurchase}
          disabled={purchasing || restoring}
          className="w-full max-w-sm h-12 rounded-2xl text-base font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/25 mt-6 active:scale-[0.97] transition-transform"
        >
          {purchasing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Subscribe Now"}
        </Button>

        <button
          onClick={handleRestore}
          disabled={purchasing || restoring}
          className="flex items-center gap-1.5 mt-4 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restore Purchases
        </button>

        <div className="flex items-center gap-3 mt-5 text-xs text-muted-foreground/60">
          <a href="/legal?tab=terms" className="underline">Terms of Use</a>
          <span>·</span>
          <a href="/legal?tab=privacy" className="underline">Privacy Policy</a>
        </div>

        <p className="text-[10px] text-muted-foreground/40 text-center mt-3 max-w-[280px] leading-relaxed">
          Payment will be charged to your Apple ID account at confirmation of purchase.
          Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.
        </p>
      </div>
    </div>
  );
}
