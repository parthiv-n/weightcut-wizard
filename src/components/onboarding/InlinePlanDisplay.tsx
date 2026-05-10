import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  TrendingDown,
  Shield,
  Zap,
  Droplets,
  Flame,
  Utensils,
  Wheat,
} from "lucide-react";

// Same shape as CutPlanReview.tsx — kept locally to avoid coupling.
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

interface PlanData {
  weeklyPlan: WeekPlan[];
  summary: string;
  totalWeeks: number;
  weeklyLossTarget: string;
  maintenanceCalories?: number;
  deficit?: number;
  targetCalories?: number;
  safetyNotes: string;
  fightWeek?: FightWeekStrategy;
  fightWeekStrategy?: string;
  keyPrinciples: string[];
  currentWeight?: number;
  goalWeight?: number;
  targetDate?: string;
}

interface InlinePlanDisplayProps {
  plan: any; // PlanData shape, same as CutPlanReview's
  planType: "cut" | "weight_loss";
  onContinue: () => void;
}

export function InlinePlanDisplay({
  plan,
  planType,
  onContinue,
}: InlinePlanDisplayProps): JSX.Element {
  const planData = plan as PlanData;
  const isWeightLoss = planType === "weight_loss";

  const currentWeight =
    planData.currentWeight ?? planData.weeklyPlan?.[0]?.targetWeight ?? 0;
  const goalWeight =
    planData.goalWeight ??
    planData.weeklyPlan?.[planData.weeklyPlan.length - 1]?.targetWeight ??
    0;

  const headerTitle = isWeightLoss
    ? "Your Weight Loss Plan"
    : "Your Weight Cut Plan";
  const headerSubtitle = isWeightLoss
    ? "Personalised · Sustainable · Adaptive"
    : "Personalised · Science-backed · Adaptive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="w-full"
    >
      {/* Header — compact, no back button (owned by Onboarding) */}
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 mb-3">
          <TrendingDown className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight mb-1">{headerTitle}</h2>
        <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
      </div>

      {/* Summary — structured breakdown */}
      <div className="card-surface rounded-2xl p-4 mb-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 dark:bg-white/[0.03] p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Start
            </p>
            <p className="text-lg font-bold tabular-nums">
              {currentWeight}
              <span className="text-xs font-normal text-muted-foreground ml-0.5">
                kg
              </span>
            </p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-center">
            <p className="text-[10px] text-primary uppercase tracking-wider">
              Target
            </p>
            <p className="text-lg font-bold tabular-nums text-primary">
              {goalWeight}
              <span className="text-xs font-normal text-primary/60 ml-0.5">
                kg
              </span>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/30 dark:bg-white/[0.03] p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Duration
            </p>
            <p className="text-sm font-bold tabular-nums">
              {planData.totalWeeks}{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                wks
              </span>
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 dark:bg-white/[0.03] p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Weekly Loss
            </p>
            <p className="text-sm font-bold tabular-nums">
              {planData.weeklyLossTarget}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 dark:bg-white/[0.03] p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Total
            </p>
            <p className="text-sm font-bold tabular-nums">
              {Math.abs(currentWeight - goalWeight).toFixed(1)}{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                kg
              </span>
            </p>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {planData.summary}
        </p>
      </div>

      {/* Your Numbers */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {planData.maintenanceCalories && (
          <div className="card-surface rounded-2xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Maintenance
            </p>
            <p className="text-lg font-bold display-number">
              {Math.round(planData.maintenanceCalories / 100) * 100}
            </p>
            <p className="text-[10px] text-muted-foreground">kcal/day</p>
          </div>
        )}
        {planData.deficit && (
          <div className="card-surface rounded-2xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Deficit
            </p>
            <p className="text-lg font-bold display-number text-destructive">
              -{Math.round(planData.deficit / 100) * 100}
            </p>
            <p className="text-[10px] text-muted-foreground">kcal/day</p>
          </div>
        )}
        {planData.targetCalories && (
          <div className="card-surface rounded-2xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Target
            </p>
            <p className="text-lg font-bold display-number text-primary">
              {Math.round(planData.targetCalories / 100) * 100}
            </p>
            <p className="text-[10px] text-muted-foreground">kcal/day</p>
          </div>
        )}
      </div>

      {/* Week-by-week */}
      <p className="section-header mb-2">Week-by-Week Plan</p>
      <div className="space-y-2 mb-4">
        {planData.weeklyPlan.map((week) => (
          <div key={week.week} className="card-surface rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-foreground">
                Week {week.week}
              </span>
              <span className="text-xs font-bold display-number text-primary">
                {week.targetWeight.toFixed(1)} kg
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Cal</p>
                <p className="text-xs font-semibold display-number">
                  {Math.round(week.calories / 100) * 100}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Protein</p>
                <p className="text-xs font-semibold display-number">
                  {week.protein_g}g
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Carbs</p>
                <p className="text-xs font-semibold display-number">
                  {week.carbs_g}g
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Fat</p>
                <p className="text-xs font-semibold display-number">
                  {week.fats_g}g
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{week.focus}</p>
          </div>
        ))}
      </div>

      {/* Key Principles */}
      <p className="section-header mb-2">Key Principles</p>
      <div className="card-surface rounded-2xl p-4 mb-3 space-y-2">
        {planData.keyPrinciples.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{p}</p>
          </div>
        ))}
      </div>

      {/* Fight Week Strategy — cutting flow only */}
      {!isWeightLoss && (
        <p className="section-header mb-2">Fight Week — Final Week Game Plan</p>
      )}

      {!isWeightLoss && planData.fightWeek ? (
        <div className="space-y-2 mb-4">
          <div className="card-surface rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wheat className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold">Low Carb</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {planData.fightWeek.lowCarb}
            </p>
          </div>

          <div className="card-surface rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-semibold">Sodium</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {planData.fightWeek.sodium}
            </p>
          </div>

          <div className="card-surface rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold">Water Loading</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {planData.fightWeek.waterLoading}
            </p>
          </div>

          <div className="card-surface rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Utensils className="h-4 w-4 text-green-400" />
              <span className="text-sm font-semibold">What to Eat</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {planData.fightWeek.nutrition}
            </p>
          </div>
        </div>
      ) : !isWeightLoss && planData.fightWeekStrategy ? (
        <div className="card-surface rounded-2xl p-4 mb-4 border-l-2 border-l-warning">
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold">Final Week</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {planData.fightWeekStrategy}
          </p>
        </div>
      ) : null}

      {/* Safety */}
      <div className="card-surface rounded-2xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold">Safety</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {planData.safetyNotes}
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-2xl bg-muted/50 p-4 mb-6">
        <p className="text-xs text-muted-foreground leading-relaxed">
          This is a rough plan to help you feel on track. Use the tools in the
          app to recalculate if you're slightly ahead or behind schedule.{" "}
          <span className="font-semibold text-foreground">
            FightCamp Wizard adapts alongside you
          </span>{" "}
          — not a cookie-cutter plan.
        </p>
      </div>

      {/* Continue — onboarding-style button, parent owns nav + localStorage */}
      <Button
        onClick={onContinue}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90"
      >
        Continue to Dashboard
      </Button>
    </motion.div>
  );
}
