import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Droplets, TrendingDown, Calendar } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.png";
import { WeightProgressRing } from "@/components/dashboard/WeightProgressRing";
import { CalorieProgressRing } from "@/components/dashboard/CalorieProgressRing";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [todayCalories, setTodayCalories] = useState(0);
  const [todayHydration, setTodayHydration] = useState(0);
  const { userName } = useUser();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const { data: logsData } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true })
        .limit(30);

      // Fetch today's nutrition data
      const { data: nutritionData } = await supabase
        .from("nutrition_logs")
        .select("calories")
        .eq("user_id", user.id)
        .eq("date", today);

      // Fetch today's hydration data
      const { data: hydrationData } = await supabase
        .from("hydration_logs")
        .select("amount_ml")
        .eq("user_id", user.id)
        .eq("date", today);

      const totalCalories = nutritionData?.reduce((sum, log) => sum + log.calories, 0) || 0;
      const totalHydration = hydrationData?.reduce((sum, log) => sum + log.amount_ml, 0) || 0;

      setProfile(profileData);
      setWeightLogs(logsData || []);
      setTodayCalories(totalCalories);
      setTodayHydration(totalHydration);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const daysUntilTarget = profile ? Math.ceil((new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const weightToLose = profile ? (profile.current_weight_kg - profile.goal_weight_kg).toFixed(1) : 0;
  const dailyCalorieGoal = profile ? Math.round(profile.tdee - 500) : 0;

  // Generate dynamic wizard wisdom
  const getWizardWisdom = () => {
    const caloriePercentage = dailyCalorieGoal > 0 ? (todayCalories / dailyCalorieGoal) * 100 : 0;
    const hydrationGoal = 3000; // 3L in ml
    const hydrationPercentage = (todayHydration / hydrationGoal) * 100;

    if (caloriePercentage < 50 && hydrationPercentage < 50) {
      return "You're starting slow today! Make sure to fuel up and hydrate. Your body needs energy to perform at its best.";
    } else if (caloriePercentage > 110) {
      return "You've exceeded your calorie target today. Don't worry, consistency matters more than perfection! Get back on track tomorrow.";
    } else if (caloriePercentage < 80) {
      return "You're under your calorie target. Make sure you're eating enough to maintain your energy and support recovery.";
    } else if (hydrationPercentage < 50) {
      return "Great job with nutrition, but don't forget to hydrate! Water is crucial for performance and weight management.";
    } else if (caloriePercentage >= 90 && caloriePercentage <= 110 && hydrationPercentage >= 80) {
      return "Outstanding! You're hitting your targets perfectly. This is exactly the kind of consistency that leads to success!";
    } else {
      return "You're making excellent progress! Remember to stay hydrated and trust the process. Your body is adapting to this journey.";
    }
  };

  const convertWeight = (kg: number) => {
    return weightUnit === 'kg' ? kg : kg * 2.20462;
  };

  const chartData = weightLogs.map((log) => ({
    date: new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: convertWeight(parseFloat(log.weight_kg)),
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {userName || "Fighter"}!</h1>
          <p className="text-muted-foreground">Your weight cut journey dashboard</p>
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 p-4 border border-primary/20">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Wizard's Daily Wisdom</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {getWizardWisdom()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weight Progress Ring - Takes 1 column */}
        {profile && (
          <WeightProgressRing
            currentWeight={weightLogs.length > 0 ? parseFloat(weightLogs[weightLogs.length - 1].weight_kg) : profile.current_weight_kg}
            startingWeight={weightLogs.length > 0 ? parseFloat(weightLogs[0].weight_kg) : profile.current_weight_kg}
            goalWeight={profile.goal_weight_kg}
          />
        )}
        
        {/* Calorie Progress Ring - Takes 1 column */}
        <CalorieProgressRing
          consumed={todayCalories}
          target={dailyCalorieGoal}
        />
        
        {/* Stats Grid - Takes 1 column */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weight to Lose</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{weightToLose} kg</div>
              <p className="text-sm text-muted-foreground mt-1">Until goal weight</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Days Until Target</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{daysUntilTarget}</div>
              <p className="text-sm text-muted-foreground mt-1">days remaining</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Hydration</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{(todayHydration / 1000).toFixed(1)}L</div>
              <p className="text-sm text-muted-foreground mt-1">
                {todayHydration >= 3000 ? "Great job!" : `${((3000 - todayHydration) / 1000).toFixed(1)}L to go`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Weight History</CardTitle>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={weightUnit === 'kg' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setWeightUnit('kg')}
                className="h-7 text-xs"
              >
                kg
              </Button>
              <Button
                variant={weightUnit === 'lb' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setWeightUnit('lb')}
                className="h-7 text-xs"
              >
                lb
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  label={{ value: weightUnit, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                  formatter={(value: number) => [`${value.toFixed(1)} ${weightUnit}`, 'Weight']}
                />
                <Area
                  type="monotone"
                  dataKey="weight"
                  stroke="none"
                  fill="url(#weightGradient)"
                  animationDuration={1000}
                />
                <Line 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={1000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No weight data yet. Start logging your weight to see your progress!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}