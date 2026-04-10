import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, Shield, Zap, ChevronRight, Download, Droplets, Flame, Utensils, Wheat } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { CutPlanCard } from "@/components/share/cards/CutPlanCard";

interface WeekPlan {
  week: number;
  targetWeight: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  focus: string;
  tips?: string[];
}

interface FightWeekStrategy {
  lowCarb: string;
  sodium: string;
  waterLoading: string;
  nutrition: string;
}

interface CutPlan {
  weeklyPlan: WeekPlan[];
  summary: string;
  totalWeeks: number;
  weeklyLossTarget: string;
  maintenanceCalories?: number;
  deficit?: number;
  targetCalories?: number;
  safetyNotes: string;
  fightWeek?: FightWeekStrategy;
  fightWeekStrategy?: string; // backwards compat
  keyPrinciples: string[];
}

export default function CutPlanReview() {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const planData = useMemo(() => {
    try {
      const raw = localStorage.getItem("wcw_cut_plan");
      if (!raw) return null;
      return JSON.parse(raw) as CutPlan & { currentWeight?: number; goalWeight?: number; targetDate?: string };
    } catch {
      return null;
    }
  }, []);

  if (!planData) {
    // No plan available — show message with link to dashboard
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

  const plan = planData as CutPlan;
  const currentWeight = (planData as any).currentWeight || plan.weeklyPlan[0]?.targetWeight || 0;
  const goalWeight = (planData as any).goalWeight || plan.weeklyPlan[plan.weeklyPlan.length - 1]?.targetWeight || 0;
  const targetDate = (planData as any).targetDate || "";

  const handleContinue = () => {
    triggerHaptic(ImpactStyle.Medium);
    localStorage.setItem("wcw_cut_plan_seen", "true");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground safe-area-inset-top safe-area-inset-bottom">
      <div className="max-w-lg mx-auto px-4 py-6 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)]">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
            <TrendingDown className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-1">Your Weight Cut Plan</h1>
          <p className="text-sm text-muted-foreground">Personalised · Science-backed · Adaptive</p>
        </div>

        {/* Summary */}
        <div className="card-surface rounded-xl p-4 mb-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{plan.summary}</p>
        </div>

        {/* Your Numbers */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {plan.maintenanceCalories && (
            <div className="card-surface rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Maintenance</p>
              <p className="text-lg font-bold display-number">{plan.maintenanceCalories}</p>
              <p className="text-[10px] text-muted-foreground">kcal/day</p>
            </div>
          )}
          {plan.deficit && (
            <div className="card-surface rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deficit</p>
              <p className="text-lg font-bold display-number text-destructive">-{plan.deficit}</p>
              <p className="text-[10px] text-muted-foreground">kcal/day</p>
            </div>
          )}
          {plan.targetCalories && (
            <div className="card-surface rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</p>
              <p className="text-lg font-bold display-number text-primary">{plan.targetCalories}</p>
              <p className="text-[10px] text-muted-foreground">kcal/day</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="card-surface rounded-xl p-3 flex-1 text-center">
            <p className="text-[10px] text-muted-foreground">Weekly Loss</p>
            <p className="text-sm font-bold display-number">{plan.weeklyLossTarget}</p>
          </div>
          <div className="card-surface rounded-xl p-3 flex-1 text-center">
            <p className="text-[10px] text-muted-foreground">Duration</p>
            <p className="text-sm font-bold display-number">{plan.totalWeeks} weeks</p>
          </div>
        </div>

        {/* Week-by-week */}
        <p className="section-header mb-2">Week-by-Week Plan</p>
        <div className="space-y-2 mb-4">
          {plan.weeklyPlan.map((week) => (
            <div key={week.week} className="card-surface rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-foreground">Week {week.week}</span>
                <span className="text-xs font-bold display-number text-primary">{week.targetWeight.toFixed(1)} kg</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Cal</p>
                  <p className="text-xs font-semibold display-number">{week.calories}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Protein</p>
                  <p className="text-xs font-semibold display-number">{week.protein_g}g</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Carbs</p>
                  <p className="text-xs font-semibold display-number">{week.carbs_g}g</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Fat</p>
                  <p className="text-xs font-semibold display-number">{week.fats_g}g</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{week.focus}</p>
            </div>
          ))}
        </div>

        {/* Key Principles */}
        <p className="section-header mb-2">Key Principles</p>
        <div className="card-surface rounded-xl p-4 mb-3 space-y-2">
          {plan.keyPrinciples.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <p className="text-sm text-muted-foreground">{p}</p>
            </div>
          ))}
        </div>

        {/* Fight Week Strategy — structured sections */}
        <p className="section-header mb-2">Fight Week — Final Week Game Plan</p>

        {plan.fightWeek ? (
          <div className="space-y-2 mb-4">
            <div className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wheat className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold">Low Carb</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.fightWeek.lowCarb}</p>
            </div>

            <div className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-semibold">Sodium</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.fightWeek.sodium}</p>
            </div>

            <div className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Droplets className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-semibold">Water Loading</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.fightWeek.waterLoading}</p>
            </div>

            <div className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Utensils className="h-4 w-4 text-green-400" />
                <span className="text-sm font-semibold">What to Eat</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.fightWeek.nutrition}</p>
            </div>
          </div>
        ) : plan.fightWeekStrategy ? (
          <div className="card-surface rounded-xl p-4 mb-4 border-l-2 border-l-warning">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-4 w-4 text-warning" />
              <span className="text-sm font-semibold">Final Week</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{plan.fightWeekStrategy}</p>
          </div>
        ) : null}

        {/* Safety */}
        <div className="card-surface rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="h-4 w-4 text-success" />
            <span className="text-sm font-semibold">Safety</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{plan.safetyNotes}</p>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl bg-muted/50 p-4 mb-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This is a rough plan to help you feel on track. Use the tools in the app to recalculate if you're slightly ahead or behind schedule. <span className="font-semibold text-foreground">FightCamp Wizard adapts alongside you</span> — not a cookie-cutter plan.
          </p>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button onClick={handleContinue} className="w-full h-12 text-base font-bold">
            Continue to Dashboard
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            onClick={() => setShareOpen(true)}
            variant="outline"
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            Save to Gallery
          </Button>
        </div>
      </div>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Weight Cut Plan"
        shareTitle="My Weight Cut Plan"
        shareText="Check out my personalised weight cut plan from FightCamp Wizard"
      >
        {({ cardRef, aspect }) => (
          <CutPlanCard
            ref={cardRef}
            plan={plan}
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
