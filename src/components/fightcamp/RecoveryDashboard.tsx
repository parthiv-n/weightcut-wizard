import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Activity, Brain, AlertTriangle, TrendingUp, TrendingDown, Minus, BookOpen, ChevronDown, Heart, Flame, Shield, Moon, Dumbbell, Gauge, Zap, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AIPersistence } from "@/lib/aiPersistence";
import { RecoveryRing } from "./RecoveryRing";
import { StrainChart } from "./StrainChart";
import { ReadinessBreakdownCard } from "./ReadinessBreakdownCard";
import { BalanceMetricsCard } from "./BalanceMetricsCard";
import { WellnessCheckIn } from "./WellnessCheckIn";
import { RecoveryCoachChat } from "./RecoveryCoachChat";
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

function getDeterministicReadinessBadge(label: ReadinessResult['label']) {
  switch (label) {
    case 'peaked':
      return { label: "PEAKED", className: "bg-green-500/20 text-green-400 border-green-500/30", icon: TrendingUp };
    case 'ready':
      return { label: "READY", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Minus };
    case 'recovering':
      return { label: "RECOVERING", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: TrendingDown };
    case 'strained':
      return { label: "STRAINED", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: TrendingDown };
  }
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
  const baselineLoadedRef = useRef(false);

  const uniqueDays = new Set(sessions28d.map(s => s.date)).size;
  const hasEnoughData = uniqueDays >= 1;

  // Reset baselineLoadedRef when userId changes to prevent cross-account data leak
  useEffect(() => {
    baselineLoadedRef.current = false;
  }, [userId]);

  // Load baseline on mount
  useEffect(() => {
    if (baselineLoadedRef.current) return;
    baselineLoadedRef.current = true;

    loadOrComputeBaseline(userId, tdee).then(b => {
      if (b) setBaseline(b);
    }).catch(err => logger.warn("RecoveryDashboard: baseline fetch failed", { err }));

    // Check if already checked in today
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('daily_wellness_checkins')
      .select('sleep_quality, stress_level, fatigue_level, soreness_level, energy_level, motivation_level, sleep_hours, hydration_feeling, appetite_level, hooper_index')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTodayCheckedIn(true);
          setWellnessCheckIn(data as WellnessCheckInData);
        }
      }).catch(err => logger.warn("RecoveryDashboard: wellness fetch failed", { err }));

    // Count total check-in days for progress banner
    supabase
      .from('daily_wellness_checkins')
      .select('date', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count }) => {
        setCheckInDaysCount(count ?? 0);
      }).catch(err => logger.warn("RecoveryDashboard: check-in count fetch failed", { err }));

    // Fetch sleep logs (28 days) for performance engine
    const from28d = new Date();
    from28d.setDate(from28d.getDate() - 28);
    supabase
      .from('sleep_logs')
      .select('date, hours')
      .eq('user_id', userId)
      .gte('date', from28d.toISOString().split('T')[0])
      .order('date', { ascending: true })
      .then(({ data }) => {
        if (data) setSleepLogs(data);
      }).catch(err => logger.warn("RecoveryDashboard: sleep fetch failed", { err }));
  }, [userId, tdee]);

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
  }, [sessions28d, athleteProfile?.trainingFrequency, athleteProfile?.activityLevel, wellnessCheckIn, baseline, userId, sleepLogs]);

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
      {/* 1) Readiness Badge */}
      <DeterministicReadinessBadge label={metrics.readiness.label} score={metrics.readiness.score} />

      {/* 2) Readiness Ring (hero) + Strain Ring + OT Ring */}
      <div className="card-surface rounded-2xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Performance</h2>
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

        {/* Stats bar — 4 columns */}
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          <div className="text-center p-1.5 rounded-2xl bg-accent/20">
            <div className="text-sm font-bold display-number text-foreground">{metrics.weeklySessionCount}</div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Sessions/wk</div>
          </div>
          <div className={`text-center p-1.5 rounded-2xl overflow-hidden ${getLoadZoneStyle(metrics.loadZone.zone).bg}`}>
            <div className={`text-sm font-bold display-number truncate ${getLoadZoneStyle(metrics.loadZone.zone).color}`}>{metrics.loadZone.label}</div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Training Load</div>
          </div>
          <div className="text-center p-1.5 rounded-2xl bg-accent/20">
            <div className="text-sm font-bold display-number text-foreground">{metrics.sleepScore}</div>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider leading-tight">Sleep Score</div>
          </div>
          <div className="text-center p-1.5 rounded-2xl bg-accent/20">
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

      {/* 2.6) Recovery Coach Chat */}
      {!hasEnoughData ? (
        <div className="card-surface rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Recovery Coach</h2>
          </div>
          <div className="text-center py-6 text-sm text-muted-foreground">
            Log a session to unlock the coach.
          </div>
        </div>
      ) : !todayCheckedIn ? (
        <div className="card-surface rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Recovery Coach</h2>
          </div>
          <WellnessCheckIn userId={userId} onSubmit={handleWellnessSubmit} isSubmitting={false} />
        </div>
      ) : (
        <RecoveryCoachChat userId={userId} userName={profile?.full_name ?? null} />
      )}

      {/* 3) 7-Day Strain Chart with forecast */}
      <div className="card-surface rounded-2xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold">7-Day Strain Trend</h2>
        </div>
        <StrainChart strainHistory={metrics.strainHistory} forecast={metrics.forecast} />
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
            <div className={`text-lg font-bold ${getLoadZoneStyle(metrics.forecast.predictedLoadZone.zone).color}`}>{metrics.forecast.predictedLoadZone.label}</div>
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

      {/* Metrics Guide */}
      <MetricsGuide />
    </div>
  );
});

