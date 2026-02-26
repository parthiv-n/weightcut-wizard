// WHOOP-style Deterministic Performance Engine
// All strain/load/overtraining calculations are non-AI
// LLM only interprets — never calculates

export interface SessionRow {
  id: string;
  date: string;
  session_type: string;
  duration_minutes: number;
  rpe: number;
  intensity: string; // legacy 'low' | 'moderate' | 'high'
  intensity_level: number | null; // new 1-5 scale
  soreness_level: number;
  sleep_hours: number;
  user_id: string;
  created_at: string;
  // Rest day fields
  fatigue_level?: number | null;
  sleep_quality?: string | null;
  mobility_done?: boolean | null;
}

export interface OvertrainingRisk {
  score: number; // 0-100
  zone: 'low' | 'moderate' | 'high' | 'critical';
  factors: string[];
}

export interface DailyStrainEntry {
  date: string;
  strain: number;
  dailyLoad: number;
  sessionCount: number;
}

export type LoadZone = 'detraining' | 'optimal' | 'pushing' | 'overreaching';

export interface LoadZoneInfo {
  zone: LoadZone;
  label: string;
  description: string;
}

export interface ForecastResult {
  predictedStrain: number;
  predictedLoadRatio: number;
  predictedLoadZone: LoadZoneInfo;
  predictedOvertrainingScore: number;
  isRestDay: boolean;
}

// ─── New Types ──────────────────────────────────────────────

export type AthleteTier = 'beginner' | 'developing' | 'intermediate' | 'advanced';

export interface AthleteCalibration {
  tier: AthleteTier;
  loadRatioThresholds: { caution: number; danger: number };
  rpeCeiling: number;
  normalSessionsPerWeek: number;
  strainDivisor: number;
  sessionFrequencyFlagThreshold: number;
}

export interface TrendAlerts {
  sorenessRising: boolean;
  sleepDeclining: boolean;
  loadEscalating: boolean;
  rpeCreeping: boolean;
  alerts: string[];
}

export interface ReadinessBreakdown {
  sleepScore: number;
  sorenessScore: number;
  loadBalanceScore: number;
  recoveryScore: number;
  consistencyScore: number;
}

export interface EnhancedReadinessBreakdown extends ReadinessBreakdown {
  wellnessScore?: number;
  priorRecoveryScore?: number;
  deficitImpactScore?: number;
  stabilityScore?: number;
  hydrationScore?: number;
  tier: 1 | 2 | 3;
}

export interface ReadinessResult {
  score: number;
  label: 'peaked' | 'ready' | 'recovering' | 'strained';
  breakdown: EnhancedReadinessBreakdown;
}

// ─── Wellness / Baseline Types ────────────────────────────────

export interface WellnessCheckIn {
  sleep_quality: number;   // 1-7
  stress_level: number;    // 1-7
  fatigue_level: number;   // 1-7
  soreness_level: number;  // 1-7
  energy_level?: number | null;
  motivation_level?: number | null;
  sleep_hours?: number | null;
  hydration_feeling?: number | null;  // 1-5
  appetite_level?: number | null;     // 1-5
  hooper_index: number;    // 4-28
}

export type BalanceDirection = 'improving' | 'stable' | 'declining';
export type BalanceSeverity = 'normal' | 'warning' | 'alert';

export interface BalanceMetric {
  metric: string;
  recent14d: number;
  baseline60d: number;
  zScore: number;
  direction: BalanceDirection;
  severity: BalanceSeverity;
}

export interface PersonalBaseline {
  sleep_hours_mean_14d: number | null;
  sleep_hours_std_14d: number | null;
  soreness_mean_14d: number | null;
  soreness_std_14d: number | null;
  fatigue_mean_14d: number | null;
  fatigue_std_14d: number | null;
  stress_mean_14d: number | null;
  stress_std_14d: number | null;
  hooper_mean_14d: number | null;
  hooper_std_14d: number | null;
  daily_load_mean_14d: number | null;
  daily_load_std_14d: number | null;
  sleep_hours_mean_60d: number | null;
  sleep_hours_std_60d: number | null;
  soreness_mean_60d: number | null;
  soreness_std_60d: number | null;
  fatigue_mean_60d: number | null;
  fatigue_std_60d: number | null;
  stress_mean_60d: number | null;
  stress_std_60d: number | null;
  hooper_mean_60d: number | null;
  hooper_std_60d: number | null;
  daily_load_mean_60d: number | null;
  daily_load_std_60d: number | null;
  hooper_cv_14d: number | null;
  avg_deficit_7d: number | null;
  avg_deficit_14d: number | null;
}

export interface AllMetrics {
  strain: number;           // Today's 0-21 strain
  dailyLoad: number;        // Today's raw load
  acuteLoad: number;        // Sum of last 7 daily loads
  chronicLoad: number;      // Average of last 28 daily loads
  loadRatio: number;        // acuteLoad / (chronicLoad + 1)
  loadZone: LoadZoneInfo;   // User-friendly interpretation
  overtrainingRisk: OvertrainingRisk;
  weeklySessionCount: number;
  avgSleep: number;
  latestSleep: number;
  latestSoreness: number;
  avgRPE7d: number;
  avgSoreness7d: number;
  sessionsLast7d: number;
  consecutiveHighDays: number;
  strainHistory: DailyStrainEntry[]; // Last 7 days for chart
  forecast: ForecastResult;
  recentSessions: SessionRow[];
  // Core fields
  readiness: ReadinessResult;
  trends: TrendAlerts;
  calibration: AthleteCalibration;
  sleepScore: number;
  avgSleepLast3: number;
  // Enhanced fields (populated when wellness data available)
  balanceMetrics?: BalanceMetric[];
  deficitImpactScore?: number;
  wellnessScore?: number;
  hooperIndex?: number;
  hooperComponents?: { sleep: number; stress: number; fatigue: number; soreness: number };
  stabilityScore?: number;
}

// ─── Utility Functions ──────────────────────────────────────

export function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const clamped = clamp(inMin, inMax, value);
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function getRecentSleepValues(sessions: SessionRow[], count: number): number[] {
  const grouped = groupByDate(sessions);
  const today = new Date();
  const values: number[] = [];
  for (let i = 0; i < 28 && values.length < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    const withSleep = daySessions.find(s => s.sleep_hours > 0);
    if (withSleep) values.push(withSleep.sleep_hours);
  }
  return values;
}

