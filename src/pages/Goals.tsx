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
    <div className={`grid gap-1 ${columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : columns === 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
      {options.map(opt => (
        <button key={opt.value} type="button"
          onClick={() => { triggerHapticSelection(); onChange(opt.value); }}
          className={`h-7 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.97] ${
            value === opt.value
              ? "bg-primary/15 text-foreground shadow-sm"
              : "bg-muted/30 text-muted-foreground active:bg-muted/50"
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
    <div className="animate-page-in space-y-2 p-3 sm:p-4 max-w-7xl mx-auto pb-16 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground text-[13px]">Profile & targets</p>
      </div>

      {!contextProfile?.goal_weight_kg && (
        <div className="rounded-lg bg-muted/20 p-2.5 flex items-start gap-2">
          <Target className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[13px] text-muted-foreground leading-snug">
            Fill in your details so the Wizard can calculate targets and guide your cut.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {/* Section: Athlete Profile */}
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 ml-0.5">Athlete Profile</h2>
          <div className="rounded-lg bg-muted/10 overflow-hidden divide-y divide-border/20">
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sport</Label>
              <ChipSelect value={formData.athlete_type} columns={4}
                options={Object.entries(ATHLETE_TYPES).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, athlete_type: v }))} />
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Goal</Label>
              <ChipSelect value={formData.goal_type} columns={4}
                options={[
                  { value: "cutting", label: "Cut" },
                  { value: "losing", label: "Lose" },
                  { value: "maintaining", label: "Maintain" },
                  { value: "gaining", label: "Gain" },
                ]}
                onChange={(v) => setFormData(prev => ({ ...prev, goal_type: v }))} />
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Experience</Label>
              <ChipSelect value={formData.experience_level}
                options={Object.entries(EXPERIENCE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, experience_level: v }))} />
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plan Style</Label>
              <ChipSelect value={formData.plan_aggressiveness}
                options={Object.entries(AGGRESSIVENESS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, plan_aggressiveness: v }))} />
            </div>
          </div>
        </div>

        {/* Section: Personal Details */}
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 ml-0.5">Personal Details</h2>
          <div className="rounded-lg bg-muted/10 overflow-hidden divide-y divide-border/20">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">Age</Label>
              <Input type="number" value={formData.age} onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px]" placeholder="-" />
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</Label>
              <ChipSelect value={formData.sex} columns={2}
                options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                onChange={(v) => setFormData(prev => ({ ...prev, sex: v }))} />
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">Height</Label>
              <div className="flex items-center gap-0.5">
                <Input type="number" value={formData.height_cm} onChange={(e) => setFormData(prev => ({ ...prev, height_cm: e.target.value }))}
                  className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px]" placeholder="-" />
                <span className="text-muted-foreground text-[13px]">cm</span>
              </div>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">Weight</Label>
              <div className="flex items-center gap-0.5">
                <Input type="number" step="0.1" value={formData.current_weight_kg} onChange={(e) => setFormData(prev => ({ ...prev, current_weight_kg: e.target.value }))}
                  className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px]" placeholder="-" />
                <span className="text-muted-foreground text-[13px]">kg</span>
              </div>
            </div>
            {formData.body_fat_pct !== undefined && (
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <Label className="text-[13px] font-medium">Body Fat</Label>
                <div className="flex items-center gap-0.5">
                  <Input type="number" step="0.1" value={formData.body_fat_pct} onChange={(e) => setFormData(prev => ({ ...prev, body_fat_pct: e.target.value }))}
                    className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px]" placeholder="-" />
                  <span className="text-muted-foreground text-[13px]">%</span>
                </div>
              </div>
            )}
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sleep</Label>
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
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 ml-0.5">Targets</h2>
          <div className="rounded-lg bg-muted/10 overflow-hidden divide-y divide-border/20">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">{isFighter ? 'Weight Class' : 'Goal Weight'}</Label>
              <div className="flex items-center gap-0.5">
                <Input type="number" step="0.1" value={formData.goal_weight_kg} onChange={(e) => setFormData(prev => ({ ...prev, goal_weight_kg: e.target.value }))}
                  className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px] font-semibold text-primary" placeholder="-" />
                <span className="text-muted-foreground text-[13px]">kg</span>
              </div>
            </div>

            {isFighter && (
              <div className="px-2.5 py-1.5 space-y-1.5 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[13px] font-medium">Diet Target</Label>
                    <button type="button" onClick={() => setUseAutoTarget(!useAutoTarget)}
                      className={`text-[8px] px-1.5 py-0.5 rounded-full transition-colors ${useAutoTarget ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}>
                      {useAutoTarget ? "AUTO" : "MANUAL"}
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Input type="number" step="0.1" value={formData.fight_week_target_kg}
                      onChange={(e) => { setFormData(prev => ({ ...prev, fight_week_target_kg: e.target.value })); setUseAutoTarget(false); }}
                      disabled={useAutoTarget}
                      className="w-16 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px] disabled:opacity-60" placeholder="-" />
                    <span className="text-muted-foreground text-[13px]">kg</span>
                  </div>
                </div>
                {useAutoTarget ? (
                  <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-primary shrink-0" />
                    <span>Safe pre-cut weight (5.5% buffer)</span>
                  </div>
                ) : safetyFeedback && (
                  <div className={`flex items-center gap-1.5 text-[13px] font-medium ${
                    targetSafetyLevel === "safe" ? "text-green-500" :
                    targetSafetyLevel === "moderate" ? "text-yellow-500" :
                    "text-red-500"
                  }`}>
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>{safetyFeedback.message}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">Target Date</Label>
              <Input type="date" value={formData.target_date} onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
                className="w-auto h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px] text-right" />
            </div>
          </div>
        </div>

        {/* Section: Activity & Training */}
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 ml-0.5">Activity & Training</h2>
          <div className="rounded-lg bg-muted/10 overflow-hidden divide-y divide-border/20">
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Activity Level</Label>
              <ChipSelect value={formData.activity_level} columns={3}
                options={[
                  { value: "sedentary", label: "Sedentary" },
                  { value: "lightly_active", label: "Light" },
                  { value: "moderately_active", label: "Moderate" },
                  { value: "very_active", label: "Active" },
                  { value: "extra_active", label: "Extreme" },
                ]}
                onChange={(v) => setFormData(prev => ({ ...prev, activity_level: v }))} />
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <Label className="text-[13px] font-medium">Training</Label>
              <div className="flex items-center gap-0.5">
                <Input type="number" value={formData.training_frequency} onChange={(e) => setFormData(prev => ({ ...prev, training_frequency: e.target.value }))}
                  className="w-12 text-right h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[13px]" placeholder="-" />
                <span className="text-muted-foreground text-[13px]">/wk</span>
              </div>
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Food Budget</Label>
              <ChipSelect value={formData.food_budget}
                options={Object.entries(BUDGET_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                onChange={(v) => setFormData(prev => ({ ...prev, food_budget: v }))} />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="pt-1 pb-4">
          <button onClick={handleSubmit} disabled={saving}
            className="w-full py-2.5 text-[13px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 disabled:opacity-40">
            {saving ? "Saving..." : "Save Updates"}
          </button>
        </div>
      </div>
    </div>
  );
}
