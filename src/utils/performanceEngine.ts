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

export interface ForecastResult {
  predictedStrain: number;
  predictedLoadRatio: number;
  predictedOvertrainingScore: number;
  isRestDay: boolean;
}

export interface AllMetrics {
  strain: number;           // Today's 0-21 strain
  dailyLoad: number;        // Today's raw load
  acuteLoad: number;        // Sum of last 7 daily loads
  chronicLoad: number;      // Average of last 28 daily loads
  loadRatio: number;        // acuteLoad / (chronicLoad + 1)
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
// strain = 21 * (1 - e^(-dailyLoad / 1000))
// Clamped 0-21. Diminishing returns at high loads.
export function calculateStrain(load: number): number {
  const strain = 21 * (1 - Math.exp(-load / 1000));
  const clamped = Math.min(21, Math.max(0, strain));

  if (import.meta.env.DEV) {
    console.log('[PE] strain:', { load, strain: clamped });
  }

  return clamped;
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

// ─── Overtraining Risk Engine ────────────────────────────────
// Score 0-100 based on multiple risk factors
function computeOvertrainingScore(
  loadRatio: number,
  avgRPE7d: number,
  avgSoreness7d: number,
  consecutiveHighDays: number,
  sessionsLast7d: number,
): OvertrainingRisk {
  let score = 0;
  const factors: string[] = [];

  // Load ratio spikes
  if (loadRatio > 1.5) {
    score += 40;
    factors.push('Severe acute load spike (ratio > 1.5)');
  } else if (loadRatio > 1.3) {
    score += 25;
    factors.push('Elevated acute load (ratio > 1.3)');
  }

  // Average RPE
  if (avgRPE7d > 8) {
    score += 15;
    factors.push('Average RPE over 8 in last 7 days');
  }

  // Average soreness
  if (avgSoreness7d > 7) {
    score += 20;
    factors.push('High average soreness (>7) in last 7 days');
  }

  // Consecutive high strain days (strain > 15)
  if (consecutiveHighDays >= 3) {
    score += 20;
    factors.push(`${consecutiveHighDays} consecutive high-strain days`);
  }

  // Session frequency
  if (sessionsLast7d >= 5) {
    score += 15;
    factors.push('5+ sessions in last 7 days');
  }

  score = Math.min(100, Math.max(0, score));

  let zone: OvertrainingRisk['zone'];
  if (score <= 30) zone = 'low';
  else if (score <= 60) zone = 'moderate';
  else if (score <= 80) zone = 'high';
  else zone = 'critical';

  if (import.meta.env.DEV) {
    console.log('[PE] overtrainingScore:', { score, zone, factors });
  }

  return { score, zone, factors };
}

// ─── Rest Day Logic ──────────────────────────────────────────
// When a rest day is logged, apply recovery adjustments
export function applyRestDayRecovery(
  currentOvertrainingScore: number,
  sorenessLevel: number,
  sleepQuality: string | null,
): number {
  // Good recovery conditions: reduce by 15%
  if (sorenessLevel <= 4 && sleepQuality === 'good') {
    return Math.max(0, currentOvertrainingScore * 0.85);
  }
  // Poor recovery: reduce by only 5%
  return Math.max(0, currentOvertrainingScore * 0.95);
}

// ─── Helper: Get 7-day strain history ────────────────────────
function getStrainHistory(dailyLoads: { date: string; load: number; sessions: SessionRow[] }[]): DailyStrainEntry[] {
  return dailyLoads.slice(-7).map(d => ({
    date: d.date,
    strain: calculateStrain(d.load),
    dailyLoad: d.load,
    sessionCount: d.sessions.filter(s => s.session_type !== 'Rest').length,
  }));
}

// ─── Helper: Consecutive high-strain days ────────────────────
function getConsecutiveHighStrainDays(dailyLoads: { date: string; load: number }[]): number {
  let count = 0;
  // Walk backwards from today
  for (let i = dailyLoads.length - 1; i >= 0; i--) {
    if (calculateStrain(dailyLoads[i].load) > 15) {
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

// ─── Forecast ────────────────────────────────────────────────
function computeForecast(
  dailyLoads: { date: string; load: number }[],
  currentOvertrainingScore: number,
): ForecastResult {
  // Predict tomorrow's load as average of last 3 days
  const last3 = dailyLoads.slice(-3);
  const avgLoad = last3.reduce((sum, d) => sum + d.load, 0) / last3.length;

  // Projected with training
  const predictedStrain = calculateStrain(avgLoad);

  // Projected load ratio with one more day of avg load
  const acuteWithPredicted = dailyLoads.slice(-6).reduce((sum, d) => sum + d.load, 0) + avgLoad;
  const chronicWithPredicted = (dailyLoads.reduce((sum, d) => sum + d.load, 0) + avgLoad) / 29;
  const predictedLoadRatio = acuteWithPredicted / (chronicWithPredicted + 1);

  // Simple OT projection
  const predictedOvertrainingScore = Math.min(100, currentOvertrainingScore + (predictedLoadRatio > 1.3 ? 10 : -5));

  return {
    predictedStrain,
    predictedLoadRatio,
    predictedOvertrainingScore: Math.max(0, predictedOvertrainingScore),
    isRestDay: false,
  };
}

// ─── Master Function ─────────────────────────────────────────
export function computeAllMetrics(sessions28d: SessionRow[]): AllMetrics {
  const dailyLoadsArr = buildDailyLoads(sessions28d);
  const { acuteLoad, chronicLoad, loadRatio } = computeLoadMetrics(dailyLoadsArr);

  const todayEntry = dailyLoadsArr[dailyLoadsArr.length - 1];
  const todayStrain = calculateStrain(todayEntry.load);

  const avgRPE7d = getAvgRPE7d(sessions28d);
  const avgSoreness7d = getAvgSoreness7d(sessions28d);
  const consecutiveHighDays = getConsecutiveHighStrainDays(dailyLoadsArr);
  const sessionsLast7d = getSessionsLast7d(sessions28d);

  const overtrainingRisk = computeOvertrainingScore(
    loadRatio,
    avgRPE7d,
    avgSoreness7d,
    consecutiveHighDays,
    sessionsLast7d,
  );

  // Check if today has rest day sessions — apply recovery
  const todayRestSessions = todayEntry.sessions?.filter(s => s.session_type === 'Rest') || [];
  if (todayRestSessions.length > 0) {
    const restSession = todayRestSessions[0];
    const adjusted = applyRestDayRecovery(
      overtrainingRisk.score,
      restSession.soreness_level,
      restSession.sleep_quality ?? null,
    );
    overtrainingRisk.score = adjusted;
    // Recalculate zone
    if (adjusted <= 30) overtrainingRisk.zone = 'low';
    else if (adjusted <= 60) overtrainingRisk.zone = 'moderate';
    else if (adjusted <= 80) overtrainingRisk.zone = 'high';
    else overtrainingRisk.zone = 'critical';
  }

  const forecast = computeForecast(dailyLoadsArr, overtrainingRisk.score);

  if (import.meta.env.DEV) {
    console.log('[PE] allMetrics:', {
      strain: todayStrain,
      acuteLoad,
      chronicLoad,
      loadRatio,
      overtrainingScore: overtrainingRisk.score,
      overtrainingZone: overtrainingRisk.zone,
    });
  }

  return {
    strain: todayStrain,
    dailyLoad: todayEntry.load,
    acuteLoad,
    chronicLoad,
    loadRatio,
    overtrainingRisk,
    weeklySessionCount: sessionsLast7d,
    avgSleep: getAvgSleep(sessions28d),
    latestSleep: getLatestSleep(sessions28d),
    latestSoreness: getLatestSoreness(sessions28d),
    avgRPE7d,
    avgSoreness7d,
    sessionsLast7d,
    consecutiveHighDays,
    strainHistory: getStrainHistory(dailyLoadsArr),
    forecast,
    recentSessions: getRecentSessions(sessions28d),
  };
}
