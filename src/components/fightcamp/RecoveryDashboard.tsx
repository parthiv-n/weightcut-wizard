import { useState, useEffect, useCallback } from "react";
import { Activity, Brain, RefreshCw, AlertTriangle, CheckCircle, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AIPersistence } from "@/lib/aiPersistence";
import { RecoveryRing } from "./RecoveryRing";
import { StrainChart } from "./StrainChart";
import { computeAllMetrics, type SessionRow, type AllMetrics } from "@/utils/performanceEngine";

interface CoachResponse {
  readiness_state: 'push' | 'maintain' | 'reduce' | 'recover';
  coaching_summary: string;
  next_session_advice: string;
  recovery_focus: string[];
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
}

interface RecoveryDashboardProps {
  sessions28d: SessionRow[];
  userId: string;
  sessionLoggedAt?: number; // counter that increments on session save
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

const today = new Date().toISOString().split('T')[0];
const CACHE_KEY = `fight_camp_coach_${today}`;

export function RecoveryDashboard({ sessions28d, userId, sessionLoggedAt = 0 }: RecoveryDashboardProps) {
  const [metrics, setMetrics] = useState<AllMetrics | null>(null);
  const [coachData, setCoachData] = useState<CoachResponse | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

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

  // Auto-trigger AI when session is logged (sessionLoggedAt counter changes)
  useEffect(() => {
    if (sessionLoggedAt > 0 && metrics && hasEnoughData) {
      AIPersistence.remove(userId, CACHE_KEY);
      setCoachData(null);
      // Small delay to let metrics recompute with new data
      const timer = setTimeout(() => askCoach(), 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoggedAt]);

  const refreshCoach = useCallback(() => {
    AIPersistence.remove(userId, CACHE_KEY);
    setCoachData(null);
    askCoach();
  }, [userId, askCoach]);

  if (!metrics) return null;

  const strainColors = getStrainColor(metrics.strain);
  const otColors = getOTColor(metrics.overtrainingRisk.zone);

  return (
    <div className="space-y-4 mb-6">
      {/* 1) Readiness Hero Badge */}
      {coachData && <ReadinessBadge state={coachData.readiness_state} />}

      {/* 2) Strain Ring + Overtraining Ring */}
      <div className="glass-card rounded-[20px] p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Performance</h2>
        </div>

        <div className="flex items-end justify-around">
          {/* Large primary strain ring */}
          <RecoveryRing
            value={metrics.strain}
            max={21}
            color={strainColors.color}
            glowColor={strainColors.glow}
            label="Strain"
            size={140}
            strokeWidth={12}
            displayValue={metrics.strain.toFixed(1)}
            sublabel="/ 21"
          />
          {/* Smaller overtraining ring */}
          <div className="flex flex-col items-center gap-3">
            <RecoveryRing
              value={metrics.overtrainingRisk.score}
              max={100}
              color={otColors.color}
              glowColor={otColors.glow}
              label="Overtraining"
              size={90}
              strokeWidth={8}
              displayValue={`${Math.round(metrics.overtrainingRisk.score)}`}
              sublabel={metrics.overtrainingRisk.zone}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">{metrics.weeklySessionCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sessions/wk</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">{metrics.loadRatio.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Load Ratio</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-accent/20">
            <div className="text-lg font-bold display-number text-foreground">
              {metrics.avgSleep > 0 ? `${metrics.avgSleep.toFixed(1)}h` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Sleep</div>
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
          <Button
            onClick={askCoach}
            disabled={!hasEnoughData || isCoachLoading}
            className="w-full rounded-2xl h-12 font-semibold gap-2"
            variant="outline"
            title={!hasEnoughData ? "Need 7+ days of data for AI coaching" : undefined}
          >
            <Brain className="h-4 w-4" />
            {hasEnoughData ? "Analyze Training" : "Need 7+ days of data"}
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

// ─── Readiness Hero Badge ─────────────────────────────────────
function ReadinessBadge({ state }: { state: CoachResponse['readiness_state'] }) {
  const badge = getReadinessBadge(state);
  const Icon = badge.icon;

  return (
    <div className={`flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border text-lg font-bold tracking-wide ${badge.className}`}>
      <Icon className="h-5 w-5" />
      {badge.label}
    </div>
  );
}

// ─── AI Coach Result Card ─────────────────────────────────────
function CoachResultCard({ coach, onRefresh }: { coach: CoachResponse; onRefresh: () => void }) {
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

      {/* Next session advice */}
      <div className="bg-accent/20 rounded-xl p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Next Session</div>
        <p className="text-sm font-medium text-foreground">{coach.next_session_advice}</p>
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
