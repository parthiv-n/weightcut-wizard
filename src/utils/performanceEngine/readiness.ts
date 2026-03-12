import type { SessionRow, AthleteCalibration, ReadinessResult, WellnessCheckIn, PersonalBaseline } from "./types";
import { clamp, mapRange, getRecentSleepValues, getRecentSorenessValues } from "./helpers";
import { computeWellnessScore, computeDeficitImpactScore, computeStabilityScore, autoRegressiveSmooth } from "./wellness";

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
    sleepScore = 50;
  } else {
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

    sleepScore = clamp(0, 100, mapRange(weightedSleep, baseline - 3, baseline + 1, 0, 100));
  }

  // ── Soreness Score (25%) ──
  const recentSoreness = getRecentSorenessValues(sessions28d, 3);
  let sorenessScore: number;
  if (recentSoreness.length === 0) {
    sorenessScore = 80;
  } else {
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

    sorenessScore = clamp(0, 100, mapRange(weightedSoreness, 0, 10, 100, 0));
  }

  // ── Load Balance Score (25%) ──
  const { caution, danger } = calibration.loadRatioThresholds;
  let loadBalanceScore: number;
  if (loadRatio < 0.8) {
    loadBalanceScore = 70;
  } else if (loadRatio <= caution) {
    loadBalanceScore = 100;
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
    consistencyScore = 50;
  } else {
    const mean = last7Loads.reduce((s, l) => s + l, 0) / last7Loads.length;
    const variance = last7Loads.reduce((s, l) => s + (l - mean) ** 2, 0) / last7Loads.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
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
      tier: 1 as const,
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
  const baseResult = computeReadiness(sessions28d, dailyLoadsArr, loadRatio, calibration);
  const { sleepScore, sorenessScore, loadBalanceScore, recoveryScore, consistencyScore } = baseResult.breakdown;

  // Tier 1: No check-in data
  if (!todayCheckIn) {
    return {
      ...baseResult,
      breakdown: { ...baseResult.breakdown, tier: 1 },
    };
  }

  const wellnessScore = computeWellnessScore(todayCheckIn.hooper_index, baseline ?? null);

  const hydrationScore = todayCheckIn.hydration_feeling != null
    ? Math.round(mapRange(todayCheckIn.hydration_feeling, 1, 5, 20, 100))
    : 50;

  // Tier 2: Check-in but no baseline yet
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

// ─── Granular Rest Day Recovery ─────────────────────────────
export function applyRestDayRecovery(
  currentOvertrainingScore: number,
  sorenessLevel: number,
  sleepQuality: string | null,
  sleepHours?: number | null,
  fatigueLevel?: number | null,
  mobilityDone?: boolean | null,
): number {
  if (sleepHours === undefined && fatigueLevel === undefined && mobilityDone === undefined) {
    if (sorenessLevel <= 4 && sleepQuality === 'good') {
      return Math.max(0, currentOvertrainingScore * 0.85);
    }
    return Math.max(0, currentOvertrainingScore * 0.95);
  }

  let recoveryPct = 5;

  if (sleepQuality === 'good') recoveryPct += 8;
  else if (sleepQuality === 'poor') recoveryPct += 2;

  const hours = sleepHours ?? 0;
  if (hours >= 8) recoveryPct += 5;
  else if (hours >= 7) recoveryPct += 3;
  else if (hours >= 6) recoveryPct += 1;

  if (sorenessLevel <= 2) recoveryPct += 5;
  else if (sorenessLevel <= 4) recoveryPct += 3;
  else if (sorenessLevel <= 6) recoveryPct += 1;

  const fatigue = fatigueLevel ?? 10;
  if (fatigue <= 3) recoveryPct += 4;
  else if (fatigue <= 5) recoveryPct += 2;
  else if (fatigue <= 7) recoveryPct += 1;

  if (mobilityDone) recoveryPct += 3;

  recoveryPct = clamp(5, 25, recoveryPct);

  return Math.max(0, currentOvertrainingScore * (1 - recoveryPct / 100));
}
