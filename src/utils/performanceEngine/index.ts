// WHOOP-style Deterministic Performance Engine
// All strain/load/overtraining calculations are non-AI
// LLM only interprets — never calculates

import { logger } from "@/lib/logger";
import type { SessionRow, AllMetrics, OvertrainingRisk, WellnessCheckIn, PersonalBaseline } from "./types";
import { clamp, mapRange, groupByDate } from "./helpers";
import { sessionLoad, dailyLoad, calculateStrain } from "./load";
import { deriveCalibration } from "./calibration";
import { getLoadZone, computeBalanceMetrics, computeDeficitImpactScore, computeWellnessScore, computeStabilityScore } from "./wellness";
import { computeEnhancedReadiness, applyRestDayRecovery } from "./readiness";
import { detectTrends, detectEnhancedTrends } from "./trends";
import {
  getStrainHistory, getConsecutiveHighStrainDays,
  getAvgRPE7d, getAvgSoreness7d, getSessionsLast7d,
  getLatestSleep, getLatestSoreness, getAvgSleep, getRecentSessions,
  computeForecast, computeSleepScore, getAvgSleepLast3,
} from "./stats";

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

  logger.info('[PE] loadMetrics', { acuteLoad, chronicLoad, loadRatio });

  return { acuteLoad, chronicLoad, loadRatio };
}

// ─── Adaptive Overtraining Score ────────────────────────────

function computeAdaptiveOvertrainingScore(
  loadRatio: number,
  avgRPE7d: number,
  avgSoreness7d: number,
  consecutiveHighDays: number,
  sessionsLast7d: number,
  calibration: import("./types").AthleteCalibration,
  trends: import("./types").TrendAlerts,
): OvertrainingRisk {
  let score = 0;
  const factors: string[] = [];

  const { caution, danger } = calibration.loadRatioThresholds;
  if (loadRatio > danger) {
    score += 40;
    factors.push(`Severe acute load spike (ratio ${loadRatio.toFixed(2)} > ${danger})`);
  } else if (loadRatio > caution) {
    score += Math.round(mapRange(loadRatio, caution, danger, 15, 40));
    factors.push(`Elevated acute load (ratio ${loadRatio.toFixed(2)} > ${caution})`);
  }

  if (avgRPE7d > calibration.rpeCeiling) {
    const overBy = avgRPE7d - calibration.rpeCeiling;
    const rpePenalty = Math.round(clamp(0, 25, overBy * 10));
    score += rpePenalty;
    factors.push(`Average RPE ${avgRPE7d.toFixed(1)} exceeds ceiling ${calibration.rpeCeiling}`);
  }

  if (avgSoreness7d > 6) {
    const sorenessPenalty = Math.round(mapRange(avgSoreness7d, 6, 10, 10, 25));
    score += sorenessPenalty;
    factors.push(`High average soreness (${avgSoreness7d.toFixed(1)}/10) in last 7 days`);
  }

  if (consecutiveHighDays >= 3) {
    score += 20;
    factors.push(`${consecutiveHighDays} consecutive high-strain days`);
  }

  if (sessionsLast7d >= calibration.sessionFrequencyFlagThreshold) {
    score += 15;
    factors.push(`${sessionsLast7d} sessions in last 7 days (threshold: ${calibration.sessionFrequencyFlagThreshold})`);
  }

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

  logger.info('[PE] adaptiveOvertrainingScore', { score, zone, factors, tier: calibration.tier });

  return { score, zone, factors };
}

// ─── Master Function ─────────────────────────────────────────
export function computeAllMetrics(
  sessions28d: SessionRow[],
  profileFreq?: number | null,
  activityLevel?: string | null,
  todayCheckIn?: WellnessCheckIn | null,
  baseline?: PersonalBaseline | null,
  previousDayReadiness?: number | null,
  sleepLogs?: { date: string; hours: number }[],
): AllMetrics {
  const calibration = deriveCalibration(
    profileFreq ?? null,
    activityLevel ?? null,
    sessions28d,
  );

  const dailyLoadsArr = buildDailyLoads(sessions28d);
  const { acuteLoad, chronicLoad, loadRatio } = computeLoadMetrics(dailyLoadsArr);

  const todayEntry = dailyLoadsArr[dailyLoadsArr.length - 1];
  const todayStrain = calculateStrain(todayEntry.load, calibration.strainDivisor);

  const avgRPE = getAvgRPE7d(sessions28d);
  const avgSoreness = getAvgSoreness7d(sessions28d);
  const consecutiveHighDays = getConsecutiveHighStrainDays(dailyLoadsArr, calibration.strainDivisor);
  const sessionsLast7d = getSessionsLast7d(sessions28d);

  const trends = baseline
    ? detectEnhancedTrends(sessions28d, dailyLoadsArr, baseline, sleepLogs)
    : detectTrends(sessions28d, dailyLoadsArr, sleepLogs);

  const overtrainingRisk = computeAdaptiveOvertrainingScore(
    loadRatio,
    avgRPE,
    avgSoreness,
    consecutiveHighDays,
    sessionsLast7d,
    calibration,
    trends,
  );

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

  const readiness = computeEnhancedReadiness(
    sessions28d, dailyLoadsArr, loadRatio, calibration,
    todayCheckIn, baseline, previousDayReadiness,
  );

  const forecast = computeForecast(dailyLoadsArr, overtrainingRisk.score, calibration);

  const sleepScore = computeSleepScore(sessions28d, sleepLogs);
  const avgSleepLast3 = getAvgSleepLast3(sessions28d, sleepLogs);

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

  logger.info('[PE] allMetrics', {
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

  return {
    strain: todayStrain,
    dailyLoad: todayEntry.load,
    acuteLoad,
    chronicLoad,
    loadRatio,
    loadZone: getLoadZone(loadRatio, calibration),
    overtrainingRisk,
    weeklySessionCount: sessionsLast7d,
    avgSleep: getAvgSleep(sessions28d, sleepLogs),
    latestSleep: getLatestSleep(sessions28d, sleepLogs),
    latestSoreness: getLatestSoreness(sessions28d),
    avgRPE7d: avgRPE,
    avgSoreness7d: avgSoreness,
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

// ─── Re-exports ──────────────────────────────────────────────
// All consumers import from @/utils/performanceEngine — barrel re-exports everything

export type {
  SessionRow, SleepLog, OvertrainingRisk, DailyStrainEntry, LoadZone, LoadZoneInfo,
  ForecastResult, AthleteTier, AthleteCalibration, TrendAlerts,
  ReadinessBreakdown, EnhancedReadinessBreakdown, ReadinessResult,
  WellnessCheckIn, BalanceDirection, BalanceSeverity, BalanceMetric,
  PersonalBaseline, AllMetrics,
} from "./types";

export { clamp, mapRange, getRecentSleepValues, getRecentSorenessValues, zScore } from "./helpers";
export { sessionLoad, dailyLoad, calculateStrain } from "./load";
export { deriveCalibration } from "./calibration";
export {
  computeBalanceMetrics, computeDeficitImpactScore, computeWellnessScore,
  computeStabilityScore, autoRegressiveSmooth, getLoadZone,
} from "./wellness";
export { computeReadiness, computeEnhancedReadiness, applyRestDayRecovery } from "./readiness";
export { detectTrends, detectEnhancedTrends } from "./trends";
