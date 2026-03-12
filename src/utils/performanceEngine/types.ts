// WHOOP-style Deterministic Performance Engine — Types

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
