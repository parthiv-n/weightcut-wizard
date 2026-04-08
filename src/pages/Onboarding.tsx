import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile, useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, CheckCircle, Zap, Shield, Activity } from "lucide-react";
import { profileSchema } from "@/lib/validation";
import wizardLogo from "@/assets/wizard-logo.webp";
import { celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import { seedDemoData } from "@/lib/demoData";

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const navigate = useNavigate();
  const { refreshProfile } = useProfile();
  const { hasProfile, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    age: "",
    sex: "",
    height_cm: "",
    current_weight_kg: "",
    goal_weight_kg: "",
    fight_week_target_kg: "",
    target_date: "",
    activity_level: "",
    training_frequency: "",
    goal_type: "cutting" as "cutting" | "losing",
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);
  const [targetSafetyLevel, setTargetSafetyLevel] = useState<"safe" | "moderate" | "risky">("safe");

  // Redirect immediately if profile already exists (no async flash)
  useEffect(() => {
    if (!authLoading && hasProfile) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, hasProfile, navigate]);

  const calculateBMR = () => {
    const weight = parseFloat(formData.current_weight_kg);
    const height = parseFloat(formData.height_cm);
    const age = parseInt(formData.age);

    if (formData.sex === "male") {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  };

  const handleSubmit = async () => {
    const startTime = performance.now();

    // Validate input
    const validationResult = profileSchema.safeParse({
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height_cm),
      current_weight_kg: parseFloat(formData.current_weight_kg),
      goal_weight_kg: parseFloat(formData.goal_weight_kg),
      fight_week_target_kg: formData.goal_type === 'cutting' ? parseFloat(formData.fight_week_target_kg) : undefined,
      training_frequency: parseInt(formData.training_frequency),
    });

    if (!validationResult.success) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
      });
      return;
    }

    setLoading(true);
    setGeneratingPlan(true);
    setGenerationStep(0);

    // Staged progress messages
    const stepTimers = [
      setTimeout(() => setGenerationStep(1), 600),
      setTimeout(() => setGenerationStep(2), 1400),
      setTimeout(() => setGenerationStep(3), 2200),
    ];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const bmr = calculateBMR();
      const tdee = bmr * ACTIVITY_MULTIPLIERS[formData.activity_level as keyof typeof ACTIVITY_MULTIPLIERS];

      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        age: parseInt(formData.age),
        sex: formData.sex,
        height_cm: parseFloat(formData.height_cm),
        current_weight_kg: parseFloat(formData.current_weight_kg),
        goal_weight_kg: parseFloat(formData.goal_weight_kg),
        fight_week_target_kg: formData.goal_type === 'cutting' ? parseFloat(formData.fight_week_target_kg) : null,
        target_date: formData.target_date,
        activity_level: formData.activity_level,
        training_frequency: parseInt(formData.training_frequency),
        goal_type: formData.goal_type,
        bmr,
        tdee,
      });

      if (error) throw error;

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      logger.info("Onboarding completed", { ms: duration });

      // Ensure all 3 animation steps have had time to play (step 3 fires at 2200ms)
      const minAnimMs = 2400;
      const remainingAnim = Math.max(0, minAnimMs - (endTime - startTime));

      stepTimers.forEach(clearTimeout);

      setTimeout(async () => {
        setGenerationStep(4);
        const profileRefreshed = await refreshProfile();
        if (!profileRefreshed) {
          await refreshProfile();
        }
        // Seed demo data so dashboard looks populated during tutorial
        const { data: { user } } = await supabase.auth.getUser();
        if (user) seedDemoData(user.id);
        celebrateSuccess();
        setTimeout(() => navigate("/dashboard"), 1000);
      }, remainingAnim);
    } catch (error: any) {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      logger.error("Onboarding failed", error, { ms: duration });

      stepTimers.forEach(clearTimeout);
      setGeneratingPlan(false);
      setGenerationStep(0);

      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 4) * 100;

  // Calculate AI-recommended fight week target
  const calculateRecommendedTarget = (fightNightWeight: number) => {
    // Safe dehydration is 5-7% of body weight with water loading
    // Conservative recommendation: 5.5% of fight night weight
    const safeDehydrationPercentage = 0.055;
    const recommendedTarget = fightNightWeight * (1 + safeDehydrationPercentage);
    return Math.round(recommendedTarget * 10) / 10; // Round to 1 decimal
  };

  // Assess safety level of manual target
  const assessTargetSafety = (fightNightWeight: number, fightWeekTarget: number) => {
    const cutAmount = fightWeekTarget - fightNightWeight;
    const cutPercentage = (cutAmount / fightNightWeight) * 100;

    if (cutPercentage <= 5) {
      return { level: "safe" as const, message: "Safe range (≤5% dehydration)", color: "text-green-600 dark:text-green-400" };
    } else if (cutPercentage <= 7) {
      return { level: "moderate" as const, message: "Moderate risk (5-7% dehydration)", color: "text-yellow-600 dark:text-yellow-400" };
    } else {
      return { level: "risky" as const, message: "High risk (>7% dehydration)", color: "text-red-600 dark:text-red-400" };
    }
  };

  // Update fight week target when goal weight changes or auto mode is enabled
  useEffect(() => {
    if (useAutoTarget && formData.goal_weight_kg) {
      const recommended = calculateRecommendedTarget(parseFloat(formData.goal_weight_kg));
      setFormData(prev => ({ ...prev, fight_week_target_kg: recommended.toString() }));
      setTargetSafetyLevel("safe");
    }
  }, [formData.goal_weight_kg, useAutoTarget]);

  // Assess safety when manual target changes
  useEffect(() => {
    if (!useAutoTarget && formData.goal_weight_kg && formData.fight_week_target_kg) {
      const assessment = assessTargetSafety(
        parseFloat(formData.goal_weight_kg),
        parseFloat(formData.fight_week_target_kg)
      );
      setTargetSafetyLevel(assessment.level);
    }
  }, [formData.fight_week_target_kg, formData.goal_weight_kg, useAutoTarget]);

  const getSafetyFeedback = () => {
    if (!formData.goal_weight_kg || !formData.fight_week_target_kg) return null;

    return assessTargetSafety(
      parseFloat(formData.goal_weight_kg),
      parseFloat(formData.fight_week_target_kg)
    );
  };

  const GENERATION_STEPS = [
    { icon: Activity, label: "Analyzing your profile", color: "text-blue-400" },
    { icon: Zap, label: "Calculating nutrition targets", color: "text-yellow-400" },
    { icon: Shield, label: formData.goal_type === 'losing' ? "Building your weight loss plan" : "Building your weight cut strategy", color: "text-blue-400" },
    { icon: Sparkles, label: "Finalizing your plan", color: "text-primary" },
    { icon: CheckCircle, label: "Your plan is ready!", color: "text-green-400" },
  ];

  // Shared input/select styles — Apple Health / Watch style
  const inputClass =
    "h-12 min-h-[44px] rounded-2xl bg-card dark:bg-white/5 border border-border dark:border-white/10 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:border-primary/40 px-4 text-base transition-colors touch-manipulation";
  const selectTriggerClass =
    "h-12 min-h-[44px] rounded-2xl bg-card dark:bg-white/5 border border-border dark:border-white/10 text-foreground data-[placeholder]:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 focus:border-primary/40 px-4 text-base transition-colors";

  // Full-screen generating plan overlay
  if (generatingPlan) {
    const progressPercent = Math.min((generationStep / 4) * 100, 100);
    return (
      <div className="fixed inset-0 bg-background dark:bg-black/95 text-foreground flex flex-col items-center justify-center z-50 px-6">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <img
              src={wizardLogo}
              alt="Wizard"
              className="relative h-20 w-20 object-contain drop-shadow-2xl"
            />
          </div>

          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2 text-center">
            {generationStep >= 4 ? "All Set!" : "Creating Your Plan"}
          </h2>
          <p className="text-sm text-muted-foreground mb-10 text-center">
            {generationStep >= 4 ? "Redirecting to your dashboard..." : "This will only take a moment"}
          </p>

          {/* Slim Apple-style progress bar */}
          <div className="w-full h-1.5 rounded-full bg-muted/50 dark:bg-white/10 overflow-hidden mb-10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="w-full space-y-4">
            {GENERATION_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === generationStep;
              const isDone = i < generationStep;
              const isPending = i > generationStep;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition-all duration-500 ${isPending ? "opacity-20" : isDone ? "opacity-60" : "opacity-100"}`}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      isDone
                        ? "bg-primary/20 dark:bg-primary/30"
                        : isActive
                          ? "bg-muted dark:bg-white/15"
                          : "bg-muted/50 dark:bg-white/10"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <Icon className={`h-4 w-4 ${isActive ? s.color : "text-muted-foreground"} ${isActive ? "animate-pulse" : ""}`} />
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium transition-colors duration-500 ${
                      isDone ? "text-muted-foreground line-through" : isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
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

  // Don't flash onboarding UI if user already has a profile
  if (authLoading || hasProfile) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background dark:bg-[#020204] p-4">
      <div className="card-surface w-full max-w-2xl rounded-xl border border-border shadow-xl overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-title font-semibold text-foreground">Set Up Your Plan</h1>
            <p className="text-muted-foreground mt-1">Let's personalize your journey ({step}/4)</p>
            {/* Slim Apple-style progress bar */}
            <div className="mt-4 w-full h-1.5 rounded-full bg-muted/50 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {step === 1 && "Basic information"}
              {step === 2 && "Weight goals"}
              {step === 3 && "Activity level"}
              {step === 4 && "Review and create"}
            </p>
          </div>

          <div className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-foreground">Basic Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age" className="text-foreground text-sm font-medium">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    inputMode="numeric"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex" className="text-foreground text-sm font-medium">Sex</Label>
                  <Select value={formData.sex} onValueChange={(value) => setFormData({ ...formData, sex: value })}>
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height" className="text-foreground text-sm font-medium">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_weight" className="text-foreground text-sm font-medium">Current Weight (kg)</Label>
                  <Input
                    id="current_weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={formData.current_weight_kg}
                    onChange={(e) => setFormData({ ...formData, current_weight_kg: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <Button onClick={() => setStep(2)} className="w-full h-12 rounded-2xl text-base font-medium bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Next</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-foreground">Weight Goals</h3>

              {/* Goal type toggle */}
              <div className="flex gap-1 p-1 rounded-2xl bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, goal_type: "cutting" }))}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                    formData.goal_type === "cutting"
                      ? "bg-background dark:bg-white/10 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  I have a fight
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, goal_type: "losing" }))}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                    formData.goal_type === "losing"
                      ? "bg-background dark:bg-white/10 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Just lose weight
                </button>
              </div>

              <p className="text-sm text-muted-foreground">
                {formData.goal_type === 'cutting'
                  ? "Set your fight night weight (weigh-in) and fight week target (before dehydration cut)"
                  : "Set your goal weight and target date"}
              </p>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal_weight" className="text-foreground text-sm font-medium">
                    {formData.goal_type === 'cutting' ? 'Fight Night Weight (kg)' : 'Goal Weight (kg)'}
                    {formData.goal_type === 'cutting' && (
                      <span className="text-xs text-muted-foreground ml-2 font-normal">Your competition weight class</span>
                    )}
                  </Label>
                  <Input
                    id="goal_weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="e.g., 70"
                    value={formData.goal_weight_kg}
                    onChange={(e) => setFormData({ ...formData, goal_weight_kg: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>

                {formData.goal_type === 'cutting' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Label htmlFor="fight_week_target" className="text-foreground text-sm font-medium">
                      Fight Week Target (kg)
                      <span className="text-xs text-muted-foreground ml-2 font-normal">Weight before dehydration</span>
                    </Label>
                    <Button
                      type="button"
                      variant={useAutoTarget ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseAutoTarget(!useAutoTarget)}
                      className="gap-2 rounded-2xl h-9"
                    >
                      <Sparkles className="h-3 w-3" />
                      {useAutoTarget ? "AI Auto" : "Manual"}
                    </Button>
                  </div>

                  <Input
                    id="fight_week_target"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="e.g., 77"
                    value={formData.fight_week_target_kg}
                    onChange={(e) => {
                      setFormData({ ...formData, fight_week_target_kg: e.target.value });
                      setUseAutoTarget(false);
                    }}
                    disabled={useAutoTarget}
                    required
                    className={inputClass}
                  />

                  {useAutoTarget ? (
                    <Alert className="border-primary/40 bg-primary/10 dark:bg-primary/20 rounded-2xl">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-sm text-foreground">
                        AI calculated safe target based on 5.5% dehydration capacity with water loading protocol
                      </AlertDescription>
                    </Alert>
                  ) : (
                    getSafetyFeedback() && (
                      <Alert className={`rounded-2xl ${targetSafetyLevel === "safe" ? "border-green-500/40 bg-green-500/10 dark:bg-green-500/20" :
                        targetSafetyLevel === "moderate" ? "border-yellow-500/40 bg-yellow-500/10 dark:bg-yellow-500/20" :
                          "border-red-500/40 bg-red-500/10 dark:bg-red-500/20"
                        }`}>
                        {targetSafetyLevel === "safe" ? (
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertTriangle className={`h-4 w-4 ${targetSafetyLevel === "moderate" ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`} />
                        )}
                        <AlertDescription className={`text-sm ${getSafetyFeedback()?.color}`}>
                          {getSafetyFeedback()?.message}
                          {formData.goal_weight_kg && formData.fight_week_target_kg && (
                            <span className="block mt-1">
                              Dehydration cut: {(parseFloat(formData.fight_week_target_kg) - parseFloat(formData.goal_weight_kg)).toFixed(1)}kg
                              ({((parseFloat(formData.fight_week_target_kg) - parseFloat(formData.goal_weight_kg)) / parseFloat(formData.goal_weight_kg) * 100).toFixed(1)}% of body weight)
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    )
                  )}

                  <p className="text-xs text-muted-foreground">
                    {useAutoTarget
                      ? "AI will calculate the optimal target based on safe dehydration limits"
                      : "Manual mode: Set your own target (typically 5-7kg above fight night weight)"}
                  </p>
                </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="target_date" className="text-foreground text-sm font-medium">Target Date</Label>
                  <Input
                    id="target_date"
                    type="date"
                    value={formData.target_date}
                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-2xl flex-1 border-border dark:border-white/15 text-foreground">Back</Button>
                <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Next</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-foreground">Activity Level</h3>
              <div className="space-y-2">
                <Label htmlFor="activity_level" className="text-foreground text-sm font-medium">Activity Level</Label>
                <Select value={formData.activity_level} onValueChange={(value) => setFormData({ ...formData, activity_level: value })}>
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue placeholder="Select activity level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
                    <SelectItem value="lightly_active">Lightly Active (1-3 days/week)</SelectItem>
                    <SelectItem value="moderately_active">Moderately Active (3-5 days/week)</SelectItem>
                    <SelectItem value="very_active">Very Active (6-7 days/week)</SelectItem>
                    <SelectItem value="extra_active">Extra Active (2x per day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="training_frequency" className="text-foreground text-sm font-medium">Training Frequency (sessions per week)</Label>
                <Input
                  id="training_frequency"
                  type="number"
                  inputMode="numeric"
                  value={formData.training_frequency}
                  onChange={(e) => setFormData({ ...formData, training_frequency: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="h-12 rounded-2xl flex-1 border-border dark:border-white/15 text-foreground">Back</Button>
                <Button onClick={() => setStep(4)} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">Next</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-foreground">Review & Confirm</h3>
              <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border dark:border-white/10 p-4 space-y-2 text-sm text-foreground">
                <p><strong className="text-foreground">Age:</strong> <span className="text-muted-foreground">{formData.age} years</span></p>
                <p><strong className="text-foreground">Sex:</strong> <span className="text-muted-foreground">{formData.sex}</span></p>
                <p><strong className="text-foreground">Height:</strong> <span className="text-muted-foreground">{formData.height_cm} cm</span></p>
                <p><strong className="text-foreground">Current Weight:</strong> <span className="text-muted-foreground">{formData.current_weight_kg} kg</span></p>
                <p><strong className="text-foreground">{formData.goal_type === 'cutting' ? 'Fight Night Weight' : 'Goal Weight'}:</strong> <span className="text-muted-foreground">{formData.goal_weight_kg} kg</span></p>
                {formData.goal_type === 'cutting' && (
                  <p><strong className="text-foreground">Fight Week Target:</strong> <span className="text-muted-foreground">{formData.fight_week_target_kg} kg</span></p>
                )}
                <p><strong className="text-foreground">Target Date:</strong> <span className="text-muted-foreground">{formData.target_date}</span></p>
                <p><strong className="text-foreground">Activity Level:</strong> <span className="text-muted-foreground">{formData.activity_level?.replace(/_/g, " ")}</span></p>
                <p><strong className="text-foreground">Training Frequency:</strong> <span className="text-muted-foreground">{formData.training_frequency} sessions/week</span></p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(3)} className="h-12 rounded-2xl flex-1 border-border dark:border-white/15 text-foreground">Back</Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-70">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground"></div>
                      Creating your plan...
                    </div>
                  ) : (
                    "Create Plan"
                  )}
                </Button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}