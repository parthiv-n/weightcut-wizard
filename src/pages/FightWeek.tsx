import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { Calendar, Droplets, TrendingDown, AlertTriangle, CheckCircle, Activity, Sparkles, Trash2, ChevronDown, ChevronUp, Timer, Shield, BookOpen, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import wizardLogo from "@/assets/wizard-logo.png";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";

interface FightWeekPlan {
  id: string;
  fight_date: string;
  starting_weight_kg: number;
  target_weight_kg: number;
}

interface DailyLog {
  id?: string;
  log_date: string;
  weight_kg?: number;
  carbs_g?: number;
  fluid_intake_ml?: number;
  sweat_session_min?: number;
  supplements?: string;
  notes?: string;
}

interface AIAnalysis {
  riskLevel: "green" | "yellow" | "red";
  riskPercentage: number;
  weightRemaining: number;
  dehydrationRequired: number;
  carbDepletionEstimate: number;
  isOnTrack: boolean;
  progressStatus: string;
  dailyAnalysis: string;
  adaptations: string[];
  riskExplanation: string;
  recommendation: string;
}

export default function FightWeek() {
  const [plan, setPlan] = useState<FightWeekPlan | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [newPlan, setNewPlan] = useState({ fight_date: "", starting_weight_kg: "", target_weight_kg: "" });
  const [isWaterloading, setIsWaterloading] = useState(false);
  const [quickWeightLog, setQuickWeightLog] = useState({
    log_date: format(new Date(), "yyyy-MM-dd"),
    weight_kg: undefined as number | undefined,
  });
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [wizardAdviceOpen, setWizardAdviceOpen] = useState(false);
  const [riskExplanationOpen, setRiskExplanationOpen] = useState(false);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [analyzingWeight, setAnalyzingWeight] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<DailyLog | null>(null);
  const { toast } = useToast();
  const { userId, currentWeight: contextCurrentWeight, updateCurrentWeight, profile: contextProfile } = useUser();

  useEffect(() => {
    if (userId) {
      fetchPlanAndLogs();
      loadPersistedAnalysis();
    }
  }, [userId]);

  // Populate plan defaults from context profile
  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
      const currentWeightValue = contextCurrentWeight ?? contextProfile.current_weight_kg ?? 0;
      setNewPlan(prev => ({
        ...prev,
        starting_weight_kg: prev.starting_weight_kg || currentWeightValue.toString(),
        target_weight_kg: prev.target_weight_kg || contextProfile.goal_weight_kg?.toString() || ""
      }));
    }
  }, [contextProfile, contextCurrentWeight]);

  const loadPersistedAnalysis = () => {
    if (!userId || aiAnalysis) return;
    try {
      const persistedData = AIPersistence.load(userId, 'fight_week_analysis');
      if (persistedData) {
        setAiAnalysis(persistedData);
      }
    } catch (error) {
      console.error("Error loading persisted analysis:", error);
    }
  };

  useEffect(() => {
    if (plan) {
      updateLocalCurrentWeight();
    }
  }, [logs, plan, contextCurrentWeight]);

  // Countdown timer
  useEffect(() => {
    if (!plan) return;

    const updateCountdown = () => {
      const fightDate = new Date(plan.fight_date);
      fightDate.setHours(23, 59, 59, 999);
      const now = Date.now();
      const diff = fightDate.getTime() - now;

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [plan]);

  const updateLocalCurrentWeight = async () => {
    if (!plan) return;

    const latestFightWeekLog = logs[logs.length - 1];
    let weight = latestFightWeekLog?.weight_kg;

    if (!weight) {
      weight = contextCurrentWeight ?? plan.starting_weight_kg;
    }

    setCurrentWeight(weight);
  };

  const fetchPlanAndLogs = async () => {
    if (!userId) return;
    try {
      const { data: planData } = await supabase
        .from("fight_week_plans")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (planData) {
        setPlan(planData);

        const { data: logsData } = await supabase
          .from("fight_week_logs")
          .select("id, log_date, weight_kg, carbs_g, fluid_intake_ml, sweat_session_min, supplements, notes")
          .eq("user_id", userId)
          .order("log_date", { ascending: true });

        setLogs(logsData || []);

        if (logsData && logsData.some(log => log.weight_kg !== null)) {
          setTimeout(() => getAIAnalysis(), 500);
        }
      }
    } catch (error) {
      console.error("Error fetching plan:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const createPlan = async () => {
    if (!userId) return;

    setLoading(true);

    const { error } = await supabase.from("fight_week_plans").insert({
      user_id: userId,
      fight_date: newPlan.fight_date,
      starting_weight_kg: parseFloat(newPlan.starting_weight_kg),
      target_weight_kg: parseFloat(newPlan.target_weight_kg)
    });

    if (error) {
      toast({ title: "Error creating plan", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fight week plan created!", description: "Your countdown has started." });
      fetchPlanAndLogs();
      setNewPlan({ fight_date: "", starting_weight_kg: "", target_weight_kg: "" });
    }
    setLoading(false);
  };

  const saveQuickWeight = async () => {
    if (!userId || !quickWeightLog.log_date || !quickWeightLog.weight_kg) return;

    setLoading(true);
    const logData = {
      user_id: userId,
      log_date: quickWeightLog.log_date,
      weight_kg: quickWeightLog.weight_kg,
      carbs_g: null,
      fluid_intake_ml: null,
      sweat_session_min: null,
      supplements: null,
      notes: null
    };

    const { error } = await supabase
      .from("fight_week_logs")
      .upsert(logData, { onConflict: "user_id,log_date" });

    if (error) {
      toast({ title: "Error saving log", description: error.message, variant: "destructive" });
      setLoading(false);
    } else {
      toast({ title: "Weight logged!", description: "Your progress has been tracked." });

      await supabase
        .from("profiles")
        .update({ current_weight_kg: quickWeightLog.weight_kg })
        .eq("id", userId);

      await updateCurrentWeight(quickWeightLog.weight_kg);
      await fetchPlanAndLogs();

      if (plan) {
        await getAIAnalysis();
      }

      setQuickWeightLog({
        log_date: format(new Date(), "yyyy-MM-dd"),
        weight_kg: undefined,
      });
      setLoading(false);
    }
  };

  const getAIAnalysis = async () => {
    if (!plan || !userId) return;

    setAnalyzingWeight(true);

    const { data: freshLogs } = await supabase
      .from("fight_week_logs")
      .select("*")
      .eq("user_id", userId)
      .order("log_date", { ascending: true });

    if (!freshLogs || freshLogs.length === 0) {
      setAnalyzingWeight(false);
      return;
    }

    const logsWithWeight = freshLogs.filter(log => log.weight_kg !== null);
    const latestLog = logsWithWeight[logsWithWeight.length - 1];
    const currentWeight = latestLog?.weight_kg || plan.starting_weight_kg;

    const { data, error } = await supabase.functions.invoke("fight-week-analysis", {
      body: {
        currentWeight,
        targetWeight: plan.target_weight_kg,
        daysUntilFight: getDaysUntilFight(),
        dailyLogs: freshLogs,
        startingWeight: plan.starting_weight_kg,
        isWaterloading
      }
    });

    if (error) {
      console.error("AI analysis error:", error);
      toast({ title: "AI analysis unavailable", description: error.message, variant: "destructive" });
    } else if (data?.analysis) {
      setAiAnalysis(data.analysis);
      AIPersistence.save(userId, 'fight_week_analysis', data.analysis, 72);
    }
    setAnalyzingWeight(false);
  };

  const handleDeleteLog = async () => {
    if (!logToDelete?.id) return;

    setLoading(true);
    const { error } = await supabase
      .from("fight_week_logs")
      .delete()
      .eq("id", logToDelete.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete log entry",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Log entry has been removed",
      });
      await fetchPlanAndLogs();
      if (logs.length > 0) {
        await getAIAnalysis();
      }
    }

    setLoading(false);
    setDeleteDialogOpen(false);
    setLogToDelete(null);
  };

  const initiateDelete = (log: DailyLog) => {
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const getDaysUntilFight = () => {
    if (!plan) return 0;
    return differenceInDays(new Date(plan.fight_date), new Date());
  };

  const getWeightProgress = () => {
    if (!plan || !currentWeight) return 0;
    const totalLoss = plan.starting_weight_kg - plan.target_weight_kg;
    const currentLoss = plan.starting_weight_kg - currentWeight;
    return (currentLoss / totalLoss) * 100;
  };

  const getWeightCutBreakdown = () => {
    if (!plan || !currentWeight) return null;
    const totalWeightToCut = currentWeight - plan.target_weight_kg;

    const glycogenWaterWeight = 2.0;
    const safeDehydration = currentWeight * 0.03;
    const maxSafeCut = glycogenWaterWeight + safeDehydration;

    const isSafe = totalWeightToCut <= maxSafeCut;
    const percentBodyweight = (totalWeightToCut / currentWeight) * 100;

    let status: "safe" | "warning" | "danger";
    let message: string;
    let wizardAdvice: string;

    if (percentBodyweight <= 5) {
      status = "safe";
      message = "Safe and manageable weight cut";
      wizardAdvice = "Your weight cut is well within safe limits. Focus on gradual carb reduction starting 5 days out, maintain hydration until 24h before weigh-in, then implement controlled water loading/cutting protocol.";
    } else if (percentBodyweight <= 8) {
      status = "warning";
      message = "Aggressive but doable with proper protocol";
      wizardAdvice = "This is an aggressive cut that requires precise execution. You'll need to maximize glycogen depletion through carb restriction and strategic dehydration. Monitor your energy levels closely and consider extending your cut timeline if possible.";
    } else {
      status = "danger";
      message = "DANGEROUS - Exceeds safe limits";
      wizardAdvice = "WARNING: This weight cut exceeds safe physiological limits and poses serious health risks including cognitive impairment, reduced performance, and potential medical complications. Strongly recommend reconsidering your target weight or fight timeline.";
    }

    return {
      totalWeightToCut,
      glycogenWaterWeight,
      safeDehydration,
      maxSafeCut,
      isSafe,
      status,
      message,
      percentBodyweight,
      wizardAdvice,
      currentWeight
    };
  };

  const getChartData = () => {
    return logs.map(log => ({
      date: format(new Date(log.log_date), "MMM dd"),
      weight: log.weight_kg,
      logId: log.id,
      fullDate: log.log_date
    }));
  };

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const payload = data.activePayload[0].payload;
      const log = logs.find(l => l.id === payload.logId);
      if (log) {
        initiateDelete(log);
      }
    }
  };

  const daysUntilFight = getDaysUntilFight();
  const weightCutInfo = getWeightCutBreakdown();

  const FIGHT_WEEK_STEPS = [
    { icon: Activity, label: "Reviewing daily logs", color: "text-blue-400" },
    { icon: Droplets, label: "Checking hydration status", color: "text-cyan-500" },
    { icon: Shield, label: "Validating safety metrics", color: "text-green-500" },
    { icon: Sparkles, label: "Updating strategy", color: "text-yellow-400" },
  ];

  // Add Skeleton Loader at the beginning of render
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black text-white pb-32 md:pb-10 pt-safe-top p-6 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-zinc-900" />
          <Skeleton className="h-4 w-32 bg-zinc-900" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-3xl bg-zinc-900" />
          <Skeleton className="h-32 rounded-3xl bg-zinc-900" />
        </div>
        <Skeleton className="h-40 rounded-3xl bg-zinc-900" />
        <Skeleton className="h-64 rounded-3xl bg-zinc-900" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-30" />

        <div className="w-full max-w-sm z-10 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Fight Week Plan</h1>
            <p className="text-zinc-400">Set your targets to start the countdown.</p>
          </div>

          <div className="space-y-4 bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
            <div className="space-y-2">
              <Label htmlFor="fight_date" className="text-zinc-300">Fight Date</Label>
              <Input
                id="fight_date"
                type="date"
                value={newPlan.fight_date}
                onChange={(e) => setNewPlan({ ...newPlan, fight_date: e.target.value })}
                className="bg-black border-zinc-800 text-white h-12 rounded-xl focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="starting_weight" className="text-zinc-300">Current Weight (kg)</Label>
              <Input
                id="starting_weight"
                type="number"
                step="0.1"
                value={newPlan.starting_weight_kg}
                onChange={(e) => setNewPlan({ ...newPlan, starting_weight_kg: e.target.value })}
                className="bg-black border-zinc-800 text-white h-12 rounded-xl focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_weight" className="text-zinc-300">Target Weight (kg)</Label>
              <Input
                id="target_weight"
                type="number"
                step="0.1"
                value={newPlan.target_weight_kg}
                onChange={(e) => setNewPlan({ ...newPlan, target_weight_kg: e.target.value })}
                className="bg-black border-zinc-800 text-white h-12 rounded-xl focus:border-primary"
              />
            </div>
            <Button
              onClick={createPlan}
              disabled={loading}
              className="w-full h-12 rounded-xl text-lg font-bold bg-white text-black hover:bg-zinc-200 transition-all mt-2"
            >
              {loading ? "Creating..." : "Start Protocol"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AIGeneratingOverlay
        isOpen={analyzingWeight}
        isGenerating={analyzingWeight}
        steps={FIGHT_WEEK_STEPS}
        title="Analyzing Progress"
        subtitle="Optimizing your weight cut strategy..."
      />
      <div className="min-h-screen bg-black text-white pb-32 md:pb-10 pt-safe-top">
        {/* Dynamic Background */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] opacity-40" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto px-6 py-6 space-y-8">
          {/* Header & Countdown */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Fight Week</h1>
                <p className="text-zinc-400 text-sm font-medium">
                  {format(new Date(plan.fight_date), "MMMM dd, yyyy")}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${weightCutInfo?.status === 'safe' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                weightCutInfo?.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                {weightCutInfo?.status === 'safe' ? 'ON TRACK' : weightCutInfo?.status === 'warning' ? 'CAUTION' : 'CRITICAL'}
              </div>
            </div>

            {/* Hero Countdown & Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800/50 flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute top-3 right-3 text-zinc-600 group-hover:text-zinc-500 transition-colors">
                  <Timer className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-zinc-400">Time Left</span>
                <div className="space-y-1">
                  <span className="text-4xl font-bold tracking-tight block">
                    {timeRemaining.days}<span className="text-lg text-zinc-500 font-normal ml-1">d</span>
                  </span>
                  <span className="text-sm text-zinc-500 font-mono">
                    {String(timeRemaining.hours).padStart(2, '0')}:{String(timeRemaining.minutes).padStart(2, '0')}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800/50 flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute top-3 right-3 text-zinc-600 group-hover:text-zinc-500 transition-colors">
                  <Activity className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-zinc-400">Weight Left</span>
                <div>
                  <span className="text-4xl font-bold tracking-tight text-white block">
                    {(currentWeight - plan.target_weight_kg).toFixed(1)}<span className="text-lg text-zinc-500 font-normal ml-1">kg</span>
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={getWeightProgress()} className="h-1.5 bg-zinc-800" indicatorClassName="bg-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Wizard's Advice — Collapsible */}
          {weightCutInfo && (
            <div className="rounded-3xl bg-zinc-900 border border-zinc-800/50 overflow-hidden">
              <button
                className="w-full p-5 flex items-center gap-3 text-left hover:bg-zinc-800/30 transition-colors"
                onClick={() => setWizardAdviceOpen(o => !o)}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold block">Wizard's Safety Advice</span>
                  <span className="text-xs text-zinc-500">{weightCutInfo.message}</span>
                </div>
                <span className="text-zinc-500">
                  {wizardAdviceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>
              {wizardAdviceOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-zinc-800">
                  <p className="text-sm text-zinc-300 leading-relaxed pt-4">{weightCutInfo.wizardAdvice}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">% Bodyweight</span>
                      <span className={`text-lg font-bold ${weightCutInfo.percentBodyweight <= 5 ? 'text-green-400' : weightCutInfo.percentBodyweight <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {weightCutInfo.percentBodyweight.toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Total to Cut</span>
                      <span className="text-lg font-bold text-white">{weightCutInfo.totalWeightToCut.toFixed(1)}kg</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Glycogen + Water</span>
                      <span className="text-lg font-bold text-orange-400">~{weightCutInfo.glycogenWaterWeight.toFixed(1)}kg</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Safe Dehydration</span>
                      <span className="text-lg font-bold text-blue-400">~{weightCutInfo.safeDehydration.toFixed(1)}kg</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Log Action */}
          <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Log Weight</h3>
            </div>
            <div className="flex gap-3">
              <div className="w-1/3">
                <Input
                  type="date"
                  value={quickWeightLog.log_date}
                  onChange={(e) => setQuickWeightLog({ ...quickWeightLog, log_date: e.target.value })}
                  className="bg-black border-zinc-800 text-white h-12 rounded-xl focus:border-primary text-sm font-medium text-center"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={quickWeightLog.weight_kg || ""}
                  onChange={(e) => setQuickWeightLog({ ...quickWeightLog, weight_kg: parseFloat(e.target.value) })}
                  className="bg-black border-zinc-800 text-white h-12 rounded-xl focus:border-primary text-lg font-medium text-center"
                />
              </div>
              <Button
                onClick={saveQuickWeight}
                disabled={loading || !quickWeightLog.weight_kg}
                className="h-12 w-24 rounded-xl bg-white text-black hover:bg-zinc-200 font-bold text-base transition-transform active:scale-95"
              >
                {loading ? "..." : "Save"}
              </Button>
            </div>
          </div>

          {/* AI Insight Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Insight
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-zinc-400 hover:text-white"
                onClick={getAIAnalysis}
                disabled={analyzingWeight}
              >
                {analyzingWeight ? "Analyzing..." : "Refresh"}
              </Button>
            </div>

            {analyzingWeight ? (
              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800/50 flex flex-col items-center justify-center space-y-4 min-h-[200px]">
                <Sparkles className="h-8 w-8 text-primary animate-spin" />
                <p className="text-zinc-400 animate-pulse text-sm">Analyzing protocol...</p>
              </div>
            ) : aiAnalysis ? (
              <div className="bg-zinc-900 rounded-3xl border border-zinc-800/50 overflow-hidden">
                <div className="p-5 space-y-4">
                  {/* Risk Header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${aiAnalysis.riskLevel === 'green' ? 'bg-green-500/20 text-green-400' :
                      aiAnalysis.riskLevel === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                      {aiAnalysis.riskLevel === 'green' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">
                        {aiAnalysis.riskLevel === 'green' ? 'Protocol Safe' : aiAnalysis.riskLevel === 'yellow' ? 'Moderate adjustments needed' : 'Immediate action required'}
                      </h3>
                      <p className="text-sm text-zinc-400">{aiAnalysis.progressStatus}</p>
                    </div>
                  </div>

                  {/* Cut Composition Visualization */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Estimated Cut Composition</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="h-3.5 w-3.5 text-orange-400" />
                          <span className="text-xs text-zinc-400">Carb/Gut Depletion</span>
                        </div>
                        <span className="text-xl font-bold text-white block">
                          ~{aiAnalysis.carbDepletionEstimate.toFixed(1)}<span className="text-sm text-zinc-500 font-normal ml-0.5">kg</span>
                        </span>
                      </div>
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Droplets className="h-3.5 w-3.5 text-blue-400" />
                          <span className="text-xs text-zinc-400">Water Loss Required</span>
                        </div>
                        <span className="text-xl font-bold text-white block">
                          ~{aiAnalysis.dehydrationRequired.toFixed(1)}<span className="text-sm text-zinc-500 font-normal ml-0.5">kg</span>
                        </span>
                      </div>
                    </div>
                    {isWaterloading && (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-start gap-3">
                        <Droplets className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-blue-400">Water Loading Active</p>
                          <p className="text-xs text-blue-300/70 mt-0.5">Bonus 2-3kg safe dehydration capacity added.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Analysis Text */}
                  <div className="space-y-3 border-t border-zinc-800 pt-3">
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      "{aiAnalysis.dailyAnalysis}"
                    </p>
                    {aiAnalysis.adaptations.length > 0 && (
                      <div className="bg-zinc-950/50 rounded-xl p-3 space-y-2">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Adaptations</span>
                        <ul className="space-y-2">
                          {aiAnalysis.adaptations.map((item, i) => (
                            <li key={i} className="text-sm flex gap-2 text-zinc-300">
                              <span className="text-primary mt-1">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Risk Explanation — Collapsible */}
                  {aiAnalysis.riskExplanation && (
                    <div className="border-t border-zinc-800">
                      <button
                        className="w-full py-3 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                        onClick={() => setRiskExplanationOpen(o => !o)}
                      >
                        <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Risk Explanation</span>
                        <span className="ml-auto text-zinc-600">
                          {riskExplanationOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                      {riskExplanationOpen && (
                        <p className="text-sm text-zinc-300 leading-relaxed pb-3">{aiAnalysis.riskExplanation}</p>
                      )}
                    </div>
                  )}

                  {/* Recommendation — Collapsible */}
                  {aiAnalysis.recommendation && (
                    <div className="border-t border-zinc-800">
                      <button
                        className="w-full py-3 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                        onClick={() => setRecommendationOpen(o => !o)}
                      >
                        <Target className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Recommendation</span>
                        <span className="ml-auto text-zinc-600">
                          {recommendationOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                      {recommendationOpen && (
                        <p className="text-sm text-zinc-300 leading-relaxed pb-3">{aiAnalysis.recommendation}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Protocol Toggle footer */}
                <div className="bg-zinc-950 p-4 border-t border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className={`h-4 w-4 ${isWaterloading ? 'text-blue-500' : 'text-zinc-600'}`} />
                    <span className="text-sm font-medium text-zinc-400">Water Loading</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{isWaterloading ? "On" : "Off"}</span>
                    <input
                      type="checkbox"
                      checked={isWaterloading}
                      onChange={(e) => setIsWaterloading(e.target.checked)}
                      className="toggle-checkbox h-5 w-9 rounded-full bg-zinc-800 border-transparent appearance-none transition-colors checked:bg-blue-600 relative cursor-pointer
                      after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform checked:after:translate-x-4"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800/50 text-center space-y-4">
                <p className="text-zinc-400">No analysis available. Log your weight to get started.</p>
                <Button onClick={getAIAnalysis} variant="outline" className="text-white border-zinc-700 hover:bg-zinc-800">
                  Generate Analysis
                </Button>
              </div>
            )}
          </div>

          {/* Chart & History */}
          {logs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-1">History</h2>
              <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800/50 overflow-hidden">
                <div className="h-48 w-full -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getChartData()}>
                      <XAxis
                        dataKey="date"
                        stroke="#52525b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ color: '#a1a1aa' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, fill: "#fff", strokeWidth: 0 }}
                      />
                      <ReferenceLine y={plan.target_weight_kg} stroke="#3f3f46" strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 space-y-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
                  {logs.slice().reverse().map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-zinc-900 hover:bg-zinc-800/80 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-primary/50"></div>
                        <div>
                          <p className="font-semibold text-sm text-white">{format(new Date(log.log_date), "MMM dd")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-bold text-white">{log.weight_kg}kg</span>
                        <button
                          onClick={() => initiateDelete(log)}
                          className="text-zinc-600 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteLog}
          title="Delete Log"
          itemName={logToDelete ? `entry from ${format(new Date(logToDelete.log_date), "MMM dd")}` : undefined}
        />
      </div>
    </>
  );
}