export function getRecentSorenessValues(sessions: SessionRow[], count: number): number[] {
  const grouped = groupByDate(sessions);
  const today = new Date();
  const values: number[] = [];
  for (let i = 0; i < 28 && values.length < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    const withSoreness = daySessions.find(s => s.soreness_level > 0);
    if (withSoreness) values.push(withSoreness.soreness_level);
  }
  return values;
}

// ─── Z-Score & Enhanced Scoring Utilities ────────────────────

export function zScore(value: number, mean: number, std: number): number {
  if (std < 0.01) return 0;
  return (value - mean) / std;
}

export function computeBalanceMetrics(baseline: PersonalBaseline): BalanceMetric[] {
  const metrics: BalanceMetric[] = [];

  const pairs: { metric: string; mean14d: number | null; mean60d: number | null; std60d: number | null }[] = [
    { metric: 'Sleep Hours', mean14d: baseline.sleep_hours_mean_14d, mean60d: baseline.sleep_hours_mean_60d, std60d: baseline.sleep_hours_std_60d },
    { metric: 'Soreness', mean14d: baseline.soreness_mean_14d, mean60d: baseline.soreness_mean_60d, std60d: baseline.soreness_std_60d },
    { metric: 'Fatigue', mean14d: baseline.fatigue_mean_14d, mean60d: baseline.fatigue_mean_60d, std60d: baseline.fatigue_std_60d },
    { metric: 'Stress', mean14d: baseline.stress_mean_14d, mean60d: baseline.stress_mean_60d, std60d: baseline.stress_std_60d },
    { metric: 'Hooper Index', mean14d: baseline.hooper_mean_14d, mean60d: baseline.hooper_mean_60d, std60d: baseline.hooper_std_60d },
    { metric: 'Daily Load', mean14d: baseline.daily_load_mean_14d, mean60d: baseline.daily_load_mean_60d, std60d: baseline.daily_load_std_60d },
  ];

  for (const { metric, mean14d, mean60d, std60d } of pairs) {
    if (mean14d == null || mean60d == null) continue;

    const z = zScore(mean14d, mean60d, std60d ?? 0);

    // For negative metrics (soreness, fatigue, stress), increasing is bad
    const isNegativeMetric = ['Soreness', 'Fatigue', 'Stress'].includes(metric);
    const effectiveZ = isNegativeMetric ? -z : z;

    let direction: BalanceDirection;
    if (effectiveZ > 0.5) direction = 'improving';
    else if (effectiveZ < -0.5) direction = 'declining';
    else direction = 'stable';

    let severity: BalanceSeverity;
    if (Math.abs(effectiveZ) > 1.5) severity = 'alert';
    else if (Math.abs(effectiveZ) > 0.8) severity = 'warning';
    else severity = 'normal';

    metrics.push({ metric, recent14d: mean14d, baseline60d: mean60d, zScore: z, direction, severity });
  }

  return metrics;
}

export function computeDeficitImpactScore(avgDeficit7d: number | null): number {
  if (avgDeficit7d == null) return 100; // No data = assume no impact
  const deficit = Math.abs(avgDeficit7d);
  if (deficit <= 200) return 100;
  if (deficit <= 500) return Math.round(mapRange(deficit, 200, 500, 100, 60));
  if (deficit <= 800) return Math.round(mapRange(deficit, 500, 800, 60, 30));
  return Math.round(mapRange(deficit, 800, 1200, 30, 10));
}

export function computeWellnessScore(hooperIndex: number, baseline: PersonalBaseline | null): number {
  if (baseline && baseline.hooper_mean_60d != null && baseline.hooper_std_60d != null && baseline.hooper_std_60d >= 0.01) {
    // Z-score based: 0 SD = 50, +2 SD = 100, -2 SD = 0
    const z = zScore(hooperIndex, baseline.hooper_mean_60d, baseline.hooper_std_60d);
    return Math.round(clamp(0, 100, mapRange(z, -2, 2, 0, 100)));
  }
  // Absolute mapping: Hooper 4-28 → 0-100
  return Math.round(clamp(0, 100, mapRange(hooperIndex, 4, 28, 0, 100)));
}

export function computeStabilityScore(hooperCV14d: number | null): number {
  if (hooperCV14d == null) return 50; // Neutral when no data
  // Lower CV = more stable = better. CV<0.08 = 100, CV>0.35 = 20
  return Math.round(clamp(20, 100, mapRange(hooperCV14d, 0.08, 0.35, 100, 20)));
}

export function autoRegressiveSmooth(rawScore: number, previousDayScore: number | null, alpha: number = 0.6): number {
  if (previousDayScore == null) return rawScore;
  return Math.round(alpha * rawScore + (1 - alpha) * previousDayScore);
}

export function getLoadZone(loadRatio: number, calibration: AthleteCalibration): LoadZoneInfo {
  const { caution, danger } = calibration.loadRatioThresholds;

  if (loadRatio < 0.8) {
    return { zone: 'detraining', label: 'Low', description: 'Volume is dropping — risk of losing fitness' };
  }
  if (loadRatio <= caution) {
    return { zone: 'optimal', label: 'Optimal', description: 'Training is well balanced' };
  }
  if (loadRatio <= danger) {
    return { zone: 'pushing', label: 'High', description: 'Recent load is higher than usual — monitor recovery' };
  }
  return { zone: 'overreaching', label: 'Spike', description: 'Training spike detected — high injury risk' };
}

// ─── Intensity Multiplier ────────────────────────────────────
// Maps the 1-5 intensity level to a multiplier
const INTENSITY_MULTIPLIERS: Record<number, number> = {
  1: 0.8,
  2: 1.0,
  3: 1.15,
  4: 1.3,
  5: 1.5,
};

// Legacy intensity text → level mapping
function intensityToLevel(session: SessionRow): number {
  if (session.intensity_level != null && session.intensity_level >= 1 && session.intensity_level <= 5) {
    return session.intensity_level;
  }
  // Fallback for legacy data
  switch (session.intensity) {
    case 'low': return 1;
    case 'moderate': return 3;
    case 'high': return 5;
    default: return 3;
  }
}

function getIntensityMultiplier(session: SessionRow): number {
  const level = intensityToLevel(session);
  return INTENSITY_MULTIPLIERS[level] ?? 1.0;
}