// ─── Metrics Guide ───────────────────────────────────────────
const GUIDE_SECTIONS = [
  {
    icon: Heart,
    color: "text-green-400",
    bg: "bg-green-500/10",
    title: "Readiness Score",
    range: "0 – 100",
    zones: [
      { label: "Peaked", value: "80+", color: "text-green-400" },
      { label: "Ready", value: "55–79", color: "text-blue-400" },
      { label: "Recovering", value: "35–54", color: "text-amber-400" },
      { label: "Strained", value: "< 35", color: "text-red-400" },
    ],
    description: "A composite score reflecting how prepared your body is for training. It factors in sleep quality, soreness, training load balance, recovery patterns, and consistency. Higher scores mean your body is primed for intense work.",
  },
  {
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    title: "Strain",
    range: "0 – 21",
    zones: [
      { label: "Light", value: "0–7", color: "text-green-400" },
      { label: "Moderate", value: "8–13", color: "text-blue-400" },
      { label: "Hard", value: "14–17", color: "text-amber-400" },
      { label: "All-Out", value: "18–21", color: "text-red-400" },
    ],
    description: "Measures the total cardiovascular and muscular load from your sessions using an exponential formula (RPE × duration × intensity). Diminishing returns mean it gets harder to push the score higher — just like real fatigue.",
  },
  {
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-500/10",
    title: "Overtraining Risk",
    range: "0 – 100",
    zones: [
      { label: "Low", value: "0–30", color: "text-green-400" },
      { label: "Moderate", value: "31–60", color: "text-amber-400" },
      { label: "High", value: "61–80", color: "text-orange-400" },
      { label: "Critical", value: "81+", color: "text-red-400" },
    ],
    description: "Tracks whether you're piling on too much stress too fast. Flags include spiked training loads, high average RPE, elevated soreness, consecutive high-strain days, and declining sleep. Multiple flags compound the score.",
  },
  {
    icon: BarChart3,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "Training Load & ACWR",
    range: null,
    zones: [
      { label: "Detraining", value: "< 0.8", color: "text-blue-400" },
      { label: "Optimal", value: "0.8–1.3", color: "text-green-400" },
      { label: "Pushing", value: "1.3–1.5", color: "text-amber-400" },
      { label: "Overreaching", value: "> 1.5", color: "text-red-400" },
    ],
    description: "Acute:Chronic Workload Ratio (ACWR) compares your last 7 days of training to your 28-day baseline. A spike means you've suddenly ramped up — increasing injury and fatigue risk. The sweet spot is the optimal zone where fitness improves without excessive breakdown.",
  },
  {
    icon: Moon,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    title: "Sleep Score",
    range: "0 – 100",
    zones: null,
    description: "Derived from a weighted average of your last 3 nights compared to your personal baseline. Sleep is the single biggest recovery lever — even small deficits compound over days. Tracks both duration and consistency.",
  },
  {
    icon: Dumbbell,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    title: "RPE & Soreness",
    range: "1 – 10 scale",
    zones: null,
    description: "Rate of Perceived Exertion (RPE) measures how hard a session felt. Soreness tracks delayed muscle damage. When 7-day average RPE consistently exceeds your calibrated ceiling or soreness stays above 6, the system raises overtraining flags.",
  },
  {
    icon: Gauge,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    title: "Hooper Index",
    range: "4 – 28",
    zones: null,
    description: "A validated sports science questionnaire combining sleep quality, stress, fatigue, and soreness into a single wellness number. Recorded via your daily check-in. Lower is better — rising values signal accumulating fatigue before it shows in performance.",
  },
  {
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    title: "Forecast",
    range: null,
    zones: null,
    description: "Predicts tomorrow's strain, load zone, and overtraining risk based on your current trajectory. Use it to decide whether to push hard, go moderate, or take a recovery day. The forecast adapts as you log more sessions.",
  },
  {
    icon: Brain,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Recovery Coach Chat",
    range: "1 gem per message",
    zones: null,
    description: "A conversational AI coach you can text or talk to. Tell it where you're sore, how you feel, or what session you're considering — it factors in your readiness, training load, recent sessions and a peer-reviewed combat-sports recovery library to suggest a session, flag red flags, or talk you out of overreaching. Tap the mic to dictate when supported. Free accounts get 1 message per day; Pro is unlimited.",
  },
];

