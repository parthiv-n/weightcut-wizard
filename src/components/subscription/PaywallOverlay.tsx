import { useState, useEffect } from "react";
import { X, Zap, Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { useProfile } from "@/contexts/UserContext";
import {
  isPremiumFromCustomerInfo,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/lib/purchases";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

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
  const { isPaywallOpen } = useSubscriptionContext();
  if (!isPaywallOpen) return null;
  return <WebFallbackPaywall />;
}

/**
 * Custom paywall for web/non-native platforms.
 * On native iOS, RevenueCat's built-in paywall UI is used instead.
 */
function WebFallbackPaywall() {
  const { closePaywall, refreshAIUsage } = useSubscriptionContext();
  const { refreshProfile } = useProfile();
  const { toast } = useToast();
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
        await new Promise((r) => setTimeout(r, 2000));
        await refreshProfile();
        await refreshAIUsage();
        closePaywall();
        toast({ title: "Welcome to Pro!", description: "You now have unlimited AI access." });
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
        await new Promise((r) => setTimeout(r, 2000));
        await refreshProfile();
        await refreshAIUsage();
        closePaywall();
        toast({ title: "Purchases restored!", description: "Premium access has been restored." });
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
    <div className="fixed inset-0 z-[10003] flex flex-col bg-background/98 dark:bg-background/99 backdrop-blur-xl animate-in fade-in duration-300">
      <button
        onClick={closePaywall}
        className="absolute right-4 z-10 h-11 w-11 flex items-center justify-center rounded-full bg-muted/30 dark:bg-white/10 border border-border/30 active:scale-90 transition-transform"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto" style={{ paddingTop: "calc(env(safe-area-inset-top, 16px) + 48px)", paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)" }}>
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 flex items-center justify-center mb-5">
          <Zap className="h-8 w-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center">Go Pro</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-[280px]">
          You've used your free AI analysis for today. Unlock unlimited access.
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
