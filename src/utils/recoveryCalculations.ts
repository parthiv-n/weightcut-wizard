// Pure scoring engine for WHOOP-style recovery metrics
// No React or Supabase dependencies

export interface SessionRow {
  id: string;
  date: string;
  session_type: string;
  duration_minutes: number;
  rpe: number;
  intensity: 'low' | 'moderate' | 'high';
  soreness_level: number;
  sleep_hours: number;
  user_id: string;
  created_at: string;
}

export interface RecoveryStatus {
  score: number;
  status: 'green' | 'yellow' | 'red';
}

export interface OvertrainingRisk {
  level: 'low' | 'moderate' | 'high';
  factors: string[];
}

export interface AllMetrics {
  strain: number;
  recoveryScore: RecoveryStatus;
  acRatio: number;
  overtrainingRisk: OvertrainingRisk;
  weeklySessionCount: number;
  avgSleep: number;
  latestSleep: number;
  latestSoreness: number;
  consecutiveHighDays: number;
  recentSessions: SessionRow[];
}

// Group sessions by date string
function groupByDate(sessions: SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const existing = map.get(s.date) || [];
    existing.push(s);
    map.set(s.date, existing);
  }
  return map;
}

// Raw load for a set of sessions on one day
function rawLoad(sessions: SessionRow[]): number {
  return sessions.reduce((sum, s) => sum + s.rpe * s.duration_minutes, 0);
}

// Strain on a 0-21 logarithmic scale
export function dailyStrain(sessions: SessionRow[]): number {
  if (sessions.length === 0) return 0;
  const load = rawLoad(sessions);
  const strain = 7 * Math.log2(1 + load / 100);
  return Math.min(21, Math.max(0, strain));
}

// Acute:Chronic workload ratio over 28 days
export function acuteChronicRatio(sessions28d: SessionRow[]): number {
  const grouped = groupByDate(sessions28d);

  // Build array of daily loads for last 28 days
  const today = new Date();
  const dailyLoads: number[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    dailyLoads.push(rawLoad(daySessions));
  }

  const acute = dailyLoads.slice(-7).reduce((a, b) => a + b, 0);
  const chronic = dailyLoads.reduce((a, b) => a + b, 0) / 4; // avg weekly over 4 weeks

  return chronic > 0 ? acute / chronic : 1.0;
}

export function recoveryScore(
  sleep: number,
  soreness: number,
  loadRatio: number,
  consecutiveHighDays: number
): RecoveryStatus {
  let score = 100;

  // Sleep deductions
  if (sleep < 6) score -= 30;
  else if (sleep < 7) score -= 15;
  else if (sleep < 8) score -= 5;

  // Soreness deduction
  score -= soreness * 3;

  // Load ratio deductions
  if (loadRatio > 1.5) score -= 25;
  else if (loadRatio > 1.3) score -= 15;
  else if (loadRatio > 1.1) score -= 5;

  // Consecutive high strain days
  score -= consecutiveHighDays * 5;

  score = Math.min(100, Math.max(0, score));

  let status: 'green' | 'yellow' | 'red';
  if (score >= 67) status = 'green';
  else if (score >= 34) status = 'yellow';
  else status = 'red';

  return { score, status };
}

export function overtrainingRisk(
  loadRatio: number,
  weeklyCount: number,
  highRpeFreq: number,
  sorenessTrend: number
): OvertrainingRisk {
  let riskPoints = 0;
  const factors: string[] = [];

  // AC ratio spikes
  if (loadRatio > 1.5) {
    riskPoints += 3;
    factors.push("Acute load spike detected (AC ratio > 1.5)");
  } else if (loadRatio > 1.3) {
    riskPoints += 2;
    factors.push("Elevated acute load (AC ratio > 1.3)");
  }

  // High weekly volume
  if (weeklyCount >= 10) {
    riskPoints += 2;
    factors.push("Very high session frequency (10+/week)");
  } else if (weeklyCount >= 7) {
    riskPoints += 1;
    factors.push("High session frequency (7+/week)");
  }

  // Frequent high RPE sessions
  if (highRpeFreq >= 4) {
    riskPoints += 2;
    factors.push("Too many high-RPE sessions (4+ in 7 days)");
  } else if (highRpeFreq >= 3) {
    riskPoints += 1;
    factors.push("Multiple high-RPE sessions (3 in 7 days)");
  }

  // Soreness trending up
  if (sorenessTrend > 3) {
    riskPoints += 2;
    factors.push("Soreness trending upward");
  } else if (sorenessTrend > 1) {
    riskPoints += 1;
    factors.push("Moderate soreness reported");
  }

  let level: 'low' | 'moderate' | 'high';
  if (riskPoints >= 5) level = 'high';
  else if (riskPoints >= 3) level = 'moderate';
  else level = 'low';

  return { level, factors };
}

