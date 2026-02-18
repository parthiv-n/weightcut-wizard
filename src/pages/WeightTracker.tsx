import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Apple, Trash2, RefreshCw, Bug } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { weightLogSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WeightLog {
  id: string;
  date: string;
  weight_kg: number;
}

interface Profile {
  current_weight_kg: number;
  goal_weight_kg: number;
  fight_week_target_kg: number | null;
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
  const [aiAnalysisWeight, setAiAnalysisWeight] = useState<number | null>(null);
  const [aiAnalysisTarget, setAiAnalysisTarget] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<WeightLog | null>(null);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState<{
    requestPayload: any;
    rawResponse: any;
    parsedResponse: any;
    currentWeightSource: string;
    currentWeightValue: number | null;
    latestWeightLog: any;
    profileData: any;
  } | null>(null);
  const [unsafeGoalDialogOpen, setUnsafeGoalDialogOpen] = useState(false);
  const [pendingAICallParams, setPendingAICallParams] = useState<{
    currentWeight: number;
    fightWeekTarget: number;
    requestPayload: any;
  } | null>(null);
  const { toast } = useToast();
  const { updateCurrentWeight, userId } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const weightInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    loadPersistedAnalysis();
  }, []);

  const loadPersistedAnalysis = async () => {
    if (!userId) return;

    try {
      const storageKey = `weight_tracker_ai_analysis_${userId}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) return;

      const parsed = JSON.parse(stored);
      const { analysis, currentWeight, fightWeekTarget } = parsed;

      // Validate that the stored analysis is still valid
      // Get current weight and target
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: latestWeightLog } = await supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("current_weight_kg, fight_week_target_kg")
        .eq("id", user.id)
        .single();

      if (!profileData) return;

      const actualCurrentWeight = latestWeightLog?.weight_kg || profileData.current_weight_kg;
      const actualFightWeekTarget = profileData.fight_week_target_kg;

      // Only restore if weight and target match (analysis is still valid)
      if (
        actualCurrentWeight === currentWeight &&
        actualFightWeekTarget === fightWeekTarget &&
        analysis
      ) {
        setAiAnalysis(analysis);
        setAiAnalysisWeight(currentWeight);
        setAiAnalysisTarget(fightWeekTarget);
      } else {
        // Clear invalid stored analysis
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error("Error loading persisted analysis:", error);
    }
  };

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

    // Validate input
    const validationResult = weightLogSchema.safeParse({
      weight_kg: parseFloat(newWeight),
      date: newDate,
    });

    if (!validationResult.success) {
      toast({
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

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
      const loggedWeight = parseFloat(newWeight);

      // Update profile current weight
      await supabase
        .from("profiles")
        .update({ current_weight_kg: loggedWeight })
        .eq("id", user.id);

      // Update centralized current weight
      await updateCurrentWeight(loggedWeight);

      // Clear stored AI analysis since weight has changed
      if (userId) {
        const storageKey = `weight_tracker_ai_analysis_${userId}`;
        localStorage.removeItem(storageKey);
        setAiAnalysis(null);
        setAiAnalysisWeight(null);
        setAiAnalysisTarget(null);
      }

      toast({
        title: "Weight logged",
        description: "Your weight has been recorded",
      });
      setNewWeight("");
      fetchData();

      // Refresh AI analysis with new weight
      if (profile) {
        getAIAnalysis();
      }
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

    // Ensure fight_week_target_kg is set - this is the diet goal, not the final weigh-in goal
    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      toast({
        title: "Fight Week Target Required",
        description: "Please set your fight week target weight in Goals to get AI analysis.",
        variant: "destructive",
      });
      return;
    }

    setAnalyzingWeight(true);

    // Fetch fresh weight from database to ensure we have the latest
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAnalyzingWeight(false);
      return;
    }

    const { data: latestWeightLog } = await supabase
      .from("weight_logs")
      .select("weight_kg, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use latest weight log if available, otherwise use profile weight
    const currentWeight = latestWeightLog?.weight_kg || profile.current_weight_kg;
    const currentWeightSource = latestWeightLog?.weight_kg ? "weight_logs (latest log)" : "profile.current_weight_kg";

    // Check if goal is unrealistic (>1.5kg/week)
    if (isGoalUnrealistic(currentWeight, fightWeekTarget, profile.target_date)) {
      // Store parameters for later use
      const requestPayload = {
        currentWeight,
        goalWeight: fightWeekTarget,
        weighInDayWeight: profile.goal_weight_kg,
        targetDate: profile.target_date,
        activityLevel: profile.activity_level,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.height_cm,
        tdee: profile.tdee
      };

      setPendingAICallParams({
        currentWeight,
        fightWeekTarget,
        requestPayload
      });
      setUnsafeGoalDialogOpen(true);
      setAnalyzingWeight(false);
      return;
    }

    // Prepare request payload for debugging
    const requestPayload = {
      currentWeight,
      // Use fight_week_target_kg as the end goal for weight loss strategy (diet target before dehydration)
      goalWeight: fightWeekTarget,
      weighInDayWeight: profile.goal_weight_kg, // Day before fight day, final weigh-in goal (after dehydration)
      targetDate: profile.target_date,
      activityLevel: profile.activity_level,
      age: profile.age,
      sex: profile.sex,
      heightCm: profile.height_cm,
      tdee: profile.tdee,
      bypassSafety: false
    };

    const { data, error } = await supabase.functions.invoke("weight-tracker-analysis", {
      body: requestPayload
    });

    // Capture debug data
    const debugInfo = {
      requestPayload,
      rawResponse: data || error,
      parsedResponse: data?.analysis || null,
      currentWeightSource,
      currentWeightValue: currentWeight,
      latestWeightLog: latestWeightLog ? {
        weight_kg: latestWeightLog.weight_kg,
        date: latestWeightLog.date || "N/A"
      } : null,
      profileData: {
        current_weight_kg: profile.current_weight_kg,
        goal_weight_kg: profile.goal_weight_kg,
        fight_week_target_kg: profile.fight_week_target_kg,
        target_date: profile.target_date,
        activity_level: profile.activity_level,
        age: profile.age,
        sex: profile.sex,
        height_cm: profile.height_cm,
        tdee: profile.tdee
      }
    };
    setDebugData(debugInfo);

    if (error) {
      toast({
        title: "AI analysis unavailable",
        description: error.message,
        variant: "destructive"
      });
    } else if (data?.analysis) {
      setAiAnalysis(data.analysis);
      setAiAnalysisWeight(currentWeight);
      setAiAnalysisTarget(fightWeekTarget);

      // Store in localStorage for persistence
      if (userId) {
        const storageKey = `weight_tracker_ai_analysis_${userId}`;
        const storageData = {
          analysis: data.analysis,
          currentWeight,
          fightWeekTarget,
          timestamp: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(storageData));
      }
    }
    setAnalyzingWeight(false);
  };

  const handleUnsafeGoalConfirm = async () => {
    if (!pendingAICallParams) return;

    setUnsafeGoalDialogOpen(false);
    setAnalyzingWeight(true);

    const { currentWeight, fightWeekTarget, requestPayload } = pendingAICallParams;

    // Add bypassSafety flag to request
    const requestPayloadWithBypass = {
      ...requestPayload,
      bypassSafety: true
    };

    // Get user for saving recommendations
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.functions.invoke("weight-tracker-analysis", {
      body: requestPayloadWithBypass
    });

    if (error) {
      toast({
        title: "AI analysis unavailable",
        description: error.message,
        variant: "destructive"
      });
      setAnalyzingWeight(false);
    } else if (data?.analysis) {
      setAiAnalysis(data.analysis);
      setAiAnalysisWeight(currentWeight);
      setAiAnalysisTarget(fightWeekTarget);

      // Store in localStorage for persistence
      if (userId) {
        const storageKey = `weight_tracker_ai_analysis_${userId}`;
        const storageData = {
          analysis: data.analysis,
          currentWeight,
          fightWeekTarget,
          timestamp: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(storageData));
      }
    }

    setPendingAICallParams(null);
    setAnalyzingWeight(false);
  };

  const handleUnsafeGoalCancel = () => {
    setUnsafeGoalDialogOpen(false);
    setPendingAICallParams(null);
    toast({
      title: "Unsafe Goal",
      description: "Unsafe goals you will have to change weight and consider catch weight",
      variant: "destructive",
    });
  };

  const getWeeklyLossRequired = () => {
    if (!profile) return 0;
    const current = getCurrentWeight();
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    // Use fight_week_target_kg as the end goal (diet target before dehydration)
    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) return 0;
    const weightRemaining = current - fightWeekTarget;
    return weightRemaining / weeksRemaining;
  };

  const isGoalUnrealistic = (currentWeight: number, fightWeekTarget: number, targetDate: string): boolean => {
    const target = new Date(targetDate);
    const today = new Date();
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const weightRemaining = currentWeight - fightWeekTarget;
    const requiredWeeklyLoss = weightRemaining / weeksRemaining;
    return requiredWeeklyLoss > 1.5;
  };

  const getChartData = () => {
    if (!profile) return [];

    // Show both fight week target (diet goal) and weigh-in day weight (final weigh-in) on chart
    // Prioritize fight_week_target_kg as the primary diet goal
    const fightWeekTarget = profile.fight_week_target_kg || profile.goal_weight_kg;

    // If no weight logs, show onboarding weight as a starting point
    if (!weightLogs.length) {
      if (profile.current_weight_kg) {
        return [{
          date: "Start",
          weight: profile.current_weight_kg,
          fightWeekGoal: fightWeekTarget,
          fightNightGoal: profile.goal_weight_kg,
          logId: null,
          fullDate: "Onboarding weight",
        }];
      }
      return [];
    }

    const data = weightLogs.map((log) => ({
      date: format(new Date(log.date), "MMM dd"),
      weight: log.weight_kg,
      fightWeekGoal: fightWeekTarget,
      fightNightGoal: profile.goal_weight_kg,
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
    // Progress towards fight week target (diet goal before dehydration)
    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) return 0;
    const total = start - fightWeekTarget;
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
    // Use fight_week_target_kg as the end goal (diet target before dehydration)
    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      return {
        message: "Please set your fight week target weight in Goals to see insights.",
        icon: Target,
        color: "text-muted-foreground",
      };
    }
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weightRemaining = current - fightWeekTarget;

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

  return (
    <div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">
      {/* Header + Inline Log Form */}
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Weight</h1>
        <form onSubmit={handleAddWeight} className="flex gap-2 items-center">
          <Input
            ref={weightInputRef}
            type="number"
            step="0.1"
            placeholder="75.5 kg"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            required
            className="flex-1 h-10"
          />
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
            className="w-[130px] h-10"
          />
          <Button type="submit" disabled={loading} className="h-10 px-4 shrink-0">
            {loading ? "..." : "Log"}
          </Button>
        </form>
      </div>

      {/* Stats Overview */}
      {profile && (
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Current</p>
            <p className="display-number text-2xl">{getCurrentWeight().toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">kg</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Target</p>
            <p className="display-number text-2xl">{(profile.fight_week_target_kg || profile.goal_weight_kg).toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">kg</p>
          </div>
          <div className="glass-card p-4 text-center">
            {(() => {
              const current = getCurrentWeight();
              const target = profile.fight_week_target_kg || profile.goal_weight_kg;
              const diff = target - current;
              if (diff > 0) return (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">To Gain</p>
                  <p className="display-number text-2xl text-green-500">+{diff.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">kg</p>
                </>
              );
              if (diff < 0) return (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">To Lose</p>
                  <p className="display-number text-2xl text-primary">{Math.abs(diff).toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">kg</p>
                </>
              );
              return (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                  <p className="display-number text-2xl text-green-500">✓</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">At Target</p>
                </>
              );
            })()}
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Deadline</p>
            <p className="text-base font-semibold">{format(new Date(profile.target_date), "MMM dd")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(profile.target_date), "yyyy")}</p>
          </div>
        </div>
      )}

      {/* Progress + Insight */}
      {profile && (
        <div className="glass-card p-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progress to target</span>
            <span className="font-medium">{getWeightProgress().toFixed(0)}%</span>
          </div>
          <Progress value={getWeightProgress()} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{insight.message}</p>
        </div>
      )}

      {/* Chart + History */}
      <div className="glass-card p-4 space-y-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Progress Chart</p>
        {getChartData().length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={getChartData()} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={["dataMin - 2", "dataMax + 2"]}
                  width={36}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                          <p className="text-xs text-muted-foreground">{payload[0].payload.fullDate}</p>
                          <p className="text-lg font-bold text-primary">{payload[0].value}kg</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Tap to delete</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine
                  y={profile?.fight_week_target_kg || profile?.goal_weight_kg}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="5 5"
                  label={{ value: "Target", fill: "hsl(var(--primary))", fontSize: 10 }}
                />
                {profile?.fight_week_target_kg && (
                  <ReferenceLine
                    y={profile.goal_weight_kg}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="3 3"
                    label={{ value: "Fight Night", fill: "hsl(var(--destructive))", fontSize: 10 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ fill: "hsl(var(--primary))", r: 4, cursor: "pointer" }}
                  activeDot={{ r: 6, cursor: "pointer" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="border-t border-border/20 pt-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Recent Entries</p>
              <div className="max-h-44 overflow-y-auto">
                {weightLogs.slice().reverse().slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
                  >
                    <p className="text-sm">{format(new Date(log.date), "MMM dd, yyyy")}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary">{log.weight_kg} kg</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => initiateDelete(log)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Log your first weight to see progress
          </div>
        )}
      </div>

      {/* AI Analysis Loading */}
      {analyzingWeight && (
        <div className="glass-card p-5 flex flex-col items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary animate-spin" />
          <div className="space-y-2 w-full max-w-xs">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4 mx-auto" />
          </div>
          <p className="text-xs text-muted-foreground">Analyzing your weight loss strategy...</p>
        </div>
      )}

      {/* AI Analysis */}
      {!analyzingWeight && aiAnalysis && (() => {
        const isAtOrBelowTarget = aiAnalysisWeight !== null && aiAnalysisTarget !== null &&
          aiAnalysisWeight <= aiAnalysisTarget;
        const displayRiskLevel = isAtOrBelowTarget ? 'green' : aiAnalysis.riskLevel;
        const weightDiff = aiAnalysisWeight !== null && aiAnalysisTarget !== null
          ? aiAnalysisTarget - aiAnalysisWeight
          : 0;

        return (
          <div className="glass-card p-4 space-y-5 animate-fade-in">
            {/* Header row */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Strategy</p>
                <p className={`text-lg font-bold mt-0.5 ${displayRiskLevel === 'green' ? 'text-green-500' :
                    displayRiskLevel === 'yellow' ? 'text-yellow-500' :
                      'text-red-500'
                  }`}>
                  {displayRiskLevel === 'green' ? 'Safe Pace' :
                    displayRiskLevel === 'yellow' ? 'Moderate Pace' : 'Aggressive Pace'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isAtOrBelowTarget
                    ? 'At or below target — maintenance mode'
                    : `${aiAnalysis.requiredWeeklyLoss.toFixed(2)} kg/week required`
                  }
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={getAIAnalysis}
                disabled={analyzingWeight}
                className="h-8 w-8"
                title="Refresh analysis"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Now / Goal / Diff */}
            {aiAnalysisWeight !== null && aiAnalysisTarget !== null && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Now</p>
                  <p className="text-xl font-bold">{aiAnalysisWeight.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">kg</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Goal</p>
                  <p className="text-xl font-bold">{aiAnalysisTarget.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">kg</p>
                </div>
                <div>
                  {(() => {
                    if (weightDiff > 0) return (
                      <>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Gain</p>
                        <p className="text-xl font-bold text-green-500">+{weightDiff.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">kg</p>
                      </>
                    );
                    if (weightDiff < 0) return (
                      <>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Lose</p>
                        <p className="text-xl font-bold text-primary">{Math.abs(weightDiff).toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">kg</p>
                      </>
                    );
                    return (
                      <>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                        <p className="text-xl font-bold text-green-500">✓</p>
                        <p className="text-[10px] text-muted-foreground">At Target</p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Weekly Progress Bar */}
            {aiAnalysisWeight !== null && aiAnalysisTarget !== null && profile && aiAnalysis && (
              (() => {
                const currentWeight = aiAnalysisWeight;
                const targetWeight = aiAnalysisTarget;
                const weightDiff = targetWeight - currentWeight;
                const isAtOrBelowTarget = weightDiff >= 0;

                // Calculate weeks until target
                const targetDate = new Date(profile.target_date);
                const today = new Date();
                const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));

                // Calculate progress percentage
                let progressPercent = 0;
                if (!isAtOrBelowTarget && weightDiff < 0) {
                  // Weight loss: progress = (start - current) / (start - target) * 100
                  const startWeight = currentWeight;
                  const totalToLose = startWeight - targetWeight;
                  const lostSoFar = 0; // Currently at start
                  progressPercent = Math.min(100, Math.max(0, (lostSoFar / totalToLose) * 100));
                } else if (isAtOrBelowTarget && weightDiff > 0) {
                  // Weight gain: progress = (current - start) / (target - start) * 100
                  const startWeight = currentWeight;
                  const totalToGain = targetWeight - startWeight;
                  const gainedSoFar = 0; // Currently at start
                  progressPercent = Math.min(100, Math.max(0, (gainedSoFar / totalToGain) * 100));
                } else {
                  // At target
                  progressPercent = 100;
                }

                // Calculate weekly milestones for markers
                const milestones: Array<{ week: number; expectedWeight: number; position: number }> = [];

                if (!isAtOrBelowTarget && aiAnalysis.requiredWeeklyLoss > 0) {
                  // Weight loss mode
                  const startWeight = currentWeight;
                  const totalToLose = startWeight - targetWeight;
                  for (let week = 1; week <= Math.min(weeksRemaining, 8); week++) {
                    const expectedWeight = Math.max(
                      targetWeight,
                      currentWeight - (week * aiAnalysis.requiredWeeklyLoss)
                    );
                    const weightLost = startWeight - expectedWeight;
                    const position = Math.min(100, Math.max(0, (weightLost / totalToLose) * 100));
                    milestones.push({ week, expectedWeight, position });
                  }
                } else if (isAtOrBelowTarget && weightDiff > 0) {
                  // Weight gain mode
                  const startWeight = currentWeight;
                  const totalToGain = targetWeight - startWeight;
                  const weeklyGain = Math.abs(aiAnalysis.requiredWeeklyLoss) || 0.2;
                  for (let week = 1; week <= Math.min(weeksRemaining, 8); week++) {
                    const expectedWeight = Math.min(
                      targetWeight,
                      currentWeight + (week * weeklyGain)
                    );
                    const weightGained = expectedWeight - startWeight;
                    const position = Math.min(100, Math.max(0, (weightGained / totalToGain) * 100));
                    milestones.push({ week, expectedWeight, position });
                  }
                }

                return (
                  <div className="py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {currentWeight.toFixed(1)} kg
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {weeksRemaining} {weeksRemaining === 1 ? 'week' : 'weeks'} remaining
                      </span>
                      <span className="text-[10px] font-semibold text-primary">
                        {targetWeight.toFixed(1)} kg
                      </span>
                    </div>
                    <div className="relative">
                      {/* Weight labels above milestones */}
                      <div className="relative h-4 mb-1">
                        {milestones.map(({ week, expectedWeight, position }) => (
                          <div
                            key={`label-${week}`}
                            className="absolute -translate-x-1/2"
                            style={{ left: `${position}%` }}
                          >
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                              {expectedWeight.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Progress bar */}
                      <div className="relative h-3 bg-muted rounded-full overflow-visible">
                        {/* Progress fill */}
                        <div
                          className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                        {/* Milestone markers */}
                        {milestones.map(({ week, expectedWeight, position }) => (
                          <div
                            key={week}
                            className="absolute top-0 bottom-0 w-0.5 bg-foreground/30"
                            style={{ left: `${position}%` }}
                            title={`Week ${week}: ${expectedWeight.toFixed(1)} kg`}
                          />
                        ))}
                        {/* Current position indicator */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full border-2 border-background shadow-sm z-10"
                          style={{ left: `${progressPercent}%`, marginLeft: '-4px' }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Calories + Macros */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Calories</p>
                <p className="text-xl font-bold text-primary">{aiAnalysis.recommendedCalories}</p>
                <p className="text-[10px] text-muted-foreground">kcal/day</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">−{aiAnalysis.calorieDeficit} deficit</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Protein</p>
                <p className="text-xl font-bold">{aiAnalysis.proteinGrams}</p>
                <p className="text-[10px] text-muted-foreground">g</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Carbs</p>
                <p className="text-xl font-bold">{aiAnalysis.carbsGrams}</p>
                <p className="text-[10px] text-muted-foreground">g</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Fats</p>
                <p className="text-xl font-bold">{aiAnalysis.fatsGrams}</p>
                <p className="text-[10px] text-muted-foreground">g</p>
              </div>
            </div>

            {/* Guidance rows */}
            <div className="space-y-3 border-t border-border/20 pt-4">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Risk: </span>{aiAnalysis.riskExplanation}
                </p>
              </div>
              <div className="flex gap-2 items-start">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Strategy: </span>{aiAnalysis.strategicGuidance}
                </p>
              </div>
              {aiAnalysis.nutritionTips.length > 0 && (
                <div className="flex gap-2 items-start">
                  <Apple className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Nutrition: </span>
                    {aiAnalysis.nutritionTips.join(' · ')}
                  </div>
                </div>
              )}
              <div className="flex gap-2 items-start">
                <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Training: </span>{aiAnalysis.trainingConsiderations}
                </p>
              </div>
              <div className="flex gap-2 items-start">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Timeline: </span>{aiAnalysis.timeline}
                </p>
              </div>
            </div>

            {/* Weekly Plan */}
            <div className="border-t border-border/20 pt-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Weekly Plan</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Week 1</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.weeklyPlan.week1}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Week 2</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.weeklyPlan.week2}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Ongoing</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.weeklyPlan.ongoing}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Get AI Button */}
      {!aiAnalysis && profile && (
        <Button onClick={getAIAnalysis} disabled={analyzingWeight} variant="outline" className="w-full">
          <Sparkles className="h-4 w-4 mr-2" />
          {analyzingWeight ? "Analyzing..." : "Get AI Weight Loss Strategy"}
        </Button>
      )}

      {/* Debug Button */}
      {debugData && (
        <Button
          onClick={() => setDebugDialogOpen(true)}
          variant="ghost"
          size="sm"
          className="w-full opacity-50 text-xs"
        >
          <Bug className="h-3 w-3 mr-1" />
          Debug AI Request/Response
        </Button>
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteLog}
        title="Delete Weight Log"
        itemName={logToDelete ? `${logToDelete.weight_kg}kg on ${format(new Date(logToDelete.date), "MMM dd, yyyy")}` : undefined}
      />

      <AlertDialog open={unsafeGoalDialogOpen} onOpenChange={setUnsafeGoalDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unrealistic Weight Loss Goal</AlertDialogTitle>
            <AlertDialogDescription>
              This goal requires losing more than 1.5kg per week, which is considered unsafe and can cause severe performance degradation and health risks. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleUnsafeGoalCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnsafeGoalConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Weight Loss Strategy - Debug Info</DialogTitle>
            <DialogDescription>
              Debug information for the AI weight loss strategy request and response
            </DialogDescription>
          </DialogHeader>
          {debugData && (
            <div className="space-y-6 mt-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Current Weight Information</h3>
                <div className="bg-muted p-3 rounded-md text-sm font-mono">
                  <div><strong>Source:</strong> {debugData.currentWeightSource}</div>
                  <div><strong>Value Used:</strong> {debugData.currentWeightValue} kg</div>
                  {debugData.latestWeightLog && (
                    <div className="mt-2">
                      <strong>Latest Weight Log:</strong>
                      <div className="ml-4">
                        Weight: {debugData.latestWeightLog.weight_kg} kg
                        {debugData.latestWeightLog.date && (
                          <div>Date: {debugData.latestWeightLog.date}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {!debugData.latestWeightLog && (
                    <div className="mt-2 text-muted-foreground">No weight log found, using profile weight</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Profile Data</h3>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                  {JSON.stringify(debugData.profileData, null, 2)}
                </pre>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Request Payload (Sent to API)</h3>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                  {JSON.stringify(debugData.requestPayload, null, 2)}
                </pre>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Raw API Response</h3>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono max-h-96 overflow-y-auto">
                  {JSON.stringify(debugData.rawResponse, null, 2)}
                </pre>
              </div>
              {debugData.parsedResponse && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Parsed Response (Analysis)</h3>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono max-h-96 overflow-y-auto">
                    {JSON.stringify(debugData.parsedResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
