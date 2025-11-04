import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Droplets, Target, TrendingDown, Calendar } from "lucide-react";

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        .single();

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
          <h1 className="text-3xl font-title font-bold">Welcome back, Fighter!</h1>
          <p className="text-muted-foreground">Your weight cut journey dashboard</p>
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 p-4 border border-primary/20">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/20 p-2">
            <span className="text-2xl">🧙‍♂️</span>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Calorie Goal</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailyCalorieGoal}</div>
            <p className="text-xs text-muted-foreground">kcal per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weight to Lose</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weightToLose} kg</div>
            <p className="text-xs text-muted-foreground">Until goal weight</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Until Target</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{daysUntilTarget}</div>
            <p className="text-xs text-muted-foreground">days remaining</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hydration Status</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">Good</div>
            <p className="text-xs text-muted-foreground">On track</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weight History</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-2))" }}
                />
              </LineChart>
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