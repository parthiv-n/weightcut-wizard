// Server-side training load math for the recovery coach edge function.
// Ported from src/utils/performanceEngine/{load,readiness}.ts — kept intentionally
// simple. These numbers are fed into a system prompt as athlete context, not used
// for UI-critical calculations.

export interface SessionRow {
  date: string;
  session_type: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  intensity: string | null;
  intensity_level: number | null;
  soreness_level: number | null;
  sleep_hours: number | null;
  fatigue_level?: number | null;
  sleep_quality?: string | null;
  mobility_done?: boolean | null;
  notes?: string | null;
}

const INTENSITY_LEVEL_MULT: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.2,
  5: 1.4,
};

const INTENSITY_LEGACY_MULT: Record<string, number> = {
  low: 0.7,
  moderate: 1.0,
  high: 1.3,
};

function intensityMultiplier(s: SessionRow): number {
  if (s.intensity_level && INTENSITY_LEVEL_MULT[s.intensity_level]) {
    return INTENSITY_LEVEL_MULT[s.intensity_level];
  }
  if (s.intensity && INTENSITY_LEGACY_MULT[s.intensity.toLowerCase()]) {
    return INTENSITY_LEGACY_MULT[s.intensity.toLowerCase()];
  }
  return 1.0;
}

function isTraining(s: SessionRow): boolean {
  const t = (s.session_type || "").toLowerCase();
  return t !== "rest" && t !== "recovery";
}

export function sessionLoad(s: SessionRow): number {
  if (!isTraining(s)) return 0;
  const rpe = s.rpe ?? 0;
  const dur = s.duration_minutes ?? 0;
  return rpe * dur * intensityMultiplier(s);
}

export function dailyLoadByDate(sessions: SessionRow[]): Map<string, number> {
  const byDate = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (!s.date) continue;
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const out = new Map<string, number>();
  for (const [date, list] of byDate) {
    const training = list.filter(isTraining);
    if (training.length === 0) {
      out.set(date, 0);
      continue;
    }
    const sum = training.reduce((acc, s) => acc + sessionLoad(s), 0);
    out.set(date, training.length > 1 ? sum * 1.1 : sum);
  }
  return out;
}

export function strainFromLoad(load: number, divisor = 1000): number {
  const s = 21 * (1 - Math.exp(-load / divisor));
  return Math.max(0, Math.min(21, s));
}

export type LoadZone = "detraining" | "optimal" | "pushing" | "overreaching";

export interface LoadMetrics {
  todayLoad: number;
  todayStrain: number;
  acuteLoad: number;     // 7d sum
  chronicLoad: number;   // 28d daily avg
  loadRatio: number;     // acute / (chronic * 7), clamped 0..3
  loadZone: LoadZone;
  avgRpe7d: number | null;
  avgSoreness7d: number | null;
  avgSleep7d: number | null;
  sessionsLast7d: number;
  recentSessions: SessionRow[];
}

function zoneFor(ratio: number): LoadZone {
  if (ratio < 0.8) return "detraining";
  if (ratio <= 1.3) return "optimal";
  if (ratio <= 1.5) return "pushing";
  return "overreaching";
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeLoadMetrics(sessions: SessionRow[], today = new Date()): LoadMetrics {
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().split("T")[0];

  const dailyLoads = dailyLoadByDate(sessions);
  const todayLoad = dailyLoads.get(todayStr) ?? 0;

  // Build last 28 daily-load values
  const last28: number[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().split("T")[0];
    last28.push(dailyLoads.get(d) ?? 0);
  }
  const acuteLoad = last28.slice(0, 7).reduce((a, b) => a + b, 0);
  const chronicLoad = last28.reduce((a, b) => a + b, 0) / 28;
  const loadRatio = chronicLoad > 0 ? Math.min(3, acuteLoad / (chronicLoad * 7)) : 0;

  const last7Sessions = sessions.filter((s) => s.date >= sevenDaysAgo && s.date <= todayStr && isTraining(s));
  const avgRpe7d = avg(last7Sessions.map((s) => s.rpe ?? 0).filter((v) => v > 0));
  const avgSoreness7d = avg(
    last7Sessions
      .map((s) => s.soreness_level)
      .filter((v): v is number => v != null),
  );
  const avgSleep7d = avg(
    last7Sessions
      .map((s) => s.sleep_hours)
      .filter((v): v is number => v != null && v > 0),
  );

  return {
    todayLoad,
    todayStrain: strainFromLoad(todayLoad),
    acuteLoad,
    chronicLoad,
    loadRatio,
    loadZone: zoneFor(loadRatio),
    avgRpe7d,
    avgSoreness7d,
    avgSleep7d,
    sessionsLast7d: last7Sessions.length,
    recentSessions: sessions
      .filter((s) => s.date >= sevenDaysAgo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
  };
}
