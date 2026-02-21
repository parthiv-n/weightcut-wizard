import { useState, useEffect, useCallback } from "react";
import { Activity, Brain, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AIPersistence } from "@/lib/aiPersistence";
import { RecoveryRing } from "./RecoveryRing";
import { computeAllMetrics, type SessionRow, type AllMetrics } from "@/utils/recoveryCalculations";

interface CoachResponse {
  readiness_state: 'ready_to_train' | 'train_light' | 'rest_recommended';
  summary: string;
  next_session_recommendation: string;
  recovery_focus: string[];
  risk_flags: string[];
}

interface RecoveryDashboardProps {
  sessions28d: SessionRow[];
  userId: string;
}

function getStrainColor(strain: number) {
  if (strain <= 7) return { color: "#3b82f6", glow: "#3b82f6" }; // blue
  if (strain <= 14) return { color: "#f59e0b", glow: "#f59e0b" }; // amber
  return { color: "#ef4444", glow: "#ef4444" }; // red
}

function getRecoveryColor(status: 'green' | 'yellow' | 'red') {
  if (status === 'green') return { color: "#22c55e", glow: "#22c55e" };
  if (status === 'yellow') return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" };
}

function getRiskColor(level: 'low' | 'moderate' | 'high') {
  if (level === 'low') return { color: "#22c55e", glow: "#22c55e" };
  if (level === 'moderate') return { color: "#f59e0b", glow: "#f59e0b" };
  return { color: "#ef4444", glow: "#ef4444" };
}

function getRiskValue(level: 'low' | 'moderate' | 'high') {
  if (level === 'low') return 33;
  if (level === 'moderate') return 66;
  return 100;
}

