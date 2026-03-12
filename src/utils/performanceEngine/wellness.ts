import type { PersonalBaseline, BalanceMetric, BalanceDirection, BalanceSeverity, AthleteCalibration, LoadZoneInfo } from "./types";
import { clamp, mapRange, zScore } from "./helpers";

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
  if (avgDeficit7d == null) return 100;
  const deficit = Math.abs(avgDeficit7d);
  if (deficit <= 200) return 100;
  if (deficit <= 500) return Math.round(mapRange(deficit, 200, 500, 100, 60));
  if (deficit <= 800) return Math.round(mapRange(deficit, 500, 800, 60, 30));
  return Math.round(mapRange(deficit, 800, 1200, 30, 10));
}

export function computeWellnessScore(hooperIndex: number, baseline: PersonalBaseline | null): number {
  if (baseline && baseline.hooper_mean_60d != null && baseline.hooper_std_60d != null && baseline.hooper_std_60d >= 0.01) {
    const z = zScore(hooperIndex, baseline.hooper_mean_60d, baseline.hooper_std_60d);
    return Math.round(clamp(0, 100, mapRange(z, -2, 2, 0, 100)));
  }
  return Math.round(clamp(0, 100, mapRange(hooperIndex, 4, 28, 0, 100)));
}

export function computeStabilityScore(hooperCV14d: number | null): number {
  if (hooperCV14d == null) return 50;
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
