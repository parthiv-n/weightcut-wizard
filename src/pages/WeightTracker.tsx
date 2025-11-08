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
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Apple, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import wizardLogo from "@/assets/wizard-logo.png";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

interface WeightLog {
  id: string;
  date: string;
  weight_kg: number;
}

interface Profile {
  current_weight_kg: number;
  goal_weight_kg: number;
  target_date: string;
  activity_level: string;
  age: number;
  sex: string;
  height_cm: number;
  tdee: number;
}

interface AIAnalysis {
  riskLevel: "green" | "yellow" | "red";
  requiredWeeklyLoss: number;
  recommendedCalories: number;
  calorieDeficit: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  riskExplanation: string;
  strategicGuidance: string;
  nutritionTips: string[];
  trainingConsiderations: string;
  timeline: string;
  weeklyPlan: {
    week1: string;
    week2: string;
    ongoing: string;
  };
}

export default function WeightTracker() {
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [analyzingWeight, setAnalyzingWeight] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<WeightLog | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (profile) {
      getAIAnalysis();
    }
  }, [profile]);

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

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    setLoading(true);
    const { error } = await supabase
      .from("weight_logs")
      .delete()
      .eq("id", logToDelete.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete weight log",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Weight log has been removed",
      });
      fetchData();
    }

    setLoading(false);
    setDeleteDialogOpen(false);
    setLogToDelete(null);
  };

  const initiateDelete = (log: WeightLog) => {
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const getAIAnalysis = async () => {
    if (!profile) return;

    setAnalyzingWeight(true);
    const currentWeight = getCurrentWeight();

    const { data, error } = await supabase.functions.invoke("weight-tracker-analysis", {
      body: {
        currentWeight,
        goalWeight: profile.goal_weight_kg,
        targetDate: profile.target_date,
        activityLevel: profile.activity_level,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.height_cm,
        tdee: profile.tdee
      }
    });

    if (error) {
      toast({ 
        title: "AI analysis unavailable", 
        description: error.message, 
        variant: "destructive" 
      });
    } else if (data?.analysis) {
      setAiAnalysis(data.analysis);
    }
    setAnalyzingWeight(false);
  };

  const getWeeklyLossRequired = () => {
    if (!profile) return 0;
    const current = getCurrentWeight();
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const weightRemaining = current - profile.goal_weight_kg;
    return weightRemaining / weeksRemaining;
  };

  const getChartData = () => {
    if (!weightLogs.length || !profile) return [];

    const data = weightLogs.map((log) => ({
      date: format(new Date(log.date), "MMM dd"),
      weight: log.weight_kg,
      goal: profile.goal_weight_kg,
      logId: log.id,
      fullDate: log.date,
    }));

    return data;
  };

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const payload = data.activePayload[0].payload;
      const log = weightLogs.find(l => l.id === payload.logId);
      if (log) {
        initiateDelete(log);
      }
    }
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

        {/* AI Analysis Loading State */}
        {analyzingWeight && (
          <Card className="border-2 border-primary/30 animate-pulse">
            <CardHeader>
              <div className="flex items-start gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-8 w-64" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <div className="text-center py-4">
                <Sparkles className="h-8 w-8 mx-auto text-primary animate-spin" />
                <p className="text-sm text-muted-foreground mt-2">Analyzing your weight loss strategy...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI-Powered Weight Loss Analysis */}
        {!analyzingWeight && aiAnalysis && (
          <Card className={`border-2 animate-fade-in ${
            aiAnalysis.riskLevel === 'green' ? 'border-green-500/50 bg-green-500/5' :
            aiAnalysis.riskLevel === 'yellow' ? 'border-yellow-500/50 bg-yellow-500/5' :
            'border-red-500/50 bg-red-500/5'
          }`}>
            <CardHeader>
              <div className="flex items-start gap-4">
                <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI Weight Loss Strategy
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-2xl font-bold uppercase ${
                      aiAnalysis.riskLevel === 'green' ? 'text-green-600 dark:text-green-400' :
                      aiAnalysis.riskLevel === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {aiAnalysis.riskLevel === 'green' ? 'SAFE PACE' : 
                       aiAnalysis.riskLevel === 'yellow' ? 'MODERATE PACE' : 'AGGRESSIVE PACE'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({aiAnalysis.requiredWeeklyLoss.toFixed(2)} kg/week required)
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Calorie & Macro Recommendations */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-background/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Apple className="h-4 w-4" />
                      Daily Calorie Target
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-3xl font-bold text-primary">
                        {aiAnalysis.recommendedCalories}
                      </span>
                      <span className="text-sm text-muted-foreground">kcal/day</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Deficit: {aiAnalysis.calorieDeficit} kcal/day
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-background/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Macronutrient Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protein:</span>
                      <span className="font-semibold">{aiAnalysis.proteinGrams}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Carbs:</span>
                      <span className="font-semibold">{aiAnalysis.carbsGrams}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fats:</span>
                      <span className="font-semibold">{aiAnalysis.fatsGrams}g</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Risk Explanation */}
              <Alert className={
                aiAnalysis.riskLevel === 'green' ? 'border-green-500/50' :
                aiAnalysis.riskLevel === 'yellow' ? 'border-yellow-500/50' :
                'border-red-500/50'
              }>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Risk Assessment:</strong> {aiAnalysis.riskExplanation}
                </AlertDescription>
              </Alert>

              {/* Strategic Guidance */}
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Strategic Guidance:</strong> {aiAnalysis.strategicGuidance}
                </AlertDescription>
              </Alert>

              {/* Nutrition Tips */}
              {aiAnalysis.nutritionTips.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Apple className="h-4 w-4" />
                    Nutrition Tips
                  </h4>
                  <ul className="space-y-1">
                    {aiAnalysis.nutritionTips.map((tip, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Training Considerations */}
              <Alert>
                <Activity className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Training Considerations:</strong> {aiAnalysis.trainingConsiderations}
                </AlertDescription>
              </Alert>

              {/* Timeline Assessment */}
              <Alert className="border-primary/50">
                <Calendar className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Timeline Assessment:</strong> {aiAnalysis.timeline}
                </AlertDescription>
              </Alert>

              {/* Weekly Plan */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Weekly Execution Plan</h4>
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="bg-background/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Week 1</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {aiAnalysis.weeklyPlan.week1}
                    </CardContent>
                  </Card>
                  <Card className="bg-background/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Week 2</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {aiAnalysis.weeklyPlan.week2}
                    </CardContent>
                  </Card>
                  <Card className="bg-background/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Ongoing</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {aiAnalysis.weeklyPlan.ongoing}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!aiAnalysis && profile && (
          <Card>
            <CardContent className="pt-6">
              <Button onClick={getAIAnalysis} disabled={loading} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                {loading ? "Analyzing..." : "Get AI Weight Loss Strategy"}
              </Button>
            </CardContent>
          </Card>
        )}

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
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getChartData()} onClick={handleChartClick}>
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
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                <p className="text-sm font-medium">{payload[0].payload.fullDate}</p>
                                <p className="text-lg font-bold text-primary">{payload[0].value}kg</p>
                                <p className="text-xs text-muted-foreground mt-1">Click to delete</p>
                              </div>
                            );
                          }
                          return null;
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
                        dot={{ fill: "hsl(var(--chart-1))", r: 5, cursor: "pointer" }}
                        activeDot={{ r: 8, cursor: "pointer" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  
                  {/* Weight Logs List */}
                  <div className="mt-6 space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Recent Entries</h4>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {weightLogs.slice().reverse().slice(0, 10).map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-sm">
                              <p className="font-medium">{format(new Date(log.date), "MMM dd, yyyy")}</p>
                              <p className="text-xs text-muted-foreground">{log.weight_kg}kg</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => initiateDelete(log)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p>No weight data yet. Start logging to see your progress!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteLog}
          title="Delete Weight Log"
          itemName={logToDelete ? `${logToDelete.weight_kg}kg on ${format(new Date(logToDelete.date), "MMM dd, yyyy")}` : undefined}
        />
      </div>
    </div>
  );
}
