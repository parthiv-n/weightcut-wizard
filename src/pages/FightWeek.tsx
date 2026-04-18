import { useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addDays, differenceInDays, format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { withSupabaseTimeout, createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { localCache } from "@/lib/localCache";
import { computeFightWeekPlan, type FightWeekProjection, type DayProjection } from "@/utils/fightWeekEngine";
import { WeightCutBreakdownCard } from "@/components/fightweek/WeightCutBreakdownCard";
import { DehydrationRingPanel } from "@/components/fightweek/DehydrationRingPanel";
import { ProjectionChart } from "@/components/fightweek/ProjectionChart";
import { DayTimelineCard } from "@/components/fightweek/DayTimelineCard";
import { WaterLoadingCard, type WaterLoadingData } from "@/components/fightweek/WaterLoadingCard";
import { ManipulationCard, type SodiumStrategy, type FibreStrategy } from "@/components/fightweek/ManipulationCard";
import { DehydrationTacticsCard, type DehydrationTactic } from "@/components/fightweek/DehydrationTacticsCard";
import { PostWeighInCard, type PostWeighInData } from "@/components/fightweek/PostWeighInCard";
import { sanitizeAIText } from "@/lib/sanitizeAIText";
import { Activity, Shield, CheckCircle, AlertTriangle } from "lucide-react";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { FightWeekSummaryCard } from "@/components/share/cards/FightWeekSummaryCard";
import { useSubscription } from "@/hooks/useSubscription";
import { useAITask } from "@/contexts/AITaskContext";
import { AICompactOverlay } from "@/components/AICompactOverlay";

interface DBPlan {
  id: string;
  fight_date: string;
  starting_weight_kg: number;
  target_weight_kg: number;
}

export interface FightWeekAIPlan {
  summary: string;
  riskLevel: "green" | "orange" | "red";
  safetyWarning: string | null;
  breakdown: {
    totalToCut: number;
    percentBW: number;
    glycogenLoss: number;
    fibreLoss: number;
    sodiumLoss: number;
    waterLoadingLoss: number;
    dietTotal: number;
    dehydrationNeeded: number;
  };
  dehydration: {
    percentBW: number;
    safety: "green" | "orange" | "red";
    saunaSessions: number;
  };
  timeline: DayProjection[];
  // Derived client-side from bodyweight; AI no longer returns these.
  waterLoading?: WaterLoadingData;
  sodiumStrategy?: SodiumStrategy;
  fibreStrategy?: FibreStrategy;
  dehydrationTactics: DehydrationTactic[];
  postWeighIn: PostWeighInData;
  medicalRedFlags: string[];
}

/**
 * Merge an AI-produced timeline with the deterministic engine timeline.
 * AI entries win where they exist; missing days are filled from the engine
 * with a calorieTarget derived from TDEE using the same rules in the system prompt.
 */
function mergeTimelines(
  aiTimeline: DayProjection[],
  engineTimeline: DayProjection[],
  tdee: number | undefined,
): DayProjection[] {
  const byDay = new Map<number, DayProjection>();
  for (const d of aiTimeline || []) byDay.set(d.day, d);
  return engineTimeline.map((eng) => {
    const ai = byDay.get(eng.day);
    if (ai) return ai;
    const daysOutAbs = Math.abs(eng.day);
    const baseline = tdee ?? 2000;
    const calorieTarget = daysOutAbs >= 4
      ? Math.round(baseline - 400)
      : Math.max(1500, Math.round(baseline * 0.7));
    return { ...eng, calorieTarget };
  });
}

export default function FightWeek() {
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [daysUntilWeighIn, setDaysUntilWeighIn] = useState("");
  const [normalDailyCarbs, setNormalDailyCarbs] = useState("");

  const [dbPlan, setDbPlan] = useState<DBPlan | null>(null);
  const [aiPlan, setAiPlan] = useState<FightWeekAIPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { toast } = useToast();
  const { userId, profile, refreshProfile } = useUser();
  const { checkAIAccess, openNoGemsDialog, onAICallSuccess, handleAILimitError } = useSubscription();
  const { tasks: aiTasks, dismissTask: aiDismiss, addTask, completeTask, failTask } = useAITask();
  const { safeAsync, isMounted } = useSafeAsync();
  const aiAbortRef = useRef<AbortController | null>(null);

  // Deterministic strategies derived from bodyweight + research thresholds.
  // We compute these client-side instead of asking the AI, since they're simple
  // formulas (saves ~600 tokens per request and prevents LLM number-formatting bugs).
  const derivedStrategies = useMemo(() => {
    const cw = parseFloat(currentWeight);
    const days = parseInt(daysUntilWeighIn);
    if (isNaN(cw) || cw <= 0) return null;

    // Water loading: 100 ml/kg for ~3 load days, then 15 ml/kg taper, then sips on weigh-in.
    // Pull load days from the AI window so a 4-day cut still loads, a 7-day cut loads more.
    const totalDays = isNaN(days) ? 5 : days;
    const loadDays = Math.max(1, Math.min(3, totalDays - 2));
    const dailyMl = Array.from({ length: loadDays }, () => Math.round(cw * 100));
    const taperMl = Math.round(cw * 15);
    const waterLoading = {
      loadDays,
      dailyMl,
      taperMl,
      rationale: `Load at 100 ml per kg (${(cw * 100 / 1000).toFixed(1)} L) for ${loadDays} day${loadDays === 1 ? "" : "s"} to flush aldosterone, then taper to 15 ml per kg the day before weigh-in and sip only on the day. This drives ~0.8% extra body-weight loss on weigh-in morning (Reid et al.).`,
    };

    // Sodium: hold below 2300 mg/day during fight week, never below 1500 mg.
    // 2000 mg/day is the safe middle for an 80 kg fighter and scales gently with size.
    const restrictionMg = Math.max(1500, Math.min(2300, Math.round(25 * cw)));
    const sodiumStrategy = {
      restrictionMg,
      rationale: `Hold sodium under ${restrictionMg} mg per day across the cut. Don't go below 1500 mg, you still sweat sodium. Yields 0.5 to 1% body weight over 3 to 5 days (ISSN 2025).`,
    };

    // Fibre: drop under 10 g/day starting 4 days out (3 if window is short).
    const fibreStart = Math.max(2, Math.min(4, totalDays - 1));
    const fibreStrategy = {
      restrictionG: 8,
      startDaysOut: fibreStart,
      rationale: `Drop fibre under 10 g per day from D-${fibreStart} to clear gut bulk. Expect 0.4 to 0.7% body weight over 4 days, up to 1% over a full week.`,
    };

    return { waterLoading, sodiumStrategy, fibreStrategy };
  }, [currentWeight, daysUntilWeighIn]);

  // Engine projection is kept ONLY as a silent sanity check against the AI output.
  // It is never rendered directly. If the AI drifts we surface a warning banner.
  const engineProjection: FightWeekProjection | null = useMemo(() => {
    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);
    const days = parseInt(daysUntilWeighIn);
    if (isNaN(cw) || isNaN(tw) || isNaN(days) || cw <= 0 || tw <= 0 || days < 1 || cw <= tw || days > 14) return null;
    const sex = (profile?.sex as "male" | "female") || "male";
    return computeFightWeekPlan({ currentWeight: cw, targetWeight: tw, daysUntilWeighIn: days, sex });
  }, [currentWeight, targetWeight, daysUntilWeighIn, profile?.sex]);

  const inputsValid = engineProjection !== null;

  // Pre-fill from profile only if no plan exists
  useEffect(() => {
    if (profile && !dbPlan && !currentWeight && !targetWeight) {
      const cw = profile.current_weight_kg;
      const tw = profile.goal_weight_kg;
      if (cw) setCurrentWeight(cw.toString());
      if (tw) setTargetWeight(tw.toString());
    }
  }, [profile?.current_weight_kg, profile?.goal_weight_kg, dbPlan?.id]);

  // Pre-fill carbs from profile
  useEffect(() => {
    if (profile?.normal_daily_carbs_g && !normalDailyCarbs) {
      setNormalDailyCarbs(profile.normal_daily_carbs_g.toString());
    }
  }, [profile?.normal_daily_carbs_g]);

  // Hydrate from cache immediately, then refresh from DB
  useEffect(() => {
    if (!userId) return;
    const cached = localCache.get<DBPlan>(userId, "fight_week_plan");
    if (cached) {
      hydrateFromPlan(cached);
      setInitialLoading(false);
    }
    loadExistingPlan();
    loadPersistedPlan();
  }, [userId]);

  // Edge function warmup
  useEffect(() => {
    const timer = setTimeout(() => {
      supabase.functions.invoke("fight-week-analysis", { method: "GET" } as any).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const hydrateFromPlan = (plan: DBPlan) => {
    setDbPlan(plan);
    const daysLeft = Math.max(1, differenceInDays(new Date(plan.fight_date), new Date()));
    setCurrentWeight(plan.starting_weight_kg.toString());
    setTargetWeight(plan.target_weight_kg.toString());
    setDaysUntilWeighIn(Math.min(daysLeft, 14).toString());
  };

  const loadExistingPlan = async () => {
    if (!userId) return;
    try {
      const { data } = await withSupabaseTimeout(
        supabase
          .from("fight_week_plans")
          .select("id, fight_date, starting_weight_kg, target_weight_kg")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        undefined,
        "Load fight week plan"
      );
      if (!isMounted()) return;
      if (data) {
        hydrateFromPlan(data);
        localCache.set(userId, "fight_week_plan", data);
      }
    } catch {
      // Timeout/network — cached data (if any) is already showing
    } finally {
      safeAsync(setInitialLoading)(false);
    }
  };

  const loadPersistedPlan = () => {
    if (!userId) return;
    const persisted = AIPersistence.load<FightWeekAIPlan>(userId, "fight_week_plan_ai");
    if (persisted) setAiPlan(persisted);
  };

  const savePlan = async () => {
    if (!userId || !inputsValid) return;
    safeAsync(setSaving)(true);

    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);
    const days = parseInt(daysUntilWeighIn);
    const fightDate = format(addDays(new Date(), days), "yyyy-MM-dd");

    const planData = {
      user_id: userId,
      fight_date: fightDate,
      starting_weight_kg: cw,
      target_weight_kg: tw,
    };

    const { data, error } = dbPlan
      ? await supabase.from("fight_week_plans").update(planData).eq("id", dbPlan.id).select().single()
      : await supabase.from("fight_week_plans").insert(planData).select().single();

    if (!isMounted()) return;

    if (error) {
      toast({ title: "Error saving plan", description: error.message, variant: "destructive" });
    } else {
      setDbPlan(data);
      localCache.set(userId, "fight_week_plan", data);
    }
    setSaving(false);
  };

  const generateProtocol = async () => {
    if (!userId || !inputsValid) return;

    if (!checkAIAccess()) {
      openNoGemsDialog();
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    safeAsync(setIsGenerating)(true);
    safeAsync(setAiPlan)(null);

    const taskId = addTask({
      id: `fight-week-${Date.now()}`,
      type: "fight-week",
      label: "Building Fight Week Protocol",
      steps: [
        { icon: Activity, label: "Reading your profile" },
        { icon: Shield, label: "Applying ISSN research" },
        { icon: CheckCircle, label: "Generating day-by-day plan" },
      ],
      returnPath: "/weight-cut",
    });

    const carbs = parseInt(normalDailyCarbs);

    try {
      const { data, error } = await supabase.functions.invoke("fight-week-analysis", {
        body: {
          currentWeight: parseFloat(currentWeight),
          targetWeight: parseFloat(targetWeight),
          daysUntilWeighIn: parseInt(daysUntilWeighIn),
          normalDailyCarbs: isNaN(carbs) ? null : carbs,
          profile: {
            sex: profile?.sex,
            age: profile?.age,
            height_cm: profile?.height_cm,
            current_weight_kg: profile?.current_weight_kg,
            goal_weight_kg: profile?.goal_weight_kg,
            fight_week_target_kg: profile?.fight_week_target_kg,
            tdee: profile?.tdee,
            bmr: profile?.bmr,
            activity_level: profile?.activity_level,
            training_frequency: profile?.training_frequency,
            goal_type: profile?.goal_type,
            target_date: profile?.target_date,
            ai_recommended_calories: profile?.ai_recommended_calories,
            ai_recommended_protein_g: profile?.ai_recommended_protein_g,
            ai_recommended_carbs_g: profile?.ai_recommended_carbs_g,
            ai_recommended_fats_g: profile?.ai_recommended_fats_g,
            normal_daily_carbs_g: profile?.normal_daily_carbs_g,
          },
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      if (!isMounted()) return;

      if (error) {
        if (await handleAILimitError(error)) { failTask(taskId, "Limit reached"); return; }
        const msg = await extractEdgeFunctionError(error, "Protocol generation unavailable");
        failTask(taskId, msg);
        toast({ title: "Protocol unavailable", description: msg, variant: "destructive" });
      } else if (data?.plan) {
        onAICallSuccess();
        const plan = data.plan as FightWeekAIPlan;

        // Safety net: if the AI returned fewer timeline days than requested,
        // merge with the deterministic engine so the UI always shows the full plan.
        if (engineProjection && Array.isArray(plan.timeline)) {
          plan.timeline = mergeTimelines(plan.timeline, engineProjection.timeline, profile?.tdee);
        }

        setAiPlan(plan);
        // Persist effectively forever (1 year). The plan only clears when the user regenerates.
        AIPersistence.save(userId, "fight_week_plan_ai", plan, 24 * 365);
        completeTask(taskId, plan);

        // Persist the carbs baseline so next visit pre-fills it
        if (!isNaN(carbs) && carbs !== profile?.normal_daily_carbs_g) {
          supabase.from("profiles").update({ normal_daily_carbs_g: carbs }).eq("id", userId).then(() => {
            refreshProfile();
          });
        }

        // Silently persist the weights/days so they auto-rehydrate next visit.
        // Previously this was behind a manual "Save Plan" button which is now gone.
        savePlan();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      failTask(taskId, err?.message || "Something went wrong");
      toast({ title: "Protocol unavailable", description: err?.message || "Something went wrong", variant: "destructive" });
    } finally {
      safeAsync(setIsGenerating)(false);
    }
  };

  // Sanity check: does the AI plan drift from the deterministic engine?
  const sanityWarning = useMemo(() => {
    if (!aiPlan || !engineProjection) return null;
    const aiTotal = aiPlan.breakdown.totalToCut;
    const engTotal = engineProjection.totalToCut;
    const drift = Math.abs(aiTotal - engTotal) / Math.max(engTotal, 0.1);
    if (aiTotal > engineProjection.maxSafeAWL) {
      return `This plan targets ${aiTotal.toFixed(1)}kg, above the ${engineProjection.maxSafeAWL.toFixed(1)}kg ISSN safe threshold for ${daysUntilWeighIn} days. Review carefully.`;
    }
    if (drift > 0.2) {
      return `The AI projection (${aiTotal.toFixed(1)}kg) differs from our calculator (${engTotal.toFixed(1)}kg). Review the breakdown.`;
    }
    return null;
  }, [aiPlan, engineProjection, daysUntilWeighIn]);

  // Build a projection-shaped object for the share card reuse.
  const shareProjection: FightWeekProjection | null = useMemo(() => {
    if (!aiPlan) return engineProjection;
    const percentBW = aiPlan.breakdown.percentBW;
    const safety = aiPlan.riskLevel;
    return {
      totalToCut: aiPlan.breakdown.totalToCut,
      glycogenLoss: aiPlan.breakdown.glycogenLoss,
      fibreLoss: aiPlan.breakdown.fibreLoss,
      sodiumLoss: aiPlan.breakdown.sodiumLoss,
      waterLoadingLoss: aiPlan.breakdown.waterLoadingLoss,
      dietTotal: aiPlan.breakdown.dietTotal,
      dehydrationNeeded: aiPlan.breakdown.dehydrationNeeded,
      dehydrationPercentBW: aiPlan.dehydration.percentBW,
      dehydrationSafety: aiPlan.dehydration.safety,
      overallSafety: safety,
      maxSafeAWL: engineProjection?.maxSafeAWL ?? aiPlan.breakdown.totalToCut,
      percentBW,
      saunaSessions: aiPlan.dehydration.saunaSessions,
      timeline: aiPlan.timeline,
    };
  }, [aiPlan, engineProjection]);

  const handleAICancel = () => {
    aiAbortRef.current?.abort();
    safeAsync(setIsGenerating)(false);
  };

  if (initialLoading) {
    return (
      <div className="space-y-2.5">
        <div className="space-y-1">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="card-surface rounded-2xl p-3 border border-border space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9 w-full rounded-2xl" />
            <Skeleton className="h-9 w-full rounded-2xl" />
            <Skeleton className="h-9 w-full rounded-2xl" />
            <Skeleton className="h-9 w-full rounded-2xl" />
          </div>
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  const safetyBadge = aiPlan
    ? aiPlan.riskLevel === "green"
      ? { label: "ON TRACK", cls: "bg-green-500/10 text-green-400 border-green-500/20" }
      : aiPlan.riskLevel === "orange"
        ? { label: "CAUTION", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" }
        : { label: "CRITICAL", cls: "bg-red-500/10 text-red-400 border-red-500/20" }
    : null;

  const fwAiTask = aiTasks.find(t => t.status === "running" && t.type === "fight-week");

  return (
    <div className="space-y-2.5 text-foreground">
      {fwAiTask && (
        <AICompactOverlay
          isOpen={true}
          isGenerating={true}
          steps={fwAiTask.steps}
          startedAt={fwAiTask.startedAt}
          title={fwAiTask.label}
          onCancel={() => aiDismiss(fwAiTask.id)}
        />
      )}
      <div className="space-y-2.5">
        {/* Header + safety badge */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Fight Week</h1>
            <p className="text-muted-foreground text-xs font-medium">Protocol Generator</p>
          </div>
          <div className="flex items-center gap-2">
            {aiPlan && <ShareButton onClick={() => setShareOpen(true)} />}
            {safetyBadge && (
              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${safetyBadge.cls}`}>
                {safetyBadge.label}
              </div>
            )}
          </div>
        </div>

        {/* Input card */}
        <div className="card-surface rounded-2xl p-3 border border-border space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Current (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value)}
                className="h-9 rounded-2xl text-center text-sm font-medium"
                placeholder="77.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Weigh-In (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                className="h-9 rounded-2xl text-center text-sm font-medium"
                placeholder="70.3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Out</Label>
              <Input
                type="number"
                min="1"
                max="14"
                value={daysUntilWeighIn}
                onChange={(e) => setDaysUntilWeighIn(e.target.value)}
                className="h-9 rounded-2xl text-center text-sm font-medium"
                placeholder="7"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Carbs/day (g)</Label>
              <Input
                type="number"
                min="0"
                step="10"
                value={normalDailyCarbs}
                onChange={(e) => setNormalDailyCarbs(e.target.value)}
                className="h-9 rounded-2xl text-center text-sm font-medium"
                placeholder="250"
              />
            </div>
          </div>
          {inputsValid && (
            <div className="flex justify-center">
              <Button
                onClick={generateProtocol}
                disabled={isGenerating || !normalDailyCarbs}
                className="h-9 rounded-2xl text-sm px-6"
              >
                {isGenerating ? "Generating..." : aiPlan ? "Regenerate" : "Generate Protocol"}
              </Button>
            </div>
          )}
        </div>

        {/* Nothing below renders until the AI returns a plan */}
        {aiPlan && (
          <>
            {/* Summary narrative */}
            <div className="card-surface rounded-2xl border border-border/50 p-4">
              <p className="text-sm text-foreground/90 leading-relaxed">{sanitizeAIText(aiPlan.summary)}</p>
            </div>

            {/* Sanity-check banner */}
            {sanityWarning && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-200 leading-relaxed">{sanityWarning}</p>
              </div>
            )}

            {/* Summary tiles */}
            <div className="grid grid-cols-3 gap-2">
              <div className="card-surface rounded-2xl p-2.5 border border-border text-center">
                <span className="text-lg font-bold block">{aiPlan.breakdown.totalToCut.toFixed(1)}</span>
                <span className="text-[9px] text-muted-foreground uppercase">kg to cut</span>
              </div>
              <div className="card-surface rounded-2xl p-2.5 border border-border text-center">
                <span className={`text-lg font-bold block ${
                  aiPlan.breakdown.percentBW <= 5 ? "text-green-400" :
                  aiPlan.breakdown.percentBW <= 8 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {aiPlan.breakdown.percentBW.toFixed(1)}%
                </span>
                <span className="text-[9px] text-muted-foreground uppercase">% bodyweight</span>
              </div>
              <div className="card-surface rounded-2xl p-2.5 border border-border text-center">
                <span className="text-lg font-bold block">{daysUntilWeighIn}</span>
                <span className="text-[9px] text-muted-foreground uppercase">days</span>
              </div>
            </div>

            {/* Safety warning */}
            {aiPlan.safetyWarning && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300 leading-relaxed">{sanitizeAIText(aiPlan.safetyWarning)}</p>
              </div>
            )}

            <WeightCutBreakdownCard
              glycogenLoss={aiPlan.breakdown.glycogenLoss}
              fibreLoss={aiPlan.breakdown.fibreLoss}
              sodiumLoss={aiPlan.breakdown.sodiumLoss}
              waterLoadingLoss={aiPlan.breakdown.waterLoadingLoss}
              dehydrationNeeded={aiPlan.breakdown.dehydrationNeeded}
              dietTotal={aiPlan.breakdown.dietTotal}
              totalToCut={aiPlan.breakdown.totalToCut}
            />

            <DehydrationRingPanel
              dehydrationPercentBW={aiPlan.dehydration.percentBW}
              dehydrationNeeded={aiPlan.breakdown.dehydrationNeeded}
              dehydrationSafety={aiPlan.dehydration.safety}
              saunaSessions={aiPlan.dehydration.saunaSessions}
            />

            {aiPlan.timeline.length > 0 && (
              <ProjectionChart
                timeline={aiPlan.timeline}
                targetWeight={parseFloat(targetWeight)}
              />
            )}

            <DayTimelineCard timeline={aiPlan.timeline} />

            {derivedStrategies && (
              <>
                <WaterLoadingCard data={derivedStrategies.waterLoading} />
                <ManipulationCard sodium={derivedStrategies.sodiumStrategy} fibre={derivedStrategies.fibreStrategy} />
              </>
            )}

            <DehydrationTacticsCard tactics={aiPlan.dehydrationTactics} />

            <PostWeighInCard data={aiPlan.postWeighIn} />

            {aiPlan.medicalRedFlags?.length > 0 && (
              <div className="card-surface rounded-2xl border border-red-500/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider">Stop if you see any of these</h3>
                </div>
                <ul className="space-y-1">
                  {aiPlan.medicalRedFlags.map((flag, i) => (
                    <li key={i} className="text-[12px] text-muted-foreground flex gap-2 leading-relaxed">
                      <span className="text-red-400 mt-0.5">·</span>
                      {sanitizeAIText(flag)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {aiPlan && shareProjection && (
        <ShareCardDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Share Fight Week"
          shareTitle="Fight Week Plan"
          shareText="Check out my weight cut protocol on FightCamp Wizard"
        >
          {({ cardRef, aspect }) => (
            <FightWeekSummaryCard
              ref={cardRef}
              projection={shareProjection}
              currentWeight={parseFloat(currentWeight)}
              targetWeight={parseFloat(targetWeight)}
              daysOut={parseInt(daysUntilWeighIn)}
              aspect={aspect}
            />
          )}
        </ShareCardDialog>
      )}
    </div>
  );
}
