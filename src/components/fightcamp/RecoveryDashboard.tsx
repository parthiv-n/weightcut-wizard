import { useState, useEffect, useCallback } from "react";
import { Activity, Brain, RefreshCw, AlertTriangle, CheckCircle, Loader2, TrendingUp, TrendingDown, Minus, Zap, CircleCheck, BatteryLow, Skull, Dumbbell, Grip, CircleAlert, Ban, Moon, ThumbsUp, CloudMoon, CircleX, Flame, Meh, HeartCrack, BrainCog, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AIPersistence } from "@/lib/aiPersistence";
import { RecoveryRing } from "./RecoveryRing";
import { StrainChart } from "./StrainChart";
import { computeAllMetrics, type SessionRow, type AllMetrics, type ReadinessResult } from "@/utils/performanceEngine";

interface FeelCheckIn {
  energy: 'high' | 'moderate' | 'low' | 'empty';
  soreness: 'none' | 'mild' | 'moderate' | 'severe';
  sleep: 'great' | 'ok' | 'poor' | 'terrible';
  mental: 'motivated' | 'neutral' | 'stressed' | 'burnt_out';
}

interface RecommendedSession {
  type: string;
  duration_minutes: number;
  max_rpe: number;
  notes: string;
}

interface SessionAlternative extends RecommendedSession {
  condition: string;
}

interface CoachResponse {
  readiness_state: 'push' | 'maintain' | 'reduce' | 'recover';
  coaching_summary: string;
  recommended_session?: RecommendedSession;
  alternatives?: SessionAlternative[];
  rest_day_override?: boolean;
  next_session_advice?: string; // backward compat for old cached data
  recovery_focus: string[];
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
}

interface AthleteBaseline {
  trainingFrequency: number | null;
  activityLevel: string | null;
}

interface RecoveryDashboardProps {
  sessions28d: SessionRow[];
  userId: string;
  sessionLoggedAt?: number; // counter that increments on session save
  athleteProfile?: AthleteBaseline;
}

function getStrainColor(strain: number) {
  if (strain <= 7) return { color: "#3b82f6", glow: "#3b82f6" };
  if (strain <= 14) return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" };
}

function getOTColor(zone: 'low' | 'moderate' | 'high' | 'critical') {
  if (zone === 'low') return { color: "#22c55e", glow: "#22c55e" };
  if (zone === 'moderate') return { color: "#f59e0b", glow: "#f59e0b" };
  if (zone === 'high') return { color: "#ef4444", glow: "#ef4444" };
  return { color: "#dc2626", glow: "#dc2626" }; // critical
}

function getReadinessColor(label: ReadinessResult['label']) {
  if (label === 'peaked') return { color: "#22c55e", glow: "#22c55e" };
  if (label === 'ready') return { color: "#3b82f6", glow: "#3b82f6" };
  if (label === 'recovering') return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" }; // strained
}

