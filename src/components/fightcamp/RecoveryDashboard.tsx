import { useState, useEffect, useCallback, useRef, useMemo, memo, lazy, Suspense } from "react";
import { Activity, Brain, AlertTriangle, HelpCircle } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { AIPersistence } from "@/lib/aiPersistence";
import { RecoveryRing } from "./RecoveryRing";
// Lazy-load the recharts-backed StrainChart so the ~100KB charts bundle defers until first paint.
const StrainChart = lazy(() => import("./StrainChart").then(m => ({ default: m.StrainChart })));
import { ReadinessBreakdownCard } from "./ReadinessBreakdownCard";
import { BalanceMetricsCard } from "./BalanceMetricsCard";
import { WellnessCheckIn } from "./WellnessCheckIn";
import { RecoveryCoachChat } from "./RecoveryCoachChat";
import { DailyVerdictCard, BaselineConfidencePill } from "./DailyVerdict";
import { WeeklyLoadPlan } from "./WeeklyLoadPlan";
import { RecoveryHelpSheet } from "./RecoveryHelpSheet";
import { computeAllMetrics, type SessionRow, type AllMetrics, type ReadinessResult, type WellnessCheckIn as WellnessCheckInData, type PersonalBaseline } from "@/utils/performanceEngine";
import { loadOrComputeBaseline, computeAndStoreBaseline, storeReadinessScore } from "@/utils/baselineComputer";
import { useUser } from "@/contexts/UserContext";
import { logger } from "@/lib/logger";

interface AthleteBaseline {
  trainingFrequency: number | null;
  activityLevel: string | null;
  sex?: string | null;
  age?: number | null;
}

interface RecoveryDashboardProps {
  sessions28d: SessionRow[];
  userId: string;
  sessionLoggedAt?: number; // counter that increments on session save
  athleteProfile?: AthleteBaseline;
  tdee?: number | null;
}

function getStrainColor(strain: number) {
  if (strain <= 7) return { color: "hsl(var(--primary))", glow: "hsl(var(--primary))" };
  if (strain <= 14) return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" };
}

function getOTColor(zone: 'low' | 'moderate' | 'high' | 'critical') {
  if (zone === 'low') return { color: "#22c55e", glow: "#22c55e" };
  if (zone === 'moderate') return { color: "#f59e0b", glow: "#f59e0b" };
  if (zone === 'high') return { color: "#ef4444", glow: "#ef4444" };
  return { color: "#dc2626", glow: "#dc2626" }; // critical
}

function getLoadZoneStyle(zone: string) {
  switch (zone) {
    case 'optimal':
      return { color: 'text-green-400', bg: 'bg-green-500/20' };
    case 'detraining':
      return { color: 'text-blue-400', bg: 'bg-blue-500/20' };
    case 'pushing':
      return { color: 'text-amber-400', bg: 'bg-amber-500/20' };
    case 'overreaching':
      return { color: 'text-red-400', bg: 'bg-red-500/20' };
    default:
      return { color: 'text-muted-foreground', bg: 'bg-accent/20' };
  }
}

function getReadinessColor(label: ReadinessResult['label']) {
  if (label === 'peaked') return { color: "#22c55e", glow: "#22c55e" };
  if (label === 'ready') return { color: "hsl(var(--primary))", glow: "hsl(var(--primary))" };
  if (label === 'recovering') return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" }; // strained
}

