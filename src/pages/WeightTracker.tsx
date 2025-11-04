import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle } from "lucide-react";

interface WeightLog {
  id: string;
  date: string;
  weight_kg: number;
}

interface Profile {
  current_weight_kg: number;
  goal_weight_kg: number;
  target_date: string;
}

export default function WeightTracker() {
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    // Fetch weight logs
    const { data: logsData } = await supabase
      .from("weight_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true });

    if (logsData) {
      setWeightLogs(logsData);
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("weight_logs").insert({
      user_id: user.id,
      weight_kg: parseFloat(newWeight),
      date: newDate,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to log weight",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Weight logged",
        description: "Your weight has been recorded",
      });
      setNewWeight("");
      fetchData();
    }

    setLoading(false);
  };

  const getChartData = () => {
    if (!weightLogs.length || !profile) return [];

    const data = weightLogs.map((log) => ({
      date: format(new Date(log.date), "MMM dd"),
      weight: log.weight_kg,
      goal: profile.goal_weight_kg,
    }));

    return data;
  };

  const getCurrentWeight = () => {
    if (!weightLogs.length) return profile?.current_weight_kg || 0;
    return weightLogs[weightLogs.length - 1].weight_kg;
  };

  const getWeightProgress = () => {
    if (!profile) return 0;
    const current = getCurrentWeight();
    // Use the first weight log as starting weight, or profile weight if no logs exist
    const start = weightLogs.length > 0 ? weightLogs[0].weight_kg : profile.current_weight_kg;
    const goal = profile.goal_weight_kg;
    const total = start - goal;
    const progress = start - current;
    return Math.min(100, Math.max(0, (progress / total) * 100));
  };

  const getInsight = () => {
    if (!weightLogs.length || !profile) {
      return {
        message: "Start logging your weight to receive personalized insights.",
        icon: Target,
        color: "text-muted-foreground",
      };
    }

    const current = getCurrentWeight();
    const goal = profile.goal_weight_kg;
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weightRemaining = current - goal;

    // Calculate recent weight loss rate (last 7 days)
    const recentLogs = weightLogs.slice(-7);
    if (recentLogs.length >= 2) {
      const weekAgo = recentLogs[0].weight_kg;
      const weeklyLoss = weekAgo - current;
      const weeklyLossPercent = (weeklyLoss / current) * 100;

      if (weeklyLossPercent > 1.5) {
        return {
          message: "⚠️ Weight loss pace is too aggressive. Reduce deficit to maintain performance and safety.",
          icon: AlertTriangle,
          color: "text-danger",
        };
      }

      if (weeklyLoss > 1.0) {
        return {
          message: "Caution: Losing weight slightly fast. Monitor energy levels and adjust if needed.",
          icon: TrendingDown,
          color: "text-warning",
        };
      }

      if (weeklyLoss >= 0.5 && weeklyLoss <= 1.0) {
        return {
          message: "Excellent pace! You're losing weight safely within the optimal 0.5-1kg per week range.",
          icon: TrendingDown,
          color: "text-success",
        };
      }

      if (weeklyLoss > 0 && weeklyLoss < 0.5) {
        return {
          message: "Steady progress. Consider slight calorie reduction if deadline is approaching.",
          icon: TrendingDown,
          color: "text-primary",
        };
      }

      if (weeklyLoss <= 0) {
        return {
          message: "No weight loss detected. Review calorie intake and increase activity if possible.",
          icon: TrendingUp,
          color: "text-warning",
        };
      }
    }

    const requiredWeeklyLoss = weightRemaining / (daysRemaining / 7);
    if (requiredWeeklyLoss > 1.0) {
      return {
        message: "Target requires >1kg/week loss. Consider extending timeline for safety.",
        icon: AlertTriangle,
        color: "text-danger",
      };
    }

    return {
      message: "Stay consistent with your plan. Track daily for best results.",
      icon: Target,
      color: "text-primary",
    };
  };

  const insight = getInsight();
  const InsightIcon = insight.icon;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Weight Tracker</h1>
          <p className="text-muted-foreground mt-2">Monitor your weight cut progress and stay on target</p>
        </div>

        {/* Stats Overview */}
        {profile && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Current Weight</p>
                  <p className="text-3xl font-bold">{getCurrentWeight().toFixed(1)} kg</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Target Weight</p>
                  <p className="text-3xl font-bold">{profile.goal_weight_kg.toFixed(1)} kg</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Remaining</p>
                  <p className="text-3xl font-bold text-primary">
                    {(getCurrentWeight() - profile.goal_weight_kg).toFixed(1)} kg
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Deadline
                  </p>
                  <p className="text-xl font-semibold">{format(new Date(profile.target_date), "MMM dd, yyyy")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Progress Bar */}
        {profile && (
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-sm font-bold text-primary">{getWeightProgress().toFixed(0)}%</span>
                </div>
                <Progress value={getWeightProgress()} className="h-3" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Insights */}
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InsightIcon className={`h-5 w-5 ${insight.color}`} />
              Wizard Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`${insight.color} font-medium`}>{insight.message}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weight Input */}
          <Card className="border-border/50 lg:col-span-1">
            <CardHeader>
              <CardTitle>Log Weight</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddWeight} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    placeholder="75.5"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Logging..." : "Log Weight"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Weight Chart */}
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader>
              <CardTitle>Weight Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {getChartData().length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      domain={["dataMin - 2", "dataMax + 2"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <ReferenceLine
                      y={profile?.goal_weight_kg}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="5 5"
                      label={{ value: "Target", fill: "hsl(var(--primary))", fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--chart-1))", r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p>No weight data yet. Start logging to see your progress!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