function getReadinessBadge(state: CoachResponse['readiness_state']) {
  switch (state) {
    case 'push':
      return { label: "PUSH", className: "bg-green-500/20 text-green-400 border-green-500/30", icon: TrendingUp };
    case 'maintain':
      return { label: "MAINTAIN", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Minus };
    case 'reduce':
      return { label: "REDUCE", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: TrendingDown };
    case 'recover':
      return { label: "RECOVER", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: TrendingDown };
  }
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

const today = new Date().toISOString().split('T')[0];
const CACHE_KEY = `fight_camp_coach_${today}`;

export function RecoveryDashboard({ sessions28d, userId, sessionLoggedAt = 0, athleteProfile }: RecoveryDashboardProps) {
  const [metrics, setMetrics] = useState<AllMetrics | null>(null);
  const [coachData, setCoachData] = useState<CoachResponse | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<Partial<FeelCheckIn>>({});

  const uniqueDays = new Set(sessions28d.map(s => s.date)).size;
  const hasEnoughData = uniqueDays >= 1;

  // Compute metrics whenever sessions change — pass profile for personalization
  useEffect(() => {
    if (sessions28d.length > 0) {
      setMetrics(computeAllMetrics(
        sessions28d,
        athleteProfile?.trainingFrequency,
        athleteProfile?.activityLevel,
      ));
    } else {
      setMetrics(computeAllMetrics([]));
    }
  }, [sessions28d, athleteProfile?.trainingFrequency, athleteProfile?.activityLevel]);

  // Load cached coach data on mount
  useEffect(() => {
    const cached = AIPersistence.load(userId, CACHE_KEY);
    if (cached) setCoachData(cached);
  }, [userId]);

  // Edge function warmup
  useEffect(() => {
    const timer = setTimeout(() => {
      supabase.functions.invoke('fight-camp-coach', { method: 'GET' }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const checkInComplete = checkIn.energy && checkIn.soreness && checkIn.sleep && checkIn.mental;

  const askCoach = useCallback(async () => {
    if (!metrics || !hasEnoughData) return;

    const checkInHash = Object.values(checkIn).sort().join('-');
    const cacheKey = checkInHash ? `${CACHE_KEY}_${checkInHash}` : CACHE_KEY;

    const cached = AIPersistence.load(userId, cacheKey);
    if (cached) {
      setCoachData(cached);
      return;
    }

    setIsCoachLoading(true);
    setCoachError(null);

    try {
      const payload = {
        strain: metrics.strain,
        dailyLoad: metrics.dailyLoad,
        acuteLoad: metrics.acuteLoad,
        chronicLoad: metrics.chronicLoad,
        loadRatio: metrics.loadRatio,
        overtrainingScore: metrics.overtrainingRisk.score,
        overtrainingZone: metrics.overtrainingRisk.zone,
        avgRPE7d: metrics.avgRPE7d,
        avgSoreness7d: metrics.avgSoreness7d,
        sessionsLast7d: metrics.sessionsLast7d,
        consecutiveHighDays: metrics.consecutiveHighDays,
        weeklySessionCount: metrics.weeklySessionCount,
        avgSleep: metrics.avgSleep,
        latestSleep: metrics.latestSleep,
        latestSoreness: metrics.latestSoreness,
        recentSessions: metrics.recentSessions.map(s => ({
          date: s.date,
          session_type: s.session_type,
          duration_minutes: s.duration_minutes,
          rpe: s.rpe,
          intensity: s.intensity,
          intensity_level: s.intensity_level,
          soreness_level: s.soreness_level,
          sleep_hours: s.sleep_hours,
        })),
        // New enhanced payload fields
        readinessScore: metrics.readiness.score,
        readinessLabel: metrics.readiness.label,
        readinessBreakdown: metrics.readiness.breakdown,
        trendAlerts: metrics.trends.alerts,
        athleteTier: metrics.calibration.tier,
        personalRpeCeiling: metrics.calibration.rpeCeiling,
        personalNormalSessions: metrics.calibration.normalSessionsPerWeek,
        sleepScore: metrics.sleepScore,
        avgSleepLast3: metrics.avgSleepLast3,
        ...(checkInComplete ? { checkIn: checkIn as FeelCheckIn } : {}),
        ...(athleteProfile ? { athleteProfile } : {}),
      };

      const { data, error } = await supabase.functions.invoke('fight-camp-coach', {
        body: payload,
      });

      if (error) throw error;
      if (data?.coach) {
        setCoachData(data.coach);
        AIPersistence.save(userId, cacheKey, data.coach, 24);
      } else {
        throw new Error("Invalid response from coach");
      }
    } catch (err: any) {
      console.error("Coach error:", err);
      const msg = err?.message || err?.error || "Unknown error";
      setCoachError(`Coach error: ${msg}`);
    } finally {
      setIsCoachLoading(false);
    }
  }, [metrics, userId, hasEnoughData, checkIn, checkInComplete, athleteProfile]);

  // Reset questionnaire when session is logged so user re-checks in
  useEffect(() => {
    if (sessionLoggedAt > 0 && metrics && hasEnoughData) {
      AIPersistence.remove(userId, CACHE_KEY);
      setCoachData(null);
      setCheckIn({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoggedAt]);

  const refreshCoach = useCallback(() => {
    AIPersistence.remove(userId, CACHE_KEY);
    setCoachData(null);
    setCheckIn({});
  }, [userId]);

  if (!metrics) return null;

  const readinessColors = getReadinessColor(metrics.readiness.label);
  const strainColors = getStrainColor(metrics.strain);
  const otColors = getOTColor(metrics.overtrainingRisk.zone);

  return (
    <div className="space-y-4 mb-6">
      {/* 1) Readiness Badge — deterministic first, AI overrides */}
      {coachData ? (
        <ReadinessBadgeUI state={coachData.readiness_state} />
      ) : (
        <DeterministicReadinessBadge label={metrics.readiness.label} score={metrics.readiness.score} />
      )}

      {/* 2) Readiness Ring (hero) + Strain Ring + OT Ring */}
      <div className="glass-card rounded-[20px] p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Performance</h2>
        </div>

        <div className="flex items-end justify-around">
          {/* Large primary readiness ring */}
          <RecoveryRing
            value={metrics.readiness.score}
            max={100}
            color={readinessColors.color}
            glowColor={readinessColors.glow}
            label="Readiness"
            size={140}
            strokeWidth={12}
            displayValue={`${metrics.readiness.score}`}
            sublabel={metrics.readiness.label}
          />
          {/* Medium strain ring */}
          <div className="flex flex-col items-center gap-3">
            <RecoveryRing
              value={metrics.strain}
              max={21}
              color={strainColors.color}
              glowColor={strainColors.glow}
              label="Strain"
              size={90}
              strokeWidth={8}
              displayValue={metrics.strain.toFixed(1)}
              sublabel="/ 21"
            />
          </div>
          {/* Small overtraining ring */}
          <div className="flex flex-col items-center gap-3">
            <RecoveryRing
              value={metrics.overtrainingRisk.score}
              max={100}
              color={otColors.color}
              glowColor={otColors.glow}
              label="Overtraining"
              size={70}
              strokeWidth={6}
              displayValue={`${Math.round(metrics.overtrainingRisk.score)}`}
              sublabel={metrics.overtrainingRisk.zone}
            />
          </div>
        </div>

        {/* Stats bar — 4 columns */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">{metrics.weeklySessionCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sessions/wk</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">{metrics.loadRatio.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Load Ratio</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">{metrics.sleepScore}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sleep Score</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">
              {metrics.avgSleepLast3 > 0 ? `${metrics.avgSleepLast3.toFixed(1)}h` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">3-Night Avg</div>
          </div>
        </div>
      </div>

      {/* 3) 7-Day Strain Chart with forecast */}
      <div className="glass-card rounded-[20px] p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">7-Day Strain Trend</h2>
        </div>
        <StrainChart strainHistory={metrics.strainHistory} forecast={metrics.forecast} />
      </div>

      {/* 3.5) Trend Alerts — only when alerts exist */}
      {metrics.trends.alerts.length > 0 && (
        <div className="glass-card rounded-[20px] p-4 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold text-amber-400">Trend Alerts</h2>
          </div>
          <ul className="space-y-1.5">
            {metrics.trends.alerts.map((alert, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-300/90">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4) Forecast Summary Card */}
      <div className="glass-card rounded-[20px] p-4 border border-border/50">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Projected Tomorrow</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold display-number text-foreground">{metrics.forecast.predictedStrain.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">Strain</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold display-number text-foreground">{metrics.forecast.predictedLoadRatio.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">Load Ratio</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold display-number text-foreground">{Math.round(metrics.forecast.predictedOvertrainingScore)}</div>
            <div className="text-[10px] text-muted-foreground">OT Score</div>
          </div>
        </div>
      </div>

      {/* 5) AI Coach Section */}
      <div className="glass-card rounded-[20px] p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">AI Recovery Coach</h2>
        </div>

        {!coachData && !isCoachLoading && (
          hasEnoughData ? (
            <FeelCheckInForm
              checkIn={checkIn}
              setCheckIn={setCheckIn}
              onSubmit={askCoach}
              isComplete={!!checkInComplete}
            />
          ) : (
            <Button
              disabled
              className="w-full rounded-2xl h-12 font-semibold gap-2"
              variant="outline"
            >
              <Brain className="h-4 w-4" />
              Log a session to unlock
            </Button>
          )
        )}

        {isCoachLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing your training data...</span>
          </div>
        )}

        {coachError && (
          <div className="text-sm text-red-400 text-center py-2">{coachError}</div>
        )}

        {coachData && <CoachResultCard coach={coachData} onRefresh={refreshCoach} />}
      </div>
    </div>
  );
}

// ─── Readiness Hero Badge (AI-driven) ────────────────────────
function ReadinessBadgeUI({ state }: { state: CoachResponse['readiness_state'] }) {
  const badge = getReadinessBadge(state);
  const Icon = badge.icon;

  return (
    <div className={`flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border text-lg font-bold tracking-wide ${badge.className}`}>
      <Icon className="h-5 w-5" />
      {badge.label}
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

// ─── Feel Check-In Form ───────────────────────────────────────
const CHECKIN_QUESTIONS: {
  key: keyof FeelCheckIn;
  label: string;
  options: { value: string; icon: LucideIcon; label: string }[];
}[] = [
  {
    key: 'energy',
    label: "How's your energy?",
    options: [
      { value: 'high', icon: Zap, label: 'Fired up' },
      { value: 'moderate', icon: CircleCheck, label: 'Normal' },
      { value: 'low', icon: BatteryLow, label: 'Drained' },
      { value: 'empty', icon: Skull, label: 'Empty' },
    ],
  },
  {
    key: 'soreness',
    label: "How sore is your body?",
    options: [
      { value: 'none', icon: Dumbbell, label: 'Fresh' },
      { value: 'mild', icon: Grip, label: 'A little tight' },
      { value: 'moderate', icon: CircleAlert, label: 'Pretty sore' },
      { value: 'severe', icon: Ban, label: 'Can barely move' },
    ],
  },
  {
    key: 'sleep',
    label: "How did you sleep?",
    options: [
      { value: 'great', icon: Moon, label: 'Slept great' },
      { value: 'ok', icon: ThumbsUp, label: 'Decent' },
      { value: 'poor', icon: CloudMoon, label: 'Rough night' },
      { value: 'terrible', icon: CircleX, label: 'Barely slept' },
    ],
  },
  {
    key: 'mental',
    label: "How's your head at?",
    options: [
      { value: 'motivated', icon: Flame, label: 'Ready to go' },
      { value: 'neutral', icon: Meh, label: 'Showing up' },
      { value: 'stressed', icon: HeartCrack, label: 'Stressed' },
      { value: 'burnt_out', icon: BrainCog, label: 'Need a break' },
    ],
  },
];

function FeelCheckInForm({
  checkIn,
  setCheckIn,
  onSubmit,
  isComplete,
}: {
  checkIn: Partial<FeelCheckIn>;
  setCheckIn: React.Dispatch<React.SetStateAction<Partial<FeelCheckIn>>>;
  onSubmit: () => void;
  isComplete: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Quick check-in so the AI can factor in how you feel</p>
      {CHECKIN_QUESTIONS.map((q) => (
        <div key={q.key}>
          <div className="text-xs font-medium text-foreground/80 mb-1.5">{q.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((opt) => {
              const selected = checkIn[q.key] === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCheckIn(prev => ({ ...prev, [q.key]: opt.value }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    selected
                      ? 'bg-primary/20 border-primary/50 text-primary shadow-sm shadow-primary/10'
                      : 'bg-accent/20 border-border/50 text-muted-foreground hover:bg-accent/40 hover:border-border/70'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${selected ? 'text-primary' : 'text-muted-foreground/70'}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Button
        onClick={onSubmit}
        disabled={!isComplete}
        className="w-full rounded-2xl h-12 font-semibold gap-2 mt-1"
        variant="outline"
      >
        <Brain className="h-4 w-4" />
        Get Coach Advice
      </Button>
    </div>
  );
}

// ─── AI Coach Result Card ─────────────────────────────────────
function CoachResultCard({ coach, onRefresh }: { coach: CoachResponse; onRefresh: () => void }) {
  const hasStructuredSession = !!coach.recommended_session;

  return (
    <div className="space-y-3">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coach Analysis</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground/90 leading-relaxed">{coach.coaching_summary}</p>

      {/* Rest day override warning */}
      {coach.rest_day_override && (
        <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/30">
          <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Rest Day Recommended
          </div>
          <p className="text-xs text-amber-300/80">Your body and mind need recovery. Skip training today — it'll pay off tomorrow.</p>
        </div>
      )}

      {/* Primary recommended session (structured) */}
      {hasStructuredSession && !coach.rest_day_override && (
        <div className="bg-primary/10 rounded-xl p-3 border border-primary/20">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recommended Session</div>
            <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">
              {coach.recommended_session!.type}
            </span>
          </div>
          <div className="flex gap-3 mb-1.5">
            <div className="text-xs text-foreground/70">
              <span className="font-semibold text-foreground">{coach.recommended_session!.duration_minutes}</span> min
            </div>
            <div className="text-xs text-foreground/70">
              Max RPE <span className="font-semibold text-foreground">{coach.recommended_session!.max_rpe}</span>
            </div>
          </div>
          <p className="text-xs text-foreground/70">{coach.recommended_session!.notes}</p>
        </div>
      )}

      {/* Alternatives */}
      {hasStructuredSession && coach.alternatives && coach.alternatives.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {coach.alternatives.map((alt, i) => (
            <div key={i} className="bg-accent/20 rounded-xl p-2.5">
              <div className="text-[10px] font-semibold text-muted-foreground mb-1">{alt.condition}</div>
              <div className="text-xs font-medium text-foreground mb-0.5">{alt.type}</div>
              <div className="text-[10px] text-foreground/60">{alt.duration_minutes}min · RPE {alt.max_rpe}</div>
              <p className="text-[10px] text-foreground/50 mt-1">{alt.notes}</p>
            </div>
          ))}
        </div>
      )}

      {/* Backward compat: old cached data with next_session_advice string */}
      {!hasStructuredSession && coach.next_session_advice && (
        <div className="bg-accent/20 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Next Session</div>
          <p className="text-sm font-medium text-foreground">{coach.next_session_advice}</p>
        </div>
      )}

      {/* Recovery focus */}
      {coach.recovery_focus?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Recovery Focus</div>
          <ul className="space-y-1">
            {coach.recovery_focus.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk flags from overtraining */}
      {coach.risk_level && coach.risk_level !== 'low' && (
        <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
          <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1 font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Risk Level: {coach.risk_level.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