// ─── Session Load ────────────────────────────────────────────
// sessionLoad = (RPE × Minutes) × IntensityMultiplier
export function sessionLoad(session: SessionRow): number {
  if (session.session_type === 'Rest' || session.session_type === 'Recovery') {
    return 0;
  }
  return session.rpe * session.duration_minutes * getIntensityMultiplier(session);
}

// ─── Daily Load ──────────────────────────────────────────────
// Sum of session loads. If sessions > 1, multiply by 1.1 (CNS fatigue)
export function dailyLoad(sessions: SessionRow[]): number {
  const trainingSessions = sessions.filter(s => s.session_type !== 'Rest');
  if (trainingSessions.length === 0) return 0;

  const total = trainingSessions.reduce((sum, s) => sum + sessionLoad(s), 0);
  const withCNS = trainingSessions.length > 1 ? total * 1.1 : total;

  if (import.meta.env.DEV) {
    console.log('[PE] dailyLoad:', {
      sessions: trainingSessions.length,
      rawTotal: total,
      cnsMultiplied: trainingSessions.length > 1,
      result: withCNS,
    });
  }

  return withCNS;
}

// ─── Strain (WHOOP-style scaling) ────────────────────────────
// strain = 21 * (1 - e^(-dailyLoad / divisor))
// Clamped 0-21. Diminishing returns at high loads.
export function calculateStrain(load: number, divisor: number = 1000): number {
  const strain = 21 * (1 - Math.exp(-load / divisor));
  const clamped = Math.min(21, Math.max(0, strain));

  if (import.meta.env.DEV) {
    console.log('[PE] strain:', { load, divisor, strain: clamped });
  }

  return clamped;
}

// ─── Athlete Calibration System ─────────────────────────────

const TIER_DEFAULTS: Record<AthleteTier, Omit<AthleteCalibration, 'tier'>> = {
  advanced: {
    loadRatioThresholds: { caution: 1.4, danger: 1.6 },
    rpeCeiling: 8,
    normalSessionsPerWeek: 6,
    strainDivisor: 1400,
    sessionFrequencyFlagThreshold: 8,
  },
  intermediate: {
    loadRatioThresholds: { caution: 1.3, danger: 1.5 },
    rpeCeiling: 7,
    normalSessionsPerWeek: 4,
    strainDivisor: 1100,
    sessionFrequencyFlagThreshold: 6,
  },
  developing: {
    loadRatioThresholds: { caution: 1.2, danger: 1.4 },
    rpeCeiling: 7,
    normalSessionsPerWeek: 3,
    strainDivisor: 900,
    sessionFrequencyFlagThreshold: 4,
  },
  beginner: {
    loadRatioThresholds: { caution: 1.1, danger: 1.3 },
    rpeCeiling: 6,
    normalSessionsPerWeek: 1,
    strainDivisor: 700,
    sessionFrequencyFlagThreshold: 3,
  },
};

function determineTier(profileFreq: number | null, activityLevel: string | null): AthleteTier {
  const f = profileFreq ?? 0;
  if (f >= 6 || activityLevel === 'extra_active') return 'advanced';
  if (f >= 4 || activityLevel === 'very_active') return 'intermediate';
  if (f >= 2 || activityLevel === 'moderately_active') return 'developing';
  return 'beginner';
}

export function deriveCalibration(
  profileFreq: number | null,
  activityLevel: string | null,
  sessions28d: SessionRow[],
): AthleteCalibration {
  const tier = determineTier(profileFreq, activityLevel);
  const defaults = TIER_DEFAULTS[tier];
  const calibration: AthleteCalibration = { tier, ...defaults };

  // Personal override: need 7+ unique training days in 28d data
  const trainingSessions = sessions28d.filter(s => s.session_type !== 'Rest' && s.session_type !== 'Recovery');
  const uniqueTrainingDays = new Set(trainingSessions.map(s => s.date)).size;

  if (uniqueTrainingDays >= 7) {
    // Personal RPE ceiling from avg RPE + 1.5
    const avgRPE = trainingSessions.reduce((sum, s) => sum + s.rpe, 0) / trainingSessions.length;
    calibration.rpeCeiling = clamp(4, 10, avgRPE + 1.5);

    // Actual sessions per week from real data
    const weeksOfData = Math.max(1, uniqueTrainingDays / 7 * (28 / Math.max(1, uniqueTrainingDays)) );
    // Count actual unique days over 28 days, convert to weekly rate
    calibration.normalSessionsPerWeek = Math.round((uniqueTrainingDays / 4) * 10) / 10; // 28 days = 4 weeks

    // Personal strain divisor: avg session load maps to ~strain 8-9/21
    // 21*(1-e^(-avgLoad/divisor)) = 8.5 → divisor = -avgLoad / ln(1 - 8.5/21)
    const avgSessionLoad = trainingSessions.reduce((sum, s) => sum + sessionLoad(s), 0) / trainingSessions.length;
    const targetStrain = 8.5;
    const ratio = 1 - targetStrain / 21;
    if (ratio > 0 && avgSessionLoad > 0) {
      calibration.strainDivisor = clamp(400, 2500, -avgSessionLoad / Math.log(ratio));
    }

    // Flag threshold: personal weekly rate + 2
    calibration.sessionFrequencyFlagThreshold = Math.ceil(calibration.normalSessionsPerWeek + 2);
  }

  return calibration;
}

// ─── Group Sessions By Date ──────────────────────────────────
function groupByDate(sessions: SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const existing = map.get(s.date) || [];
    existing.push(s);
    map.set(s.date, existing);
  }
  return map;
}

// ─── Build Daily Loads Array (28 days) ───────────────────────
function buildDailyLoads(sessions28d: SessionRow[]): { date: string; load: number; sessions: SessionRow[] }[] {
  const grouped = groupByDate(sessions28d);
  const today = new Date();
  const result: { date: string; load: number; sessions: SessionRow[] }[] = [];

  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    result.push({
      date: dateStr,
      load: dailyLoad(daySessions),
      sessions: daySessions,
    });
  }

  return result;
}

// ─── Load Monitoring ─────────────────────────────────────────
function computeLoadMetrics(dailyLoads: { date: string; load: number }[]) {
  const acuteLoad = dailyLoads.slice(-7).reduce((sum, d) => sum + d.load, 0);
  const chronicLoad = dailyLoads.reduce((sum, d) => sum + d.load, 0) / 28;
  const loadRatio = acuteLoad / (chronicLoad + 1);

  if (import.meta.env.DEV) {
    console.log('[PE] loadMetrics:', { acuteLoad, chronicLoad, loadRatio });
  }

  return { acuteLoad, chronicLoad, loadRatio };
}