// Get consecutive high-strain days ending at today
function getConsecutiveHighStrainDays(sessions28d: SessionRow[]): number {
  const grouped = groupByDate(sessions28d);
  const today = new Date();
  let count = 0;

  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = grouped.get(dateStr) || [];
    const strain = dailyStrain(daySessions);
    if (strain > 14) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

// Get latest sleep value, looking back up to 3 days
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

  return 8; // default
}

// Get latest soreness value, looking back up to 3 days
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

  return 0; // default
}

// Average soreness over last 7 days (trend indicator)
function getSorenessTrend(sessions28d: SessionRow[]): number {
  const today = new Date();
  const recentSessions: SessionRow[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const matching = sessions28d.filter(s => s.date === dateStr);
    recentSessions.push(...matching);
  }

  const withSoreness = recentSessions.filter(s => s.soreness_level > 0);
  if (withSoreness.length === 0) return 0;
  return withSoreness.reduce((sum, s) => sum + s.soreness_level, 0) / withSoreness.length;
}

// Count sessions with RPE >= 8 in last 7 days
function getHighRpeFreq(sessions28d: SessionRow[]): number {
  const today = new Date();
  let count = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const matching = sessions28d.filter(s => s.date === dateStr && s.rpe >= 8);
    count += matching.length;
  }

  return count;
}

// Average sleep over sessions that have sleep logged
function getAvgSleep(sessions28d: SessionRow[]): number {
  const withSleep = sessions28d.filter(s => s.sleep_hours > 0);
  if (withSleep.length === 0) return 0;
  return withSleep.reduce((sum, s) => sum + s.sleep_hours, 0) / withSleep.length;
}

// Count sessions in last 7 days
function getWeeklySessionCount(sessions28d: SessionRow[]): number {
  const today = new Date();
  let count = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    count += sessions28d.filter(s => s.date === dateStr).length;
  }

  return count;
}

// Get last 7 days of sessions (up to 15) for AI payload
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

// Today's strain from today's sessions
function getTodayStrain(sessions28d: SessionRow[]): number {
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = sessions28d.filter(s => s.date === todayStr);
  return dailyStrain(todaySessions);
}

export function computeAllMetrics(sessions28d: SessionRow[]): AllMetrics {
  const acRatio = acuteChronicRatio(sessions28d);
  const consecutiveHighDays = getConsecutiveHighStrainDays(sessions28d);
  const latestSleep = getLatestSleep(sessions28d);
  const latestSoreness = getLatestSoreness(sessions28d);
  const weeklySessionCount = getWeeklySessionCount(sessions28d);
  const highRpeFreq = getHighRpeFreq(sessions28d);
  const sorenessTrend = getSorenessTrend(sessions28d);

  return {
    strain: getTodayStrain(sessions28d),
    recoveryScore: recoveryScore(latestSleep, latestSoreness, acRatio, consecutiveHighDays),
    acRatio,
    overtrainingRisk: overtrainingRisk(acRatio, weeklySessionCount, highRpeFreq, sorenessTrend),
    weeklySessionCount,
    avgSleep: getAvgSleep(sessions28d),
    latestSleep,
    latestSoreness,
    consecutiveHighDays,
    recentSessions: getRecentSessions(sessions28d),
  };
}
