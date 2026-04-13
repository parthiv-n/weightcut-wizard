import type { SessionRow } from "./types";

export function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const clamped = clamp(inMin, inMax, value);
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function groupByDate(sessions: SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const existing = map.get(s.date) || [];
    existing.push(s);
    map.set(s.date, existing);
  }
  return map;
}

const DEFAULT_SLEEP_HOURS = 8;

export function getRecentSleepValues(sessions: SessionRow[], count: number, sleepLogs?: { date: string; hours: number }[]): number[] {
  const grouped = groupByDate(sessions);
  const today = new Date();
  const sleepByDate = new Map<string, number>();
  if (sleepLogs) {
    for (const log of sleepLogs) {
      if (log.hours > 0) sleepByDate.set(log.date, log.hours);
    }
  }

  const values: number[] = [];
  for (let i = 0; i < 28 && values.length < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Check sleep_logs first
    const loggedSleep = sleepByDate.get(dateStr);
    if (loggedSleep) {
      values.push(loggedSleep);
      continue;
    }

    // If training happened that day but no sleep was logged, default to 8h
    const daySessions = grouped.get(dateStr) || [];
    if (daySessions.length > 0) {
      const sessionSleep = daySessions.find(s => s.sleep_hours > 0);
      values.push(sessionSleep ? sessionSleep.sleep_hours : DEFAULT_SLEEP_HOURS);
      continue;
    }
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

export function zScore(value: number, mean: number, std: number): number {
  if (std < 0.01) return 0;
  return (value - mean) / std;
}

// ─── Intensity Multiplier ────────────────────────────────────
const INTENSITY_MULTIPLIERS: Record<number, number> = {
  1: 0.8,
  2: 1.0,
  3: 1.15,
  4: 1.3,
  5: 1.5,
};

export function intensityToLevel(session: SessionRow): number {
  if (session.intensity_level != null && session.intensity_level >= 1 && session.intensity_level <= 5) {
    return session.intensity_level;
  }
  switch (session.intensity) {
    case 'low': return 1;
    case 'moderate': return 3;
    case 'high': return 5;
    default: return 3;
  }
}

export function getIntensityMultiplier(session: SessionRow): number {
  const level = intensityToLevel(session);
  return INTENSITY_MULTIPLIERS[level] ?? 1.0;
}
