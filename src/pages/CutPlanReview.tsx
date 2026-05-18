/**
 * CutPlanReview — standalone review of the cut plan persisted on the
 * profile. Renders the same `InlinePlanDisplay` v3 timeline as the
 * onboarding finale so the user sees ONE consistent plan UI everywhere
 * (the previous bespoke wall-of-text version was replaced 2026-05-18).
 *
 * The plan source is `localStorage.wcw_cut_plan`, written by Onboarding
 * after a successful AI generation. The shape matches the server's
 * `CutPlanSchema` v2 (weeklyPlan with phase/heroLine/keyMetric/
 * dailyFocus, plus phases[], personalNote, toughestWeek, fightWeek).
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, Download, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { CutPlanCard } from "@/components/share/cards/CutPlanCard";
import { InlinePlanDisplay } from "@/components/onboarding/InlinePlanDisplay";

export default function CutPlanReview() {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const planData = useMemo(() => {
    try {
      const raw = localStorage.getItem("wcw_cut_plan");
      if (!raw) return null;
      return JSON.parse(raw) as any;
    } catch {
      return null;
    }
  }, []);

  if (!planData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <TrendingDown className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No plan generated yet.</p>
          <Button onClick={() => navigate("/dashboard", { replace: true })}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const isWeightLoss = planData?.planType === "weight_loss";
  const currentWeight =
    planData.currentWeight ?? planData.weeklyPlan?.[0]?.targetWeight ?? 0;
  const goalWeight =
    planData.goalWeight ??
    planData.weeklyPlan?.[planData.weeklyPlan.length - 1]?.targetWeight ??
    0;
  const targetDate = planData.targetDate || "";
  const shareTitle = isWeightLoss ? "My Weight Loss Plan" : "My Weight Cut Plan";
  const shareCardTitle = isWeightLoss ? "Weight Loss Plan" : "Weight Cut Plan";
  const shareCardText = isWeightLoss
    ? "Check out my personalised weight loss plan from FightCamp Wizard"
    : "Check out my personalised weight cut plan from FightCamp Wizard";

  const handleContinue = () => {
    triggerHaptic(ImpactStyle.Medium);
    localStorage.setItem("wcw_cut_plan_seen", "true");
    localStorage.setItem("wcw_onboarding_just_completed", "true");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground safe-area-inset-top safe-area-inset-bottom">
      <div className="max-w-lg mx-auto px-4 pt-6 relative">
        {/* Close button — sticks at top-right above the timeline. */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(ImpactStyle.Light);
            if (window.history.length > 1) navigate(-1);
            else navigate("/dashboard", { replace: true });
          }}
          aria-label="Close cut plan"
          className="absolute top-4 right-3 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground/70 bg-muted/40 dark:bg-white/[0.06] border border-border/30 active:text-foreground active:bg-muted/60 transition-colors z-30"
        >
          <X className="h-4 w-4" strokeWidth={2.4} />
        </button>

        {/* Reuse the onboarding plan timeline — same component, same data
            shape. Its built-in sticky CTA fires `handleContinue` which
            sets the post-onboarding flags and routes to /dashboard. */}
        <InlinePlanDisplay
          plan={planData}
          planType={isWeightLoss ? "weight_loss" : "cut"}
          onContinue={handleContinue}
        />

        {/* Secondary "Save to Gallery" share button — anchored above the
            sticky CTA via extra bottom padding inherited from
            InlinePlanDisplay's `pb-24`. */}
        <div className="-mt-16 mb-20">
          <Button
            onClick={() => setShareOpen(true)}
            variant="outline"
            className="w-full h-10 text-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Save to Gallery
          </Button>
        </div>
      </div>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={shareCardTitle}
        shareTitle={shareTitle}
        shareText={shareCardText}
      >
        {({ cardRef, aspect }) => (
          <CutPlanCard
            ref={cardRef}
            plan={planData}
            currentWeight={currentWeight}
            goalWeight={goalWeight}
            targetDate={targetDate}
            aspect={aspect}
          />
        )}
      </ShareCardDialog>
    </div>
  );
}
