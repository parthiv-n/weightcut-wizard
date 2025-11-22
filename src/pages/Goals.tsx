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

      if (error) throw error;

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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
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
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Edit Your Goals</h1>
        <p className="text-muted-foreground">Update your profile settings and weight targets</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Basic details used for calculations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weight Targets</CardTitle>
            <CardDescription>Set your fight night and fight week goals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <Alert className={`${
                    targetSafetyLevel === "safe" ? "border-green-500/50 bg-green-500/5" :
                    targetSafetyLevel === "moderate" ? "border-yellow-500/50 bg-yellow-500/5" :
                    "border-red-500/50 bg-red-500/5"
                  }`}>
                    {targetSafetyLevel === "safe" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className={`h-4 w-4 ${
                        targetSafetyLevel === "moderate" ? "text-yellow-500" : "text-red-500"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Level</CardTitle>
            <CardDescription>Your typical training and activity schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