// ─── Trend Detection ────────────────────────────────────────

export function detectTrends(
  sessions28d: SessionRow[],
  dailyLoadsArr: { date: string; load: number }[],
): TrendAlerts {
  const alerts: string[] = [];
  let sorenessRising = false;
  let sleepDeclining = false;
  let loadEscalating = false;
  let rpeCreeping = false;

  // Soreness rising: 3+ consecutive days of increasing soreness (most-recent-first)
  const recentSoreness = getRecentSorenessValues(sessions28d, 4);
  if (recentSoreness.length >= 3) {
    // recentSoreness[0] is most recent
    if (recentSoreness[0] > recentSoreness[1] && recentSoreness[1] > recentSoreness[2]) {
      sorenessRising = true;
      alerts.push(`Soreness trending up: ${recentSoreness[2]}→${recentSoreness[1]}→${recentSoreness[0]}/10 over 3 days`);
    }
  }

  // Sleep declining: 3 of last 4 nights declining
  const recentSleep = getRecentSleepValues(sessions28d, 4);
  if (recentSleep.length >= 4) {
    let decliningCount = 0;
    for (let i = 0; i < 3; i++) {
      if (recentSleep[i] < recentSleep[i + 1]) decliningCount++;
    }
    if (decliningCount >= 3) {
      sleepDeclining = true;
      alerts.push(`Sleep declining: ${recentSleep.slice().reverse().map(h => h + 'h').join('→')} over 4 nights`);
    }
  }

  // Load escalating: 3+ consecutive days of increasing load with no rest
  const lastDays = dailyLoadsArr.slice(-4);
  if (lastDays.length >= 3) {
    const last3 = lastDays.slice(-3);
    const allNonZero = last3.every(d => d.load > 0);
    const increasing = last3[2].load > last3[1].load && last3[1].load > last3[0].load;
    if (allNonZero && increasing) {
      loadEscalating = true;
      alerts.push(`Training load escalating for 3+ days with no rest`);
    }
  }

  // RPE creeping: avg RPE of last 3 sessions > prior 3 by 1.5+
  const trainingSessions = sessions28d
    .filter(s => s.session_type !== 'Rest' && s.session_type !== 'Recovery')
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  if (trainingSessions.length >= 6) {
    const recent3 = trainingSessions.slice(0, 3);
    const prior3 = trainingSessions.slice(3, 6);
    const avgRecent = recent3.reduce((s, x) => s + x.rpe, 0) / 3;
    const avgPrior = prior3.reduce((s, x) => s + x.rpe, 0) / 3;
    if (avgRecent - avgPrior >= 1.5) {
      rpeCreeping = true;
      alerts.push(`RPE creeping up: recent avg ${avgRecent.toFixed(1)} vs prior ${avgPrior.toFixed(1)}`);
    }
  }

  return { sorenessRising, sleepDeclining, loadEscalating, rpeCreeping, alerts };
}

// ─── Adaptive Overtraining Score ────────────────────────────

function computeAdaptiveOvertrainingScore(
  loadRatio: number,
  avgRPE7d: number,
  avgSoreness7d: number,
  consecutiveHighDays: number,
  sessionsLast7d: number,
  calibration: AthleteCalibration,
  trends: TrendAlerts,
): OvertrainingRisk {
  let score = 0;
  const factors: string[] = [];

  // Load ratio scoring using calibrated thresholds
  const { caution, danger } = calibration.loadRatioThresholds;
  if (loadRatio > danger) {
    score += 40;
    factors.push(`Severe acute load spike (ratio ${loadRatio.toFixed(2)} > ${danger})`);
  } else if (loadRatio > caution) {
    // Proportional: 15 at caution, 40 at danger
    score += Math.round(mapRange(loadRatio, caution, danger, 15, 40));
    factors.push(`Elevated acute load (ratio ${loadRatio.toFixed(2)} > ${caution})`);
  }

  // RPE scoring using calibrated ceiling — proportional penalty per point over ceiling
  if (avgRPE7d > calibration.rpeCeiling) {
    const overBy = avgRPE7d - calibration.rpeCeiling;
    const rpePenalty = Math.round(clamp(0, 25, overBy * 10));
    score += rpePenalty;
    factors.push(`Average RPE ${avgRPE7d.toFixed(1)} exceeds ceiling ${calibration.rpeCeiling}`);
  }

  // Soreness: threshold at >6 with proportional scoring (10-25 pts)
  if (avgSoreness7d > 6) {
    const sorenessPenalty = Math.round(mapRange(avgSoreness7d, 6, 10, 10, 25));
    score += sorenessPenalty;
    factors.push(`High average soreness (${avgSoreness7d.toFixed(1)}/10) in last 7 days`);
  }

  // Consecutive high strain days (strain > 15)
  if (consecutiveHighDays >= 3) {
    score += 20;
    factors.push(`${consecutiveHighDays} consecutive high-strain days`);
  }

  // Session frequency using calibrated threshold
  if (sessionsLast7d >= calibration.sessionFrequencyFlagThreshold) {
    score += 15;
    factors.push(`${sessionsLast7d} sessions in last 7 days (threshold: ${calibration.sessionFrequencyFlagThreshold})`);
  }

  // Trend-based penalties
  if (trends.sorenessRising) {
    score += 10;
    factors.push('Soreness trending upward');
  }
  if (trends.sleepDeclining) {
    score += 8;
    factors.push('Sleep quality declining');
  }
  if (trends.loadEscalating) {
    score += 8;
    factors.push('Training load escalating without rest');
  }

  score = clamp(0, 100, score);

  let zone: OvertrainingRisk['zone'];
  if (score <= 30) zone = 'low';
  else if (score <= 60) zone = 'moderate';
  else if (score <= 80) zone = 'high';
  else zone = 'critical';

  if (import.meta.env.DEV) {
    console.log('[PE] adaptiveOvertrainingScore:', { score, zone, factors, tier: calibration.tier });
  }

  return { score, zone, factors };
}

