import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useProfile, useAuth, useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle, CheckCircle, Zap, Shield,
  TrendingDown, ChevronLeft, Swords, Flame, Dumbbell,
  Moon, Brain, Gauge, Utensils, Loader2,
} from "lucide-react";
import { InlinePlanDisplay } from "@/components/onboarding/InlinePlanDisplay";
import { profileSchema } from "@/lib/validation";
import { celebrateSuccess, triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { seedDemoData } from "@/lib/demoData";
import { presentPaywallIfNeeded } from "@/lib/purchases";
import { Capacitor } from "@capacitor/core";
import { AnimatePresence, motion } from "motion/react";
import { springs } from "@/lib/motion";
import { XPProgressBar, CuttingNowChip, OnboardingMascot, DaysToFightSlam, WeightLossSlam, LossFrameCard, DeclarationButton, TaleOfTheTapeCard, MathWhisper, WittyValidation, sportVocab } from "@/components/onboarding/Gamification";

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const TOTAL_STEPS = 15;

// ── Selectable card ──
function OptionCard({ selected, icon, label, description, onClick }: {
  selected: boolean; icon?: React.ReactNode; label: string; description?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border transition-all active:scale-[0.98] text-left ${
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border/50 bg-card hover:bg-muted/30"
      }`}
    >
      {icon && <span className="text-lg flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />}
    </button>
  );
}

// ── Multi-select card ──
function MultiCard({ selected, label, onClick }: {
  selected: boolean; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border/50 bg-card hover:bg-muted/30"
      }`}
    >
      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        selected ? "border-primary bg-primary" : "border-muted-foreground/30"
      }`}>
        {selected && <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />}
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

/**
 * PlanRetryCard — appears on the final onboarding step ONLY when the AI
 * cut-plan generation fails. Replaces the previous misfire where the
 * app silently auto-navigated to /dashboard, stranding the user with
 * no plan and no tutorial. Both buttons are user-initiated, so the
 * navigation never happens behind their back.
 */
function PlanRetryCard({
  onRetry,
  onSkip,
}: {
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3">
      <div>
        <p className="text-[12px] uppercase tracking-wider font-bold text-amber-400/90">
          Plan didn't generate
        </p>
        <p className="text-[13px] text-foreground/85 leading-snug mt-1">
          The wizard couldn't put your plan together just now. Tap Retry, or
          skip to the dashboard and generate it later from Settings.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground text-[14px] font-semibold active:scale-[0.98] transition-transform"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 h-11 rounded-2xl bg-muted/40 text-foreground text-[14px] font-medium active:scale-[0.98] transition-transform"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/**
 * LosingProjectionChart — inline SVG that previews the user's projected
 * weight loss curve on the final onboarding step. Mirrors the visual
 * language of the cutting flow's chart (same card-surface, same line
 * weight, same dot styling) but is intentionally simpler: a single
 * steady line from `currentKg` → `goalKg` across the chosen `weeks`,
 * with a per-week-rate readout underneath so the user can see the
 * pace at a glance. Renders nothing if any input is missing or the
 * user is trying to *gain* weight (handled separately).
 */
function LosingProjectionChart({
  currentKg,
  goalKg,
  weeks,
}: {
  currentKg: number;
  goalKg: number;
  weeks: number;
}) {
  if (currentKg <= 0 || goalKg <= 0 || weeks <= 0) return null;
  if (currentKg <= goalKg) return null; // user wants to maintain or gain
  const totalKg = +(currentKg - goalKg).toFixed(1);
  const perWeek = +(totalKg / weeks).toFixed(2);

  // Same dimensions as the cutting chart so they read as one family.
  const W = 320, H = 170;
  const padL = 14, padR = 14, padT = 32, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const minW = goalKg;
  const maxW = currentKg;
  const wRange = Math.max(0.5, maxW - minW);
  const xFor = (week: number) => padL + (week / weeks) * innerW;
  const yFor = (w: number) => padT + (1 - (w - minW) / wRange) * innerH;
  const x1 = xFor(0), y1 = yFor(currentKg);
  const x2 = xFor(weeks), y2 = yFor(goalKg);
  const areaPath = `M ${x1} ${H - padB} L ${x1} ${y1} L ${x2} ${y2} L ${x2} ${H - padB} Z`;

  // Same safety palette the rest of the app uses for weekly rates.
  const rateClass =
    perWeek <= 1.0
      ? "text-emerald-400"
      : perWeek <= 1.5
        ? "text-amber-400"
        : "text-rose-400";
  const rateLabel =
    perWeek <= 1.0 ? "Safe" : perWeek <= 1.5 ? "Moderate" : "Aggressive";

  return (
    <div className="card-surface rounded-2xl border border-border/40 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-bold mb-1">
        Projected weight loss
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }} aria-label="Projected weight chart">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
        <path d={areaPath} fill="hsl(var(--primary))" opacity="0.10" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.5" />
        <circle cx={x2} cy={y2} r="4.5" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.5" />
        <text x={x1} y={y1 - 10} fontSize="10" fontWeight="600" textAnchor="start" fill="hsl(var(--foreground))">
          {currentKg.toFixed(1)}
        </text>
        <text x={x2} y={y2 - 10} fontSize="10" fontWeight="700" textAnchor="end" fill="hsl(var(--primary))">
          {goalKg.toFixed(1)}
        </text>
        <text x={x1} y={H - 10} fontSize="9" textAnchor="start" fill="hsl(var(--muted-foreground))">Now</text>
        <text x={x2} y={H - 10} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">
          Week {weeks}
        </text>
      </svg>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-muted-foreground">
          <span className="text-foreground font-semibold tabular-nums">{totalKg.toFixed(1)}</span> kg over{" "}
          <span className="text-foreground font-semibold tabular-nums">{weeks}</span>{" "}
          {weeks === 1 ? "week" : "weeks"}
        </span>
        <span className={`font-semibold tabular-nums ${rateClass}`}>
          {perWeek.toFixed(2)} kg/wk · {rateLabel}
        </span>
      </div>
    </div>
  );
}

// ── Screen layout wrapper ──
function StepLayout({ step, title, subtitle, children, footer, mascotBump }: {
  step: number; title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode; mascotBump?: number;
}) {
  return (
    <div className="relative flex flex-col min-h-[calc(100dvh-56px)] px-5 pb-6">
      <OnboardingMascot bumpCount={mascotBump ?? step} />
      <div className="pt-8 pb-5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60 font-bold mb-2">
          Round {step} of {TOTAL_STEPS}
        </p>
        <h1 className="text-[22px] font-bold leading-tight text-foreground">{title}</h1>
        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{subtitle}</p>
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="pt-4">{footer}</div>}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1); // 1=forward, -1=back
  const [loading, setLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  // Holds the AI-generated plan once it resolves. Rendered inline below the
  // chart on the final step instead of navigating to /cut-plan or /weight-plan.
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [generatedPlanType, setGeneratedPlanType] = useState<"cut" | "weight_loss">("cut");
  // True when the AI plan call returned null / threw. Surfaces a Retry +
  // Skip card on the final step instead of the misfiring auto-redirect
  // that previously dumped the user on an empty dashboard.
  const [planGenerationFailed, setPlanGenerationFailed] = useState(false);
  // Flips true the instant the user taps "Generate Plan" and stays true
  // until they explicitly click Continue. Suppresses the
  // hasProfile-watching redirect (line ~219) AND the early null-return
  // guard (line ~663) — both of which would otherwise fire the moment
  // `updateGoalsMut` writes the profile mid-handleSubmit and Convex's
  // reactive `profiles.getMine` query flips `hasProfile` to true. This
  // is THE bug that kept dumping users on the dashboard before the plan
  // had a chance to resolve.
  const [stayOnOnboarding, setStayOnOnboarding] = useState(false);
  const stayOnOnboardingRef = useRef(false);
  useEffect(() => { stayOnOnboardingRef.current = stayOnOnboarding; }, [stayOnOnboarding]);
  const navigate = useNavigate();
  const { refreshProfile } = useProfile();
  const { hasProfile, isLoading: authLoading, isCoach } = useAuth();
  const { userId, userName } = useUser();
  const { toast } = useToast();
  const generateCutPlanAction = useAction(api.actions.generateCutPlan.run);
  const generateWeightPlanAction = useAction(api.actions.generateWeightPlan.run);
  const updateGoalsMut = useMutation(api.profiles.updateGoals);

  const [formData, setFormData] = useState({
    // Screen 1 — flow split
    goal_type: "",
    // Screen 2 (cutting) — athlete types (multi)
    athlete_type: "",
    athlete_types: [] as string[],
    // Screen 2 (losing) — target weeks
    target_weeks: "",
    // Screen 3 (cutting only) — fight status
    has_fight: "",
    competition_level: "", // hobbyist | amateur | pro
    goal_weight_kg: "",
    fight_week_target_kg: "",
    target_date: "",
    // Screen 4
    height_cm: "",
    // Screen 5
    current_weight_kg: "",
    // Screen 6
    body_fat_pct: "",
    // Screen 7
    experience_level: "",
    // Screen 8
    training_frequency: "",
    // Screen 9
    training_types: [] as string[],
    // Screen 10
    sleep_hours: "",
    // Screen 11
    primary_struggle: "",
    // Screen 12
    plan_aggressiveness: "",
    // Derived
    sex: "male",
    age: "",
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);

  // Redirect if profile exists OR if this is a coach (coaches must never see
  // the fighter onboarding wizard — they go straight to /coach).
  useEffect(() => {
    if (authLoading) return;
    if (isCoach) {
      navigate("/coach", { replace: true });
      return;
    }
    // Suppress the hasProfile-bounce while the user is mid-final-step
    // (plan generating or already showing). Without this, the reactive
    // Convex query flips `hasProfile` true the moment we save the
    // profile and the user gets yanked to the dashboard before the
    // plan even starts.
    if (hasProfile && !stayOnOnboarding) navigate("/dashboard", { replace: true });
  }, [authLoading, hasProfile, isCoach, navigate, stayOnOnboarding]);

  // Step 13 (plan_aggressiveness — "how aggressive / how fast") only applies
  // to non-fighters. Fighters' pace is determined by the fight date alone, so
  // we skip the screen for them in both directions.
  const isFighterFlow = formData.goal_type === "cutting";

  // Step 3 in the cutting flow is split into 4 sub-pages (competition level,
  // fight date, weight class, pre-dehydration target) animated like the rest
  // of the flow. fightSubStep tracks 0-3; fightSubDirection drives the same
  // direction-aware spring slide as the outer step transitions.
  const [fightSubStep, setFightSubStep] = useState(0);
  const [fightSubDirection, setFightSubDirection] = useState(1);

  // submitRef lets goNext call handleSubmit (defined later) when the user
  // finishes the last step of either flow without forcing a code reorder.
  const submitRef = useRef<() => void>(() => {});

  const goNext = useCallback(() => {
    triggerHapticSelection();
    // Sub-step navigation within step 3 (cutting fight details)
    if (isFighterFlow && step === 3 && fightSubStep < 3) {
      setFightSubDirection(1);
      setFightSubStep(s => s + 1);
      return;
    }
    // End-of-flow: cutting ends at step 13 (preview chart + generate);
    // losing ends at step 13 (plan_aggressiveness). Submit instead of advancing.
    const isLastCutting = isFighterFlow && step === 13;
    const isLastLosing = !isFighterFlow && step === 13;
    if (isLastCutting || isLastLosing) {
      submitRef.current();
      return;
    }
    setDirection(1);
    setStep(prev => {
      const next = Math.min(prev + 1, 13);
      // Entering step 3 cutting from step 2 — start at first sub-page
      if (isFighterFlow && next === 3) {
        setFightSubStep(0);
        setFightSubDirection(1);
      }
      return next;
    });
  }, [isFighterFlow, step, fightSubStep]);

  const goBack = useCallback(() => {
    triggerHapticSelection();
    // Sub-step navigation within step 3 (cutting fight details)
    if (isFighterFlow && step === 3 && fightSubStep > 0) {
      setFightSubDirection(-1);
      setFightSubStep(s => s - 1);
      return;
    }
    setDirection(-1);
    setStep(prev => {
      const next = Math.max(prev - 1, 1);
      // Entering step 3 cutting from step 4 (back nav) — land on last sub-page
      if (isFighterFlow && next === 3) {
        setFightSubStep(3);
        setFightSubDirection(-1);
      }
      return next;
    });
  }, [isFighterFlow, step, fightSubStep]);

  // Single-select helper — sets field value, user taps Continue to advance.
  const selectAndAdvance = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    triggerHapticSelection();
  }, []);

  const toggleMulti = useCallback((field: "training_types" | "athlete_types", value: string) => {
    triggerHapticSelection();
    setFormData(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }, []);

  // Derive activity_level from training_frequency
  const deriveActivityLevel = (freq: string): string => {
    const f = parseInt(freq);
    if (f <= 2) return "lightly_active";
    if (f <= 4) return "moderately_active";
    if (f <= 6) return "very_active";
    return "extra_active";
  };

  // BMR calculation (Mifflin-St Jeor)
  const calculateBMR = () => {
    const weight = parseFloat(formData.current_weight_kg) || 70;
    const height = parseFloat(formData.height_cm) || 175;
    const age = parseInt(formData.age) || 25;
    if (formData.sex === "male") return 10 * weight + 6.25 * height - 5 * age + 5;
    return 10 * weight + 6.25 * height - 5 * age - 161;
  };

  // Fight week target calculations — water cut % scales with competition level
  // Hobbyist: 3% (safe, minimal water cut)
  // Amateur: 5.5% (standard safe dehydration)
  // Pro: 8% (aggressive, experienced athletes with medical oversight)
  const getWaterCutPercent = (level: string): number => {
    if (level === "pro") return 0.08;
    if (level === "amateur") return 0.055;
    return 0.03; // hobbyist
  };

  const getWaterCutLabel = (level: string): string => {
    if (level === "pro") return "8% water cut — aggressive, requires medical oversight";
    if (level === "amateur") return "5.5% water cut — standard safe dehydration";
    return "3% water cut — gentle, minimal risk";
  };

  const calculateRecommendedTarget = (fightNightWeight: number, level: string) => {
    const pct = getWaterCutPercent(level);
    return Math.round(fightNightWeight * (1 + pct) * 10) / 10;
  };

  useEffect(() => {
    if (useAutoTarget && formData.goal_weight_kg && formData.goal_type === "cutting") {
      const level = formData.competition_level || "amateur";
      const rec = calculateRecommendedTarget(parseFloat(formData.goal_weight_kg), level);
      setFormData(prev => ({ ...prev, fight_week_target_kg: rec.toString() }));
    }
  }, [formData.goal_weight_kg, formData.competition_level, useAutoTarget, formData.goal_type]);

  // Dynamic weight feedback
  const weightDiff = formData.current_weight_kg && formData.goal_weight_kg
    ? (parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg)).toFixed(1)
    : null;
  const weeksToFight = formData.target_date
    ? Math.max(1, Math.ceil((new Date(formData.target_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
    : null;

  // Days remaining until the user's fight date — drives DaysToFightSlam.
  const daysToFight = formData.target_date
    ? Math.max(1, Math.ceil((new Date(formData.target_date).getTime() - Date.now()) / 86400000))
    : null;

  // ── WeightLossSlam inputs ─────────────────────────────────────────
  // Fires once when the user has all three pieces locked (current
  // weight, goal weight, and a timeframe). Cutting flow uses the
  // computed `weeksToFight` from the target date; losing flow uses the
  // explicit `target_weeks` field. Slam dedupes internally on
  // (totalKg, weeks) so editing the weight by 0.1 kg won't re-fire.
  const totalKgToLose =
    formData.current_weight_kg && formData.goal_weight_kg
      ? Math.max(
          0,
          parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg),
        )
      : null;
  const slamWeeks = isFighterFlow
    ? weeksToFight
    : formData.target_weeks
      ? Math.max(1, parseInt(formData.target_weeks))
      : null;
  const perWeekKg =
    totalKgToLose != null && slamWeeks != null && slamWeeks > 0
      ? totalKgToLose / slamWeeks
      : null;

  // Sport vocabulary — derive once, reused in copy below.
  const vocab = sportVocab(formData.athlete_type || formData.athlete_types[0] || "");

  // Inline achievement chip — milestone fires keyed on `step`. Renders
  // beside the social-proof chip in the sticky header (see
  // `CuttingNowChip` consumption below). Haptic + auto-clear used to
  // live in the standalone `SilentAchievement` overlay; lifted here so
  // a single source of truth handles both the visual + the timer.
  const [achievementLabel, setAchievementLabel] = useState<string | null>(null);
  useEffect(() => {
    let label: string | null = null;
    if (step === 4) label = "Goal Locked";
    else if (step === 8) label = "Discipline Declared";
    else if (step === 13) label = "Camp Sealed";
    if (!label) return;
    setAchievementLabel(label);
    triggerHaptic(ImpactStyle.Medium);
    const t = setTimeout(() => setAchievementLabel(null), 2400);
    return () => clearTimeout(t);
  }, [step]);

  // Final-step declaration gate — before showing chart + Generate, ask the
  // user to hold-to-commit. Once declared, normal final-step content renders.
  const [declared, setDeclared] = useState(false);

  // ── Submit ──
  const handleSubmit = async () => {
    // Pin the user on the onboarding screen for the entire submit run
    // (and until they explicitly tap Continue on the inline plan or
    // Skip on the retry card). MUST be set BEFORE the first
    // updateGoalsMut call below — that mutation triggers Convex to
    // flip `hasProfile` true, which would otherwise yank the user to
    // the dashboard mid-flight.
    setStayOnOnboarding(true);
    // Quick age/sex prompt — we collect these minimally at submit time
    // since they don't need their own screen (low friction)
    if (!formData.age || !formData.sex) {
      // Default age 25, sex male if not set — user can change in settings later
      setFormData(prev => ({
        ...prev,
        age: prev.age || "25",
        sex: prev.sex || "male",
      }));
    }

    const activityLevel = deriveActivityLevel(formData.training_frequency);

    const validationResult = profileSchema.safeParse({
      age: parseInt(formData.age || "25"),
      height_cm: parseFloat(formData.height_cm),
      current_weight_kg: parseFloat(formData.current_weight_kg),
      goal_weight_kg: parseFloat(formData.goal_weight_kg),
      fight_week_target_kg: formData.goal_type === "cutting" ? parseFloat(formData.fight_week_target_kg) : undefined,
      training_frequency: parseInt(formData.training_frequency) || 3,
      body_fat_pct: formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : undefined,
    });

    if (!validationResult.success) {
      toast({ variant: "destructive", title: "Check your inputs", description: validationResult.error.errors[0].message });
      return;
    }

    setLoading(true);

    const isFighterFlow = formData.goal_type === "cutting";

    try {
      if (!userId) throw new Error("No user found");

      const bmr = calculateBMR();
      const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.55);
      const trainingFreq = parseInt(formData.training_frequency) || 3;

      const targetDate = formData.target_date || (() => {
        if (formData.target_weeks) {
          const weeks = parseInt(formData.target_weeks) || 12;
          return new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        }
        const diff = Math.abs(parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg));
        const weeks = Math.max(4, Math.ceil(diff / 0.5));
        return new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      })();

      // 1. Save profile via the Convex `updateGoals` mutation. The auth
      //    callback already inserted a placeholder profile row; this is the
      //    first authoritative write of the user's onboarding answers.
      await updateGoalsMut({
        age: parseInt(formData.age || "25"),
        sex: formData.sex || "male",
        heightCm: parseFloat(formData.height_cm),
        currentWeightKg: parseFloat(formData.current_weight_kg),
        goalWeightKg: parseFloat(formData.goal_weight_kg),
        fightWeekTargetKg: isFighterFlow ? parseFloat(formData.fight_week_target_kg) : undefined,
        targetDate,
        activityLevel,
        trainingFrequency: trainingFreq,
        goalType: formData.goal_type || "losing",
        bmr,
        tdee,
        athleteType: formData.athlete_types.length > 0
          ? formData.athlete_types.join(",")
          : (formData.athlete_type || undefined),
        experienceLevel: formData.experience_level || undefined,
        trainingTypes: formData.training_types.length > 0 ? formData.training_types : undefined,
        sleepHours: formData.sleep_hours || undefined,
        primaryStruggle: formData.primary_struggle || undefined,
        planAggressiveness: formData.plan_aggressiveness || "balanced",
        bodyFatPct: formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : undefined,
      });

      // 2. Mark generation as in-flight — this drives the inline pill near
      //    the Generate button. The chart page stays visible behind it; we no
      //    longer route to a full-screen overlay or to /cut-plan|/weight-plan.
      setGeneratingPlan(true);

      // Fire the AI plan. Resolves with the saved plan payload (or null on
      // failure) so we can render it in-place once it lands.
      const planPromise: Promise<any | null> = (async () => {
        try {
          if (isFighterFlow) {
            // Touch values that the Convex action sources from server snapshot
            // so unused-locals lint stays happy on this shortened payload.
            void trainingFreq; void bmr; void tdee;
            let planData: any = null;
            try {
              planData = await generateCutPlanAction({
                currentWeight: parseFloat(formData.current_weight_kg),
                goalWeight: parseFloat(formData.goal_weight_kg),
                fightWeekTargetKg: parseFloat(formData.fight_week_target_kg),
                targetDate: formData.target_date,
                age: parseInt(formData.age || "25"),
                sex: (formData.sex === "female" ? "female" : "male") as "male" | "female",
                heightCm: parseFloat(formData.height_cm),
                activityLevel,
              });
            } catch (planError) {
              logger.warn("Cut plan generation failed", { error: planError });
            }
            const plan = planData?.plan || planData;
            if (plan?.weeklyPlan) {
              const planPayload = {
                ...plan,
                currentWeight: parseFloat(formData.current_weight_kg),
                goalWeight: parseFloat(formData.goal_weight_kg),
                targetDate: formData.target_date,
              };
              localStorage.setItem("wcw_cut_plan", JSON.stringify(planPayload));
              const week1 = plan.weeklyPlan[0];
              await updateGoalsMut({
                cutPlanJson: planPayload,
                ...(week1 ? {
                  aiRecommendedCalories: week1.calories,
                  aiRecommendedProteinG: week1.protein_g,
                  aiRecommendedCarbsG: week1.carbs_g,
                  aiRecommendedFatsG: week1.fats_g,
                } : {}),
              });
              return planPayload;
            }
            return null;
          } else {
            logger.info("Generating weight loss plan for non-fighter", { goalType: formData.goal_type, targetWeeks: formData.target_weeks });
            const targetWeeks = parseInt(formData.target_weeks) || Math.max(4, Math.ceil(Math.abs(parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg)) / 0.5));
            // Derive target date from target weeks since Convex action expects a date.
            const derivedTargetDate = formData.target_date
              || new Date(Date.now() + targetWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            void trainingFreq; void bmr; void tdee;
            let planData: any = null;
            try {
              planData = await generateWeightPlanAction({
                currentWeight: parseFloat(formData.current_weight_kg),
                goalWeight: parseFloat(formData.goal_weight_kg),
                targetDate: derivedTargetDate,
                age: parseInt(formData.age || "25"),
                sex: (formData.sex === "female" ? "female" : "male") as "male" | "female",
                heightCm: parseFloat(formData.height_cm),
                activityLevel,
                goalType: formData.goal_type,
              });
            } catch (planError) {
              logger.warn("Weight plan generation failed", { error: planError });
            }
            const plan = planData?.plan || planData;
            if (plan?.weeklyPlan) {
              const planPayload = {
                ...plan,
                currentWeight: parseFloat(formData.current_weight_kg),
                goalWeight: parseFloat(formData.goal_weight_kg),
                targetDate: formData.target_date,
                planType: "weight_loss",
              };
              localStorage.setItem("wcw_cut_plan", JSON.stringify(planPayload));
              const week1 = plan.weeklyPlan[0];
              await updateGoalsMut({
                cutPlanJson: planPayload,
                ...(week1 ? {
                  aiRecommendedCalories: week1.calories,
                  aiRecommendedProteinG: week1.protein_g,
                  aiRecommendedCarbsG: week1.carbs_g,
                  aiRecommendedFatsG: week1.fats_g,
                } : {}),
              });
              return planPayload;
            }
            return null;
          }
        } catch (planErr) {
          logger.warn("Plan generation error", { err: String(planErr) });
          return null;
        }
      })();

      // 3. Show the RevenueCat paywall in parallel with generation. The user
      //    only sees the inline pill on the chart page; no full-screen takeover.
      if (Capacitor.isNativePlatform()) {
        try {
          await presentPaywallIfNeeded();
          await refreshProfile();
        } catch (err) { logger.warn("Paywall presentation error", { err: String(err) }); }
      }

      // 4. Await the plan. The inline pill stays visible until it resolves.
      const planPayload = await planPromise;

      await refreshProfile();
      if (userId) seedDemoData(userId);

      if (planPayload) {
        localStorage.removeItem("wcw_cut_plan_seen"); // Force user to see plan first
        celebrateSuccess();
        // Render the plan in-place below the chart. The Continue button on
        // InlinePlanDisplay sets `wcw_onboarding_just_completed` and routes
        // to /dashboard, which auto-triggers the tutorial flow.
        setGeneratedPlanType(isFighterFlow ? "cut" : "weight_loss");
        setGeneratedPlan(planPayload);
        setGeneratingPlan(false);
        setPlanGenerationFailed(false);
      } else {
        // Plan generation failed. Stay on the onboarding screen and
        // surface inline retry / skip controls — never auto-navigate to
        // the dashboard, because that strands the user with no plan, no
        // tutorial, and no path forward.
        setGeneratingPlan(false);
        setPlanGenerationFailed(true);
        toast({
          title: "Couldn't build your plan",
          description: "Tap Retry to try again, or skip to the dashboard.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      logger.error("Onboarding failed", error);
      setGeneratingPlan(false);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Wire submitRef so goNext can fire handleSubmit at end-of-flow.
  submitRef.current = handleSubmit;

  // Continue handler for the in-page plan view. Sets the flag the
  // TutorialContext watches for the first-run tutorial flow. Releases
  // the stayOnOnboarding pin LAST so any re-render between setState
  // and navigate doesn't trigger the hasProfile-bounce useEffect.
  const handleContinueToDashboard = useCallback(() => {
    localStorage.setItem("wcw_onboarding_just_completed", "1");
    setStayOnOnboarding(false);
    navigate("/dashboard");
  }, [navigate]);

  // Retry handler when plan generation failed inline. Resets the
  // failure flag and re-runs handleSubmit so the user doesn't have to
  // re-enter any data — they stay on the final step throughout.
  const handleRetryPlan = useCallback(() => {
    setPlanGenerationFailed(false);
    submitRef.current();
  }, []);

  // Skip handler — only available after a failed plan generation. Marks
  // onboarding complete (so we don't loop) and routes to the dashboard
  // without a plan. The tutorial still fires there.
  const handleSkipPlan = useCallback(() => {
    setPlanGenerationFailed(false);
    handleContinueToDashboard();
  }, [handleContinueToDashboard]);

  // ── Slam re-arm booleans ──────────────────────────────────────────
  // Each slam shows on the rising edge of (armed && data-valid). The
  // booleans below are true while the user is on the screen that owns
  // the data — so leaving and re-entering the step naturally re-arms
  // the slam.
  // - DaysToFightSlam: cutting flow only, fires on the date sub-step.
  // - WeightLossSlam: cutting → step 6 (current weight, last piece);
  //                   losing  → step 4 (goal weight, last piece).
  const daysSlamArmed = isFighterFlow && step === 3 && fightSubStep === 1;
  const weightSlamArmed =
    (isFighterFlow && step === 6) || (!isFighterFlow && step === 4);

  // Same gate as the redirect useEffect — when stayOnOnboarding is true
  // we MUST keep the page mounted even if `hasProfile` has flipped, or
  // the in-flight plan generation tears down with no UI to land in.
  if (authLoading || isCoach) return null;
  if (hasProfile && !stayOnOnboarding) return null;

  // ── Render screens ──
  return (
    <div className="min-h-screen bg-background dark:bg-[#020204]">
      {/* Persistent gamification header — XP bar + social-proof chip
          stay PINNED at the top of the viewport like a normal progress
          bar, regardless of scroll. The old thin gradient progress bar
          + separate back-arrow row above this got removed once the XP
          bar took over: it was redundant feedback eating vertical
          space. The back arrow now lives inside this same sticky
          wrapper, top-left, so the user keeps the gesture without the
          extra header row. z-[10005] keeps the bar above the slams'
          z-[10003] backdrop so the XP bar stays sharp + readable while
          the slam dims the rest of the screen. */}
      <div
        className="sticky z-[10005] bg-background/85 backdrop-blur-md pb-2 border-b border-border/30"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Compact back-arrow row — sits flush above the XP bar so we
            don't lose the gesture, but takes only the minimal height
            an icon button needs (no duplicate progress track). */}
        <div className="px-3 pt-2 h-8 flex items-center">
          {step > 1 ? (
            <button
              onClick={goBack}
              aria-label="Back"
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/50 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
          ) : (
            // Reserve the same 32px so the XP bar's vertical position
            // doesn't jump on step 1 → step 2.
            <div className="h-8 w-8" />
          )}
        </div>
        <XPProgressBar step={step} totalSteps={13} />
        <CuttingNowChip achievementLabel={achievementLabel} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: direction > 0 ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -60 : 60 }}
          transition={springs.responsive}
        >

        {/* ── Screen 1: Flow Split — "What brings you here?" ── */}
        {step === 1 && (
          <StepLayout step={1} title="What brings you here?" subtitle="We'll build your plan around this."
            footer={<Button onClick={goNext} disabled={!formData.goal_type}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "cutting", label: "I have a fight coming up", description: "Structured weight cut with a deadline", icon: <Swords className="h-5 w-5 text-red-400" /> },
                { value: "losing", label: "I want to lose weight", description: "Steady, sustainable fat loss", icon: <Flame className="h-5 w-5 text-orange-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.goal_type === opt.value} icon={opt.icon}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("goal_type", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 2: Branching ── */}
        {step === 2 && formData.goal_type === "cutting" && (
          <StepLayout step={2} title="What's your discipline?" subtitle={`Pick your sport${userName ? `, ${userName}` : ""} — we'll tailor everything to it.`}
            footer={<Button onClick={goNext} disabled={formData.athlete_types.length === 0}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "muay_thai", label: "Muay Thai", icon: <Swords className="h-5 w-5 text-orange-400" /> },
                { value: "boxing", label: "Boxing", icon: <Swords className="h-5 w-5 text-red-400" /> },
                { value: "mma", label: "MMA", icon: <Swords className="h-5 w-5 text-blue-400" /> },
                { value: "bjj", label: "BJJ", icon: <Swords className="h-5 w-5 text-purple-400" /> },
                { value: "wrestling", label: "Wrestling", icon: <Swords className="h-5 w-5 text-green-400" /> },
                { value: "kickboxing", label: "Kickboxing", icon: <Swords className="h-5 w-5 text-yellow-400" /> },
                { value: "judo", label: "Judo", icon: <Swords className="h-5 w-5 text-indigo-400" /> },
                { value: "karate", label: "Karate", icon: <Swords className="h-5 w-5 text-rose-400" /> },
                { value: "other", label: "Other", icon: <Dumbbell className="h-5 w-5 text-muted-foreground" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.athlete_types.includes(opt.value)} icon={opt.icon}
                  label={opt.label} onClick={() => toggleMulti("athlete_types", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}
        {/* ── Lose weight flow: Screen 2 — Current Weight ── */}
        {step === 2 && formData.goal_type === "losing" && (
          <StepLayout step={2} title="What's your current weight?" subtitle="Step on the scale — this is your starting line."
            footer={<Button onClick={goNext} disabled={!formData.current_weight_kg}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-8 gap-6">
              <div className="text-center">
                <motion.span
                  key={formData.current_weight_kg || "empty"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-foreground inline-block"
                >
                  {formData.current_weight_kg || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">kg</span>
              </div>
              <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 85"
                value={formData.current_weight_kg}
                onChange={e => setFormData(prev => ({ ...prev, current_weight_kg: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />
            </div>
          </StepLayout>
        )}

        {/* ── Lose weight flow: Screen 3 — Goal Weight ── */}
        {step === 3 && formData.goal_type === "losing" && (
          <StepLayout step={3} title="What's your goal weight?" subtitle="The weight you want to reach."
            footer={<Button onClick={goNext} disabled={!formData.goal_weight_kg}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-8 gap-6">
              <div className="text-center">
                <motion.span
                  key={formData.goal_weight_kg || "empty-goal"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-primary inline-block"
                >
                  {formData.goal_weight_kg || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">kg</span>
              </div>
              <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 75"
                value={formData.goal_weight_kg}
                onChange={e => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />
              {formData.current_weight_kg && formData.goal_weight_kg && (
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{Math.abs(parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg)).toFixed(1)} kg</strong> to {parseFloat(formData.current_weight_kg) > parseFloat(formData.goal_weight_kg) ? "lose" : "gain"}
                </p>
              )}
            </div>
          </StepLayout>
        )}

        {/* ── Lose weight flow: Screen 4 — Timeframe + Calculation ── */}
        {step === 4 && formData.goal_type === "losing" && (
          <StepLayout step={4} title="How long do you want to take?" subtitle="We'll calculate your weekly target."
            footer={<Button onClick={goNext} disabled={!formData.target_weeks || parseInt(formData.target_weeks) < 1}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-6 gap-5">
              <div className="text-center">
                <motion.span
                  key={formData.target_weeks || "empty-weeks"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-foreground inline-block"
                >
                  {formData.target_weeks || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">weeks</span>
              </div>
              <Input type="number" inputMode="numeric" placeholder="e.g. 12"
                value={formData.target_weeks}
                onChange={e => setFormData(prev => ({ ...prev, target_weeks: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />

              {/* Live kg/week calculation + safety advice */}
              {formData.current_weight_kg && formData.goal_weight_kg && formData.target_weeks && parseInt(formData.target_weeks) > 0 && (() => {
                const diff = Math.abs(parseFloat(formData.current_weight_kg) - parseFloat(formData.goal_weight_kg));
                const weeks = parseInt(formData.target_weeks);
                const kgPerWeek = diff / weeks;
                const isSafe = kgPerWeek <= 0.75;
                const isModerate = kgPerWeek > 0.75 && kgPerWeek <= 1.0;
                const isAggressive = kgPerWeek > 1.0 && kgPerWeek <= 1.5;
                const isDangerous = kgPerWeek > 1.5;

                return (
                  <div className="w-full max-w-[280px] space-y-3">
                    <div className={`rounded-2xl p-4 text-center border ${
                      isSafe ? "bg-emerald-500/5 border-emerald-500/20" :
                      isModerate ? "bg-primary/5 border-primary/20" :
                      isAggressive ? "bg-yellow-500/5 border-yellow-500/20" :
                      "bg-red-500/5 border-red-500/20"
                    }`}>
                      <p className={`text-2xl font-black tabular-nums ${
                        isSafe ? "text-emerald-400" : isModerate ? "text-primary" : isAggressive ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {kgPerWeek.toFixed(1)} <span className="text-sm font-semibold">kg/week</span>
                      </p>
                      <p className={`text-xs mt-1 font-medium ${
                        isSafe ? "text-emerald-400" : isModerate ? "text-primary" : isAggressive ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {isSafe ? "Safe & sustainable" : isModerate ? "Good pace" : isAggressive ? "Aggressive — stay disciplined" : "Very aggressive — consider more time"}
                      </p>
                    </div>
                    {isDangerous && (
                      <p className="text-[11px] text-muted-foreground text-center leading-snug">
                        Losing more than 1.5 kg/week risks muscle loss and fatigue. Try adding a few more weeks for better results.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 3: Fight Details (cutting flow only) — 4 sub-pages ── */}
        {step === 3 && formData.goal_type === "cutting" && (() => {
          const subTitles = [
            { title: "Competition level", subtitle: "We use this to set your safe water cut limit." },
            { title: "When's the fight?", subtitle: "We'll plan backwards from your fight date." },
            { title: "What's your weight class?", subtitle: "The weight you'll weigh in at." },
            { title: "Pre-dehydration target", subtitle: "Your fight week target before the cut." },
          ];
          const t = subTitles[fightSubStep];
          const continueDisabled =
            (fightSubStep === 0 && !formData.competition_level) ||
            (fightSubStep === 1 && !formData.target_date) ||
            (fightSubStep === 2 && !formData.goal_weight_kg) ||
            (fightSubStep === 3 && !formData.fight_week_target_kg);
          return (
            <StepLayout step={3} title={t.title} subtitle={t.subtitle}
              mascotBump={step * 10 + fightSubStep}
              footer={
                <Button onClick={goNext} disabled={continueDisabled}
                  className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={fightSubStep}
                  initial={{ opacity: 0, x: fightSubDirection > 0 ? 60 : -60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: fightSubDirection > 0 ? -60 : 60 }}
                  transition={springs.responsive}
                >
                  {/* Sub-page 0: Competition level */}
                  {fightSubStep === 0 && (
                    <div className="space-y-2.5">
                      {[
                        { value: "hobbyist", label: "Hobbyist", description: "3% water cut — gentle, minimal risk", icon: <Shield className="h-5 w-5 text-emerald-400" /> },
                        { value: "amateur", label: "Amateur", description: "5.5% water cut — standard safe dehydration", icon: <Gauge className="h-5 w-5 text-amber-400" /> },
                        { value: "pro", label: "Pro", description: "8% water cut — aggressive, requires medical oversight", icon: <Flame className="h-5 w-5 text-red-400" /> },
                      ].map(opt => (
                        <OptionCard key={opt.value} selected={formData.competition_level === opt.value} icon={opt.icon}
                          label={opt.label} description={opt.description}
                          onClick={() => { selectAndAdvance("competition_level", opt.value); setFormData(prev => ({ ...prev, has_fight: "yes" })); }} />
                      ))}
                    </div>
                  )}

                  {/* Sub-page 1: Fight date */}
                  {fightSubStep === 1 && (
                    <div className="flex flex-col items-center pt-8 gap-6">
                      <div className="text-center">
                        <motion.span
                          key={formData.target_date || "empty-date"}
                          initial={{ opacity: 0, y: 12, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="text-3xl font-bold tabular-nums text-foreground inline-block"
                        >
                          {formData.target_date
                            ? new Date(formData.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </motion.span>
                      </div>
                      <Input type="date" value={formData.target_date}
                        onChange={e => setFormData(prev => ({ ...prev, target_date: e.target.value, has_fight: "yes" }))}
                        className="h-14 rounded-2xl bg-card border-border/50 text-center text-base font-semibold max-w-[260px]"
                        autoFocus />
                    </div>
                  )}

                  {/* Sub-page 2: Weight class */}
                  {fightSubStep === 2 && (
                    <div className="flex flex-col items-center pt-8 gap-6">
                      <div className="text-center">
                        <motion.span
                          key={formData.goal_weight_kg || "empty-class"}
                          initial={{ opacity: 0, y: 12, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="text-6xl font-bold tabular-nums text-primary inline-block"
                        >
                          {formData.goal_weight_kg || "—"}
                        </motion.span>
                        <span className="text-lg text-muted-foreground ml-2">kg</span>
                      </div>
                      <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 70"
                        value={formData.goal_weight_kg}
                        onChange={e => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                        className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                        autoFocus />
                      {/* Live arithmetic + loss-frame — only show when current
                          weight is also on file (user revisited via back nav). */}
                      {weeksToFight && weightDiff && (
                        <div className="w-full max-w-[300px] space-y-2">
                          <MathWhisper>
                            That's {(parseFloat(weightDiff) / weeksToFight).toFixed(1)} kg/week — {(parseFloat(weightDiff) / weeksToFight) < 1.0 ? "safe and steady." : "aggressive but doable."}
                          </MathWhisper>
                          {weeksToFight > 1 && (
                            <LossFrameCard
                              baseWeeklyKg={parseFloat(weightDiff) / weeksToFight}
                              remainingKgPerWeekIfSkipped={parseFloat(weightDiff) / Math.max(1, weeksToFight - 1)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-page 3: Pre-dehydration target with risk indicators */}
                  {fightSubStep === 3 && (() => {
                    const goalKg = parseFloat(formData.goal_weight_kg);
                    const targetKg = parseFloat(formData.fight_week_target_kg);
                    const waterCutKg = targetKg - goalKg;
                    const waterCutPct = goalKg > 0 ? (waterCutKg / targetKg) * 100 : 0;
                    const isSafe = waterCutPct <= 5;
                    const isModerate = waterCutPct > 5 && waterCutPct <= 8;
                    const isDangerous = waterCutPct > 8;
                    const recommendedTarget = goalKg > 0 ? calculateRecommendedTarget(goalKg, formData.competition_level) : 0;
                    return (
                      <div className="flex flex-col items-center pt-6 gap-4">
                        <div className="text-center">
                          <motion.span
                            key={formData.fight_week_target_kg || "empty-target"}
                            initial={{ opacity: 0, y: 12, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="text-6xl font-bold tabular-nums text-foreground inline-block"
                          >
                            {formData.fight_week_target_kg || "—"}
                          </motion.span>
                          <span className="text-lg text-muted-foreground ml-2">kg</span>
                        </div>
                        <Input type="number" inputMode="decimal" step="0.1"
                          value={formData.fight_week_target_kg}
                          onChange={e => { setUseAutoTarget(false); setFormData(prev => ({ ...prev, fight_week_target_kg: e.target.value })); }}
                          className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]" />
                        <p className="text-[11px] text-muted-foreground text-center max-w-[280px]">
                          {useAutoTarget ? "AI recommended based on your competition level" : `Manually set — AI recommendation was ${recommendedTarget}kg`}
                          {!useAutoTarget && (
                            <button type="button" onClick={() => { setUseAutoTarget(true); setFormData(prev => ({ ...prev, fight_week_target_kg: recommendedTarget.toString() })); }}
                              className="block text-primary font-medium mt-1.5">Reset to {recommendedTarget}kg</button>
                          )}
                        </p>

                        {/* Water cut risk indicator */}
                        {targetKg > 0 && goalKg > 0 && (
                          <div className={`w-full max-w-[300px] rounded-2xl p-3 border ${isSafe ? "border-emerald-500/20 bg-emerald-500/5" : isModerate ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-sm font-bold ${isSafe ? "text-emerald-400" : isModerate ? "text-amber-400" : "text-red-400"}`}>
                                {waterCutKg.toFixed(1)}kg water cut ({waterCutPct.toFixed(1)}%)
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isSafe ? "bg-emerald-500/20 text-emerald-400" : isModerate ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                                {isSafe ? "Safe" : isModerate ? "Moderate Risk" : "High Risk"}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {isSafe && (
                                <>
                                  <p className="text-[11px] text-emerald-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Within safe limits for most athletes</p>
                                  <p className="text-[11px] text-emerald-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Minimal impact on strength and reaction time</p>
                                </>
                              )}
                              {isModerate && (
                                <>
                                  <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>May reduce power output 5-10% if poorly rehydrated</p>
                                  <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Increased cramping risk — prioritise sodium and potassium</p>
                                  <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Allow 12+ hours between weigh-in and fight for recovery</p>
                                </>
                              )}
                              {isDangerous && (
                                <>
                                  <p className="text-[11px] text-red-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Significant risk of impaired reaction time and decision-making</p>
                                  <p className="text-[11px] text-red-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Strength reduction of 10-20% even with proper rehydration</p>
                                  <p className="text-[11px] text-red-400/80 flex items-start gap-1.5"><span className="mt-0.5">•</span>Kidney stress increases sharply — consult a doctor</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </motion.div>
              </AnimatePresence>
            </StepLayout>
          );
        })()}

        {/* ── Screen 4: Height ── */}
        {/* ── Screen 4: Age + Sex ── */}
        {((step === 4 && formData.goal_type !== "losing") || (step === 5 && formData.goal_type === "losing")) && (
          <StepLayout step={step} title="How old are you?" subtitle="We'll use this to dial in your metabolic rate."
            footer={<Button onClick={goNext} disabled={!formData.age}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-8 gap-8">
              <div className="text-center">
                <motion.span
                  key={formData.age || "empty"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-foreground inline-block"
                >
                  {formData.age || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">years</span>
              </div>
              <Input type="number" inputMode="numeric" placeholder="e.g. 25"
                value={formData.age}
                onChange={e => setFormData(prev => ({ ...prev, age: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />
              <div className="w-full max-w-[240px] space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center block">Sex</label>
                <div className="flex gap-2">
                  {["male", "female"].map(s => (
                    <button key={s} type="button"
                      onClick={() => { triggerHapticSelection(); setFormData(prev => ({ ...prev, sex: s })); }}
                      className={`flex-1 h-11 rounded-2xl text-sm font-semibold border transition-all capitalize ${
                        formData.sex === s ? "border-primary bg-primary/10 text-foreground" : "border-border/50 bg-card text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </StepLayout>
        )}

        {/* ── Screen 5: Height ── */}
        {((step === 5 && formData.goal_type !== "losing") || (step === 6 && formData.goal_type === "losing")) && (
          <StepLayout step={step} title="What's your height?" subtitle="Used to calculate your metabolic rate."
            footer={<Button onClick={goNext} disabled={!formData.height_cm}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-8 gap-6">
              <div className="text-center">
                <motion.span
                  key={formData.height_cm || "empty"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-foreground inline-block"
                >
                  {formData.height_cm || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">cm</span>
              </div>
              <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 175"
                value={formData.height_cm}
                onChange={e => setFormData(prev => ({ ...prev, height_cm: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />
              {/* Tall fighters get a single coaching nod — silence is feedback for everyone else. */}
              {formData.height_cm && parseFloat(formData.height_cm) >= 188 && (
                <WittyValidation>{formData.height_cm} cm — long levers, good for jab range.</WittyValidation>
              )}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 6: Current Weight ── */}
        {step === 6 && formData.goal_type !== "losing" && (
          <StepLayout step={6} title="What's your current weight?" subtitle="Step on the scale. Be honest — this is your starting line."
            footer={<Button onClick={goNext} disabled={!formData.current_weight_kg}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="flex flex-col items-center pt-8 gap-6">
              <div className="text-center">
                <motion.span
                  key={formData.current_weight_kg || "empty"}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-6xl font-bold tabular-nums text-foreground inline-block"
                >
                  {formData.current_weight_kg || "—"}
                </motion.span>
                <span className="text-lg text-muted-foreground ml-2">kg</span>
              </div>
              <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 78"
                value={formData.current_weight_kg}
                onChange={e => setFormData(prev => ({ ...prev, current_weight_kg: e.target.value }))}
                className="h-14 rounded-2xl bg-card border-border/50 text-center text-xl font-semibold max-w-[200px]"
                autoFocus />
              {weightDiff && formData.goal_weight_kg && (() => {
                const current = parseFloat(formData.current_weight_kg);
                const goal = parseFloat(formData.goal_weight_kg);
                const diff = Math.abs(current - goal);
                if (diff < 0.1) return null;
                const isLosing = current > goal;
                const isGaining = current < goal;

                // Fighter with fight date — show risk warnings
                if (weeksToFight && formData.has_fight === "yes" && isLosing) {
                  const weeklyLoss = diff / weeksToFight;
                  const bodyPct = current > 0 ? (diff / current) * 100 : 0;
                  const isAggressivePace = weeklyLoss > 1.0 && weeklyLoss <= 1.5;
                  const isDangerous = weeklyLoss > 1.5 || bodyPct > 10;

                  return (
                    <div className="w-full max-w-[300px] space-y-2">
                      <p className="text-sm text-muted-foreground text-center">
                        You need to drop <strong className="text-foreground">{diff.toFixed(1)} kg</strong>
                        {" "}in <strong className="text-foreground">{weeksToFight} weeks</strong>
                        <span className="text-xs text-muted-foreground/60"> ({weeklyLoss.toFixed(1)} kg/wk)</span>
                      </p>
                      {isDangerous && (
                        <Alert className="border-red-500/30 bg-red-500/5 rounded-2xl">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <AlertDescription className="text-xs text-red-400">
                            <strong className="text-red-300">High risk cut.</strong> Losing {weeklyLoss.toFixed(1)} kg/week ({bodyPct.toFixed(0)}% bodyweight) increases risk of muscle loss and performance decline. Consult a sports doctor. We'll still build your plan.
                          </AlertDescription>
                        </Alert>
                      )}
                      {isAggressivePace && !isDangerous && (
                        <Alert className="border-yellow-500/30 bg-yellow-500/5 rounded-2xl">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          <AlertDescription className="text-xs text-yellow-400">
                            <strong className="text-yellow-300">Aggressive pace.</strong> Losing {weeklyLoss.toFixed(1)} kg/week requires strict adherence. We'll plan for this.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  );
                }

                // Non-fighter or no fight date — show timeline estimate
                if (isLosing) {
                  const targetWeeks = formData.target_weeks ? parseInt(formData.target_weeks) : 0;
                  if (targetWeeks > 0 && formData.goal_type === "losing") {
                    const kgPerWeek = diff / targetWeeks;
                    return (
                      <div className="w-full max-w-[300px] space-y-2">
                        <p className="text-sm text-muted-foreground text-center">
                          <strong className="text-foreground">{diff.toFixed(1)} kg</strong> to lose in{" "}
                          <strong className="text-foreground">{targetWeeks} weeks</strong>
                          {" "}&mdash; that's <strong className="text-foreground">{kgPerWeek.toFixed(1)} kg/week</strong>
                        </p>
                        {kgPerWeek > 1.0 && (
                          <Alert className="border-yellow-500/30 bg-yellow-500/5 rounded-2xl">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <AlertDescription className="text-xs text-yellow-400">
                              Losing more than 1 kg/week increases muscle loss risk. Consider extending your timeframe for safer results.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    );
                  }
                  const weeksConservative = Math.ceil(diff / 0.5);
                  const weeksAggressive = Math.ceil(diff / 1.0);
                  const monthsEst = Math.ceil(weeksConservative / 4.3);
                  return (
                    <div className="w-full max-w-[300px]">
                      <p className="text-sm text-muted-foreground text-center">
                        <strong className="text-foreground">{diff.toFixed(1)} kg</strong> to lose — at a safe pace that's
                        {" "}<strong className="text-foreground">{weeksAggressive}-{weeksConservative} weeks</strong>
                        <span className="text-xs text-muted-foreground/60"> (~{monthsEst} {monthsEst === 1 ? "month" : "months"})</span>
                      </p>
                    </div>
                  );
                }

                if (isGaining) {
                  const weeksToGain = Math.ceil(diff / 0.35);
                  const monthsEst = Math.ceil(weeksToGain / 4.3);
                  return (
                    <div className="w-full max-w-[300px]">
                      <p className="text-sm text-muted-foreground text-center">
                        <strong className="text-foreground">{diff.toFixed(1)} kg</strong> to gain — at a lean pace that's
                        {" "}<strong className="text-foreground">~{weeksToGain} weeks</strong>
                        <span className="text-xs text-muted-foreground/60"> (~{monthsEst} {monthsEst === 1 ? "month" : "months"})</span>
                      </p>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 7: Body Fat (Optional) ── */}
        {step === 7 && (
          <StepLayout step={7} title="Estimate your body fat" subtitle="Drag the slider. Skip if you're not sure."
            footer={
              <div className="space-y-2">
                <Button onClick={goNext} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Continue</Button>
                <button onClick={() => { setFormData(prev => ({ ...prev, body_fat_pct: "" })); goNext(); }} className="w-full text-center text-xs text-muted-foreground/60 py-2 hover:text-muted-foreground transition-colors">
                  Skip this step
                </button>
              </div>
            }
          >
            <div className="flex flex-col items-center pt-8 gap-6">
              <div className="text-center">
                <span className="text-5xl font-bold tabular-nums text-foreground">
                  {formData.body_fat_pct || "—"}
                </span>
                <span className="text-lg text-muted-foreground ml-1">%</span>
              </div>
              {/* Visual hint based on body fat range */}
              {formData.body_fat_pct && (() => {
                const bf = parseFloat(formData.body_fat_pct);
                const isMale = formData.sex !== "female";
                const hint = isMale
                  ? bf <= 8 ? { label: "Competition lean", desc: "Visible abs, vascularity, very defined. Hard to maintain.", color: "text-red-400" }
                    : bf <= 12 ? { label: "Athletic", desc: "Clear abs, muscle definition, visible veins on arms.", color: "text-emerald-400" }
                    : bf <= 15 ? { label: "Fit", desc: "Some ab definition, lean arms and face. Most fighters walk around here.", color: "text-primary" }
                    : bf <= 20 ? { label: "Average", desc: "Soft midsection, no visible abs. Some face fullness.", color: "text-muted-foreground" }
                    : bf <= 25 ? { label: "Above average", desc: "Noticeable belly, rounder face. Harder to see muscle.", color: "text-amber-400" }
                    : { label: "Higher", desc: "Significant midsection, wide waist. Focus on building habits first.", color: "text-amber-400" }
                  : bf <= 14 ? { label: "Competition lean", desc: "Very defined, visible muscle striations. Hard to maintain.", color: "text-red-400" }
                    : bf <= 18 ? { label: "Athletic", desc: "Toned, some ab definition, lean arms.", color: "text-emerald-400" }
                    : bf <= 23 ? { label: "Fit", desc: "Healthy, some curves, lean face. Most active women are here.", color: "text-primary" }
                    : bf <= 28 ? { label: "Average", desc: "Soft midsection, fuller arms and thighs.", color: "text-muted-foreground" }
                    : bf <= 33 ? { label: "Above average", desc: "Rounder shape, less muscle definition visible.", color: "text-amber-400" }
                    : { label: "Higher", desc: "Fuller figure. Focus on building habits first.", color: "text-amber-400" };

                return (
                  <div className="text-center max-w-[260px] animate-in fade-in duration-300">
                    <p className={`text-sm font-semibold ${hint.color}`}>{hint.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint.desc}</p>
                  </div>
                );
              })()}
              <div className="w-full max-w-xs space-y-3">
                {(() => {
                  const isMale = formData.sex !== "female";
                  const min = isMale ? 5 : 10;
                  const max = isMale ? 40 : 45;
                  const defaultBf = isMale ? 15 : 23;
                  return (
                    <>
                      <Slider
                        value={[formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : defaultBf]}
                        onValueChange={([v]) => setFormData(prev => ({ ...prev, body_fat_pct: v.toString() }))}
                        min={min} max={max} step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/50">
                        <span>Lean</span><span>Average</span><span>Higher</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </StepLayout>
        )}

        {/* ── Screen 8: Experience Level ── */}
        {step === 8 && (
          <StepLayout step={8} title="What's your experience level?" subtitle="No judgment. We just need to know where you're at."
            footer={<Button onClick={goNext} disabled={!formData.experience_level}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "beginner", label: "Beginner", description: "Less than 1 year training" },
                { value: "amateur", label: "Amateur Fighter", description: "Some fights, still learning the game" },
                { value: "pro", label: "Experienced / Pro", description: "Multiple fights, know the weight cut drill" },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.experience_level === opt.value}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("experience_level", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 9: Training Frequency ── */}
        {step === 9 && (
          <StepLayout step={9} title="How often do you train?" subtitle="All sessions — pads, sparring, gym, running."
            footer={<Button onClick={goNext} disabled={!formData.training_frequency}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "2", label: "1-2 times per week", description: "Just getting started" },
                { value: "4", label: "3-4 times per week", description: "Consistent training" },
                { value: "6", label: "5-6 times per week", description: "Serious camp schedule" },
                { value: "10", label: "Twice a day", description: "Full-time fighter mode" },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.training_frequency === opt.value}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("training_frequency", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 10: Training Types ── */}
        {step === 10 && (
          <StepLayout step={10} title="What does your training include?" subtitle="Select all that apply."
            footer={<Button onClick={goNext} disabled={formData.training_types.length === 0}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {["Pads", "Sparring", "Strength & Conditioning", "Running"].map(t => (
                <MultiCard key={t} label={t} selected={formData.training_types.includes(t.toLowerCase().replace(/ & /g, "_"))}
                  onClick={() => toggleMulti("training_types", t.toLowerCase().replace(/ & /g, "_"))} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 11: Sleep ── */}
        {step === 11 && (
          <StepLayout step={11} title="How many hours do you sleep?" subtitle="Recovery is half the game."
            footer={<Button onClick={goNext} disabled={!formData.sleep_hours}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "less_than_6", label: "Less than 6 hours", icon: <Moon className="h-5 w-5 text-red-400" /> },
                { value: "6_to_7", label: "6-7 hours", icon: <Moon className="h-5 w-5 text-yellow-400" /> },
                { value: "7_to_8", label: "7-8 hours", icon: <Moon className="h-5 w-5 text-green-400" /> },
                { value: "8_plus", label: "8+ hours", icon: <Moon className="h-5 w-5 text-emerald-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.sleep_hours === opt.value} icon={opt.icon}
                  label={opt.label} onClick={() => selectAndAdvance("sleep_hours", opt.value)} />
              ))}
              {(formData.sleep_hours === "less_than_6" || formData.sleep_hours === "6_to_7") && (
                <WittyValidation>We'll fix that in week one.</WittyValidation>
              )}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 12: Struggles (cutting flow) ──
            Fighters get the "what holds you back" picker — feeds the
            cut-plan AI's framing. Losing flow takes a different
            question on this step (see below) so the shared step 13
            stays a clean declaration + generate-plan finale. */}
        {step === 12 && formData.goal_type !== "losing" && (
          <StepLayout step={12} title="What do you struggle with most?" subtitle="Be real. We'll build around your weak spots."
            footer={<Button onClick={goNext} disabled={!formData.primary_struggle}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "making_weight", label: "Making weight", icon: <TrendingDown className="h-5 w-5 text-red-400" /> },
                { value: "low_energy", label: "Low energy in training", icon: <Zap className="h-5 w-5 text-yellow-400" /> },
                { value: "binge_eating", label: "Binge eating after cuts", icon: <Utensils className="h-5 w-5 text-orange-400" /> },
                { value: "no_progress", label: "Not seeing progress", icon: <Brain className="h-5 w-5 text-purple-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.primary_struggle === opt.value} icon={opt.icon}
                  label={opt.label} onClick={() => selectAndAdvance("primary_struggle", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 12: Plan style (losing flow only) ──
            Promoted up from the previous step-13 finale so the LAST
            step is purely declaration → tale-of-the-tape → generate.
            Was the source of "round 13 asks me how aggressive when it
            should just be Generate" — this fixes that. */}
        {step === 12 && formData.goal_type === "losing" && (
          <StepLayout step={12} title="How aggressive do you want to go?" subtitle="Picks the pace of your cut. You can change it later in Settings."
            footer={<Button onClick={goNext} disabled={!formData.plan_aggressiveness}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>}
          >
            <div className="space-y-2.5">
              {[
                { value: "safe", label: "Safe & Steady", description: "Slow, sustainable. Best for 8+ week runways.", icon: <Shield className="h-5 w-5 text-green-400" /> },
                { value: "balanced", label: "Balanced", description: "Standard pace. Works for most timelines.", icon: <Gauge className="h-5 w-5 text-yellow-400" /> },
                { value: "aggressive", label: "Aggressive", description: "Hard push. Use when the timeline is tight.", icon: <Flame className="h-5 w-5 text-red-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.plan_aggressiveness === opt.value} icon={opt.icon}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("plan_aggressiveness", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 13: Aggressiveness (losing flow only) ── */}
        {step === 13 && formData.goal_type === "losing" && !declared && (
          <StepLayout step={13} title={`${vocab.campNoun} — last call.`} subtitle="One commitment, then we build the plan.">
            <div className="space-y-4 px-1 pt-4">
              <h2 className="text-[28px] font-black leading-tight text-center">{userName ? userName + ", " : ""}lock it in.</h2>
              <p className="text-[14px] text-center text-muted-foreground">
                I will weigh <span className="font-bold text-foreground tabular-nums">{formData.goal_weight_kg} kg</span>
                {formData.target_weeks ? ` in ${formData.target_weeks} weeks` : ""}.
              </p>
              <DeclarationButton label="Hold to commit" onCommit={() => setDeclared(true)} />
            </div>
          </StepLayout>
        )}
        {step === 13 && formData.goal_type === "losing" && declared && (
          <StepLayout step={13} title="Here's your plan." subtitle="Review the snapshot, then tap Generate to lock it in."
            footer={
              generatedPlan ? null : generatingPlan ? (
                <div className="w-full flex justify-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating your plan…
                  </div>
                </div>
              ) : (
                <Button onClick={goNext} disabled={loading}
                  className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Generate plan</Button>
              )
            }
          >
            <div className="space-y-3">
              {/* Tale-of-the-Tape — fighter intro reveal at the top of
                  the finale. Aggressiveness now appears here as a stat
                  (read-only) so the user can see what they picked
                  without us asking the question again. */}
              <TaleOfTheTapeCard
                name={userName || "Fighter"}
                sport={(formData.athlete_type || formData.athlete_types[0] || vocab.campNoun).toString()}
                stats={[
                  { label: "Height", value: formData.height_cm ? `${formData.height_cm} cm` : "—" },
                  { label: "Weight", value: formData.current_weight_kg ? `${formData.current_weight_kg} kg` : "—" },
                  { label: "Goal", value: formData.goal_weight_kg ? `${formData.goal_weight_kg} kg` : "—" },
                  { label: "Timeline", value: formData.target_weeks ? `${formData.target_weeks} weeks` : "—" },
                  { label: "Pace", value: formData.plan_aggressiveness || "balanced" },
                ]}
              />

              {/* Projected weight-loss chart — same visual language as
                  the cutting flow's chart but simpler: linear current →
                  goal over the user's chosen timeline. Renders only
                  when we have enough data to be meaningful (current,
                  goal, weeks all set and current > goal). */}
              <LosingProjectionChart
                currentKg={parseFloat(formData.current_weight_kg) || 0}
                goalKg={parseFloat(formData.goal_weight_kg) || 0}
                weeks={parseInt(formData.target_weeks) || 0}
              />

              {/* In-page plan display — slides in below the card once the
                  AI plan resolves. The Continue button inside this
                  component handles the dashboard handoff + tutorial. */}
              <AnimatePresence>
                {generatedPlan && (
                  <motion.div
                    key="inline-plan-losing"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="pt-2"
                  >
                    <InlinePlanDisplay
                      plan={generatedPlan}
                      planType={generatedPlanType}
                      onContinue={handleContinueToDashboard}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              {planGenerationFailed && !generatedPlan && (
                <PlanRetryCard onRetry={handleRetryPlan} onSkip={handleSkipPlan} />
              )}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 13: Cut Preview (cutting flow only) — projected weight chart ── */}
        {step === 13 && formData.goal_type === "cutting" && (() => {
          const currentWeight = parseFloat(formData.current_weight_kg) || 0;
          const fightWeekTarget = parseFloat(formData.fight_week_target_kg) || 0;
          const fightWeight = parseFloat(formData.goal_weight_kg) || 0;
          const fightDate = formData.target_date ? new Date(formData.target_date) : null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const validInputs =
            currentWeight > 0 && fightWeekTarget > 0 && fightWeight > 0 && fightDate &&
            fightDate.getTime() > today.getTime();

          let chartContent: React.ReactNode = null;
          let stats: { totalCut: number; sustainedCut: number; dehydrationDrop: number; cutWeeks: number; dehydrationDays: number } | null = null;

          if (validInputs && fightDate) {
            const totalDays = Math.max(1, Math.round((fightDate.getTime() - today.getTime()) / 86400000));
            const dehydrationDays = Math.min(7, totalDays);
            const cutDays = Math.max(0, totalDays - dehydrationDays);
            const cutWeeks = Math.max(1, Math.round(cutDays / 7));

            stats = {
              totalCut: Math.max(0, currentWeight - fightWeight),
              sustainedCut: Math.max(0, currentWeight - fightWeekTarget),
              dehydrationDrop: Math.max(0, fightWeekTarget - fightWeight),
              cutWeeks,
              dehydrationDays,
            };

            // SVG chart — three key points: today (current), cut end (pre-dehydration), fight day (weigh-in)
            const W = 320, H = 170;
            const padL = 14, padR = 14, padT = 32, padB = 30;
            const innerW = W - padL - padR;
            const innerH = H - padT - padB;
            const minW = Math.min(currentWeight, fightWeekTarget, fightWeight);
            const maxW = Math.max(currentWeight, fightWeekTarget, fightWeight);
            const wRange = Math.max(0.5, maxW - minW);
            const xFor = (day: number) => padL + (totalDays > 0 ? (day / totalDays) * innerW : 0);
            const yFor = (w: number) => padT + (1 - (w - minW) / wRange) * innerH;
            const x1 = xFor(0), y1 = yFor(currentWeight);
            const x2 = xFor(cutDays), y2 = yFor(fightWeekTarget);
            const x3 = xFor(totalDays), y3 = yFor(fightWeight);

            // Build subtle area under the cut phase for visual weight
            const areaPath = `M ${x1} ${H - padB} L ${x1} ${y1} L ${x2} ${y2} L ${x2} ${H - padB} Z`;
            // Dehydration area (red tint)
            const dehydAreaPath = `M ${x2} ${H - padB} L ${x2} ${y2} L ${x3} ${y3} L ${x3} ${H - padB} Z`;

            chartContent = (
              <div className="card-surface rounded-2xl border border-border/40 p-3">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }} aria-label="Projected weight chart">
                  {/* Baseline */}
                  <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                  {/* Areas */}
                  <path d={areaPath} fill="hsl(var(--primary))" opacity="0.10" />
                  <path d={dehydAreaPath} fill="rgb(239 68 68)" opacity="0.10" />
                  {/* Cut phase line */}
                  {cutDays > 0 && (
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
                  )}
                  {/* Dehydration phase line */}
                  <line x1={x2} y1={y2} x2={x3} y2={y3}
                    stroke="rgb(239 68 68)" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Dots */}
                  <circle cx={x1} cy={y1} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.5" />
                  <circle cx={x2} cy={y2} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.5" />
                  <circle cx={x3} cy={y3} r="4.5" fill="rgb(239 68 68)" stroke="hsl(var(--background))" strokeWidth="1.5" />
                  {/* Weight value labels above dots */}
                  <text x={x1} y={y1 - 10} fontSize="10" fontWeight="600" textAnchor="middle" fill="hsl(var(--foreground))">{currentWeight.toFixed(1)}</text>
                  <text x={x2} y={y2 - 10} fontSize="10" fontWeight="600" textAnchor={cutDays === 0 ? "start" : "middle"} fill="hsl(var(--foreground))">{fightWeekTarget.toFixed(1)}</text>
                  <text x={x3} y={y3 - 10} fontSize="10" fontWeight="700" textAnchor="end" fill="rgb(239 68 68)">{fightWeight.toFixed(1)}</text>
                  {/* X-axis date labels */}
                  <text x={x1} y={H - 10} fontSize="9" textAnchor="start" fill="hsl(var(--muted-foreground))">Now</text>
                  {cutDays > 0 && (
                    <text x={x2} y={H - 10} fontSize="9" textAnchor="middle" fill="hsl(var(--muted-foreground))">Cut end</text>
                  )}
                  <text x={x3} y={H - 10} fontSize="9" textAnchor="end" fill="rgb(239 68 68)">Fight</text>
                </svg>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Steady cut</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Dehydration</span>
                </div>
              </div>
            );
          }

          // Pre-final declaration gate — user must hold-to-commit before
          // the chart + Generate button render. Once declared, the rest of
          // the existing final-step content remains intact.
          if (!declared) {
            return (
              <StepLayout step={13} title={`${vocab.campNoun} — last call.`} subtitle="One commitment, then we build the plan.">
                <div className="space-y-4 px-1 pt-4">
                  <h2 className="text-[28px] font-black leading-tight text-center">{userName ? userName + ", " : ""}lock it in.</h2>
                  <p className="text-[14px] text-center text-muted-foreground">
                    I will weigh <span className="font-bold text-foreground tabular-nums">{formData.goal_weight_kg} kg</span>
                    {formData.target_date ? ` by ${new Date(formData.target_date).toLocaleDateString()}` : ""}.
                  </p>
                  <DeclarationButton label="Hold to commit" onCommit={() => setDeclared(true)} />
                </div>
              </StepLayout>
            );
          }

          return (
            <StepLayout step={13} title={`Your projected ${vocab.campNoun.toLowerCase()}`} subtitle="Review before we generate your plan."
              footer={
                generatedPlan ? null : generatingPlan ? (
                  <div className="w-full flex justify-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating your plan…
                    </div>
                  </div>
                ) : (
                  <Button onClick={goNext} disabled={loading || !validInputs}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
                    Generate plan
                  </Button>
                )
              }
            >
              <div className="space-y-3">
                {/* Tale-of-the-Tape — fighter intro reveal at the top of the finale. */}
                <TaleOfTheTapeCard
                  name={userName || "Fighter"}
                  sport={(formData.athlete_type || formData.athlete_types[0] || vocab.campNoun).toString()}
                  stats={[
                    { label: "Height", value: formData.height_cm ? `${formData.height_cm} cm` : "—" },
                    { label: "Weight", value: formData.current_weight_kg ? `${formData.current_weight_kg} kg` : "—" },
                    { label: "Goal", value: formData.goal_weight_kg ? `${formData.goal_weight_kg} kg` : "—" },
                    { label: "Days to fight", value: daysToFight ? String(daysToFight) : "—" },
                    { label: "Experience", value: formData.experience_level || "—" },
                  ]}
                />
                {validInputs && stats ? (
                  <>
                    {chartContent}
                    {/* Key stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="card-surface rounded-2xl border border-border/40 p-2.5 text-center">
                        <p className="text-[18px] font-bold tabular-nums leading-none text-foreground">{stats.totalCut.toFixed(1)}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Total kg</p>
                      </div>
                      <div className="card-surface rounded-2xl border border-border/40 p-2.5 text-center">
                        <p className="text-[18px] font-bold tabular-nums leading-none text-primary">{stats.sustainedCut.toFixed(1)}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Steady · {stats.cutWeeks}w</p>
                      </div>
                      <div className="card-surface rounded-2xl border border-border/40 p-2.5 text-center">
                        <p className="text-[18px] font-bold tabular-nums leading-none text-red-400">{stats.dehydrationDrop.toFixed(1)}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Dehyd · {stats.dehydrationDays}d</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center leading-snug px-2 pt-1">
                      Steady cut to <strong className="text-foreground">{fightWeekTarget.toFixed(1)} kg</strong> over {stats.cutWeeks} weeks, then <strong className="text-red-400">{stats.dehydrationDrop.toFixed(1)} kg</strong> water cut to make weight on fight day.
                    </p>
                  </>
                ) : (
                  <div className="card-surface rounded-2xl border border-border/40 p-5 text-center">
                    <p className="text-[13px] text-muted-foreground leading-snug">
                      Need a fight date in the future plus your weight class and pre-dehydration target to project your cut.
                    </p>
                  </div>
                )}

                {/* In-page plan display — slides in below the chart once the
                    AI plan resolves. The Continue button inside this component
                    handles the dashboard handoff + tutorial trigger. */}
                <AnimatePresence>
                  {generatedPlan && (
                    <motion.div
                      key="inline-plan"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="pt-2"
                    >
                      <InlinePlanDisplay
                        plan={generatedPlan}
                        planType={generatedPlanType}
                        onContinue={handleContinueToDashboard}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {planGenerationFailed && !generatedPlan && (
                  <PlanRetryCard onRetry={handleRetryPlan} onSkip={handleSkipPlan} />
                )}
              </div>
            </StepLayout>
          );
        })()}

        </motion.div>
      </AnimatePresence>

      {/* Overlay layer — fires once when fight date first lands. */}
      <DaysToFightSlam days={daysToFight} armed={daysSlamArmed} />
      <WeightLossSlam
        totalKg={totalKgToLose}
        weeks={slamWeeks}
        perWeekKg={perWeekKg}
        armed={weightSlamArmed}
      />
      {/* Milestone achievement now renders INLINE next to the
          social-proof chip in the sticky header (see CuttingNowChip
          above). The standalone floating toast was removed so the two
          surfaces don't compete for the eye. */}

    </div>
  );
}
