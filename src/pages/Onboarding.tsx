import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

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
  const navigate = useNavigate();
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

  useEffect(() => {
    // Check if user already has a profile
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              navigate("/dashboard");
            }
          });
      }
    });
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
    setLoading(true);
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

      toast({
        title: "Profile created!",
        description: "Your weight cut plan is ready.",
      });
      navigate("/dashboard");
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

  const progress = (step / 4) * 100;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-card p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-title">Set Up Your Weight Cut Plan</CardTitle>
          <CardDescription>Let's personalize your journey</CardDescription>
          <Progress value={progress} className="mt-4" />
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
                <div className="space-y-2">
                  <Label htmlFor="fight_week_target">
                    Fight Week Target (kg)
                    <span className="text-xs text-muted-foreground ml-2">Weight before dehydration cut</span>
                  </Label>
                  <Input
                    id="fight_week_target"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 77"
                    value={formData.fight_week_target_kg}
                    onChange={(e) => setFormData({ ...formData, fight_week_target_kg: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Usually 5-7kg above fight night weight (diet-down goal)
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
                  {loading ? "Creating..." : "Create Plan"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}