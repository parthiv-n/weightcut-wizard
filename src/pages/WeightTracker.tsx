import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Sparkles, Activity, Scale, Trash2, RefreshCw, Edit2, ChevronDown, Check, CheckCircle2, Gem, Minus, Plus } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useUser } from "@/contexts/UserContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";
import { useAITask } from "@/contexts/AITaskContext";
import { AICompactOverlay } from "@/components/AICompactOverlay";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { WeightTrackerCard } from "@/components/share/cards/WeightTrackerCard";
import { WeighInResultCard } from "@/components/share/cards/WeighInResultCard";
import type { Profile } from "@/pages/weight/types";
import { isFighter } from "@/lib/goalType";
import { useWeightData } from "@/hooks/weight/useWeightData";
import { useWeightAnalysis } from "@/hooks/weight/useWeightAnalysis";
import { useGems } from "@/hooks/useGems";
import { triggerHapticSelection } from "@/lib/haptics";

export default function WeightTracker() {
  const { userId, profile: contextProfile } = useUser();
  const profile = contextProfile as unknown as Profile;
  const { gems, isPremium: gemsIsPremium } = useGems();
  const [searchParams, setSearchParams] = useSearchParams();
  const [timeFilter, setTimeFilter] = useState<"1W" | "1M" | "ALL">("1M");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showProjected, setShowProjected] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [weighInShareOpen, setWeighInShareOpen] = useState(false);
  const [showWeightSuccess, setShowWeightSuccess] = useState(false);

  const {
    weightLogs, newWeight, setNewWeight, newDate, setNewDate,
    loading, editingLogId, deleteDialogOpen, setDeleteDialogOpen,
    logToDelete, weightInputRef,
    fetchData, handleAddWeight: rawHandleAddWeight, handleDeleteLog, handleEditLog, initiateDelete,
    getCurrentWeight,
  } = useWeightData({ profile });

  const {
    analyzingWeight, aiAnalysis, aiAnalysisWeight, aiAnalysisTarget,
    unsafeGoalDialogOpen, setUnsafeGoalDialogOpen,
    loadPersistedAnalysis, clearAnalysis, getAIAnalysis, handleAICancel,
    targetsApplied, applyingTargets, applyNutritionTargets,
  } = useWeightAnalysis({ profile });

  const adjustWeight = (delta: number) => {
    setNewWeight((prev: string) => {
      const current = parseFloat(prev) || 0;
      return Math.max(0, current + delta).toFixed(1);
    });
    triggerHapticSelection();
  };

  useEffect(() => {
    if (!userId) return;
    fetchData();
    loadPersistedAnalysis();
    const stored = localStorage.getItem(`weight_tracker_show_projected_${userId}`);
    if (stored !== null) setShowProjected(JSON.parse(stored));
  }, [userId]);

  // Warmup ping
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      supabase.functions.invoke("weight-tracker-analysis", { method: "GET" } as any).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [userId]);

  const handleAddWeight = async (e: React.FormEvent) => {
    const loggedWeight = await rawHandleAddWeight(e);
    if (loggedWeight && profile) {
      setShowWeightSuccess(true);
      setTimeout(() => setShowWeightSuccess(false), 1500);
      const fwt = profile.fight_week_target_kg ?? profile.goal_weight_kg;
      if (fwt && loggedWeight <= fwt && !editingLogId) {
        setWeighInShareOpen(true);
      }
    }
  };

  const getWeeklyLossRequired = () => {
    if (!profile) return 0;
    const current = getCurrentWeight();
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const target = profile.fight_week_target_kg || profile.goal_weight_kg;
    if (!target) return 0;
    const weightRemaining = current - target;
    return weightRemaining / weeksRemaining;
  };

  const getChartData = () => {
    if (!profile) return [];
    const fightWeekTarget = profile.fight_week_target_kg || profile.goal_weight_kg;

    if (!weightLogs.length) {
      if (profile.current_weight_kg) {
        return [{
          date: "Start",
          weight: profile.current_weight_kg,
          projected: null as number | null,
          fightWeekGoal: fightWeekTarget,
          fightNightGoal: profile.goal_weight_kg,
          logId: null,
          fullDate: "Onboarding weight",
        }];
      }
      return [];
    }

    let filteredLogs = [...weightLogs];
    const now = new Date();

    if (timeFilter === "1W") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredLogs = filteredLogs.filter(log => new Date(log.date) >= oneWeekAgo);
    } else if (timeFilter === "1M") {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredLogs = filteredLogs.filter(log => new Date(log.date) >= oneMonthAgo);
    }

    if (filteredLogs.length === 0 && weightLogs.length > 0) {
      filteredLogs = [weightLogs[weightLogs.length - 1]];
    }

    const data: { date: string; weight: number | null; projected: number | null; fightWeekGoal: number | undefined; fightNightGoal: number | undefined; logId: string | null; fullDate: string }[] = filteredLogs.map((log, idx) => ({
      date: format(new Date(log.date), "MMM dd"),
      weight: log.weight_kg,
      projected: (aiAnalysis && idx === filteredLogs.length - 1) ? log.weight_kg : null as number | null,
      fightWeekGoal: fightWeekTarget,
      fightNightGoal: profile.goal_weight_kg,
      logId: log.id,
      fullDate: log.date,
    }));

    if (aiAnalysis && aiAnalysis.requiredWeeklyLoss > 0 && filteredLogs.length > 0) {
      const lastLog = filteredLogs[filteredLogs.length - 1];
      const lastWeight = lastLog.weight_kg;
      const lastDate = new Date(lastLog.date);
      const targetDate = new Date(profile.target_date);
      const maxWeeks = 8;

      for (let week = 1; week <= maxWeeks; week++) {
        const futureDate = new Date(lastDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        if (futureDate > targetDate) break;

        const projectedWeight = Math.max(
          fightWeekTarget,
          lastWeight - (week * aiAnalysis.requiredWeeklyLoss)
        );

        data.push({
          date: format(futureDate, "MMM dd"),
          weight: null as number | null,
          projected: projectedWeight,
          fightWeekGoal: fightWeekTarget,
          fightNightGoal: profile.goal_weight_kg,
          logId: null,
          fullDate: format(futureDate, "yyyy-MM-dd"),
        });

        if (projectedWeight <= fightWeekTarget) break;
      }
    }

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

  const getWeightProgress = () => {
    if (!profile) return 0;
    const current = getCurrentWeight();
    const start = weightLogs.length > 0 ? weightLogs[0].weight_kg : profile.current_weight_kg;
    const target = profile.fight_week_target_kg || profile.goal_weight_kg;
    if (!target) return 0;
    const total = start - target;
    const progress = start - current;
    return Math.min(100, Math.max(0, (progress / total) * 100));
  };

  const getInsight = () => {
    if (!weightLogs.length || !profile) {
      return { message: "Start logging your weight to receive personalized insights.", icon: Target, color: "text-muted-foreground" };
    }

    const current = getCurrentWeight();
    const target = profile.fight_week_target_kg || profile.goal_weight_kg;
    if (!target) {
      return { message: "Please set a target weight in Goals to see insights.", icon: Target, color: "text-muted-foreground" };
    }
    const targetDate = new Date(profile.target_date);
    const today = new Date();
    const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weightRemaining = current - target;

    const recentLogs = weightLogs.slice(-7);
    if (recentLogs.length >= 2) {
      const weekAgo = recentLogs[0].weight_kg;
      const weeklyLoss = weekAgo - current;
      const weeklyLossPercent = (weeklyLoss / current) * 100;

      if (weeklyLossPercent > 1.5) return { message: "Warning: Weight loss pace is too aggressive. Reduce deficit to maintain performance and safety.", icon: AlertTriangle, color: "text-danger" };
      if (weeklyLoss > 1.0) return { message: "Caution: Losing weight slightly fast. Monitor energy levels and adjust if needed.", icon: TrendingDown, color: "text-warning" };
      if (weeklyLoss >= 0.5 && weeklyLoss <= 1.0) return { message: "Excellent pace! You're losing weight safely within the optimal 0.5-1kg per week range.", icon: TrendingDown, color: "text-success" };
      if (weeklyLoss > 0 && weeklyLoss < 0.5) return { message: "Steady progress. Consider slight calorie reduction if deadline is approaching.", icon: TrendingDown, color: "text-primary" };
      if (weeklyLoss <= 0) return { message: "No weight loss detected. Review calorie intake and increase activity if possible.", icon: TrendingUp, color: "text-warning" };
    }

    const requiredWeeklyLoss = weightRemaining / (daysRemaining / 7);
    if (requiredWeeklyLoss > 1.0) return { message: "Target requires >1kg/week loss. Consider extending timeline for safety.", icon: AlertTriangle, color: "text-danger" };

    return { message: "Stay consistent with your plan. Track daily for best results.", icon: Target, color: "text-primary" };
  };

  const insight = getInsight();

  const ANALYSIS_STEPS = [
    { icon: Activity, label: "Analyzing weight trends", color: "text-blue-400" },
    { icon: TrendingDown, label: "Calculating loss rate", color: "text-green-500" },
    { icon: Target, label: "Projecting goal completion", color: "text-blue-500" },
    { icon: Sparkles, label: "Formulating strategy", color: "text-yellow-400" },
  ];

  const { tasks: aiTasks, dismissTask: aiDismiss } = useAITask();
  const aiTask = aiTasks.find(t => t.status === "running" && t.type === "weight-analysis");

  // Pick up completed weight analysis from task context
  const handledWeightTaskRef = useRef<string | null>(null);
  useEffect(() => {
    const done = aiTasks.find(t => t.status === "done" && t.type === "weight-analysis" && t.result && handledWeightTaskRef.current !== t.id);
    if (done) {
      handledWeightTaskRef.current = done.id;
      loadPersistedAnalysis();
      aiDismiss(done.id);
    }
  }, [aiTasks, aiDismiss]);

  return (
    <>
      {aiTask && (
        <div className="px-3 sm:px-5 md:px-6 pt-3 max-w-2xl mx-auto">
          <AICompactOverlay
            isOpen={true}
            isGenerating={true}
            steps={aiTask.steps}
            title={aiTask.label}
            onCancel={() => aiDismiss(aiTask.id)}
          />
        </div>
      )}
      <div className="space-y-2.5 p-3 sm:p-5 md:p-6 max-w-2xl mx-auto">
        {/* Chart + History */}
        <div className="card-surface p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Progress Chart</p>
            <div className="flex items-center gap-2">
            {weightLogs.length >= 2 && <ShareButton onClick={() => setShareOpen(true)} />}
            <div className="flex rounded-full bg-muted p-0.5">
              {(["1W", "1M", "ALL"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${timeFilter === filter
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            </div>
          </div>
          {getChartData().length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={getChartData()} onClick={handleChartClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} domain={["dataMin - 2", "dataMax + 2"]} width={30} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const entry = payload[0].payload;
                        const actualWeight = entry.weight;
                        const projectedWeight = entry.projected;
                        const isProjectedOnly = !actualWeight && projectedWeight;
                        return (
                          <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                            <p className="text-xs text-muted-foreground">{entry.fullDate}</p>
                            {actualWeight && <p className="text-lg font-bold text-primary">{actualWeight}kg</p>}
                            {isProjectedOnly && <p className="text-lg font-bold text-muted-foreground">{projectedWeight.toFixed(1)}kg <span className="text-xs font-normal">projected</span></p>}
                            {actualWeight && <p className="text-[10px] text-muted-foreground mt-1">Tap to delete</p>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={profile?.fight_week_target_kg || profile?.goal_weight_kg} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: "Target", fill: "hsl(var(--primary))", fontSize: 10, position: "insideTopRight" }} />
                  {profile?.fight_week_target_kg && (
                    <ReferenceLine y={profile.goal_weight_kg} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: isFighter(profile?.goal_type) ? "Fight Night" : "Goal Weight", fill: "hsl(var(--destructive))", fontSize: 10, position: "insideBottomRight" }} />
                  )}
                  <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", r: 4, cursor: "pointer" }} activeDot={{ r: 6, cursor: "pointer" }} animationDuration={0} />
                  {aiAnalysis && showProjected && (
                    <Line type="monotone" dataKey="projected" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} animationDuration={0} />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {aiAnalysis && (
                <div className="flex justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 text-[11px] gap-1.5 ${showProjected ? 'text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => {
                      const next = !showProjected;
                      setShowProjected(next);
                      if (userId) localStorage.setItem(`weight_tracker_show_projected_${userId}`, JSON.stringify(next));
                    }}
                  >
                    <TrendingDown className="h-3 w-3" />
                    Projected {showProjected ? 'On' : 'Off'}
                  </Button>
                </div>
              )}
              <div className="border-t border-border/20 pt-2">
                <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen} className="w-full space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent Entries</p>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground">
                        {isHistoryOpen ? "Hide" : "View & Edit"}
                        <ChevronDown className={`h-3 w-3 ml-1 transition-transform duration-200 ${isHistoryOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {weightLogs.slice().reverse().map((log) => (
                        <div key={log.id} className="flex items-center justify-between p-2 rounded-xl border border-white/5 bg-background/50 hover:bg-background/80 transition-colors">
                          <div>
                            <span className="text-sm font-bold text-primary mr-2">{log.weight_kg} kg</span>
                            <span className="text-[11px] text-muted-foreground">{format(new Date(log.date), "MMM dd, yyyy")}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditLog(log)} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => initiateDelete(log)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              Log your first weight to see progress
              <Button variant="outline" size="sm" className="text-xs" onClick={() => weightInputRef.current?.focus()}>
                Log Now
              </Button>
            </div>
          )}
        </div>

        {/* Header + Inline Log Form */}
        <div className="flex flex-col gap-2">
          <form onSubmit={handleAddWeight} className="flex gap-1.5 items-center">
            <div className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => adjustWeight(-0.1)}
                className="h-8 w-8 shrink-0 rounded-lg bg-muted flex items-center justify-center text-muted-foreground active:scale-95 transition-transform"
                aria-label="Decrease weight"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <Input ref={weightInputRef} type="number" inputMode="decimal" step="0.1" placeholder={weightLogs.length > 0 ? `e.g. ${parseFloat(weightLogs[weightLogs.length - 1].weight_kg).toFixed(1)}` : "0.0"} value={newWeight} onChange={(e) => setNewWeight(e.target.value)} required className="flex-1 min-w-0 h-9 text-sm" />
              <button
                type="button"
                onClick={() => adjustWeight(0.1)}
                className="h-8 w-8 shrink-0 rounded-lg bg-muted flex items-center justify-center text-muted-foreground active:scale-95 transition-transform"
                aria-label="Increase weight"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required className="w-[120px] h-9 text-sm" />
            <Button type="submit" disabled={loading} className="h-9 px-3 text-sm shrink-0">
              {loading ? "..." : editingLogId ? "Update" : "Log"}
            </Button>
            {showWeightSuccess && (
              <span className="text-success animate-[fadeSlideUp_0.3s_ease-out_both]">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            )}
          </form>
        </div>

        {/* Stats Overview */}
        {profile && (
          <div className="grid grid-cols-4 gap-2">
            <div className="card-surface p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Current</p>
              <p className="display-number text-lg">{getCurrentWeight().toFixed(1)}</p>
              <p className="text-[9px] text-muted-foreground">kg</p>
            </div>
            <div className="card-surface p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Target</p>
              <p className="display-number text-lg">{(profile.fight_week_target_kg || profile.goal_weight_kg).toFixed(1)}</p>
              <p className="text-[9px] text-muted-foreground">kg</p>
            </div>
            <div className="card-surface p-2.5 text-center">
              {(() => {
                const current = getCurrentWeight();
                const target = profile.fight_week_target_kg || profile.goal_weight_kg;
                const diff = target - current;
                if (diff > 0) return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">To Gain</p><p className="display-number text-lg text-green-500">+{diff.toFixed(1)}</p><p className="text-[9px] text-muted-foreground">kg</p></>);
                if (diff < 0) return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">To Lose</p><p className="display-number text-lg text-primary">{Math.abs(diff).toFixed(1)}</p><p className="text-[9px] text-muted-foreground">kg</p></>);
                return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Status</p><p className="display-number text-lg text-green-500">✓</p><p className="text-[9px] text-muted-foreground">At Target</p></>);
              })()}
            </div>
            <div className="card-surface p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Deadline</p>
              <p className="text-sm font-semibold">{format(new Date(profile.target_date), "MMM dd")}</p>
              <p className="text-[9px] text-muted-foreground">{format(new Date(profile.target_date), "yyyy")}</p>
            </div>
          </div>
        )}

        {/* Progress + Insight */}
        {profile && (
          <div className="card-surface p-3 space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Progress to target</span>
              <span className="font-medium">{getWeightProgress().toFixed(0)}%</span>
            </div>
            <Progress value={getWeightProgress()} className="h-1" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.message}</p>
          </div>
        )}

        {/* AI Analysis Loading */}
        {analyzingWeight && (
          <div className="card-surface p-5 flex flex-col items-center gap-3">
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
          const isAtOrBelowTarget = aiAnalysisWeight !== null && aiAnalysisTarget !== null && aiAnalysisWeight <= aiAnalysisTarget;
          const displayRiskLevel = isAtOrBelowTarget ? 'green' : aiAnalysis.riskLevel;
          const weightDiff = aiAnalysisWeight !== null && aiAnalysisTarget !== null ? aiAnalysisTarget - aiAnalysisWeight : 0;

          return (
            <div className="card-surface p-3 space-y-3 animate-fade-in">
              {/* Header row */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">AI Strategy</p>
                  <p className={`text-base font-bold mt-0.5 ${displayRiskLevel === 'green' ? 'text-green-500' : displayRiskLevel === 'yellow' ? 'text-yellow-500' : 'text-red-500'}`}>
                    {displayRiskLevel === 'green' ? 'Safe Pace' : displayRiskLevel === 'yellow' ? 'Moderate Pace' : 'Aggressive Pace'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isAtOrBelowTarget ? 'At or below target — maintenance mode' : `${aiAnalysis.requiredWeeklyLoss.toFixed(2)} kg/week required`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={getAIAnalysis} disabled={analyzingWeight} className="h-8 w-8" title="Refresh analysis"><RefreshCw className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={clearAnalysis} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete analysis"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Now / Goal / Diff */}
              {aiAnalysisWeight !== null && aiAnalysisTarget !== null && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Now</p>
                    <p className="text-lg font-bold">{aiAnalysisWeight.toFixed(1)}</p>
                    <p className="text-[9px] text-muted-foreground">kg</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Goal</p>
                    <p className="text-lg font-bold">{aiAnalysisTarget.toFixed(1)}</p>
                    <p className="text-[9px] text-muted-foreground">kg</p>
                  </div>
                  <div>
                    {(() => {
                      if (weightDiff > 0) return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Gain</p><p className="text-lg font-bold text-green-500">+{weightDiff.toFixed(1)}</p><p className="text-[9px] text-muted-foreground">kg</p></>);
                      if (weightDiff < 0) return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Lose</p><p className="text-lg font-bold text-primary">{Math.abs(weightDiff).toFixed(1)}</p><p className="text-[9px] text-muted-foreground">kg</p></>);
                      return (<><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Status</p><p className="text-lg font-bold text-green-500">✓</p><p className="text-[9px] text-muted-foreground">At Target</p></>);
                    })()}
                  </div>
                </div>
              )}

              {/* Weekly Progress Bar */}
              {aiAnalysisWeight !== null && aiAnalysisTarget !== null && profile && aiAnalysis && (
                (() => {
                  const startWeight = aiAnalysisWeight;
                  const targetWeight = aiAnalysisTarget;
                  const latestWeight = getCurrentWeight();
                  const isLosing = startWeight > targetWeight;

                  const targetDate = new Date(profile.target_date);
                  const today = new Date();
                  const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));

                  // Calculate actual progress from logged weight
                  let progressPercent = 0;
                  if (isLosing) {
                    const totalToLose = startWeight - targetWeight;
                    if (totalToLose > 0 && latestWeight < startWeight) {
                      // Only fill if user has lost weight (not gained)
                      const actualLost = startWeight - latestWeight;
                      progressPercent = Math.min(100, Math.max(0, (actualLost / totalToLose) * 100));
                    }
                  } else {
                    const totalToGain = targetWeight - startWeight;
                    if (totalToGain > 0 && latestWeight > startWeight) {
                      const actualGained = latestWeight - startWeight;
                      progressPercent = Math.min(100, Math.max(0, (actualGained / totalToGain) * 100));
                    }
                  }

                  const milestones: Array<{ week: number; expectedWeight: number; position: number }> = [];

                  if (isLosing && aiAnalysis.requiredWeeklyLoss > 0) {
                    const totalToLose = startWeight - targetWeight;
                    for (let week = 1; week <= Math.min(weeksRemaining, 8); week++) {
                      const expectedWeight = Math.max(targetWeight, startWeight - (week * aiAnalysis.requiredWeeklyLoss));
                      const weightLost = startWeight - expectedWeight;
                      const position = Math.min(100, Math.max(0, (weightLost / totalToLose) * 100));
                      milestones.push({ week, expectedWeight, position });
                    }
                  } else if (!isLosing) {
                    const totalToGain = targetWeight - startWeight;
                    const weeklyGain = Math.abs(aiAnalysis.requiredWeeklyLoss) || 0.2;
                    for (let week = 1; week <= Math.min(weeksRemaining, 8); week++) {
                      const expectedWeight = Math.min(targetWeight, startWeight + (week * weeklyGain));
                      const weightGained = expectedWeight - startWeight;
                      const position = totalToGain > 0 ? Math.min(100, Math.max(0, (weightGained / totalToGain) * 100)) : 0;
                      milestones.push({ week, expectedWeight, position });
                    }
                  }

                  return (
                    <div className="py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-muted-foreground">{startWeight.toFixed(1)} kg</span>
                        <span className="text-[9px] text-muted-foreground">
                          {latestWeight !== startWeight && (
                            <span className="text-primary font-semibold mr-1">Now: {latestWeight.toFixed(1)} kg</span>
                          )}
                          {weeksRemaining} {weeksRemaining === 1 ? 'week' : 'weeks'} left
                        </span>
                        <span className="text-[10px] font-semibold text-primary">{targetWeight.toFixed(1)} kg</span>
                      </div>
                      <div className="relative">
                        <div className="relative h-4 mb-1">
                          {milestones.map(({ week, expectedWeight, position }) => (
                            <div key={`label-${week}`} className="absolute -translate-x-1/2" style={{ left: `${position}%` }}>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">{expectedWeight.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="relative h-3 bg-muted rounded-full overflow-visible">
                          <div className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                          {milestones.map(({ week, expectedWeight, position }) => (
                            <div key={week} className="absolute top-0 bottom-0 w-0.5 bg-foreground/30" style={{ left: `${position}%` }} title={`Week ${week}: ${expectedWeight.toFixed(1)} kg`} />
                          ))}
                          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full border-2 border-background shadow-sm z-10" style={{ left: `${progressPercent}%`, marginLeft: '-4px' }} />
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Calories + Macros */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Calories</p>
                  <p className="text-lg font-bold text-primary">{aiAnalysis.recommendedCalories}</p>
                  <p className="text-[9px] text-muted-foreground">kcal/day</p>
                  <p className="text-[9px] text-muted-foreground">−{aiAnalysis.calorieDeficit}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Protein</p>
                  <p className="text-lg font-bold">{aiAnalysis.proteinGrams}</p>
                  <p className="text-[9px] text-muted-foreground">g</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Carbs</p>
                  <p className="text-lg font-bold">{aiAnalysis.carbsGrams}</p>
                  <p className="text-[9px] text-muted-foreground">g</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Fats</p>
                  <p className="text-lg font-bold">{aiAnalysis.fatsGrams}</p>
                  <p className="text-[9px] text-muted-foreground">g</p>
                </div>
              </div>

              {/* Apply to Nutrition Targets */}
              <div className="flex justify-center pt-1">
                <Button
                  variant={targetsApplied ? "ghost" : "outline"}
                  size="sm"
                  className="text-xs"
                  disabled={applyingTargets || targetsApplied}
                  onClick={applyNutritionTargets}
                >
                  {targetsApplied ? (
                    <><Check className="h-3 w-3 mr-1" />Applied to Nutrition</>
                  ) : applyingTargets ? "Applying..." : "Apply to Nutrition Targets"}
                </Button>
              </div>

              {/* Guidance Cards */}
              <div className="space-y-2.5 border-t border-border/20 pt-3">
                {/* Risk Assessment */}
                <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${displayRiskLevel === 'green' ? 'bg-green-500/10' : displayRiskLevel === 'yellow' ? 'bg-yellow-500/10' : 'bg-red-500/10'}`}>
                      <AlertTriangle className={`h-3.5 w-3.5 ${displayRiskLevel === 'green' ? 'text-green-500' : displayRiskLevel === 'yellow' ? 'text-yellow-500' : 'text-red-500'}`} />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Risk Assessment</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-9">{aiAnalysis.riskExplanation}</p>
                </div>

                {/* Calorie Strategy */}
                <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Calorie Strategy</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-9">{aiAnalysis.strategicGuidance}</p>
                </div>

                {/* Weekly Check-in Protocol */}
                {aiAnalysis.weeklyWorkflow && aiAnalysis.weeklyWorkflow.length > 0 && (
                  <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Scale className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Weekly Check-in</p>
                    </div>
                    <ol className="space-y-2 pl-9">
                      {aiAnalysis.weeklyWorkflow.map((step, i) => (
                        <li key={i} className="flex gap-2 items-start">
                          <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full h-5 w-5 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <p className="text-[12px] text-muted-foreground leading-relaxed">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Training Adjustments */}
                <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Activity className="h-3.5 w-3.5 text-orange-500" />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Training Adjustments</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-9">{aiAnalysis.trainingConsiderations}</p>
                </div>

                {/* Cut Timeline */}
                <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Cut Timeline</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-9">{aiAnalysis.timeline}</p>
                </div>

                {/* Weekly Plan */}
                <div className="rounded-2xl border border-border/30 bg-muted/10 dark:bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Weekly Plan</p>
                  </div>
                  <div className="space-y-2.5 pl-9">
                    <div className="flex gap-2.5 items-start">
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 rounded-lg px-2 py-1 shrink-0 uppercase tracking-wider">Wk 1</span>
                      <p className="text-[12px] text-muted-foreground leading-relaxed pt-0.5">{aiAnalysis.weeklyPlan.week1}</p>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 rounded-lg px-2 py-1 shrink-0 uppercase tracking-wider">Wk 2</span>
                      <p className="text-[12px] text-muted-foreground leading-relaxed pt-0.5">{aiAnalysis.weeklyPlan.week2}</p>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 rounded-lg px-2 py-1 shrink-0 uppercase tracking-wider">Then</span>
                      <p className="text-[12px] text-muted-foreground leading-relaxed pt-0.5">{aiAnalysis.weeklyPlan.ongoing}</p>
                    </div>
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
            {analyzingWeight ? "Analyzing..." : <>Get AI Weight Loss Strategy{!gemsIsPremium && <span className="inline-flex items-center gap-0.5 ml-1.5 text-amber-500"><Gem className="h-3 w-3" /><span className="text-[10px] font-bold tabular-nums">{gems}</span></span>}</>}
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
              <AlertDialogTitle>Aggressive Weight Loss Goal</AlertDialogTitle>
              <AlertDialogDescription>
                This goal requires losing more than 1.5kg per week, which carries serious health risks including performance degradation, muscle loss, and metabolic damage. Please consult a doctor or sports nutritionist before following this plan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="justify-center sm:justify-center">
              <AlertDialogAction onClick={() => setUnsafeGoalDialogOpen(false)}>I understand</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>

      <ShareCardDialog open={shareOpen} onOpenChange={setShareOpen} title="Share Weight Progress" shareTitle="Weight Journey" shareText="Check out my weight progress on FightCamp Wizard">
        {({ cardRef, aspect }) => (
          <WeightTrackerCard ref={cardRef} weightLogs={weightLogs} goalWeight={profile?.fight_week_target_kg ?? profile?.goal_weight_kg} timeFilter={timeFilter} aspect={aspect} />
        )}
      </ShareCardDialog>

      <ShareCardDialog open={weighInShareOpen} onOpenChange={setWeighInShareOpen} title="Share Weigh-In Result" shareTitle="Made Weight!" shareText="I made weight on FightCamp Wizard">
        {({ cardRef, aspect }) => (
          <WeighInResultCard
            ref={cardRef}
            startWeight={weightLogs.length > 0 ? weightLogs[0].weight_kg : profile?.current_weight_kg ?? 0}
            endWeight={weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : 0}
            targetWeight={profile?.fight_week_target_kg ?? profile?.goal_weight_kg ?? 0}
            aspect={aspect}
          />
        )}
      </ShareCardDialog>
    </>
  );
}