function getReadinessBadge(state: CoachResponse['readiness_state']) {
  switch (state) {
    case 'ready_to_train':
      return { label: "Ready to Train", className: "bg-green-500/20 text-green-400 border-green-500/30" };
    case 'train_light':
      return { label: "Train Light", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
    case 'rest_recommended':
      return { label: "Rest Recommended", className: "bg-red-500/20 text-red-400 border-red-500/30" };
  }
}

const today = new Date().toISOString().split('T')[0];
const CACHE_KEY = `fight_camp_coach_${today}`;

export function RecoveryDashboard({ sessions28d, userId }: RecoveryDashboardProps) {
  const [metrics, setMetrics] = useState<AllMetrics | null>(null);
  const [coachData, setCoachData] = useState<CoachResponse | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  // Check if we have enough data for AI coach (7+ days)
  const uniqueDays = new Set(sessions28d.map(s => s.date)).size;
  const hasEnoughData = uniqueDays >= 7;

  // Compute metrics whenever sessions change
  useEffect(() => {
    if (sessions28d.length > 0) {
      setMetrics(computeAllMetrics(sessions28d));
    }
  }, [sessions28d]);

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

  const askCoach = useCallback(async () => {
    if (!metrics || !hasEnoughData) return;

    // Check cache first
    const cached = AIPersistence.load(userId, CACHE_KEY);
    if (cached) {
      setCoachData(cached);
      return;
    }

    setIsCoachLoading(true);
    setCoachError(null);

    try {
      const payload = {
        strain: metrics.strain,
        recoveryScore: metrics.recoveryScore.score,
        recoveryStatus: metrics.recoveryScore.status,
        acRatio: metrics.acRatio,
        weeklySessionCount: metrics.weeklySessionCount,
        overtrainingRisk: metrics.overtrainingRisk,
        avgSleep: metrics.avgSleep,
        latestSleep: metrics.latestSleep,
        latestSoreness: metrics.latestSoreness,
        consecutiveHighDays: metrics.consecutiveHighDays,
        recentSessions: metrics.recentSessions.map(s => ({
          date: s.date,
          session_type: s.session_type,
          duration_minutes: s.duration_minutes,
          rpe: s.rpe,
          intensity: s.intensity,
          soreness_level: s.soreness_level,
          sleep_hours: s.sleep_hours,
        })),
      };

      const { data, error } = await supabase.functions.invoke('fight-camp-coach', {
        body: payload,
      });

      if (error) throw error;
      if (data?.coach) {
        setCoachData(data.coach);
        AIPersistence.save(userId, CACHE_KEY, data.coach, 24);
      } else {
        throw new Error("Invalid response from coach");
      }
    } catch (err) {
      console.error("Coach error:", err);
      setCoachError("Could not get coaching advice. Try again later.");
    } finally {
      setIsCoachLoading(false);
    }
  }, [metrics, userId, hasEnoughData]);

  const refreshCoach = useCallback(() => {
    AIPersistence.remove(userId, CACHE_KEY);
    setCoachData(null);
    askCoach();
  }, [userId, askCoach]);

  if (!metrics) return null;

  const strainColors = getStrainColor(metrics.strain);
  const recoveryColors = getRecoveryColor(metrics.recoveryScore.status);
  const riskColors = getRiskColor(metrics.overtrainingRisk.level);

  return (
    <div className="glass-card rounded-[20px] p-4 mb-6 border border-border/50">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Recovery Status</h2>
      </div>

      {/* Ring row - Strain + Recovery */}
      <div className="flex justify-around mb-4">
        <RecoveryRing
          value={metrics.strain}
          max={21}
          color={strainColors.color}
          glowColor={strainColors.glow}
          label="Strain"
          size={110}
          displayValue={metrics.strain.toFixed(1)}
          sublabel="/ 21"
        />
        <RecoveryRing
          value={metrics.recoveryScore.score}
          max={100}
          color={recoveryColors.color}
          glowColor={recoveryColors.glow}
          label="Recovery"
          size={110}
          displayValue={`${Math.round(metrics.recoveryScore.score)}%`}
          sublabel={metrics.recoveryScore.status}
        />
      </div>

      {/* Risk ring - centered smaller */}
      <div className="flex justify-center mb-4">
        <RecoveryRing
          value={getRiskValue(metrics.overtrainingRisk.level)}
          max={100}
          color={riskColors.color}
          glowColor={riskColors.glow}
          label="Overtraining Risk"
          size={80}
          strokeWidth={7}
          displayValue={metrics.overtrainingRisk.level.toUpperCase()}
        />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-xl bg-accent/20">
          <div className="text-lg font-bold display-number text-foreground">{metrics.weeklySessionCount}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sessions/wk</div>
        </div>
        <div className="text-center p-2 rounded-xl bg-accent/20">
          <div className="text-lg font-bold display-number text-foreground">{metrics.acRatio.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">AC Ratio</div>
        </div>
        <div className="text-center p-2 rounded-xl bg-accent/20">
          <div className="text-lg font-bold display-number text-foreground">
            {metrics.avgSleep > 0 ? `${metrics.avgSleep.toFixed(1)}h` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Sleep</div>
        </div>
      </div>

      {/* AI Coach section */}
      <div className="border-t border-border/30 pt-4">
        {!coachData && !isCoachLoading && (
          <Button
            onClick={askCoach}
            disabled={!hasEnoughData || isCoachLoading}
            className="w-full rounded-2xl h-12 font-semibold gap-2"
            variant="outline"
            title={!hasEnoughData ? "Need 7+ days of data for AI coaching" : undefined}
          >
            <Brain className="h-4 w-4" />
            {hasEnoughData ? "Ask Recovery Coach" : "Need 7+ days of data"}
          </Button>
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

function CoachResultCard({ coach, onRefresh }: { coach: CoachResponse; onRefresh: () => void }) {
  const badge = getReadinessBadge(coach.readiness_state);

  return (
    <div className="space-y-3">
      {/* Header with badge + refresh */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${badge.className}`}>
          {badge.label}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground/90 leading-relaxed">{coach.summary}</p>

      {/* Next session recommendation */}
      <div className="bg-accent/20 rounded-xl p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Next Session</div>
        <p className="text-sm font-medium text-foreground">{coach.next_session_recommendation}</p>
      </div>

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

      {/* Risk flags */}
      {coach.risk_flags?.length > 0 && (
        <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
          <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5 font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Risk Flags
          </div>
          <ul className="space-y-1">
            {coach.risk_flags.map((flag, i) => (
              <li key={i} className="text-sm text-red-300">{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
