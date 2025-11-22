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
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Apple, Trash2, RefreshCw, Bug } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import wizardLogo from "@/assets/wizard-logo.png";
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
      
      // Save AI recommendations to profiles table for Nutrition page
      if (user) {
        await supabase
          .from("profiles")
          .update({
            ai_recommended_calories: data.analysis.recommendedCalories,
            ai_recommended_protein_g: data.analysis.proteinGrams,
            ai_recommended_carbs_g: data.analysis.carbsGrams,
            ai_recommended_fats_g: data.analysis.fatsGrams,
            ai_recommendations_updated_at: new Date().toISOString()
          })
          .eq("id", user.id);
      }
      
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
      
      // Save AI recommendations to profiles table for Nutrition page
      if (user) {
        await supabase
          .from("profiles")
          .update({
            ai_recommended_calories: data.analysis.recommendedCalories,
            ai_recommended_protein_g: data.analysis.proteinGrams,
            ai_recommended_carbs_g: data.analysis.carbsGrams,
            ai_recommended_fats_g: data.analysis.fatsGrams,
            ai_recommendations_updated_at: new Date().toISOString()
          })
          .eq("id", user.id);
      }
      
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
    if (!weightLogs.length || !profile) return [];

    // Show both fight week target (diet goal) and weigh-in day weight (final weigh-in) on chart
    // Prioritize fight_week_target_kg as the primary diet goal
    const fightWeekTarget = profile.fight_week_target_kg || profile.goal_weight_kg;
    
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
          <div className="flex flex-wrap gap-2 md:gap-4">
            <Card className="border-border/50 flex-1 min-w-[140px]">
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">Current Weight</p>
                  <p className="text-lg md:text-xl font-bold">{getCurrentWeight().toFixed(1)} kg</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 flex-1 min-w-[140px]">
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">Fight Week Target</p>
                  <p className="text-lg md:text-xl font-bold">{(profile.fight_week_target_kg || profile.goal_weight_kg).toFixed(1)} kg</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 flex-1 min-w-[140px]">
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  {(() => {
                    const current = getCurrentWeight();
                    const target = profile.fight_week_target_kg || profile.goal_weight_kg;
                    const weightDiff = target - current;
                    const isAtOrBelowTarget = weightDiff >= 0;
                    
                    if (weightDiff > 0) {
                      return (
                        <>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">To Gain</p>
                          <p className="text-lg md:text-xl font-bold text-green-600 dark:text-green-400">
                            +{weightDiff.toFixed(1)} kg
                          </p>
                        </>
                      );
                    } else if (weightDiff < 0) {
                      return (
                        <>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">To Lose</p>
                          <p className="text-lg md:text-xl font-bold text-primary">
                            {Math.abs(weightDiff).toFixed(1)} kg
                          </p>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">Status</p>
                          <p className="text-lg md:text-xl font-bold text-green-600 dark:text-green-400">
                            At Target
                          </p>
                        </>
                      );
                    }
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 flex-1 min-w-[140px]">
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-xs md:text-sm font-medium text-muted-foreground flex items-center justify-center gap-1 mb-1">
                    <Calendar className="h-3 w-3" />
                    Deadline
                  </p>
                  <p className="text-sm md:text-base font-semibold">{format(new Date(profile.target_date), "MMM dd, yyyy")}</p>
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
        {!analyzingWeight && aiAnalysis && (() => {
          // Force green risk level when current weight is at or below target
          const isAtOrBelowTarget = aiAnalysisWeight !== null && aiAnalysisTarget !== null && 
                                   aiAnalysisWeight <= aiAnalysisTarget;
          const displayRiskLevel = isAtOrBelowTarget ? 'green' : aiAnalysis.riskLevel;
          const weightDiff = aiAnalysisWeight !== null && aiAnalysisTarget !== null 
                           ? aiAnalysisTarget - aiAnalysisWeight 
                           : 0;
          
          return (
            <Card className={`border-2 animate-fade-in ${
              displayRiskLevel === 'green' ? 'border-green-500/50 bg-green-500/5' :
              displayRiskLevel === 'yellow' ? 'border-yellow-500/50 bg-yellow-500/5' :
              'border-red-500/50 bg-red-500/5'
            }`}>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        AI Weight Loss Strategy
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={getAIAnalysis}
                        disabled={analyzingWeight}
                        className="h-8 w-8"
                        title="Refresh AI Analysis"
                      >
                        <RefreshCw className={`h-4 w-4 ${analyzingWeight ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-2xl font-bold uppercase ${
                        displayRiskLevel === 'green' ? 'text-green-600 dark:text-green-400' :
                        displayRiskLevel === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {displayRiskLevel === 'green' ? 'SAFE PACE' : 
                         displayRiskLevel === 'yellow' ? 'MODERATE PACE' : 'AGGRESSIVE PACE'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {isAtOrBelowTarget && weightDiff > 0 
                          ? '(Maintenance mode - at/below target)'
                          : isAtOrBelowTarget && weightDiff === 0
                          ? '(At target - maintenance)'
                          : `(${aiAnalysis.requiredWeeklyLoss.toFixed(2)} kg/week required)`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Weight and Goal Summary */}
              {aiAnalysisWeight !== null && aiAnalysisTarget !== null && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border/50">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Current Weight</p>
                      <p className="text-lg font-bold">{aiAnalysisWeight.toFixed(1)} kg</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">End Goal</p>
                      <p className="text-lg font-bold">{aiAnalysisTarget.toFixed(1)} kg</p>
                    </div>
                    <div>
                      {(() => {
                        const weightDiff = aiAnalysisTarget - aiAnalysisWeight;
                        const isAtOrBelowTarget = weightDiff >= 0;
                        
                        if (weightDiff > 0) {
                          return (
                            <>
                              <p className="text-xs text-muted-foreground mb-1">To Gain</p>
                              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                +{weightDiff.toFixed(1)} kg
                              </p>
                            </>
                          );
                        } else if (weightDiff < 0) {
                          return (
                            <>
                              <p className="text-xs text-muted-foreground mb-1">To Lose</p>
                              <p className="text-lg font-bold text-primary">
                                {Math.abs(weightDiff).toFixed(1)} kg
                              </p>
                            </>
                          );
                        } else {
                          return (
                            <>
                              <p className="text-xs text-muted-foreground mb-1">Status</p>
                              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                At Target
                              </p>
                            </>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
              )}
              
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
          );
        })()}

        {/* Weight Input - Moved above AI Strategy */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                        y={profile?.fight_week_target_kg || profile?.goal_weight_kg}
                        stroke="hsl(var(--primary))"
                        strokeDasharray="5 5"
                        label={{ value: "Fight Week Target", fill: "hsl(var(--primary))", fontSize: 12 }}
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

        {!aiAnalysis && profile && (
          <Card>
            <CardContent className="pt-6">
              <Button onClick={getAIAnalysis} disabled={analyzingWeight} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                {analyzingWeight ? "Analyzing..." : "Get AI Weight Loss Strategy"}
              </Button>
            </CardContent>
          </Card>
        )}

        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteLog}
          title="Delete Weight Log"
          itemName={logToDelete ? `${logToDelete.weight_kg}kg on ${format(new Date(logToDelete.date), "MMM dd, yyyy")}` : undefined}
        />

        {/* Unrealistic Goal Confirmation Dialog */}
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

        {/* Debug Button - Only show if debug data exists */}
        {debugData && (
          <Card>
            <CardContent className="pt-6">
              <Button 
                onClick={() => setDebugDialogOpen(true)} 
                variant="outline" 
                className="w-full"
              >
                <Bug className="h-4 w-4 mr-2" />
                Debug AI Request/Response
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Debug Dialog */}
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
                {/* Current Weight Info */}
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

                {/* Profile Data */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Profile Data</h3>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                    {JSON.stringify(debugData.profileData, null, 2)}
                  </pre>
                </div>

                {/* Request Payload */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Request Payload (Sent to API)</h3>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                    {JSON.stringify(debugData.requestPayload, null, 2)}
                  </pre>
                </div>

                {/* Raw API Response */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Raw API Response</h3>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono max-h-96 overflow-y-auto">
                    {JSON.stringify(debugData.rawResponse, null, 2)}
                  </pre>
                </div>

                {/* Parsed Response */}
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
    </div>
  );
}