// ─── Granular Rest Day Recovery ─────────────────────────────
// Backward compatible — old 3-arg calls still work
export function applyRestDayRecovery(
  currentOvertrainingScore: number,
  sorenessLevel: number,
  sleepQuality: string | null,
  sleepHours?: number | null,
  fatigueLevel?: number | null,
  mobilityDone?: boolean | null,
): number {
  // If only 3 args provided (old callers), use legacy behavior
  if (sleepHours === undefined && fatigueLevel === undefined && mobilityDone === undefined) {
    if (sorenessLevel <= 4 && sleepQuality === 'good') {
      return Math.max(0, currentOvertrainingScore * 0.85);
    }
    return Math.max(0, currentOvertrainingScore * 0.95);
  }

  // Granular recovery: 5%-25% reduction
  let recoveryPct = 5; // base minimum

  // Sleep quality
  if (sleepQuality === 'good') recoveryPct += 8;
  else if (sleepQuality === 'poor') recoveryPct += 2;

  // Sleep hours
  const hours = sleepHours ?? 0;
  if (hours >= 8) recoveryPct += 5;
  else if (hours >= 7) recoveryPct += 3;
  else if (hours >= 6) recoveryPct += 1;

  // Soreness
  if (sorenessLevel <= 2) recoveryPct += 5;
  else if (sorenessLevel <= 4) recoveryPct += 3;
  else if (sorenessLevel <= 6) recoveryPct += 1;

  // Fatigue level
  const fatigue = fatigueLevel ?? 10;
  if (fatigue <= 3) recoveryPct += 4;
  else if (fatigue <= 5) recoveryPct += 2;
  else if (fatigue <= 7) recoveryPct += 1;

  // Mobility done
  if (mobilityDone) recoveryPct += 3;

  recoveryPct = clamp(5, 25, recoveryPct);

  return Math.max(0, currentOvertrainingScore * (1 - recoveryPct / 100));
}

// ─── Readiness Score (0-100) ────────────────────────────────

export function computeReadiness(
  sessions28d: SessionRow[],
  dailyLoadsArr: { date: string; load: number; sessions: SessionRow[] }[],
  loadRatio: number,
  calibration: AthleteCalibration,
): ReadinessResult {
  // ── Sleep Score (30%) ──
  const recentSleep = getRecentSleepValues(sessions28d, 3);
  let sleepScore: number;
  if (recentSleep.length === 0) {
    sleepScore = 50; // neutral if no data
  } else {
    // 28d avg as baseline, default 7.5
    const allSleep = sessions28d.filter(s => s.sleep_hours > 0);
    const baseline = allSleep.length > 0
      ? allSleep.reduce((sum, s) => sum + s.sleep_hours, 0) / allSleep.length
      : 7.5;

    // Exponentially weighted last 3 nights (0.5/0.3/0.2)
    const weights = [0.5, 0.3, 0.2];
    let weightedSleep = 0;
    let totalWeight = 0;
    for (let i = 0; i < recentSleep.length; i++) {
      const w = weights[i] ?? 0;
      weightedSleep += recentSleep[i] * w;
      totalWeight += w;
    }
    if (totalWeight > 0) weightedSleep /= totalWeight;
    else weightedSleep = baseline;

    // 100 at baseline+1h, 0 at baseline-3h
    sleepScore = clamp(0, 100, mapRange(weightedSleep, baseline - 3, baseline + 1, 0, 100));
  }

  // ── Soreness Score (25%) ──
  const recentSoreness = getRecentSorenessValues(sessions28d, 3);
  let sorenessScore: number;
  if (recentSoreness.length === 0) {
    sorenessScore = 80; // default if no data
  } else {
    // Weighted 3-day soreness (0.5/0.3/0.2)
    const weights = [0.5, 0.3, 0.2];
    let weightedSoreness = 0;
    let totalWeight = 0;
    for (let i = 0; i < recentSoreness.length; i++) {
      const w = weights[i] ?? 0;
      weightedSoreness += recentSoreness[i] * w;
      totalWeight += w;
    }
    if (totalWeight > 0) weightedSoreness /= totalWeight;
    else weightedSoreness = 2;

    // Inverse: 100 at 0/10, 0 at 10/10
    sorenessScore = clamp(0, 100, mapRange(weightedSoreness, 0, 10, 100, 0));
  }

  // ── Load Balance Score (25%) ──
  const { caution, danger } = calibration.loadRatioThresholds;
  let loadBalanceScore: number;
  if (loadRatio < 0.8) {
    loadBalanceScore = 70; // detraining penalty
  } else if (loadRatio <= caution) {
    loadBalanceScore = 100; // sweet spot
  } else if (loadRatio <= danger + 0.3) {
    loadBalanceScore = clamp(0, 100, mapRange(loadRatio, caution, danger + 0.3, 100, 0));
  } else {
    loadBalanceScore = 0;
  }

  // ── Recovery Score (10%) ──
  const optimalRestDays = 7 - calibration.normalSessionsPerWeek;
  const last7 = dailyLoadsArr.slice(-7);
  const actualRestDays = last7.filter(d => d.load === 0).length;
  let recoveryScore = clamp(0, 100, mapRange(actualRestDays, 0, Math.max(1, optimalRestDays), 20, 100));

  // Boost from good sleep quality and mobility on recent rest days
  const restDaySessions = last7
    .filter(d => d.load === 0)
    .flatMap(d => d.sessions);
  const goodSleepOnRest = restDaySessions.filter(s => s.sleep_quality === 'good').length;
  const mobilityOnRest = restDaySessions.filter(s => s.mobility_done).length;
  recoveryScore = clamp(0, 100, recoveryScore + goodSleepOnRest * 5 + mobilityOnRest * 5);

  // ── Consistency Score (10%) ──
  const last7Loads = last7.map(d => d.load).filter(l => l > 0);
  let consistencyScore: number;
  if (last7Loads.length <= 1) {
    consistencyScore = 50; // not enough data
  } else {
    const mean = last7Loads.reduce((s, l) => s + l, 0) / last7Loads.length;
    const variance = last7Loads.reduce((s, l) => s + (l - mean) ** 2, 0) / last7Loads.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    // CV<0.15=100, CV>0.8=20
    consistencyScore = clamp(20, 100, mapRange(cv, 0.15, 0.8, 100, 20));
  }

  // ── Composite ──
  const score = clamp(0, 100, Math.round(
    sleepScore * 0.30 +
    sorenessScore * 0.25 +
    loadBalanceScore * 0.25 +
    recoveryScore * 0.10 +
    consistencyScore * 0.10
  ));

  let label: ReadinessResult['label'];
  if (score >= 80) label = 'peaked';
  else if (score >= 55) label = 'ready';
  else if (score >= 35) label = 'recovering';
  else label = 'strained';

  return {
    score,
    label,
    breakdown: {
      sleepScore: Math.round(sleepScore),
      sorenessScore: Math.round(sorenessScore),
      loadBalanceScore: Math.round(loadBalanceScore),
      recoveryScore: Math.round(recoveryScore),
      consistencyScore: Math.round(consistencyScore),
    },
  };
}