function MetricsGuide() {
  const [open, setOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="card-surface rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => { setOpen(prev => !prev); if (open) setExpandedIdx(null); }}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold">Understanding Your Metrics</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed pb-2">
            Tap any metric to learn how it's calculated and what it means for your training.
          </p>
          {GUIDE_SECTIONS.map((section, idx) => {
            const Icon = section.icon;
            const isExpanded = expandedIdx === idx;
            return (
              <button
                key={section.title}
                type="button"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full text-left rounded-2xl border border-border/20 overflow-hidden transition-colors hover:bg-accent/5"
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full ${section.bg} flex items-center justify-center`}>
                      <Icon className={`h-3.5 w-3.5 ${section.color}`} />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold">{section.title}</span>
                      {section.range && (
                        <span className="text-[10px] text-muted-foreground/50 ml-2">{section.range}</span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2.5">
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{section.description}</p>
                    {section.zones && (
                      <div className="flex flex-wrap gap-1.5">
                        {section.zones.map((z) => (
                          <div key={z.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/20">
                            <span className={`text-[10px] font-bold ${z.color}`}>{z.value}</span>
                            <span className="text-[10px] text-muted-foreground">{z.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Deterministic Readiness Badge ───────────────────────────
function DeterministicReadinessBadge({ label, score }: { label: ReadinessResult['label']; score: number }) {
  const badge = getDeterministicReadinessBadge(label);
  const Icon = badge.icon;

  return (
    <div className={`flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border text-lg font-bold tracking-wide ${badge.className}`}>
      <Icon className="h-5 w-5" />
      {badge.label}
      <span className="text-sm font-normal opacity-70">{score}/100</span>
    </div>
  );
}
