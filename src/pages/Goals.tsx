import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, AlertTriangle, Loader2, Target } from "lucide-react";
import { profileSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";
import { celebrateSuccess, triggerHapticSelection } from "@/lib/haptics";

/** Inline chip selector — replaces dropdown selects with tappable pills */
function ChipSelect({ value, options, onChange, columns = 3 }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div className={`grid gap-1.5 ${columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : columns === 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
      {options.map(opt => (
        <button key={opt.value} type="button"
          onClick={() => { triggerHapticSelection(); onChange(opt.value); }}
          className={`h-9 rounded-xl text-[12px] font-semibold border transition-all active:scale-[0.97] ${
            value === opt.value
              ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
              : "border-border/40 bg-white/[0.02] text-muted-foreground hover:border-border/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const ATHLETE_TYPES: Record<string, string> = {
  mma: "MMA", boxing: "Boxing", muay_thai: "Muay Thai", bjj: "BJJ",
  wrestling: "Wrestling", kickboxing: "Kickboxing", judo: "Judo", other: "Other",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner", amateur: "Amateur Fighter", pro: "Experienced / Pro",
};

const COMPETITION_LABELS: Record<string, string> = {
  hobbyist: "Hobbyist", amateur: "Amateur", pro: "Pro",
};

const AGGRESSIVENESS_LABELS: Record<string, string> = {
  conservative: "Conservative", balanced: "Balanced", aggressive: "Aggressive",
};

const BUDGET_LABELS: Record<string, string> = {
  budget: "Budget", flexible: "Flexible", no_limit: "No Limit",
};

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userId, currentWeight, profile: contextProfile, refreshProfile } = useUser();

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
    // New onboarding v2 fields
    athlete_type: "",
    goal_type: "",
    experience_level: "",
    training_types: [] as string[],
    sleep_hours: "",
    primary_struggle: "",
    plan_aggressiveness: "",
    food_budget: "",
    body_fat_pct: "",
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);
  const [targetSafetyLevel, setTargetSafetyLevel] = useState<"safe" | "moderate" | "risky">("safe");

  useEffect(() => {
    if (!userId) { navigate("/auth"); return; }
    if (contextProfile) {
      const currentWeightValue = currentWeight ?? contextProfile.current_weight_kg ?? 0;
      const p = contextProfile as any;
      setFormData({
        age: contextProfile.age?.toString() || "",
        sex: contextProfile.sex || "",
        height_cm: contextProfile.height_cm?.toString() || "",
        current_weight_kg: currentWeightValue.toString(),
        goal_weight_kg: contextProfile.goal_weight_kg?.toString() || "",
        fight_week_target_kg: contextProfile.fight_week_target_kg?.toString() || "",
        target_date: contextProfile.target_date || "",
        activity_level: contextProfile.activity_level || "",
        training_frequency: contextProfile.training_frequency?.toString() || "",
        athlete_type: p.athlete_type || "",
        goal_type: p.goal_type || "cutting",
        experience_level: p.experience_level || "",
        training_types: p.training_types || [],
        sleep_hours: p.sleep_hours || "",
        primary_struggle: p.primary_struggle || "",
        plan_aggressiveness: p.plan_aggressiveness || "",
        food_budget: p.food_budget || "",
        body_fat_pct: p.body_fat_pct?.toString() || "",
      });

      if (contextProfile.goal_weight_kg && contextProfile.fight_week_target_kg) {
        const recommended = calculateRecommendedTarget(contextProfile.goal_weight_kg);
        setUseAutoTarget(Math.abs(contextProfile.fight_week_target_kg - recommended) < 0.1);
      }
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [userId, contextProfile]);

  const calculateBMR = () => {
    const weight = parseFloat(formData.current_weight_kg) || 70;
    const height = parseFloat(formData.height_cm) || 175;
    const age = parseInt(formData.age) || 25;
    return formData.sex === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  };

  const calculateRecommendedTarget = (fightNightWeight: number) => {
    return Math.round(fightNightWeight * 1.055 * 10) / 10;
  };

  const assessTargetSafety = (fightNightWeight: number, fightWeekTarget: number) => {
    const cutPercentage = ((fightWeekTarget - fightNightWeight) / fightNightWeight) * 100;
    if (cutPercentage <= 5) return { level: "safe" as const, message: "Safe range (≤5%)" };
    if (cutPercentage <= 7) return { level: "moderate" as const, message: "Moderate risk (5-7%)" };
    return { level: "risky" as const, message: "High risk (>7%)" };
  };

  useEffect(() => {
    if (useAutoTarget && formData.goal_weight_kg) {
      const rec = calculateRecommendedTarget(parseFloat(formData.goal_weight_kg));
      setFormData(prev => ({ ...prev, fight_week_target_kg: rec.toString() }));
      setTargetSafetyLevel("safe");
    }
  }, [formData.goal_weight_kg, useAutoTarget]);

  useEffect(() => {
    if (!useAutoTarget && formData.goal_weight_kg && formData.fight_week_target_kg) {
      setTargetSafetyLevel(assessTargetSafety(parseFloat(formData.goal_weight_kg), parseFloat(formData.fight_week_target_kg)).level);
    }
  }, [formData.fight_week_target_kg, formData.goal_weight_kg, useAutoTarget]);

  const handleSubmit = async () => {
    const goalType = formData.goal_type || 'cutting';
    const validationResult = profileSchema.safeParse({
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height_cm),
      current_weight_kg: parseFloat(formData.current_weight_kg),
      goal_weight_kg: parseFloat(formData.goal_weight_kg),
      fight_week_target_kg: goalType === 'cutting' ? parseFloat(formData.fight_week_target_kg) : undefined,
      training_frequency: parseInt(formData.training_frequency),
    });

    if (!validationResult.success) {
      toast({ variant: "destructive", title: "Validation Error", description: validationResult.error.errors[0].message });
      return;
    }

    setSaving(true);
    try {
      if (!userId) throw new Error("No user found");
      const bmr = calculateBMR();
      const tdee = bmr * (ACTIVITY_MULTIPLIERS[formData.activity_level as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.55);

      const { error } = await supabase.from("profiles").update({
        age: parseInt(formData.age),
        sex: formData.sex,
        height_cm: parseFloat(formData.height_cm),
        current_weight_kg: parseFloat(formData.current_weight_kg),
        goal_weight_kg: parseFloat(formData.goal_weight_kg),
        fight_week_target_kg: goalType === 'cutting' ? parseFloat(formData.fight_week_target_kg) : null,
        target_date: formData.target_date,
        activity_level: formData.activity_level,
        training_frequency: parseInt(formData.training_frequency),
        bmr,
        tdee,
        athlete_type: formData.athlete_type || null,
        goal_type: formData.goal_type || null,
        experience_level: formData.experience_level || null,
        training_types: formData.training_types.length > 0 ? formData.training_types : null,
        sleep_hours: formData.sleep_hours || null,
        primary_struggle: formData.primary_struggle || null,
        plan_aggressiveness: formData.plan_aggressiveness || null,
        food_budget: formData.food_budget || null,
        body_fat_pct: formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : null,
      }).eq("id", userId);

      if (error) throw error;
      await refreshProfile();
      celebrateSuccess();
      navigate("/dashboard");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-[50vh]" />;

  const isFighter = formData.goal_type === "cutting";
  const safetyFeedback = formData.goal_weight_kg && formData.fight_week_target_kg
    ? assessTargetSafety(parseFloat(formData.goal_weight_kg), parseFloat(formData.fight_week_target_kg))
    : null;

  return (
    <div className="animate-page-in space-y-2.5 p-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground mt-0.5 text-xs">Update your profile and targets</p>
      </div>

      {!contextProfile?.goal_weight_kg && (
        <div className="card-surface rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/15 p-2.5 flex-shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Set Up Your Fight Profile</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Fill in your details below so the Wizard can calculate your calorie targets, track your cut, and give you daily guidance.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Section: Athlete Profile */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Athlete Profile</h2>
          <div className="card-surface rounded-xl border border-border overflow-hidden divide-y divide-border/30">
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sport</Label>
              <ChipSelect value={formData.athlete_type} columns={4}
                options={Object.entries(ATHLETE_TYPES).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, athlete_type: v }))} />
            </div>
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Goal</Label>
              <ChipSelect value={formData.goal_type} columns={4}
                options={[
                  { value: "cutting", label: "Weight Cut" },
                  { value: "losing", label: "Lose" },
                  { value: "maintaining", label: "Maintain" },
                  { value: "gaining", label: "Gain" },
                ]}
                onChange={(v) => setFormData(prev => ({ ...prev, goal_type: v }))} />
            </div>
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Experience</Label>
              <ChipSelect value={formData.experience_level}
                options={Object.entries(EXPERIENCE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, experience_level: v }))} />
            </div>
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan Style</Label>
              <ChipSelect value={formData.plan_aggressiveness}
                options={Object.entries(AGGRESSIVENESS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, plan_aggressiveness: v }))} />
            </div>
          </div>
        </div>

        {/* Section: Personal Details */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Personal Details</h2>
          <div className="card-surface rounded-xl border border-border overflow-hidden divide-y divide-border">
            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-sm font-medium">Age</Label>
              <Input type="number" value={formData.age} onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base" placeholder="-" />
            </div>
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</Label>
              <ChipSelect value={formData.sex} columns={2}
                options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                onChange={(v) => setFormData(prev => ({ ...prev, sex: v }))} />
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-sm font-medium">Height</Label>
              <div className="flex items-center gap-1">
                <Input type="number" value={formData.height_cm} onChange={(e) => setFormData(prev => ({ ...prev, height_cm: e.target.value }))}
                  className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base" placeholder="-" />
                <span className="text-muted-foreground text-sm">cm</span>
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-sm font-medium">Current Weight</Label>
              <div className="flex items-center gap-1">
                <Input type="number" step="0.1" value={formData.current_weight_kg} onChange={(e) => setFormData(prev => ({ ...prev, current_weight_kg: e.target.value }))}
                  className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base" placeholder="-" />
                <span className="text-muted-foreground text-sm">kg</span>
              </div>
            </div>
            {formData.body_fat_pct !== undefined && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <Label className="text-sm font-medium">Body Fat</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" step="0.1" value={formData.body_fat_pct} onChange={(e) => setFormData(prev => ({ ...prev, body_fat_pct: e.target.value }))}
                    className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base" placeholder="-" />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
            )}
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Sleep</Label>
              <ChipSelect value={formData.sleep_hours} columns={5}
                options={[
                  { value: "<5", label: "<5h" },
                  { value: "5-6", label: "5-6h" },
                  { value: "6-7", label: "6-7h" },
                  { value: "7-8", label: "7-8h" },
                  { value: "8+", label: "8+" },
                ]}
                onChange={(v) => setFormData(prev => ({ ...prev, sleep_hours: v }))} />
            </div>
          </div>
        </div>

        {/* Section: Targets */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Targets</h2>
          <div className="card-surface rounded-xl border border-border overflow-hidden divide-y divide-border">
            <div className="px-3 py-2.5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{isFighter ? 'Weight Class' : 'Goal Weight'}</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" step="0.1" value={formData.goal_weight_kg} onChange={(e) => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                    className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base font-semibold text-primary" placeholder="-" />
                  <span className="text-muted-foreground text-sm">kg</span>
                </div>
              </div>
            </div>

            {isFighter && (
              <div className="px-3 py-2.5 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Diet Target</Label>
                    <button type="button" onClick={() => setUseAutoTarget(!useAutoTarget)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${useAutoTarget ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border"}`}>
                      {useAutoTarget ? "AUTO" : "MANUAL"}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="number" step="0.1" value={formData.fight_week_target_kg}
                      onChange={(e) => { setFormData(prev => ({ ...prev, fight_week_target_kg: e.target.value })); setUseAutoTarget(false); }}
                      disabled={useAutoTarget}
                      className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base disabled:opacity-70" placeholder="-" />
                    <span className="text-muted-foreground text-sm">kg</span>
                  </div>
                </div>
                {useAutoTarget ? (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 p-2 rounded-lg">
                    <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Auto-calculated safe pre-cut weight (5.5% dehydration buffer).</span>
                  </div>
                ) : safetyFeedback && (
                  <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                    targetSafetyLevel === "safe" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                    targetSafetyLevel === "moderate" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                    "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}>
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="font-medium">{safetyFeedback.message}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-sm font-medium">Target Date</Label>
              <Input type="date" value={formData.target_date} onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
                className="w-auto h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base text-right" />
            </div>
          </div>
        </div>

        {/* Section: Activity & Training */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Activity & Training</h2>
          <div className="card-surface rounded-xl border border-border overflow-hidden divide-y divide-border/30">
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity Level</Label>
              <ChipSelect value={formData.activity_level} columns={3}
                options={[
                  { value: "sedentary", label: "Sedentary" },
                  { value: "lightly_active", label: "Light" },
                  { value: "moderately_active", label: "Moderate" },
                  { value: "very_active", label: "Very Active" },
                  { value: "extra_active", label: "Extreme" },
                ]}
                onChange={(v) => setFormData(prev => ({ ...prev, activity_level: v }))} />
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-sm font-medium">Training Frequency</Label>
              <div className="flex items-center gap-1">
                <Input type="number" value={formData.training_frequency} onChange={(e) => setFormData(prev => ({ ...prev, training_frequency: e.target.value }))}
                  className="w-16 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base" placeholder="-" />
                <span className="text-muted-foreground text-sm">/wk</span>
              </div>
            </div>
            <div className="px-3 py-3 space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Food Budget</Label>
              <ChipSelect value={formData.food_budget}
                options={Object.entries(BUDGET_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, food_budget: v }))} />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2 pb-6">
          <Button onClick={handleSubmit} disabled={saving} className="w-full h-10 text-sm font-semibold rounded-xl shadow-md">
            {saving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Saving...</> : "Save Updates"}
          </Button>
        </div>
      </div>
    </div>
  );
}