// ─── Enhanced Readiness (3-Tier Progressive) ────────────────

export function computeEnhancedReadiness(
  sessions28d: SessionRow[],
  dailyLoadsArr: { date: string; load: number; sessions: SessionRow[] }[],
  loadRatio: number,
  calibration: AthleteCalibration,
  todayCheckIn?: WellnessCheckIn | null,
  baseline?: PersonalBaseline | null,
  previousDayReadiness?: number | null,
): ReadinessResult {
  // Always compute base components (same as Tier 1)
  const baseResult = computeReadiness(sessions28d, dailyLoadsArr, loadRatio, calibration);
  const { sleepScore, sorenessScore, loadBalanceScore, recoveryScore, consistencyScore } = baseResult.breakdown;

  // Tier 1: No check-in data — exact current behavior
  if (!todayCheckIn) {
    return {
      ...baseResult,
      breakdown: { ...baseResult.breakdown, tier: 1 },
    };
  }

  const wellnessScore = computeWellnessScore(todayCheckIn.hooper_index, baseline ?? null);

  // Hydration sub-score from check-in
  const hydrationScore = todayCheckIn.hydration_feeling != null
    ? Math.round(mapRange(todayCheckIn.hydration_feeling, 1, 5, 20, 100))
    : 50;

  // Tier 2: Check-in but no baseline yet (<14 days of data)
  const hasBaseline = baseline != null && baseline.hooper_mean_60d != null;
  if (!hasBaseline) {
    const raw = clamp(0, 100, Math.round(
      wellnessScore * 0.25 +
      sleepScore * 0.20 +
      sorenessScore * 0.20 +
      loadBalanceScore * 0.15 +
      recoveryScore * 0.10 +
      consistencyScore * 0.10
    ));

    const score = autoRegressiveSmooth(raw, previousDayReadiness ?? null);

    let label: ReadinessResult['label'];
    if (score >= 80) label = 'peaked';
    else if (score >= 55) label = 'ready';
    else if (score >= 35) label = 'recovering';
    else label = 'strained';

    return {
      score,
      label,
      breakdown: {
        sleepScore: Math.round(sleepScore),
        sorenessScore: Math.round(sorenessScore),
        loadBalanceScore: Math.round(loadBalanceScore),
        recoveryScore: Math.round(recoveryScore),
        consistencyScore: Math.round(consistencyScore),
        wellnessScore: Math.round(wellnessScore),
        hydrationScore: Math.round(hydrationScore),
        tier: 2,
      },
    };
  }

  // Tier 3: Full model (14+ days, baseline available)
  const deficitImpactScore = computeDeficitImpactScore(baseline!.avg_deficit_7d);
  const stabilityScore = computeStabilityScore(baseline!.hooper_cv_14d);
  const priorRecoveryScore = previousDayReadiness != null
    ? clamp(0, 100, previousDayReadiness)
    : 50;

  const raw = clamp(0, 100, Math.round(
    wellnessScore * 0.30 +
    priorRecoveryScore * 0.15 +
    loadBalanceScore * 0.15 +
    sleepScore * 0.10 +
    sorenessScore * 0.10 +
    deficitImpactScore * 0.08 +
    stabilityScore * 0.05 +
    hydrationScore * 0.04 +
    recoveryScore * 0.03
  ));

  const score = autoRegressiveSmooth(raw, previousDayReadiness ?? null);

  let label: ReadinessResult['label'];
  if (score >= 80) label = 'peaked';
  else if (score >= 55) label = 'ready';
  else if (score >= 35) label = 'recovering';
  else label = 'strained';

  return {
    score,
    label,
    breakdown: {
      sleepScore: Math.round(sleepScore),
      sorenessScore: Math.round(sorenessScore),
      loadBalanceScore: Math.round(loadBalanceScore),
      recoveryScore: Math.round(recoveryScore),
      consistencyScore: Math.round(consistencyScore),
      wellnessScore: Math.round(wellnessScore),
      priorRecoveryScore: Math.round(priorRecoveryScore),
      deficitImpactScore: Math.round(deficitImpactScore),
      stabilityScore: Math.round(stabilityScore),
      hydrationScore: Math.round(hydrationScore),
      tier: 3,
    },
  };
}

// ─── Enhanced Trend Detection ────────────────────────────────

export function detectEnhancedTrends(
  sessions28d: SessionRow[],
  dailyLoadsArr: { date: string; load: number }[],
  baseline?: PersonalBaseline | null,
): TrendAlerts {
  const baseTrends = detectTrends(sessions28d, dailyLoadsArr);

  if (!baseline) return baseTrends;

  const alerts = [...baseTrends.alerts];

  // Multi-timescale: 14d vs 60d wellness comparison
  if (baseline.hooper_mean_14d != null && baseline.hooper_mean_60d != null && baseline.hooper_std_60d != null) {
    const wellnessZ = zScore(baseline.hooper_mean_14d, baseline.hooper_mean_60d, baseline.hooper_std_60d);
    if (wellnessZ < -1.0) {
      alerts.push(`Wellness declining: 14-day avg below 60-day baseline by ${Math.abs(wellnessZ).toFixed(1)} SD`);
    }
  }

  // Stability worsening
  if (baseline.hooper_cv_14d != null && baseline.hooper_cv_14d > 0.25) {
    alerts.push(`Recovery stability worsening: CV at ${(baseline.hooper_cv_14d * 100).toFixed(0)}%`);
  }

  // Caloric deficit impact
  if (baseline.avg_deficit_7d != null && Math.abs(baseline.avg_deficit_7d) > 500) {
    alerts.push(`Caloric deficit impacting recovery: ${Math.abs(baseline.avg_deficit_7d).toFixed(0)}kcal avg deficit over 7 days`);
  }

  return { ...baseTrends, alerts };
}

