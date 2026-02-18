import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { profileSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentWeight } = useUser();

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
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error loading profile:", error);
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive",
        });
        return;
      }

      if (profile) {
        // Use centralized currentWeight if available, otherwise use profile weight
        const currentWeightValue = currentWeight ?? profile.current_weight_kg ?? 0;
        setFormData({
          age: profile.age?.toString() || "",
          sex: profile.sex || "",
          height_cm: profile.height_cm?.toString() || "",
          current_weight_kg: currentWeightValue.toString(),
          goal_weight_kg: profile.goal_weight_kg?.toString() || "",
          fight_week_target_kg: profile.fight_week_target_kg?.toString() || "",
          target_date: profile.target_date || "",
          activity_level: profile.activity_level || "",
          training_frequency: profile.training_frequency?.toString() || "",
        });

        // Check if fight week target matches AI calculation
        if (profile.goal_weight_kg && profile.fight_week_target_kg) {
          const recommended = calculateRecommendedTarget(profile.goal_weight_kg);
          const isAutoCalculated = Math.abs(profile.fight_week_target_kg - recommended) < 0.1;
          setUseAutoTarget(isAutoCalculated);
        }
      }
    } catch (error) {
      console.error("Unexpected error loading profile:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const calculateRecommendedTarget = (fightNightWeight: number) => {
    const safeDehydrationPercentage = 0.055;
    const recommendedTarget = fightNightWeight * (1 + safeDehydrationPercentage);
    return Math.round(recommendedTarget * 10) / 10;
  };

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

  useEffect(() => {
    if (useAutoTarget && formData.goal_weight_kg) {
      const recommended = calculateRecommendedTarget(parseFloat(formData.goal_weight_kg));
      setFormData(prev => ({ ...prev, fight_week_target_kg: recommended.toString() }));
      setTargetSafetyLevel("safe");
    }
  }, [formData.goal_weight_kg, useAutoTarget]);

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

  const handleSubmit = async () => {
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

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const bmr = calculateBMR();
      const tdee = bmr * ACTIVITY_MULTIPLIERS[formData.activity_level as keyof typeof ACTIVITY_MULTIPLIERS];

      const { error } = await supabase.from("profiles").update({
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
      }).eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Goals updated!",
        description: "Your profile has been updated successfully.",
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24 md:pb-10">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="px-4 py-6 md:py-8">
          <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
          <p className="text-muted-foreground mt-1 text-sm">Update your profile and targets</p>
        </div>

        <div className="space-y-6 px-4">
          {/* Section: Personal Details */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Personal Details</h2>
            <div className="bg-background rounded-xl border shadow-sm overflow-hidden divide-y">
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="age" className="text-base font-medium">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base"
                  placeholder="-"
                />
              </div>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="sex" className="text-base font-medium">Sex</Label>
                <Select value={formData.sex} onValueChange={(value) => setFormData({ ...formData, sex: value })}>
                  <SelectTrigger className="w-28 h-8 border-transparent focus:ring-0 shadow-none justify-end gap-2 p-0 text-base">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="height" className="text-base font-medium">Height</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="height"
                    type="number"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                    className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base"
                    placeholder="-"
                  />
                  <span className="text-muted-foreground text-sm">cm</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="current_weight" className="text-base font-medium">Current Weight</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="current_weight"
                    type="number"
                    step="0.1"
                    value={formData.current_weight_kg}
                    onChange={(e) => setFormData({ ...formData, current_weight_kg: e.target.value })}
                    className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base"
                    placeholder="-"
                  />
                  <span className="text-muted-foreground text-sm">kg</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Targets */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Targets</h2>
            <div className="bg-background rounded-xl border shadow-sm overflow-hidden divide-y">
              {/* Weigh-in Goal */}
              <div className="p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="goal_weight" className="text-base font-medium">Weigh In Goal</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="goal_weight"
                      type="number"
                      step="0.1"
                      value={formData.goal_weight_kg}
                      onChange={(e) => setFormData({ ...formData, goal_weight_kg: e.target.value })}
                      className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base font-semibold text-primary"
                      placeholder="-"
                    />
                    <span className="text-muted-foreground text-sm">kg</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">This is your final competition weight class (day before fight).</p>
              </div>

              {/* Fight Week Target */}
              <div className="p-3 sm:p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fight_week_target" className="text-base font-medium">Diet Target</Label>
                    <button
                      type="button"
                      onClick={() => setUseAutoTarget(!useAutoTarget)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${useAutoTarget ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border"}`}
                    >
                      {useAutoTarget ? "AI AUTO" : "MANUAL"}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      id="fight_week_target"
                      type="number"
                      step="0.1"
                      value={formData.fight_week_target_kg}
                      onChange={(e) => {
                        setFormData({ ...formData, fight_week_target_kg: e.target.value });
                        setUseAutoTarget(false);
                      }}
                      disabled={useAutoTarget}
                      className="w-20 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base disabled:opacity-70"
                      placeholder="-"
                    />
                    <span className="text-muted-foreground text-sm">kg</span>
                  </div>
                </div>

                {useAutoTarget ? (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 p-2 rounded-lg">
                    <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>AI computed safe pre-cut weight (5.5% dehydration buffer).</span>
                  </div>
                ) : (
                  getSafetyFeedback() && (
                    <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${targetSafetyLevel === "safe" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                        targetSafetyLevel === "moderate" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                          "bg-red-500/10 text-red-700 dark:text-red-400"
                      }`}>
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{getSafetyFeedback()?.message}</span>
                        {formData.goal_weight_kg && formData.fight_week_target_kg && (
                          <div className="mt-0.5 opacity-80">
                            Cut: {(parseFloat(formData.fight_week_target_kg) - parseFloat(formData.goal_weight_kg)).toFixed(1)}kg
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Date */}
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="target_date" className="text-base font-medium">Target Date</Label>
                <Input
                  id="target_date"
                  type="date"
                  value={formData.target_date}
                  onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  className="w-auto h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base text-right"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section: Activity */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Activity</h2>
            <div className="bg-background rounded-xl border shadow-sm overflow-hidden divide-y">
              <div className="p-3 sm:p-4 flex flex-col gap-2">
                <Label htmlFor="activity_level" className="text-base font-medium">Activity Level</Label>
                <Select value={formData.activity_level} onValueChange={(value) => setFormData({ ...formData, activity_level: value })}>
                  <SelectTrigger className="w-full h-10 border-input bg-muted/20">
                    <SelectValue placeholder="Select activity level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="lightly_active">Lightly Active</SelectItem>
                    <SelectItem value="moderately_active">Moderately Active</SelectItem>
                    <SelectItem value="very_active">Very Active</SelectItem>
                    <SelectItem value="extra_active">Extra Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <Label htmlFor="training_frequency" className="text-base font-medium">Training Frequency</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="training_frequency"
                    type="number"
                    value={formData.training_frequency}
                    onChange={(e) => setFormData({ ...formData, training_frequency: e.target.value })}
                    className="w-16 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-base"
                    placeholder="-"
                  />
                  <span className="text-muted-foreground text-sm">/wk</span>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-4 pb-8">
            <Button onClick={handleSubmit} disabled={saving} className="w-full h-12 text-lg font-semibold rounded-xl shadow-md">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Updates"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
