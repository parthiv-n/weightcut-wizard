import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Droplets, Target, TrendingDown, Calendar } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.png";
import { WeightProgressRing } from "@/components/dashboard/WeightProgressRing";
import { useUser } from "@/contexts/UserContext";

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { userName } = useUser();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

      setProfile(profileData);
      setWeightLogs(logsData || []);
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

  const chartData = weightLogs.map((log) => ({
    date: new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: parseFloat(log.weight_kg),
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
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/20 p-2">
            <img src={wizardLogo} alt="Wizard" className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Wizard's Daily Wisdom</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You're making excellent progress! Remember to stay hydrated and trust the process. 
              Your body is adapting to this journey.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weight Progress Ring - Takes 1 column */}
        {profile && (
          <WeightProgressRing
            currentWeight={weightLogs.length > 0 ? parseFloat(weightLogs[weightLogs.length - 1].weight_kg) : profile.current_weight_kg}
            startingWeight={profile.current_weight_kg}
            goalWeight={profile.goal_weight_kg}
          />
        )}
        
        {/* Stats Grid - Takes 2 columns */}
        <div className="lg:col-span-2 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Calorie Goal</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{dailyCalorieGoal}</div>
              <p className="text-sm text-muted-foreground mt-1">kcal per day</p>
            </CardContent>
          </Card>

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
              <CardTitle className="text-sm font-medium">Hydration Status</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-success">Good</div>
              <p className="text-sm text-muted-foreground mt-1">On track</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weight History</CardTitle>
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
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
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