// ─── Helper: Get 7-day strain history ────────────────────────
function getStrainHistory(
  dailyLoads: { date: string; load: number; sessions: SessionRow[] }[],
  divisor: number = 1000,
): DailyStrainEntry[] {
  return dailyLoads.slice(-7).map(d => ({
    date: d.date,
    strain: calculateStrain(d.load, divisor),
    dailyLoad: d.load,
    sessionCount: d.sessions.filter(s => s.session_type !== 'Rest').length,
  }));
}

// ─── Helper: Consecutive high-strain days ────────────────────
function getConsecutiveHighStrainDays(
  dailyLoads: { date: string; load: number }[],
  divisor: number = 1000,
): number {
  let count = 0;
  for (let i = dailyLoads.length - 1; i >= 0; i--) {
    if (calculateStrain(dailyLoads[i].load, divisor) > 15) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Helper: Average RPE last 7 days ─────────────────────────
function getAvgRPE7d(sessions28d: SessionRow[]): number {
  const today = new Date();
  const recent: SessionRow[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    recent.push(...sessions28d.filter(s => s.date === dateStr && s.session_type !== 'Rest'));
  }
  if (recent.length === 0) return 0;
  return recent.reduce((sum, s) => sum + s.rpe, 0) / recent.length;
}

// ─── Helper: Average Soreness last 7 days ────────────────────
function getAvgSoreness7d(sessions28d: SessionRow[]): number {
  const today = new Date();
  const recent: SessionRow[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    recent.push(...sessions28d.filter(s => s.date === dateStr && s.soreness_level > 0));
  }
  if (recent.length === 0) return 0;
  return recent.reduce((sum, s) => sum + s.soreness_level, 0) / recent.length;
}

// ─── Helper: Sessions count last 7 days ──────────────────────
function getSessionsLast7d(sessions28d: SessionRow[]): number {
  const today = new Date();
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    count += sessions28d.filter(s => s.date === dateStr && s.session_type !== 'Rest').length;
  }
  return count;
}

// ─── Helper: Latest sleep ────────────────────────────────────
function getLatestSleep(sessions28d: SessionRow[]): number {
  const grouped = groupByDate(sessions28d);
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    const withSleep = daySessions.find(s => s.sleep_hours > 0);
    if (withSleep) return withSleep.sleep_hours;
  }
  return 8;
}

// ─── Helper: Latest soreness ─────────────────────────────────
function getLatestSoreness(sessions28d: SessionRow[]): number {
  const grouped = groupByDate(sessions28d);
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    const withSoreness = daySessions.find(s => s.soreness_level > 0);
    if (withSoreness) return withSoreness.soreness_level;
  }
  return 0;
}

// ─── Helper: Average sleep ───────────────────────────────────
function getAvgSleep(sessions28d: SessionRow[]): number {
  const withSleep = sessions28d.filter(s => s.sleep_hours > 0);
  if (withSleep.length === 0) return 0;
  return withSleep.reduce((sum, s) => sum + s.sleep_hours, 0) / withSleep.length;
}

// ─── Helper: Recent sessions for AI ──────────────────────────
function getRecentSessions(sessions28d: SessionRow[]): SessionRow[] {
  const today = new Date();
  const recent: SessionRow[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    recent.push(...sessions28d.filter(s => s.date === dateStr));
  }
  return recent.slice(0, 15);
}

// ─── Improved Forecast ──────────────────────────────────────
function computeForecast(
  dailyLoads: { date: string; load: number }[],
  currentOvertrainingScore: number,
  calibration: AthleteCalibration,
): ForecastResult {
  // Try same-day-of-week prediction from past 3 weeks
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = tomorrow.getDay();

  const sameDowLoads: number[] = [];
  for (let weeksBack = 1; weeksBack <= 3; weeksBack++) {
    const idx = dailyLoads.length - (weeksBack * 7);
    if (idx >= 0) {
      const entry = dailyLoads[idx];
      const entryDate = new Date(entry.date);
      if (entryDate.getDay() === targetDow && entry.load > 0) {
        sameDowLoads.push(entry.load);
      }
    }
  }

  let avgLoad: number;
  if (sameDowLoads.length >= 2) {
    // Same-day-of-week pattern
    avgLoad = sameDowLoads.reduce((s, l) => s + l, 0) / sameDowLoads.length;
  } else {
    // Fallback: recent-biased weighted average (0.5/0.3/0.2 of last 3 days)
    const last3 = dailyLoads.slice(-3);
    const weights = [0.5, 0.3, 0.2];
    let weighted = 0;
    let totalW = 0;
    for (let i = 0; i < last3.length; i++) {
      const w = weights[i] ?? 0.1;
      weighted += last3[last3.length - 1 - i].load * w; // most recent first
      totalW += w;
    }
    avgLoad = totalW > 0 ? weighted / totalW : 0;
  }

  const predictedStrain = calculateStrain(avgLoad, calibration.strainDivisor);

  // Projected load ratio
  const acuteWithPredicted = dailyLoads.slice(-6).reduce((sum, d) => sum + d.load, 0) + avgLoad;
  const chronicWithPredicted = (dailyLoads.reduce((sum, d) => sum + d.load, 0) + avgLoad) / 29;
  const predictedLoadRatio = acuteWithPredicted / (chronicWithPredicted + 1);

  // OT projection using calibrated thresholds
  let otDelta: number;
  const { caution, danger } = calibration.loadRatioThresholds;
  if (avgLoad === 0) {
    otDelta = -10; // rest day
  } else if (predictedLoadRatio > caution) {
    // Proportional: +5 at caution, +15 at danger+
    otDelta = Math.round(mapRange(predictedLoadRatio, caution, danger, 5, 15));
  } else {
    otDelta = -3; // within limits
  }

  const predictedOvertrainingScore = clamp(0, 100, currentOvertrainingScore + otDelta);

  return {
    predictedStrain,
    predictedLoadRatio,
    predictedLoadZone: getLoadZone(predictedLoadRatio, calibration),
    predictedOvertrainingScore,
    isRestDay: avgLoad === 0,
  };
}