export const RecoveryDashboard = memo(function RecoveryDashboard({ sessions28d, userId, athleteProfile, tdee }: RecoveryDashboardProps) {
  const { profile } = useUser();
  const [metrics, setMetrics] = useState<AllMetrics | null>(null);

  // Enhanced wellness state
  const [wellnessCheckIn, setWellnessCheckIn] = useState<WellnessCheckInData | null>(null);
  const [baseline, setBaseline] = useState<PersonalBaseline | null>(null);
  const [todayCheckedIn, setTodayCheckedIn] = useState(false);
  const [checkInDaysCount, setCheckInDaysCount] = useState(0);
  const [sleepLogs, setSleepLogs] = useState<{ date: string; hours: number }[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const baselineLoadedRef = useRef(false);

  const uniqueDays = new Set(sessions28d.map(s => s.date)).size;
  const hasEnoughData = uniqueDays >= 1;

  // ── Live-reactive Convex subscriptions for wellness + sleep ──
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const from28dStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString().split('T')[0];
  }, []);

  // Today's wellness check-in (last 1 day window — `.unique()` enforced server-side).
  const checkinsRows = useQuery(api.wellness.listCheckins, userId ? { from: todayStr, to: todayStr, limit: 1 } : "skip");
  // Total lifetime check-in count for the "consistency" metric. listCheckins
  // caps to 90 by default which matches the prior estimate-count behaviour
  // well enough for beta — past 90d the gradient flattens anyway.
  const checkinHistoryRows = useQuery(api.wellness.listCheckins, userId ? { limit: 90 } : "skip");
  // 28d sleep logs.
  const sleepRows = useQuery(api.sleep_logs.listForUser, userId ? { limit: 90 } : "skip");

  // Reset baselineLoadedRef when userId changes to prevent cross-account data leak
  useEffect(() => {
    baselineLoadedRef.current = false;
  }, [userId]);

  // Load baseline once on mount (still a one-shot — baseline computation is
  // synchronous against the in-memory data and doesn't need to be reactive).
  useEffect(() => {
    if (baselineLoadedRef.current) return;
    baselineLoadedRef.current = true;
    loadOrComputeBaseline(userId, tdee)
      .then((b) => { if (b) setBaseline(b); })
      .catch((err) => logger.warn("RecoveryDashboard: baseline fetch failed", { err }));
  }, [userId, tdee]);

  // Apply Convex subscription results to local state. Convex returns undefined
  // until the first query lands; treat that as "still loading" and don't churn
  // dependent state.
  useEffect(() => {
    if (!checkinsRows) return;
    const todayRow: any = checkinsRows[0];
    if (todayRow) {
      setTodayCheckedIn(true);
      setWellnessCheckIn({
        sleep_quality: todayRow.sleepQuality,
        fatigue_level: todayRow.fatigueLevel,
        soreness_level: todayRow.sorenessLevel,
        stress_level: todayRow.stressLevel,
        energy_level: todayRow.energyLevel,
        motivation_level: todayRow.motivationLevel,
        sleep_hours: todayRow.sleepHours,
        hydration_feeling: todayRow.hydrationFeeling,
        appetite_level: todayRow.appetiteLevel,
        hooper_index: todayRow.hooperIndex,
      } as WellnessCheckInData);
    }
  }, [checkinsRows]);

  useEffect(() => {
    if (!checkinHistoryRows) return;
    setCheckInDaysCount(checkinHistoryRows.length);
  }, [checkinHistoryRows]);

  useEffect(() => {
    if (!sleepRows) return;
    const filtered = sleepRows
      .filter((r: any) => r.date >= from28dStr)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((r: any) => ({ date: r.date, hours: r.hours }));
    setSleepLogs(filtered);
  }, [sleepRows, from28dStr]);

  // Stable fingerprint for sessions28d so the metrics effect doesn't re-fire
  // every Convex tick when the parent re-renders with a fresh-but-equivalent
  // array reference. Joining id+date+updatedAt is enough: any meaningful
  // session change touches one of those fields.
  const sessions28dFingerprint = useMemo(
    () => sessions28d.map((s: any) => `${s.id ?? s._id ?? ''}:${s.date ?? ''}:${s.updatedAt ?? s.updated_at ?? ''}`).join('|'),
    [sessions28d],
  );

  // Compute metrics whenever sessions or wellness data changes
  useEffect(() => {
    const prevReadiness: number | null = AIPersistence.load(userId, 'prev_readiness');

    if (sessions28d.length > 0) {
      setMetrics(computeAllMetrics(
        sessions28d,
        athleteProfile?.trainingFrequency,
        athleteProfile?.activityLevel,
        wellnessCheckIn,
        baseline,
        prevReadiness,
        sleepLogs,
      ));
    } else {
      setMetrics(computeAllMetrics(
        [],
        undefined,
        undefined,
        wellnessCheckIn,
        baseline,
        prevReadiness,
        sleepLogs,
      ));
    }
    // sessions28d intentionally excluded — sessions28dFingerprint is the
    // stable proxy. Same for sleepLogs (driven by sleepRows query).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions28dFingerprint, athleteProfile?.trainingFrequency, athleteProfile?.activityLevel, wellnessCheckIn, baseline, userId, sleepLogs]);

  // Store readiness for autoregressive smoothing when it changes (deduplicated)
  const lastStoredScoreRef = useRef<number | null>(null);
  useEffect(() => {
    const score = metrics?.readiness.score;
    if (score == null) return;
    // Only write if score actually changed (avoids duplicate PATCH calls)
    if (lastStoredScoreRef.current === score) return;
    lastStoredScoreRef.current = score;

    AIPersistence.save(userId, 'prev_readiness', score, 48);

    // Write back to check-in row if we checked in today
    if (todayCheckedIn) {
      const today = new Date().toISOString().split('T')[0];
      storeReadinessScore(userId, today, score);
    }
  }, [metrics?.readiness.score, userId, todayCheckedIn]);

  // Handle wellness check-in submission
  const handleWellnessSubmit = useCallback(async (data: WellnessCheckInData) => {
    setWellnessCheckIn(data);
    setTodayCheckedIn(true);
    setCheckInDaysCount(prev => prev + 1);

    // Recompute baseline in background after submission
    computeAndStoreBaseline(userId, tdee).then(b => {
      if (b) setBaseline(b);
    }).catch(() => {});
  }, [userId, tdee]);

  if (!metrics) return null;

  const readinessColors = getReadinessColor(metrics.readiness.label);
  const strainColors = getStrainColor(metrics.strain);
  const otColors = getOTColor(metrics.overtrainingRisk.zone);

  return (
    <div className="space-y-4 mb-6">
      {/* 1) Daily Verdict — the single most important call to action: push,
          steady, easy, or recover. Combines readiness, OT risk, and load
          zone into one decisive line so the user knows what to do right now. */}
      <DailyVerdictCard metrics={metrics} baseline={baseline} checkedInToday={todayCheckedIn} />

      {/* 2) Baseline confidence — tells the user how personalised the score is
          today. Green when their personal baseline is fully active. */}
      <BaselineConfidencePill baseline={baseline} totalCheckInDays={checkInDaysCount} />

      {/* 3) Performance — Readiness, Strain, OT Risk rings + 4-cell stats */}
      <div className="card-surface rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Performance</h2>
          </div>
          {/* Single ? button — opens the full explainer sheet. Replaces the
              old bottom-of-page accordion so the help is one tap away from
              the metric the user is actually looking at. */}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="How to read this page"
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/70 active:text-foreground active:bg-muted/40 transition-colors"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex justify-center">
            <RecoveryRing
              value={metrics.readiness.score}
              max={100}
              color={readinessColors.color}
              glowColor={readinessColors.glow}
              label="Readiness"
              size={95}
              strokeWidth={9}
              displayValue={`${metrics.readiness.score}`}
              sublabel={metrics.readiness.label}
            />
          </div>
          <div className="flex justify-center">
            <RecoveryRing
              value={metrics.strain}
              max={21}
              color={strainColors.color}
              glowColor={strainColors.glow}
              label="Strain"
              size={95}
              strokeWidth={9}
              displayValue={metrics.strain.toFixed(1)}
              sublabel="/ 21"
            />
          </div>
          <div className="flex justify-center">
            <RecoveryRing
              value={metrics.overtrainingRisk.score}
              max={100}
              color={otColors.color}
              glowColor={otColors.glow}
              label="OT Risk"
              size={95}
              strokeWidth={9}
              displayValue={`${Math.round(metrics.overtrainingRisk.score)}`}
              sublabel={metrics.overtrainingRisk.zone}
            />
          </div>
        </div>

        {/* Stats bar — 4 columns, just text, no background pills */}
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          <div className="text-center">
            <div className="text-sm font-bold display-number text-foreground">{metrics.weeklySessionCount}</div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Sessions/wk</div>
          </div>
          <div className="text-center">
            {/* Suppress the Heavy/Spike/Low label while the cold-start guard
                says ACWR isn't meaningful yet; otherwise a single logged
                session reads as "Spike" in red, which it isn't. */}
            {metrics.loadConfidence.isReliable ? (
              <div className={`text-sm font-bold display-number truncate ${getLoadZoneStyle(metrics.loadZone.zone).color}`}>{metrics.loadZone.label}</div>
            ) : (
              <div className="text-sm font-bold display-number truncate text-muted-foreground">Building</div>
            )}
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Training Load</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold display-number text-foreground">{metrics.sleepScore}</div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Sleep Score</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold display-number text-foreground">
              {metrics.avgSleepLast3 > 0 ? `${metrics.avgSleepLast3.toFixed(1)}h` : "—"}
            </div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">3-Night Avg</div>
          </div>
        </div>
      </div>

      {/* 2.5) Readiness Breakdown Card (toggleable) */}
      <ReadinessBreakdownCard
        breakdown={metrics.readiness.breakdown}
        totalCheckInDays={checkInDaysCount}
      />

      {/* 2.6) Wellness check-in (becomes Recovery Coach chat once submitted).
          Pre-check-in title is "Daily check-in" since that's what's actually
          on screen; the coach unlocks only after the user has fed it today's
          signals so its advice has something to anchor on. */}
      {!hasEnoughData ? (
        <div className="card-surface rounded-3xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Recovery Coach</h2>
          </div>
          <div className="text-center py-6 text-sm text-muted-foreground">
            Log a session to unlock the coach.
          </div>
        </div>
      ) : !todayCheckedIn ? (
        <div className="card-surface rounded-3xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">Daily check-in</h2>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">~20 sec</span>
          </div>
          <WellnessCheckIn userId={userId} onSubmit={handleWellnessSubmit} isSubmitting={false} />
        </div>
      ) : (
        <RecoveryCoachChat userId={userId} userName={profile?.full_name ?? null} />
      )}

      {/* 4) Weekly load plan — past days are dimmed actuals, today is ringed,
          remaining days are a suggested intent (rest/easy/steady/hard) chosen
          to keep ACWR landing in the 0.8-1.3 sweet spot by Sunday. */}
      <WeeklyLoadPlan metrics={metrics} />

      {/* 5) 7-Day Strain Chart with forecast */}
      <div className="card-surface rounded-2xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold">7-Day Strain Trend</h2>
        </div>
        <Suspense fallback={<div className="h-[180px] w-full animate-pulse bg-muted/20 rounded-2xl" />}>
          <StrainChart strainHistory={metrics.strainHistory} forecast={metrics.forecast} />
        </Suspense>
      </div>

      {/* 4) Forecast Summary Card */}
      <div className="card-surface rounded-2xl p-4 border border-border">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Projected Tomorrow</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold display-number text-foreground">{metrics.forecast.predictedStrain.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">Strain</div>
          </div>
          <div className="text-center">
            {metrics.loadConfidence.isReliable ? (
              <div className={`text-lg font-bold ${getLoadZoneStyle(metrics.forecast.predictedLoadZone.zone).color}`}>{metrics.forecast.predictedLoadZone.label}</div>
            ) : (
              <div className="text-lg font-bold text-muted-foreground">Building</div>
            )}
            <div className="text-[10px] text-muted-foreground">Training Load</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold display-number text-foreground">{Math.round(metrics.forecast.predictedOvertrainingScore)}</div>
            <div className="text-[10px] text-muted-foreground">OT Score</div>
          </div>
        </div>
      </div>

      {/* 4.5) Caloric Deficit Banner — when deficit significantly impacts recovery */}
      {metrics.deficitImpactScore != null && metrics.deficitImpactScore < 60 && baseline?.avg_deficit_7d != null && (
        <div className="card-surface rounded-2xl p-3 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-400">
                Caloric Deficit Impacting Recovery
              </p>
              <p className="text-[10px] text-amber-300/70 mt-0.5">
                {Math.abs(baseline.avg_deficit_7d).toFixed(0)}kcal avg deficit (7d) — recovery impact score {metrics.deficitImpactScore}/100
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5) Balance Metrics Card (only when baseline has 14+ days) */}
      {metrics.balanceMetrics && metrics.balanceMetrics.length > 0 && (
        <BalanceMetricsCard balanceMetrics={metrics.balanceMetrics} />
      )}

      {/* Single help sheet — triggered from the ? on the Performance card. */}
      <RecoveryHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
});

