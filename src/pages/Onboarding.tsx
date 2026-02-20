import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, CheckCircle, Zap, Shield, Activity } from "lucide-react";
import { profileSchema } from "@/lib/validation";
import wizardLogo from "@/assets/wizard-logo.png";

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
  const { refreshProfile } = useUser();
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
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);
  const [targetSafetyLevel, setTargetSafetyLevel] = useState<"safe" | "moderate" | "risky">("safe");

  useEffect(() => {
    // Check if user already has a profile (only once on mount)
    const checkExistingProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

          if (data) {
            navigate("/dashboard");
          }
        }
      } catch (error) {
        // Silently fail - user can continue with onboarding
      }
    };

    checkExistingProfile();
  }, [navigate]);

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
    console.log("🚀 Starting onboarding profile creation...");

    // Validate input
    const validationResult = profileSchema.safeParse({
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height_cm),
      current_weight_kg: parseFloat(formData.current_weight_kg),
      goal_weight_kg: parseFloat(formData.goal_weight_kg),
      fight_week_target_kg: parseFloat(formData.fight_week_target_kg),
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
        fight_week_target_kg: parseFloat(formData.fight_week_target_kg),
        target_date: formData.target_date,
        activity_level: formData.activity_level,
        training_frequency: parseInt(formData.training_frequency),
        bmr,
        tdee,
      });

      if (error) throw error;

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      console.log(`✅ Onboarding completed in ${duration}ms`);

      // Ensure all 3 animation steps have had time to play (step 3 fires at 2200ms)
      const minAnimMs = 2400;
      const remainingAnim = Math.max(0, minAnimMs - (endTime - startTime));

      stepTimers.forEach(clearTimeout);

      setTimeout(async () => {
        setGenerationStep(4);
        await refreshProfile(); // update hasProfile=true before navigating
        setTimeout(() => navigate("/dashboard"), 1000);
      }, remainingAnim);
    } catch (error: any) {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      console.error(`❌ Onboarding failed after ${duration}ms:`, error);

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
    { icon: Shield, label: "Building your weight cut strategy", color: "text-purple-400" },
    { icon: Sparkles, label: "Finalizing your plan", color: "text-primary" },
    { icon: CheckCircle, label: "Your plan is ready!", color: "text-green-400" },
  ];

  // Full-screen generating plan overlay
  if (generatingPlan) {
    const progressPercent = Math.min((generationStep / 4) * 100, 100);
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 px-6">
        {/* Background glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          {/* Logo */}
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <img
              src={wizardLogo}
              alt="Wizard"
              className="relative h-20 w-20 object-contain drop-shadow-2xl"
            />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2 text-center">
            {generationStep >= 4 ? "All Set!" : "Creating Your Plan"}
          </h2>
          <p className="text-sm text-zinc-500 mb-10 text-center">
            {generationStep >= 4 ? "Redirecting to your dashboard..." : "This will only take a moment"}
          </p>

          {/* Progress bar */}
          <div className="w-full h-1 bg-zinc-800 rounded-full mb-10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-green-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className="w-full space-y-4">
            {GENERATION_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === generationStep;
              const isDone = i < generationStep;
              const isPending = i > generationStep;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition-all duration-500 ${isPending ? "opacity-20" : isDone ? "opacity-50" : "opacity-100"
                    }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${isDone ? "bg-green-500/10" : isActive ? "bg-zinc-800" : "bg-zinc-900"
                    }`}>
                    {isDone ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <Icon className={`h-4 w-4 ${isActive ? s.color : "text-zinc-600"} ${isActive ? "animate-pulse" : ""}`} />
                    )}
                  </div>
                  <span className={`text-sm font-medium transition-colors duration-500 ${isDone ? "text-zinc-500 line-through" : isActive ? "text-white" : "text-zinc-700"
                    }`}>
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-card p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-title">Set Up Your Weight Cut Plan</CardTitle>
          <CardDescription>Let's personalize your journey ({step}/4)</CardDescription>
          <Progress value={progress} className="mt-4" />
          <p className="text-xs text-muted-foreground mt-2">
            {step === 1 && "Basic information"}
            {step === 2 && "Weight goals"}
            {step === 3 && "Activity level"}
            {step === 4 && "Review and create"}
          </p>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Basic Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select value={formData.sex} onValueChange={(value) => setFormData({ ...formData, sex: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    step="0.1"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_weight">Current Weight (kg)</Label>
                  <Input
                    id="current_weight"
                    type="number"
                    step="0.1"
                    value={formData.current_weight_kg}
                    onChange={(e) => setFormData({ ...formData, current_weight_kg: e.target.value })}
                    required
                  />
                </div>
              </div>
              <Button onClick={() => setStep(2)} className="w-full">Next</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Weight Goals</h3>
              <p className="text-sm text-muted-foreground">
                Set your fight night weight (weigh-in) and fight week target (before dehydration cut)
              </p>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal_weight">
                    Fight Night Weight (kg)
                    <span className="text-xs text-muted-foreground ml-2">Your competition weight class</span>
                  </Label>
                  <Input
                    id="goal_weight"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 70"
                    value={formData.goal_weight_kg}
                    onChange={(e) => setFormData({ ...formData, goal_weight_kg: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fight_week_target">
                      Fight Week Target (kg)
                      <span className="text-xs text-muted-foreground ml-2">Weight before dehydration</span>
                    </Label>
                    <Button
                      type="button"
                      variant={useAutoTarget ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseAutoTarget(!useAutoTarget)}
                      className="gap-2"
                    >
                      <Sparkles className="h-3 w-3" />
                      {useAutoTarget ? "AI Auto" : "Manual"}
                    </Button>
                  </div>

                  <Input
                    id="fight_week_target"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 77"
                    value={formData.fight_week_target_kg}
                    onChange={(e) => {
                      setFormData({ ...formData, fight_week_target_kg: e.target.value });
                      setUseAutoTarget(false);
                    }}
                    disabled={useAutoTarget}
                    required
                  />

                  {useAutoTarget ? (
                    <Alert className="border-primary/50 bg-primary/5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-sm">
                        AI calculated safe target based on 5.5% dehydration capacity with water loading protocol
                      </AlertDescription>
                    </Alert>
                  ) : (
                    getSafetyFeedback() && (
                      <Alert className={`${targetSafetyLevel === "safe" ? "border-green-500/50 bg-green-500/5" :
                        targetSafetyLevel === "moderate" ? "border-yellow-500/50 bg-yellow-500/5" :
                          "border-red-500/50 bg-red-500/5"
                        }`}>
                        {targetSafetyLevel === "safe" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className={`h-4 w-4 ${targetSafetyLevel === "moderate" ? "text-yellow-500" : "text-red-500"
                            }`} />
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

                <div className="space-y-2">
                  <Label htmlFor="target_date">Target Date</Label>
                  <Input
                    id="target_date"
                    type="date"
                    value={formData.target_date}
                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} className="flex-1">Next</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Activity Level</h3>
              <div className="space-y-2">
                <Label htmlFor="activity_level">Activity Level</Label>
                <Select value={formData.activity_level} onValueChange={(value) => setFormData({ ...formData, activity_level: value })}>
                  <SelectTrigger>
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
                <Label htmlFor="training_frequency">Training Frequency (sessions per week)</Label>
                <Input
                  id="training_frequency"
                  type="number"
                  value={formData.training_frequency}
                  onChange={(e) => setFormData({ ...formData, training_frequency: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)} className="flex-1">Next</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Review & Confirm</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Age:</strong> {formData.age} years</p>
                <p><strong>Sex:</strong> {formData.sex}</p>
                <p><strong>Height:</strong> {formData.height_cm} cm</p>
                <p><strong>Current Weight:</strong> {formData.current_weight_kg} kg</p>
                <p><strong>Fight Night Weight:</strong> {formData.goal_weight_kg} kg</p>
                <p><strong>Fight Week Target:</strong> {formData.fight_week_target_kg} kg</p>
                <p><strong>Target Date:</strong> {formData.target_date}</p>
                <p><strong>Activity Level:</strong> {formData.activity_level?.replace(/_/g, " ")}</p>
                <p><strong>Training Frequency:</strong> {formData.training_frequency} sessions/week</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating your plan...
                    </div>
                  ) : (
                    "Create Plan"
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}