// ─── Helper: Sleep score for stats display ──────────────────
function computeSleepScore(sessions28d: SessionRow[]): number {
  const recentSleep = getRecentSleepValues(sessions28d, 3);
  if (recentSleep.length === 0) return 50;

  const allSleep = sessions28d.filter(s => s.sleep_hours > 0);
  const baseline = allSleep.length > 0
    ? allSleep.reduce((sum, s) => sum + s.sleep_hours, 0) / allSleep.length
    : 7.5;

  const weights = [0.5, 0.3, 0.2];
  let weightedSleep = 0;
  let totalWeight = 0;
  for (let i = 0; i < recentSleep.length; i++) {
    const w = weights[i] ?? 0;
    weightedSleep += recentSleep[i] * w;
    totalWeight += w;
  }
  if (totalWeight > 0) weightedSleep /= totalWeight;
  else weightedSleep = baseline;

  return Math.round(clamp(0, 100, mapRange(weightedSleep, baseline - 3, baseline + 1, 0, 100)));
}

// ─── Helper: Average sleep last 3 nights ────────────────────
function getAvgSleepLast3(sessions28d: SessionRow[]): number {
  const recentSleep = getRecentSleepValues(sessions28d, 3);
  if (recentSleep.length === 0) return 0;
  return recentSleep.reduce((s, h) => s + h, 0) / recentSleep.length;
}

// ─── Master Function ─────────────────────────────────────────
// Backward compatible: callers that don't pass new args get identical behavior
export function computeAllMetrics(
  sessions28d: SessionRow[],
  profileFreq?: number | null,
  activityLevel?: string | null,
  todayCheckIn?: WellnessCheckIn | null,
  baseline?: PersonalBaseline | null,
  previousDayReadiness?: number | null,
): AllMetrics {
  // Derive calibration
  const calibration = deriveCalibration(
    profileFreq ?? null,
    activityLevel ?? null,
    sessions28d,
  );

  const dailyLoadsArr = buildDailyLoads(sessions28d);
  const { acuteLoad, chronicLoad, loadRatio } = computeLoadMetrics(dailyLoadsArr);

  const todayEntry = dailyLoadsArr[dailyLoadsArr.length - 1];
  const todayStrain = calculateStrain(todayEntry.load, calibration.strainDivisor);

  const avgRPE7d = getAvgRPE7d(sessions28d);
  const avgSoreness7d = getAvgSoreness7d(sessions28d);
  const consecutiveHighDays = getConsecutiveHighStrainDays(dailyLoadsArr, calibration.strainDivisor);
  const sessionsLast7d = getSessionsLast7d(sessions28d);

  // Detect trends (enhanced when baseline available)
  const trends = baseline
    ? detectEnhancedTrends(sessions28d, dailyLoadsArr, baseline)
    : detectTrends(sessions28d, dailyLoadsArr);

  // Adaptive overtraining score
  const overtrainingRisk = computeAdaptiveOvertrainingScore(
    loadRatio,
    avgRPE7d,
    avgSoreness7d,
    consecutiveHighDays,
    sessionsLast7d,
    calibration,
    trends,
  );

  // Check if today has rest day sessions — apply granular recovery
  const todayRestSessions = todayEntry.sessions?.filter(s => s.session_type === 'Rest') || [];
  if (todayRestSessions.length > 0) {
    const restSession = todayRestSessions[0];
    const adjusted = applyRestDayRecovery(
      overtrainingRisk.score,
      restSession.soreness_level,
      restSession.sleep_quality ?? null,
      restSession.sleep_hours,
      restSession.fatigue_level ?? null,
      restSession.mobility_done ?? null,
    );
    overtrainingRisk.score = adjusted;
    if (adjusted <= 30) overtrainingRisk.zone = 'low';
    else if (adjusted <= 60) overtrainingRisk.zone = 'moderate';
    else if (adjusted <= 80) overtrainingRisk.zone = 'high';
    else overtrainingRisk.zone = 'critical';
  }

  // Enhanced readiness (uses check-in + baseline when available, falls back to Tier 1)
  const readiness = computeEnhancedReadiness(
    sessions28d, dailyLoadsArr, loadRatio, calibration,
    todayCheckIn, baseline, previousDayReadiness,
  );

  const forecast = computeForecast(dailyLoadsArr, overtrainingRisk.score, calibration);

  const sleepScore = computeSleepScore(sessions28d);
  const avgSleepLast3 = getAvgSleepLast3(sessions28d);

  // Compute enhanced fields when wellness data is available
  const enhancedFields: Partial<AllMetrics> = {};

  if (todayCheckIn) {
    enhancedFields.hooperIndex = todayCheckIn.hooper_index;
    enhancedFields.hooperComponents = {
      sleep: todayCheckIn.sleep_quality,
      stress: todayCheckIn.stress_level,
      fatigue: todayCheckIn.fatigue_level,
      soreness: todayCheckIn.soreness_level,
    };
    enhancedFields.wellnessScore = computeWellnessScore(todayCheckIn.hooper_index, baseline ?? null);
  }

  if (baseline) {
    enhancedFields.balanceMetrics = computeBalanceMetrics(baseline);
    enhancedFields.deficitImpactScore = computeDeficitImpactScore(baseline.avg_deficit_7d);
    enhancedFields.stabilityScore = computeStabilityScore(baseline.hooper_cv_14d);
  }

  if (import.meta.env.DEV) {
    console.log('[PE] allMetrics:', {
      strain: todayStrain,
      acuteLoad,
      chronicLoad,
      loadRatio,
      overtrainingScore: overtrainingRisk.score,
      overtrainingZone: overtrainingRisk.zone,
      readiness: readiness.score,
      readinessTier: readiness.breakdown.tier,
      tier: calibration.tier,
    });
  }

  return {
    strain: todayStrain,
    dailyLoad: todayEntry.load,
    acuteLoad,
    chronicLoad,
    loadRatio,
    loadZone: getLoadZone(loadRatio, calibration),
    overtrainingRisk,
    weeklySessionCount: sessionsLast7d,
    avgSleep: getAvgSleep(sessions28d),
    latestSleep: getLatestSleep(sessions28d),
    latestSoreness: getLatestSoreness(sessions28d),
    avgRPE7d,
    avgSoreness7d,
    sessionsLast7d,
    consecutiveHighDays,
    strainHistory: getStrainHistory(dailyLoadsArr, calibration.strainDivisor),
    forecast,
    recentSessions: getRecentSessions(sessions28d),
    readiness,
    trends,
    calibration,
    sleepScore,
    avgSleepLast3,
    ...enhancedFields,
  };
}
