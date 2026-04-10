import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles, AlertTriangle, CheckCircle, Zap, Shield, Activity,
  TrendingDown, ChevronLeft, Swords, Target, Flame, Dumbbell,
  Moon, Brain, Gauge, Utensils, Wallet,
} from "lucide-react";
import { profileSchema } from "@/lib/validation";
import wizardLogo from "@/assets/wizard-logo.webp";
import { celebrateSuccess, triggerHapticSelection } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import { seedDemoData } from "@/lib/demoData";
import { presentPaywallIfNeeded } from "@/lib/purchases";
import { Capacitor } from "@capacitor/core";
import { AnimatePresence, motion } from "motion/react";
import { springs } from "@/lib/motion";

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const TOTAL_STEPS = 15;

// ── Progress bar that crawls smoothly ──
function ProgressCrawl({ targetPercent, className }: { targetPercent: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  const displayRef = useRef(0);

  useEffect(() => {
    if (targetPercent > displayRef.current + 10) {
      displayRef.current = targetPercent - 8;
    }
  }, [targetPercent]);

  useEffect(() => {
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const target = Math.min(targetPercent, 95);
      const diff = target - displayRef.current;
      const speed = diff > 10 ? 12 : diff > 5 ? 4 : diff > 2 ? 1.5 : 0.4;
      displayRef.current = Math.min(displayRef.current + speed * dt, target);
      if (diff < 1 && targetPercent < 95) {
        displayRef.current = Math.min(displayRef.current + 0.3 * dt, targetPercent + 5);
      }
      setDisplay(displayRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetPercent]);

  useEffect(() => {
    if (targetPercent >= 100) { displayRef.current = 100; setDisplay(100); }
  }, [targetPercent]);

  return (
    <div className={`w-full h-1.5 rounded-full bg-muted/50 overflow-hidden ${className || ""}`}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${display}%`, transition: "none" }} />
    </div>
  );
}

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

// ── Screen layout wrapper ──
function StepLayout({ step, title, subtitle, children, footer }: {
  step: number; title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5 pb-6">
      <div className="pt-8 pb-5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60 font-bold mb-2">
          Step {step} of {TOTAL_STEPS}
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
  const [generationStep, setGenerationStep] = useState(0);
  const navigate = useNavigate();
  const { refreshProfile } = useProfile();
  const { hasProfile, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    // Screen 1
    athlete_type: "",
    // Screen 2
    goal_type: "",
    // Screen 3
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
    // Screen 13
    dietary_restrictions: [] as string[],
    // Screen 14
    food_budget: "",
    // Derived
    sex: "male",
    age: "",
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);

  // Redirect if profile exists
  useEffect(() => {
    if (!authLoading && hasProfile) navigate("/dashboard", { replace: true });
  }, [authLoading, hasProfile, navigate]);

  const goNext = useCallback(() => {
    triggerHapticSelection();
    setDirection(1);
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const goBack = useCallback(() => {
    triggerHapticSelection();
    setDirection(-1);
    setStep(s => {
      // Skip screen 3 when going back if goal is not cutting
      if (s === 4 && formData.goal_type !== "cutting") return 2;
      return Math.max(s - 1, 1);
    });
  }, [formData.goal_type]);

  // Auto-advance helper for single-select screens
  const selectAndAdvance = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    triggerHapticSelection();
    setDirection(1);
    setTimeout(() => setStep(s => {
      // Skip screen 3 if goal is not fight-related
      if (s === 2 && value !== "cutting") return 4;
      return Math.min(s + 1, TOTAL_STEPS);
    }), 250);
  }, []);

  const toggleMulti = useCallback((field: "training_types" | "dietary_restrictions", value: string) => {
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

  // BMR calculation
  const calculateBMR = () => {
    const weight = parseFloat(formData.current_weight_kg);
    const height = parseFloat(formData.height_cm);
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

  // ── Submit ──
  const handleSubmit = async () => {
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
    setGeneratingPlan(true);
    setGenerationStep(0);

    const isFighterFlow = formData.goal_type === "cutting";
    const stepTimers = [
      setTimeout(() => setGenerationStep(1), 600),
      setTimeout(() => setGenerationStep(2), 1400),
    ];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const bmr = calculateBMR();
      const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.55);
      const trainingFreq = parseInt(formData.training_frequency) || 3;

      // 1. Save profile
      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        age: parseInt(formData.age || "25"),
        sex: formData.sex || "male",
        height_cm: parseFloat(formData.height_cm),
        current_weight_kg: parseFloat(formData.current_weight_kg),
        goal_weight_kg: parseFloat(formData.goal_weight_kg),
        fight_week_target_kg: isFighterFlow ? parseFloat(formData.fight_week_target_kg) : null,
        target_date: formData.target_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        activity_level: activityLevel,
        training_frequency: trainingFreq,
        goal_type: formData.goal_type || "losing",
        bmr,
        tdee,
        athlete_type: formData.athlete_type || null,
        experience_level: formData.experience_level || null,
        training_types: formData.training_types.length > 0 ? formData.training_types : null,
        sleep_hours: formData.sleep_hours || null,
        primary_struggle: formData.primary_struggle || null,
        plan_aggressiveness: formData.plan_aggressiveness || "balanced",
        food_budget: formData.food_budget || null,
        body_fat_pct: formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : null,
      });

      if (error) throw error;

      // Save dietary preferences if selected
      if (formData.dietary_restrictions.length > 0) {
        await supabase.from("user_dietary_preferences").insert({
          user_id: user.id,
          dietary_restrictions: formData.dietary_restrictions,
        });
      }

      stepTimers.forEach(clearTimeout);
      setGenerationStep(2);

      // 2. AI cut plan for fighters
      let hasCutPlan = false;
      if (isFighterFlow) {
        setGenerationStep(3);
        try {
          const { data: planData, error: planError } = await supabase.functions.invoke("generate-cut-plan", {
            body: {
              currentWeight: parseFloat(formData.current_weight_kg),
              goalWeight: parseFloat(formData.goal_weight_kg),
              fightWeekTarget: parseFloat(formData.fight_week_target_kg),
              targetDate: formData.target_date,
              age: parseInt(formData.age || "25"),
              sex: formData.sex || "male",
              heightCm: parseFloat(formData.height_cm),
              activityLevel,
              trainingFrequency: trainingFreq,
              bmr,
              tdee,
            },
          });
          if (planError) logger.warn("Cut plan generation failed", { error: planError });
          const plan = planData?.plan || planData;
          if (plan?.weeklyPlan) {
            localStorage.setItem("wcw_cut_plan", JSON.stringify({
              ...plan,
              currentWeight: parseFloat(formData.current_weight_kg),
              goalWeight: parseFloat(formData.goal_weight_kg),
              targetDate: formData.target_date,
            }));
            hasCutPlan = true;
            const week1 = plan.weeklyPlan[0];
            if (week1) {
              await supabase.from("profiles").update({
                ai_recommended_calories: week1.calories,
                ai_recommended_protein_g: week1.protein_g,
                ai_recommended_carbs_g: week1.carbs_g,
                ai_recommended_fats_g: week1.fats_g,
              }).eq("id", user.id);
            }
          }
        } catch (planErr) {
          logger.warn("Cut plan generation error", planErr);
        }
      }

      // 3. Finalize
      const finalStep = isFighterFlow ? 4 : 3;
      setGenerationStep(finalStep);
      await refreshProfile();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) seedDemoData(currentUser.id);
      celebrateSuccess();

      // Signal that onboarding just completed — tutorial should trigger on dashboard
      localStorage.setItem("wcw_onboarding_just_completed", "true");

      // Show RevenueCat paywall on native platforms before proceeding
      if (Capacitor.isNativePlatform()) {
        try {
          await presentPaywallIfNeeded();
          // Refresh profile in case user purchased
          await refreshProfile();
        } catch { /* dismissed or unavailable — continue */ }
      }

      if (hasCutPlan) {
        navigate("/cut-plan", { replace: true });
      } else {
        setGenerationStep(finalStep + 1);
        setTimeout(() => navigate("/dashboard"), 1000);
      }
    } catch (error: any) {
      logger.error("Onboarding failed", error);
      stepTimers.forEach(clearTimeout);
      setGeneratingPlan(false);
      setGenerationStep(0);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Generation overlay ──
  const GENERATION_STEPS = [
    { icon: Activity, label: "Analyzing your fight profile", color: "text-blue-400" },
    { icon: Zap, label: "Calculating nutrition targets", color: "text-yellow-400" },
    { icon: Shield, label: formData.goal_type === "cutting" ? "Building your weight cut strategy" : "Building your weight loss plan", color: "text-blue-400" },
    ...(formData.goal_type === "cutting" ? [{ icon: TrendingDown, label: "Generating your AI fight plan", color: "text-primary" }] : []),
    { icon: Sparkles, label: "Finalizing your plan", color: "text-primary" },
    { icon: CheckCircle, label: "Your fight camp starts now", color: "text-green-400" },
  ];

  if (generatingPlan) {
    const totalSteps = GENERATION_STEPS.length - 1;
    const progressPercent = Math.min((generationStep / totalSteps) * 100, 100);
    const isReady = generationStep >= GENERATION_STEPS.length - 1;
    return (
      <div className="fixed inset-0 bg-background text-foreground flex flex-col items-center justify-center z-50 px-6">
        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <div className="relative mb-8">
            <img src={wizardLogo} alt="Wizard" className="relative h-20 w-20 object-contain" />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight mb-1 text-center">
            {isReady ? "All Set!" : "Building Your Fight Plan"}
          </h2>
          <p className="text-sm text-muted-foreground mb-8 text-center">
            {isReady ? "Opening your dashboard..." : "This will only take a moment"}
          </p>
          <ProgressCrawl targetPercent={progressPercent} className="mb-8" />
          <div className="w-full space-y-3.5">
            {GENERATION_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === generationStep;
              const isDone = i < generationStep;
              const isPending = i > generationStep;
              return (
                <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${isPending ? "opacity-15" : isDone ? "opacity-50" : "opacity-100"}`}>
                  <div className="relative h-9 w-9 flex-shrink-0">
                    {isActive && !isDone && (
                      <svg className="absolute inset-0 h-9 w-9 animate-spin" style={{ animationDuration: "2s" }} viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="80 20" strokeLinecap="round" opacity="0.4" />
                      </svg>
                    )}
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-all duration-500 ${isDone ? "bg-primary/20" : isActive ? "bg-muted" : "bg-muted/50"}`}>
                      {isDone ? <CheckCircle className="h-4 w-4 text-primary" /> : <Icon className={`h-4 w-4 ${isActive ? s.color : "text-muted-foreground"}`} />}
                    </div>
                  </div>
                  <span className={`text-sm font-medium transition-colors duration-500 ${isDone ? "text-muted-foreground line-through" : isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || hasProfile) return null;

  const progress = (step / TOTAL_STEPS) * 100;

  // ── Render screens ──
  return (
    <div className="min-h-screen bg-background dark:bg-[#020204]">
      {/* Top bar: back arrow + progress bar */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm px-4 pt-3 pb-2 flex items-center gap-3">
        {step > 1 ? (
          <button onClick={goBack} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/50 active:scale-95 transition-all flex-shrink-0">
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
        ) : (
          <div className="w-8 flex-shrink-0" />
        )}
        <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <div className="w-8 flex-shrink-0" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: direction > 0 ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -60 : 60 }}
          transition={springs.responsive}
        >

        {/* ── Screen 1: Athlete Type ── */}
        {step === 1 && (
          <StepLayout step={1} title="What's your discipline?" subtitle="We'll tailor everything to your sport.">
            <div className="space-y-2.5">
              {[
                { value: "muay_thai", label: "Muay Thai", icon: <Swords className="h-5 w-5 text-orange-400" /> },
                { value: "boxing", label: "Boxing", icon: <Swords className="h-5 w-5 text-red-400" /> },
                { value: "mma", label: "MMA", icon: <Swords className="h-5 w-5 text-blue-400" /> },
                { value: "bjj", label: "BJJ", icon: <Swords className="h-5 w-5 text-purple-400" /> },
                { value: "other", label: "Other", icon: <Dumbbell className="h-5 w-5 text-muted-foreground" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.athlete_type === opt.value} icon={opt.icon}
                  label={opt.label} onClick={() => selectAndAdvance("athlete_type", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 2: Primary Goal ── */}
        {step === 2 && (
          <StepLayout step={2} title="What's your goal right now?" subtitle="This sets the pace for your entire plan.">
            <div className="space-y-2.5">
              {[
                { value: "cutting", label: "Make weight for a fight", description: "Structured cut with a deadline", icon: <Target className="h-5 w-5 text-red-400" /> },
                { value: "losing", label: "Lose fat", description: "Steady body composition improvement", icon: <Flame className="h-5 w-5 text-orange-400" /> },
                { value: "performance", label: "Improve performance", description: "Fuel training without cutting", icon: <Zap className="h-5 w-5 text-yellow-400" /> },
                { value: "maintenance", label: "Stay fight-ready year round", description: "Maintain weight between camps", icon: <Shield className="h-5 w-5 text-green-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.goal_type === opt.value} icon={opt.icon}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("goal_type", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 3: Fight Status (only for cutting) ── */}
        {step === 3 && (
          <StepLayout step={3} title="Do you have a fight booked?" subtitle="We'll plan backwards from your fight date."
            footer={
              <Button onClick={goNext} disabled={!formData.goal_weight_kg || (formData.has_fight === "yes" && !formData.target_date)}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">Continue</Button>
            }
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                {["yes", "no"].map(v => (
                  <button key={v} type="button"
                    onClick={() => { triggerHapticSelection(); setFormData(prev => ({ ...prev, has_fight: v })); }}
                    className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all ${
                      formData.has_fight === v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/50 bg-card text-muted-foreground"
                    }`}
                  >
                    {v === "yes" ? "Yes" : "No"}
                  </button>
                ))}
              </div>

              {formData.has_fight === "yes" && (
                <div className="space-y-3 animate-fade-in">
                  {/* Competition level — determines water cut aggressiveness */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Competition Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "hobbyist", label: "Hobbyist" },
                        { value: "amateur", label: "Amateur" },
                        { value: "pro", label: "Pro" },
                      ].map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => { triggerHapticSelection(); setFormData(prev => ({ ...prev, competition_level: opt.value })); }}
                          className={`h-11 rounded-2xl text-sm font-semibold border transition-all ${
                            formData.competition_level === opt.value
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/50 bg-card text-muted-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fight Date</label>
                    <Input type="date" value={formData.target_date}
                      onChange={e => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
                      className="h-12 rounded-2xl bg-card border-border/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weight Class (kg)</label>
                    <Input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 70"
                      value={formData.goal_weight_kg}
                      onChange={e => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                      className="h-12 rounded-2xl bg-card border-border/50" />
                  </div>
                  {/* Auto fight week target */}
                  {formData.goal_weight_kg && formData.competition_level && (
                    <Alert className={`rounded-2xl ${formData.competition_level === 'pro' ? 'border-red-500/30 bg-red-500/5' : 'border-primary/30 bg-primary/5'}`}>
                      <Sparkles className={`h-4 w-4 ${formData.competition_level === 'pro' ? 'text-red-500' : 'text-primary'}`} />
                      <AlertDescription className="text-xs text-muted-foreground">
                        Fight week target: <strong className="text-foreground">{formData.fight_week_target_kg} kg</strong>
                        <br />
                        <span className="text-[10px]">{getWaterCutLabel(formData.competition_level)}</span>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {formData.has_fight === "no" && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Weight (kg)</label>
                  <Input type="number" inputMode="decimal" step="0.1" placeholder="What weight do you want to walk around at?"
                    value={formData.goal_weight_kg}
                    onChange={e => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                    className="h-12 rounded-2xl bg-card border-border/50" />
                </div>
              )}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 4: Height ── */}
        {/* ── Screen 4: Age + Sex ── */}
        {step === 4 && (
          <StepLayout step={4} title="How old are you?" subtitle="We'll use this to dial in your metabolic rate."
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
        {step === 5 && (
          <StepLayout step={5} title="What's your height?" subtitle="Used to calculate your metabolic rate."
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
            </div>
          </StepLayout>
        )}

        {/* ── Screen 6: Current Weight ── */}
        {step === 6 && (
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
              {weightDiff && parseFloat(weightDiff) > 0 && formData.goal_type === "cutting" && (() => {
                const diff = parseFloat(weightDiff);
                const weeklyLoss = weeksToFight ? diff / weeksToFight : 0;
                const bodyPct = parseFloat(formData.current_weight_kg) > 0
                  ? (diff / parseFloat(formData.current_weight_kg)) * 100 : 0;
                // Risk: >1% bodyweight/week or >1.5 kg/week
                const isAggressive = weeklyLoss > 1.0 && weeklyLoss <= 1.5;
                const isDangerous = weeklyLoss > 1.5 || bodyPct > 10;

                return (
                  <div className="w-full max-w-[300px] space-y-2">
                    <p className="text-sm text-muted-foreground text-center">
                      You need to drop <strong className="text-foreground">{weightDiff} kg</strong>
                      {weeksToFight ? <> in <strong className="text-foreground">{weeksToFight} weeks</strong>
                        <span className="text-xs text-muted-foreground/60"> ({weeklyLoss.toFixed(1)} kg/wk)</span>
                      </> : null}
                    </p>
                    {isDangerous && (
                      <Alert className="border-red-500/30 bg-red-500/5 rounded-2xl">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-xs text-red-400">
                          <strong className="text-red-300">High risk cut.</strong> Losing {weeklyLoss.toFixed(1)} kg/week ({bodyPct.toFixed(0)}% bodyweight) significantly increases risk of muscle loss, hormonal disruption, and performance decline. Consult a sports doctor. We'll still build your plan.
                        </AlertDescription>
                      </Alert>
                    )}
                    {isAggressive && !isDangerous && (
                      <Alert className="border-yellow-500/30 bg-yellow-500/5 rounded-2xl">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <AlertDescription className="text-xs text-yellow-400">
                          <strong className="text-yellow-300">Aggressive pace.</strong> Losing {weeklyLoss.toFixed(1)} kg/week is doable but requires strict adherence. Monitor energy levels, strength, and sleep closely. We'll plan for this.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })()}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 7: Body Fat (Optional) ── */}
        {step === 7 && (
          <StepLayout step={6} title="Estimate your body fat" subtitle="Drag the slider. Skip if you're not sure."
            footer={
              <div className="space-y-2">
                <Button onClick={goNext} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Continue</Button>
                <button onClick={() => { setFormData(prev => ({ ...prev, body_fat_pct: "" })); goNext(); }} className="w-full text-center text-xs text-muted-foreground/60 py-2 hover:text-muted-foreground transition-colors">
                  Skip this step
                </button>
              </div>
            }
          >
            <div className="flex flex-col items-center pt-8 gap-8">
              <div className="text-center">
                <span className="text-5xl font-bold tabular-nums text-foreground">
                  {formData.body_fat_pct || "—"}
                </span>
                <span className="text-lg text-muted-foreground ml-1">%</span>
              </div>
              <div className="w-full max-w-xs space-y-3">
                <Slider
                  value={[formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : 15]}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, body_fat_pct: v.toString() }))}
                  min={5} max={40} step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/50">
                  <span>Lean</span><span>Average</span><span>Higher</span>
                </div>
              </div>
            </div>
          </StepLayout>
        )}

        {/* ── Screen 8: Experience Level ── */}
        {step === 8 && (
          <StepLayout step={8} title="What's your experience level?" subtitle="No judgment. We just need to know where you're at.">
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
          <StepLayout step={9} title="How often do you train?" subtitle="All sessions — pads, sparring, gym, running.">
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
          <StepLayout step={11} title="How many hours do you sleep?" subtitle="Recovery is half the game.">
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
            </div>
          </StepLayout>
        )}

        {/* ── Screen 12: Struggles ── */}
        {step === 12 && (
          <StepLayout step={12} title="What do you struggle with most?" subtitle="Be real. We'll build around your weak spots.">
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

        {/* ── Screen 13: Aggressiveness ── */}
        {step === 13 && (
          <StepLayout step={13} title="How aggressive do you want to go?" subtitle="This controls how fast we push your weight cut and plan intensity.">
            <div className="space-y-2.5">
              {[
                { value: "safe", label: "Safe & Steady", description: "Slow, sustainable. Best if you have 8+ weeks.", icon: <Shield className="h-5 w-5 text-green-400" /> },
                { value: "balanced", label: "Balanced", description: "Standard fight camp pace. 4-8 weeks out.", icon: <Gauge className="h-5 w-5 text-yellow-400" /> },
                { value: "aggressive", label: "Aggressive", description: "Hard cuts. Less than 4 weeks to fight.", icon: <Flame className="h-5 w-5 text-red-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.plan_aggressiveness === opt.value} icon={opt.icon}
                  label={opt.label} description={opt.description} onClick={() => selectAndAdvance("plan_aggressiveness", opt.value)} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 14: Dietary Preferences ── */}
        {step === 14 && (
          <StepLayout step={14} title="Any dietary preferences?" subtitle="We'll keep your meal plans compatible."
            footer={
              <div className="space-y-2">
                <Button onClick={goNext} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Continue</Button>
                <button onClick={() => { setFormData(prev => ({ ...prev, dietary_restrictions: [] })); goNext(); }} className="w-full text-center text-xs text-muted-foreground/60 py-2 hover:text-muted-foreground transition-colors">
                  No restrictions — skip
                </button>
              </div>
            }
          >
            <div className="space-y-2.5">
              {["Halal", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free"].map(d => (
                <MultiCard key={d} label={d} selected={formData.dietary_restrictions.includes(d.toLowerCase().replace("-", "_"))}
                  onClick={() => toggleMulti("dietary_restrictions", d.toLowerCase().replace("-", "_"))} />
              ))}
            </div>
          </StepLayout>
        )}

        {/* ── Screen 15: Budget ── */}
        {step === 15 && (
          <StepLayout step={15} title="What's your food budget?" subtitle="We'll match meal suggestions to what you can spend.">
            <div className="space-y-2.5">
              {[
                { value: "student", label: "Student Budget", description: "Simple, cheap, effective meals", icon: <Wallet className="h-5 w-5 text-yellow-400" /> },
                { value: "flexible", label: "Flexible", description: "Wider range of food options", icon: <Wallet className="h-5 w-5 text-green-400" /> },
              ].map(opt => (
                <OptionCard key={opt.value} selected={formData.food_budget === opt.value} icon={opt.icon}
                  label={opt.label} description={opt.description}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, food_budget: opt.value }));
                    triggerHapticSelection();
                    setTimeout(handleSubmit, 300);
                  }}
                />
              ))}
            </div>
          </StepLayout>
        )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
}
