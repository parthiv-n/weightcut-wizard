import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
// Lazy-load recharts wrapper so the ~100KB charts bundle defers until first paint.
const WeightTrackerChart = lazy(() => import("@/components/charts/WeightTrackerChart"));
import { format } from "date-fns";
import { TrendingDown, TrendingUp, Calendar, Target, AlertTriangle, Activity, Scale, Trash2, RefreshCw, ChevronDown, Check, CheckCircle2, Gem, Minus, Plus, Loader2 } from "lucide-react";
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
      if (weeklyLoss >= 0.5 && weeklyLoss <= 1.0) return { message: "", icon: TrendingDown, color: "text-success" };
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
    { icon: CheckCircle2, label: "Formulating strategy", color: "text-yellow-400" },
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
        <div className="px-5 sm:px-6 pt-3 max-w-2xl mx-auto">
          <AICompactOverlay
            isOpen={true}
            isGenerating={true}
            steps={aiTask.steps}
            startedAt={aiTask.startedAt}            title={aiTask.label}
            onCancel={() => aiDismiss(aiTask.id)}
          />
        </div>
      )}
      <div className="animate-page-in space-y-2.5 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">
        {/* Chart + History */}
        <div className="card-surface p-3 space-y-3">
          <div className="flex items-center justify-between">
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
            {weightLogs.length >= 2 && <ShareButton onClick={() => setShareOpen(true)} />}
          </div>
          {(() => { const chartData = getChartData(); const xTicks = chartData.length > 1 ? [chartData[0].date, chartData[chartData.length - 1].date] : chartData.map(d => d.date); return chartData.length > 0 ? (
            <>
              <Suspense fallback={<div className="h-[160px] w-full animate-pulse bg-muted/20 rounded-2xl" />}>
                <WeightTrackerChart
                  data={chartData}
                  xTicks={xTicks}
                  fightWeekTarget={profile?.fight_week_target_kg}
                  goalWeight={profile?.goal_weight_kg}
                  hasFightWeekTarget={!!profile?.fight_week_target_kg}
                  showProjected={showProjected}
                  hasAiAnalysis={!!aiAnalysis}
                  onChartClick={handleChartClick}
                />
              </Suspense>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <span className="w-3 border-t border-dashed border-primary/50" />Target
                  </span>
                  {profile?.fight_week_target_kg && (
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                      <span className="w-3 border-t border-dashed border-destructive/50" />{isFighter(profile?.goal_type) ? "Fight Night" : "Goal"}
                    </span>
                  )}
                </div>
                {aiAnalysis && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 ${showProjected ? 'text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => {
                      const next = !showProjected;
                      setShowProjected(next);
                      if (userId) localStorage.setItem(`weight_tracker_show_projected_${userId}`, JSON.stringify(next));
                    }}
                  >
                    <TrendingDown className="h-3 w-3" />
                    Projected {showProjected ? 'On' : 'Off'}
                  </Button>
                )}
              </div>
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
                  <CollapsibleContent className="pt-2">
                    <div
                      className="flex gap-2 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {weightLogs.slice().reverse().map((log) => (
                        <button
                          key={log.id}
                          onClick={() => initiateDelete(log)}
                          className="snap-start shrink-0 aspect-square w-24 flex flex-col items-center justify-center rounded-2xl bg-muted/30 border border-border/40 active:scale-95 active:bg-muted/50 transition-all"
                        >
                          <span className="text-[17px] font-bold tabular-nums text-foreground leading-none">
                            {parseFloat(log.weight_kg).toFixed(1)}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground mt-0.5">kg</span>
                          <span className="text-[10px] text-muted-foreground/70 mt-2 tabular-nums">
                            {format(new Date(log.date), "MMM dd")}
                          </span>
                          <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                            {format(new Date(log.date), "yyyy")}
                          </span>
                        </button>
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
          ); })()}
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
            {insight.message && <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.message}</p>}
          </div>
        )}

        {/* AI Analysis Loading */}
        {analyzingWeight && (
          <div className="card-surface p-5 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
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
            <div className="card-surface p-4 space-y-4 animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    {displayRiskLevel === 'green' ? 'Safe Pace' : displayRiskLevel === 'yellow' ? 'Moderate Pace' : 'Aggressive Pace'}
                  </p>
                  <p className="text-[12px] text-foreground mt-0.5">
                    {isAtOrBelowTarget ? 'At or below target, maintenance mode' : `${aiAnalysis.requiredWeeklyLoss.toFixed(2)} kg/week required`}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={getAIAnalysis} disabled={analyzingWeight} className="h-8 w-8 flex items-center justify-center rounded-2xl text-muted-foreground/40 active:text-foreground active:bg-muted/40 transition-colors" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button onClick={clearAnalysis} className="h-8 w-8 flex items-center justify-center rounded-2xl text-muted-foreground/40 active:text-destructive active:bg-destructive/10 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Now / Goal / Diff */}
              {aiAnalysisWeight !== null && aiAnalysisTarget !== null && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-muted/20 px-3 py-2.5 text-center">
                    <p className="text-[18px] font-bold tabular-nums text-foreground">{aiAnalysisWeight.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground/50">Current kg</p>
                  </div>
                  <div className="rounded-2xl bg-muted/20 px-3 py-2.5 text-center">
                    <p className="text-[18px] font-bold tabular-nums text-foreground">{aiAnalysisTarget.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground/50">Target kg</p>
                  </div>
                  <div className="rounded-2xl bg-muted/20 px-3 py-2.5 text-center">
                    {weightDiff > 0 ? (
                      <><p className="text-[18px] font-bold tabular-nums text-green-500">+{weightDiff.toFixed(1)}</p><p className="text-[10px] text-muted-foreground/50">Gain kg</p></>
                    ) : weightDiff < 0 ? (
                      <><p className="text-[18px] font-bold tabular-nums text-primary">{Math.abs(weightDiff).toFixed(1)}</p><p className="text-[10px] text-muted-foreground/50">To lose kg</p></>
                    ) : (
                      <><p className="text-[18px] font-bold tabular-nums text-green-500">0.0</p><p className="text-[10px] text-muted-foreground/50">At target</p></>
                    )}
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

                  const milestones: Array<{ week: number; expectedWeight: number; position: number; date: Date }> = [];

                  if (isLosing && aiAnalysis.requiredWeeklyLoss > 0) {
                    const totalToLose = startWeight - targetWeight;
                    const weeksToTarget = Math.max(1, Math.ceil(totalToLose / aiAnalysis.requiredWeeklyLoss));
                    const weekCount = Math.min(weeksRemaining, weeksToTarget);
                    for (let week = 1; week <= weekCount; week++) {
                      const isLast = week === weekCount;
                      const expectedWeight = isLast ? targetWeight : startWeight - (week * aiAnalysis.requiredWeeklyLoss);
                      const weightLost = startWeight - expectedWeight;
                      const position = totalToLose > 0 ? Math.min(100, Math.max(0, (weightLost / totalToLose) * 100)) : 0;
                      const date = new Date(today);
                      date.setDate(date.getDate() + week * 7);
                      milestones.push({ week, expectedWeight, position, date });
                    }
                  } else if (!isLosing) {
                    const totalToGain = targetWeight - startWeight;
                    const weeklyGain = Math.abs(aiAnalysis.requiredWeeklyLoss) || 0.2;
                    const weeksToTarget = totalToGain > 0 ? Math.max(1, Math.ceil(totalToGain / weeklyGain)) : 1;
                    const weekCount = Math.min(weeksRemaining, weeksToTarget);
                    for (let week = 1; week <= weekCount; week++) {
                      const isLast = week === weekCount;
                      const expectedWeight = isLast ? targetWeight : startWeight + (week * weeklyGain);
                      const weightGained = expectedWeight - startWeight;
                      const position = totalToGain > 0 ? Math.min(100, Math.max(0, (weightGained / totalToGain) * 100)) : 0;
                      const date = new Date(today);
                      date.setDate(date.getDate() + week * 7);
                      milestones.push({ week, expectedWeight, position, date });
                    }
                  }

                  return (
                    <div className="py-2 space-y-2">
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
                      <div className="relative h-3 bg-muted rounded-full overflow-visible">
                        <div className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                        {milestones.slice(0, -1).map(({ week, expectedWeight, position }) => (
                          <div key={week} className="absolute top-0 bottom-0 w-0.5 bg-foreground/30" style={{ left: `${position}%` }} title={`Week ${week}: ${expectedWeight.toFixed(1)} kg`} />
                        ))}
                        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full border-2 border-background shadow-sm z-10" style={{ left: `${progressPercent}%`, marginLeft: '-4px' }} />
                      </div>
                      {milestones.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1 snap-x scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {milestones.map(({ week, expectedWeight, date }) => (
                            <div
                              key={`card-${week}`}
                              className="snap-start shrink-0 w-16 flex flex-col items-center justify-center rounded-2xl bg-muted/30 border border-border/40 px-2 py-1.5"
                            >
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 leading-none">W{week}</span>
                              <span className="text-[13px] font-bold tabular-nums text-foreground leading-tight mt-1">
                                {expectedWeight.toFixed(1)}
                              </span>
                              <span className="text-[8px] text-muted-foreground/60 mt-0.5">kg</span>
                              <span className="text-[8px] text-muted-foreground/70 tabular-nums mt-0.5">
                                {format(date, "MMM dd")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Macros */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Calories", value: aiAnalysis.recommendedCalories, unit: "kcal", sub: `${aiAnalysis.calorieDeficit > 0 ? '-' : ''}${aiAnalysis.calorieDeficit} deficit`, color: "text-primary" },
                  { label: "Protein", value: aiAnalysis.proteinGrams, unit: "g", color: "text-blue-400" },
                  { label: "Carbs", value: aiAnalysis.carbsGrams, unit: "g", color: "text-orange-400" },
                  { label: "Fats", value: aiAnalysis.fatsGrams, unit: "g", color: "text-purple-400" },
                ].map((m) => (
                  <div key={m.label} className="rounded-2xl bg-muted/20 px-2 py-2.5 text-center">
                    <p className={`text-[16px] font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    <p className="text-[10px] text-foreground">{m.unit}</p>
                    {m.sub && <p className="text-[9px] text-foreground mt-0.5">{m.sub}</p>}
                  </div>
                ))}
              </div>

              {/* Apply */}
              <Button
                variant={targetsApplied ? "ghost" : "outline"}
                size="sm"
                className="w-full rounded-2xl text-xs h-9"
                disabled={applyingTargets || targetsApplied}
                onClick={applyNutritionTargets}
              >
                {targetsApplied ? <><Check className="h-3 w-3 mr-1" />Applied to Nutrition</> : applyingTargets ? "Applying..." : "Apply to Nutrition Targets"}
              </Button>

              {/* Guidance — list style */}
              <div className="space-y-0 rounded-2xl overflow-hidden border border-border/20">
                {/* Why These Targets */}
                <div className="px-3.5 py-3">
                  <p className="text-[13px] font-semibold text-primary mb-1">Why These Targets</p>
                  <p className="text-[12px] text-foreground leading-relaxed">{(aiAnalysis.reasoningExplanation || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                </div>
                {/* Strategy */}
                <div className="px-3.5 py-3 border-t border-border/10">
                  <p className="text-[13px] font-semibold text-primary mb-1">Calorie Strategy</p>
                  <p className="text-[12px] text-foreground leading-relaxed">{(aiAnalysis.strategicGuidance || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                </div>
                {/* Training */}
                <div className="px-3.5 py-3 border-t border-border/10">
                  <p className="text-[13px] font-semibold text-primary mb-1">Training</p>
                  <p className="text-[12px] text-foreground leading-relaxed">{(aiAnalysis.trainingConsiderations || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                </div>
                {/* Timeline */}
                <div className="px-3.5 py-3 border-t border-border/10">
                  <p className="text-[13px] font-semibold text-primary mb-1">Timeline</p>
                  <p className="text-[12px] text-foreground leading-relaxed">{(aiAnalysis.timeline || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                </div>
              </div>

              {/* Weekly Check-in */}
              {aiAnalysis.weeklyWorkflow && aiAnalysis.weeklyWorkflow.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">Weekly Check-in</p>
                  <div className="space-y-1.5">
                    {aiAnalysis.weeklyWorkflow.map((step: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-primary tabular-nums">{i + 1}</span>
                        </div>
                        <p className="text-[12px] text-foreground leading-relaxed">{(step || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly Plan */}
              {aiAnalysis.weeklyPlan && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">Weekly Plan</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Week 1", text: aiAnalysis.weeklyPlan.week1 },
                      { label: "Week 2", text: aiAnalysis.weeklyPlan.week2 },
                      { label: "Ongoing", text: aiAnalysis.weeklyPlan.ongoing },
                    ].map((w) => w.text ? (
                      <div key={w.label} className="rounded-2xl bg-muted/20 px-3.5 py-2.5">
                        <p className="text-[10px] font-semibold text-primary/60 mb-0.5">{w.label}</p>
                        <p className="text-[12px] text-foreground leading-relaxed">{(w.text || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Get AI Button */}
        {!aiAnalysis && profile && (
          <Button onClick={getAIAnalysis} disabled={analyzingWeight} variant="outline" className="w-full rounded-2xl h-11">
            {analyzingWeight ? "Analyzing..." : <>Get AI Weight Loss Strategy{!gemsIsPremium && <span className="inline-flex items-center gap-0.5 ml-1.5 text-muted-foreground"><Gem className="h-3 w-3" /><span className="text-[10px] font-medium tabular-nums">{gems}</span></span>}</>}
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
