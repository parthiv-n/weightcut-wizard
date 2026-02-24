import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addDays, differenceInDays, format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { computeFightWeekPlan, type FightWeekProjection } from "@/utils/fightWeekEngine";
import { WeightCutBreakdownCard } from "@/components/fightweek/WeightCutBreakdownCard";
import { DehydrationRingPanel } from "@/components/fightweek/DehydrationRingPanel";
import { ProjectionChart } from "@/components/fightweek/ProjectionChart";
import { DayTimelineCard } from "@/components/fightweek/DayTimelineCard";
import { AIAdviceCard, type FightWeekAIAdvice } from "@/components/fightweek/AIAdviceCard";
import { TrendingDown, Target, Calendar } from "lucide-react";

interface DBPlan {
  id: string;
  fight_date: string;
  starting_weight_kg: number;
  target_weight_kg: number;
}

export default function FightWeek() {
  // Inputs
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [daysUntilWeighIn, setDaysUntilWeighIn] = useState("");

  // State
  const [dbPlan, setDbPlan] = useState<DBPlan | null>(null);
  const [aiAdvice, setAiAdvice] = useState<FightWeekAIAdvice | null>(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const { userId, profile } = useUser();

  // Compute projection synchronously from inputs
  const projection: FightWeekProjection | null = useMemo(() => {
    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);
    const days = parseInt(daysUntilWeighIn);
    if (!cw || !tw || !days || cw <= tw || days < 1 || days > 14) return null;

    const sex = (profile?.sex as "male" | "female") || "male";
    return computeFightWeekPlan({ currentWeight: cw, targetWeight: tw, daysUntilWeighIn: days, sex });
  }, [currentWeight, targetWeight, daysUntilWeighIn, profile?.sex]);

  // Pre-fill from profile only if no plan exists
  useEffect(() => {
    if (profile && !dbPlan && !currentWeight && !targetWeight) {
      const cw = profile.current_weight_kg;
      const tw = profile.goal_weight_kg;
      if (cw) setCurrentWeight(cw.toString());
      if (tw) setTargetWeight(tw.toString());
    }
  }, [profile, dbPlan]);

  // Load existing plan from DB
  useEffect(() => {
    if (!userId) return;
    loadExistingPlan();
    loadPersistedAdvice();
  }, [userId]);

  // Edge function warmup
  useEffect(() => {
    const timer = setTimeout(() => {
      supabase.functions.invoke("fight-week-analysis", { method: "GET" }).catch(() => {});
    }, 2000);
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

    // Cache-first: show cached plan instantly
    const cached = localCache.get<DBPlan>(userId, "fight_week_plan");
    if (cached) {
      hydrateFromPlan(cached);
      setInitialLoading(false);
    }

    // Then refresh from DB in background
    try {
      const { data } = await withSupabaseTimeout(
        supabase
          .from("fight_week_plans")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        4000,
        "Load fight week plan"
      );

      if (data) {
        hydrateFromPlan(data);
        localCache.set(userId, "fight_week_plan", data);
      }
    } catch {
      // Timeout or network error — cached data (if any) is already showing
    } finally {
      setInitialLoading(false);
    }
  };

  const loadPersistedAdvice = () => {
    if (!userId) return;
    const persisted = AIPersistence.load(userId, "fight_week_advice");
    if (persisted) setAiAdvice(persisted);
  };

  const savePlan = async () => {
    if (!userId || !projection) return;
    setSaving(true);

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

    if (error) {
      toast({ title: "Error saving plan", description: error.message, variant: "destructive" });
    } else {
      setDbPlan(data);
      localCache.set(userId, "fight_week_plan", data);
      toast({ title: "Plan saved" });
    }
    setSaving(false);
  };

  const generateAdvice = async () => {
    if (!userId || !projection) return;
    setIsGeneratingAdvice(true);

    // Clear stale advice when generating new
    setAiAdvice(null);

    const { data, error } = await supabase.functions.invoke("fight-week-analysis", {
      body: {
        currentWeight: parseFloat(currentWeight),
        targetWeight: parseFloat(targetWeight),
        daysUntilWeighIn: parseInt(daysUntilWeighIn),
        sex: profile?.sex || "male",
        age: profile?.age,
        projection,
      },
    });

    if (error) {
      toast({ title: "AI advice unavailable", description: error.message, variant: "destructive" });
    } else if (data?.advice) {
      setAiAdvice(data.advice);
      AIPersistence.save(userId, "fight_week_advice", data.advice, 48);
    }
    setIsGeneratingAdvice(false);
  };

  // Loading skeleton
  if (initialLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const safetyBadge = projection
    ? projection.overallSafety === "green"
      ? { label: "ON TRACK", cls: "bg-green-500/10 text-green-400 border-green-500/20" }
      : projection.overallSafety === "orange"
        ? { label: "CAUTION", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" }
        : { label: "CRITICAL", cls: "bg-red-500/10 text-red-400 border-red-500/20" }
    : null;

  return (
    <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6 text-foreground">
      <div className="space-y-6">
        {/* Header + safety badge */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fight Week</h1>
            <p className="text-muted-foreground text-sm font-medium">Protocol Generator</p>
          </div>
          {safetyBadge && (
            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${safetyBadge.cls}`}>
              {safetyBadge.label}
            </div>
          )}
        </div>

        {/* Input card */}
        <div className="glass-card rounded-2xl p-5 border border-border/50 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Current (kg)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value)}
                className="h-12 rounded-xl text-center text-lg font-medium"
                placeholder="77.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Weigh-In (kg)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                className="h-12 rounded-xl text-center text-lg font-medium"
                placeholder="70.3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Days Out
              </Label>
              <Input
                type="number"
                min="1"
                max="14"
                value={daysUntilWeighIn}
                onChange={(e) => setDaysUntilWeighIn(e.target.value)}
                className="h-12 rounded-xl text-center text-lg font-medium"
                placeholder="7"
              />
            </div>
          </div>
          {projection && (
            <Button
              onClick={savePlan}
              disabled={saving}
              variant="outline"
              className="w-full h-10 rounded-xl text-sm"
            >
              {saving ? "Saving..." : dbPlan ? "Update Plan" : "Save Plan"}
            </Button>
          )}
        </div>

        {/* Everything below only shows when we have a valid projection */}
        {projection && (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card rounded-2xl p-4 border border-border/50 text-center">
                <TrendingDown className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <span className="text-2xl font-bold block">
                  {projection.totalToCut.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">kg to cut</span>
              </div>
              <div className="glass-card rounded-2xl p-4 border border-border/50 text-center">
                <Target className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <span className={`text-2xl font-bold block ${
                  projection.percentBW <= 5 ? "text-green-400" :
                  projection.percentBW <= 8 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {projection.percentBW.toFixed(1)}%
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">% bodyweight</span>
              </div>
              <div className="glass-card rounded-2xl p-4 border border-border/50 text-center">
                <Calendar className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <span className="text-2xl font-bold block">{daysUntilWeighIn}</span>
                <span className="text-[10px] text-muted-foreground uppercase">days</span>
              </div>
            </div>

            {/* Safe AWL note */}
            {projection.totalToCut > projection.maxSafeAWL && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                <p className="text-sm text-red-400">
                  Cut exceeds safe AWL of {projection.maxSafeAWL.toFixed(1)}kg for this timeline (ISSN Position 7).
                </p>
              </div>
            )}

            {/* Weight cut breakdown */}
            <WeightCutBreakdownCard
              glycogenLoss={projection.glycogenLoss}
              fibreLoss={projection.fibreLoss}
              sodiumLoss={projection.sodiumLoss}
              waterLoadingLoss={projection.waterLoadingLoss}
              dehydrationNeeded={projection.dehydrationNeeded}
              dietTotal={projection.dietTotal}
              totalToCut={projection.totalToCut}
            />

            {/* Dehydration ring */}
            <DehydrationRingPanel
              dehydrationPercentBW={projection.dehydrationPercentBW}
              dehydrationNeeded={projection.dehydrationNeeded}
              dehydrationSafety={projection.dehydrationSafety}
              saunaSessions={projection.saunaSessions}
            />

            {/* Projection chart */}
            <ProjectionChart
              timeline={projection.timeline}
              targetWeight={parseFloat(targetWeight)}
            />

            {/* Day-by-day timeline */}
            <DayTimelineCard timeline={projection.timeline} />

            {/* AI advice */}
            <AIAdviceCard
              advice={aiAdvice}
              isGenerating={isGeneratingAdvice}
              onGenerate={generateAdvice}
            />
          </>
        )}
      </div>
    </div>
  );
}
