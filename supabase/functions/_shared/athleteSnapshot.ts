// athleteSnapshot.ts
// Single source of truth for athlete context across every AI edge function.
// Reads profile + last 14d of weight, nutrition (meals_with_totals), gym_sessions,
// gym_sets, fight_camp_calendar, sleep_logs, hydration_logs, daily_wellness_checkins,
// and upcoming fight_camps in parallel, then computes deterministic rollups (TDEE,
// BMR, 7-day macro/training averages, weight slope, projection at fight) in TypeScript.
//
// Every field is optional — never throws, returns whatever it could compute.
// No cache — Supabase Edge Functions are stateless. Each call rebuilds from DB.
// All queries are bounded with .limit() so a pathological user can't blow up an AI call.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AthleteSnapshot {
  // Identity
  userId: string;
  weightClass?: string;
  sport?: string;
  sex?: "male" | "female";
  age?: number;
  heightCm?: number;
  // Current state
  currentWeight?: number;
  targetWeight?: number;
  kgToCut?: number;
  daysToFight?: number;
  fightCampPhase?: "early" | "mid" | "fight-week" | null;
  // 7-day rollups (deterministic, computed in TS)
  weightSlope7d?: number;        // kg/day, negative = losing
  calorieAvg7d?: number;
  proteinAvg7d?: number;
  carbAvg7d?: number;
  fatAvg7d?: number;
  trainingVolumeKg7d?: number;   // sum of weight*reps across gym_sets
  trainingSessions7d?: number;   // count of gym_sessions
  hardSessions7d?: number;       // gym_sessions with avg_rpe >= 8
  sleepAvgHours7d?: number;
  hydrationMlAvg7d?: number;
  // Computed scores (using deterministic formulas)
  tdee?: number;
  bmr?: number;
  recoveryStatus?: "green" | "yellow" | "red";
  glycogenStatus?: "depleted" | "partial" | "full";
  weightProjectionAtFight?: number;
  adherenceScore?: number;       // 0-100, % days in last 7 with full log
}

// No cache — Supabase Edge Functions are stateless serverless isolates,
// so module-global state would be per-isolate (no persistence, no cross-instance
// sharing) and unbounded. Kept as a no-op export for backwards compatibility
// in case any future caller tries to invalidate after a mutation.
export function invalidateSnapshot(_userId: string): void {
  // intentionally empty — no cache to invalidate
}

const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
  athlete: 1.9,
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function avg(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Linear regression slope (kg/day) over a date-indexed weight series.
// Using least-squares, x=days-since-first-sample, y=kg.
function linearSlope(points: { date: string; weight: number }[]): number | undefined {
  if (points.length < 2) return undefined;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const xs = sorted.map((p) => (new Date(p.date).getTime() - t0) / 86400000);
  const ys = sorted.map((p) => p.weight);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return undefined;
  return num / den;
}

function computeBMR(sex: "male" | "female", weightKg: number, heightCm: number, age: number): number {
  // Mifflin-St Jeor
  return sex === "male"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export async function buildAthleteSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<AthleteSnapshot> {
  const today = todayIso();
  const sevenDaysAgo = isoDaysAgo(7);
  const fourteenDaysAgo = isoDaysAgo(14);
  const threeDaysAgo = isoDaysAgo(3);

  // Single-roundtrip parallel fetch — never sequential.
  const [
    profileRes,
    weight14dRes,
    meals7dRes,
    sessions7dRes,
    sets7dRes,
    sets3dRes,
    sleep7dRes,
    hydration7dRes,
    wellness7dRes,
    fightCampRes,
    todayWellnessRes,
  ] = await Promise.allSettled([
    supabase
      .from("profiles")
      .select(
        "age, sex, height_cm, current_weight_kg, goal_weight_kg, target_date, " +
          "activity_level, bmr, tdee, athlete_type",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("weight_logs")
      .select("date, weight_kg")
      .eq("user_id", userId)
      .gte("date", fourteenDaysAgo)
      .order("date", { ascending: false })
      .limit(60),
    supabase
      .from("meals_with_totals")
      .select("date, total_calories, total_protein_g, total_carbs_g, total_fats_g")
      .eq("user_id", userId)
      .gte("date", sevenDaysAgo)
      .limit(60), // ~7 days x ~8 meals/day
    supabase
      .from("gym_sessions")
      .select("id, date, session_type, perceived_fatigue")
      .eq("user_id", userId)
      .gte("date", sevenDaysAgo)
      .limit(30),
    // TODO(athleteSnapshot): gym_sets has no `date` column — `created_at` misses
    // retroactive logs. Fixing requires joining via gym_sessions(id, date), which
    // is a more invasive refactor. Tracking for follow-up.
    supabase
      .from("gym_sets")
      .select("session_id, weight_kg, reps, rpe, is_warmup")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .limit(200), // ~30 sets x ~5 sessions/wk = 150; 200 ceiling for heavy users
    supabase
      .from("gym_sets")
      .select("weight_kg, reps, is_warmup")
      .eq("user_id", userId)
      .gte("created_at", threeDaysAgo)
      .limit(200),
    supabase
      .from("sleep_logs")
      .select("date, hours")
      .eq("user_id", userId)
      .gte("date", sevenDaysAgo)
      .limit(60), // ~7 days, allows multiple logs/day defensively
    supabase
      .from("hydration_logs")
      .select("date, amount_ml")
      .eq("user_id", userId)
      .gte("date", sevenDaysAgo)
      .limit(60),
    supabase
      .from("daily_wellness_checkins")
      .select("date, soreness_level, fatigue_level, sleep_hours")
      .eq("user_id", userId)
      .gte("date", sevenDaysAgo)
      .limit(30), // 7 days expected, 30 is a generous ceiling
    supabase
      .from("fight_camps")
      .select("name, fight_date, starting_weight_kg, end_weight_kg")
      .eq("user_id", userId)
      .gte("fight_date", today)
      .order("fight_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("daily_wellness_checkins")
      .select("soreness_level, fatigue_level, sleep_hours")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle(),
  ]);

  const data = <T,>(r: PromiseSettledResult<{ data: T | null }>): T | null =>
    r.status === "fulfilled" ? (r.value.data ?? null) : null;
  const list = <T,>(r: PromiseSettledResult<{ data: T[] | null }>): T[] =>
    r.status === "fulfilled" ? (r.value.data ?? []) : [];

  const profile = data<{
    age: number | null;
    sex: string | null;
    height_cm: number | string | null;
    current_weight_kg: number | string | null;
    goal_weight_kg: number | string | null;
    target_date: string | null;
    activity_level: string | null;
    bmr: number | null;
    tdee: number | null;
    athlete_type: string | null;
  }>(profileRes);
  const weight14d = list<{ date: string; weight_kg: number | string }>(weight14dRes);
  const meals7d = list<{
    date: string;
    total_calories: number;
    total_protein_g: number | string;
    total_carbs_g: number | string;
    total_fats_g: number | string;
  }>(meals7dRes);
  const sessions7d = list<{ id: string; date: string; perceived_fatigue: number | null }>(sessions7dRes);
  const sets7d = list<{
    session_id: string;
    weight_kg: number | null;
    reps: number;
    rpe: number | null;
    is_warmup: boolean;
  }>(sets7dRes);
  const sets3d = list<{ weight_kg: number | null; reps: number; is_warmup: boolean }>(sets3dRes);
  const sleep7d = list<{ date: string; hours: number | string }>(sleep7dRes);
  const hydration7d = list<{ date: string; amount_ml: number }>(hydration7dRes);
  const wellness7d = list<{
    date: string;
    soreness_level: number | null;
    fatigue_level: number | null;
    sleep_hours: number | null;
  }>(wellness7dRes);
  const fightCamp = data<{
    name: string | null;
    fight_date: string | null;
    starting_weight_kg: number | null;
    end_weight_kg: number | null;
  }>(fightCampRes);
  const todayWellness = data<{
    soreness_level: number | null;
    fatigue_level: number | null;
    sleep_hours: number | null;
  }>(todayWellnessRes);

  const snap: AthleteSnapshot = { userId };

  // Identity / current state from profile
  if (profile) {
    if (profile.sex === "male" || profile.sex === "female") snap.sex = profile.sex;
    if (typeof profile.age === "number") snap.age = profile.age;
    if (profile.height_cm != null) snap.heightCm = Number(profile.height_cm);
    if (profile.current_weight_kg != null) snap.currentWeight = Number(profile.current_weight_kg);
    if (profile.goal_weight_kg != null) snap.targetWeight = Number(profile.goal_weight_kg);
    if (profile.athlete_type) snap.sport = profile.athlete_type;
    if (typeof profile.tdee === "number") snap.tdee = profile.tdee;
    if (typeof profile.bmr === "number") snap.bmr = profile.bmr;
    if (snap.currentWeight != null && snap.targetWeight != null) {
      snap.kgToCut = Math.max(0, +(snap.currentWeight - snap.targetWeight).toFixed(2));
    }
  }

  // Most recent weight overrides profile if newer log exists
  if (weight14d.length > 0) {
    const latest = weight14d[0];
    snap.currentWeight = Number(latest.weight_kg);
    if (snap.targetWeight != null) {
      snap.kgToCut = Math.max(0, +(snap.currentWeight - snap.targetWeight).toFixed(2));
    }
  }

  // BMR / TDEE — compute fresh if we have inputs (overrides stale profile cache).
  if (
    snap.sex &&
    snap.currentWeight != null &&
    snap.heightCm != null &&
    snap.age != null
  ) {
    snap.bmr = Math.round(computeBMR(snap.sex, snap.currentWeight, snap.heightCm, snap.age));
    const mult = ACTIVITY_MULT[profile?.activity_level ?? ""] ?? 1.55;
    snap.tdee = Math.round(snap.bmr * mult);
  }

  // Days to fight + camp phase
  const fightDate =
    fightCamp?.fight_date ??
    (profile?.target_date as string | undefined);
  if (fightDate) {
    // UTC-based; uses floor so a user in a positive-offset TZ on fight day still
    // sees 0 instead of a phantom 1. TODO: accept an optional `timezone` param
    // for proper local-day boundaries.
    const days = Math.floor((new Date(fightDate).getTime() - Date.now()) / 86400000);
    snap.daysToFight = days;
    if (days <= 7) snap.fightCampPhase = "fight-week";
    else if (days <= 28) snap.fightCampPhase = "mid";
    else snap.fightCampPhase = "early";
  } else {
    snap.fightCampPhase = null;
  }

  // Weight slope (kg/day) via linear regression on last 14d
  if (weight14d.length >= 2) {
    const slope = linearSlope(weight14d.map((w) => ({ date: w.date, weight: Number(w.weight_kg) })));
    if (slope != null) snap.weightSlope7d = +slope.toFixed(4);
  }

  // 7-day macro averages — only count days that have a log (avg over actual log days, not 7).
  if (meals7d.length > 0) {
    const byDay = new Map<string, { c: number; p: number; cb: number; f: number }>();
    for (const m of meals7d) {
      const cur = byDay.get(m.date) ?? { c: 0, p: 0, cb: 0, f: 0 };
      cur.c += Number(m.total_calories) || 0;
      cur.p += Number(m.total_protein_g) || 0;
      cur.cb += Number(m.total_carbs_g) || 0;
      cur.f += Number(m.total_fats_g) || 0;
      byDay.set(m.date, cur);
    }
    const days = Array.from(byDay.values());
    snap.calorieAvg7d = Math.round(avg(days.map((d) => d.c)) ?? 0) || undefined;
    snap.proteinAvg7d = Math.round(avg(days.map((d) => d.p)) ?? 0) || undefined;
    snap.carbAvg7d = Math.round(avg(days.map((d) => d.cb)) ?? 0) || undefined;
    snap.fatAvg7d = Math.round(avg(days.map((d) => d.f)) ?? 0) || undefined;
  }

  // Training rollups — volume excludes warmups, RPE >= 8 = "hard".
  snap.trainingSessions7d = sessions7d.length || undefined;
  if (sets7d.length > 0) {
    const volume = sets7d
      .filter((s) => !s.is_warmup && s.weight_kg != null)
      .reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0);
    snap.trainingVolumeKg7d = Math.round(volume) || undefined;

    // Group RPE by session and count sessions averaging >= 8
    const sessionRpe = new Map<string, number[]>();
    for (const s of sets7d) {
      if (s.rpe == null) continue;
      const list = sessionRpe.get(s.session_id) ?? [];
      list.push(s.rpe);
      sessionRpe.set(s.session_id, list);
    }
    let hard = 0;
    for (const rpes of sessionRpe.values()) {
      const a = avg(rpes);
      if (a != null && a >= 8) hard++;
    }
    snap.hardSessions7d = hard;
  }

  // Sleep + hydration
  // Prefer dedicated sleep_logs but fall back to wellness check-in sleep_hours.
  const sleepHours: number[] = [
    ...sleep7d.map((s) => Number(s.hours)).filter((n) => Number.isFinite(n) && n > 0),
    ...wellness7d.map((w) => w.sleep_hours).filter((n): n is number => n != null && n > 0),
  ];
  if (sleepHours.length > 0) snap.sleepAvgHours7d = +(avg(sleepHours) ?? 0).toFixed(1);

  if (hydration7d.length > 0) {
    snap.hydrationMlAvg7d = Math.round(avg(hydration7d.map((h) => h.amount_ml)) ?? 0);
  }

  // Recovery status
  // red: low sleep + many hard sessions, OR today's wellness shows high fatigue + soreness.
  const avgSoreness7d = avg(
    wellness7d.map((w) => w.soreness_level).filter((n): n is number => n != null),
  );
  const todayFatigue = todayWellness?.fatigue_level ?? null;
  const todaySoreness = todayWellness?.soreness_level ?? null;
  const lowSleep = (snap.sleepAvgHours7d ?? Infinity) < 6;
  const manyHard = (snap.hardSessions7d ?? 0) >= 4;
  const acuteRed =
    todayFatigue != null && todayFatigue >= 6 && (avgSoreness7d ?? 0) >= 5;
  const acuteYellow =
    (todaySoreness != null && todaySoreness >= 4) ||
    (snap.sleepAvgHours7d != null && snap.sleepAvgHours7d < 7);

  if ((lowSleep && manyHard) || acuteRed) snap.recoveryStatus = "red";
  else if (manyHard || acuteYellow) snap.recoveryStatus = "yellow";
  else if (snap.sleepAvgHours7d != null || snap.trainingSessions7d != null) snap.recoveryStatus = "green";

  // Glycogen status — last 3d intake vs TDEE × 0.85, vs 7d median training volume.
  if (snap.tdee && snap.calorieAvg7d) {
    // Use last-3d caloric intake from the same meals window — approximate via 7d avg.
    // (We don't pull a separate 3d query to keep this in 1 fan-out.)
    const cal3dProxy = snap.calorieAvg7d;
    const lowFuel = cal3dProxy < snap.tdee * 0.85;
    const trainingVolume3d = sets3d
      .filter((s) => !s.is_warmup && s.weight_kg != null)
      .reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0);
    const median7dDailyVolume = (snap.trainingVolumeKg7d ?? 0) / 7;
    const highTraining = trainingVolume3d > median7dDailyVolume * 3; // 3 days vs daily median
    if (lowFuel && highTraining) snap.glycogenStatus = "depleted";
    else if (lowFuel || highTraining) snap.glycogenStatus = "partial";
    else snap.glycogenStatus = "full";
  }

  // Weight projection at fight date — current + slope * daysToFight.
  if (snap.currentWeight != null && snap.weightSlope7d != null && snap.daysToFight != null) {
    snap.weightProjectionAtFight = +(snap.currentWeight + snap.weightSlope7d * snap.daysToFight).toFixed(2);
  }

  // Adherence: % days in last 7 with both a meal log and a weight log.
  const dayHasMeal = new Set(meals7d.map((m) => m.date));
  const dayHasWeight = new Set(weight14d.filter((w) => w.date >= sevenDaysAgo).map((w) => w.date));
  let logged = 0;
  for (let i = 0; i < 7; i++) {
    const d = isoDaysAgo(i);
    if (dayHasMeal.has(d) && dayHasWeight.has(d)) logged++;
  }
  snap.adherenceScore = Math.round((logged / 7) * 100);

  return snap;
}

export function snapshotToPromptBlock(s: AthleteSnapshot): string {
  const lines: string[] = ["ATHLETE STATE"];

  // Header line: weight cut + days to fight
  const w = s.currentWeight != null ? `${s.currentWeight.toFixed(1)}kg` : "?";
  const tw = s.targetWeight != null ? `${s.targetWeight.toFixed(1)}kg target` : "?";
  const over = s.kgToCut != null ? `(${s.kgToCut.toFixed(1)}kg over)` : "";
  const dtf =
    s.daysToFight != null
      ? ` | ${s.daysToFight} days to fight${s.fightCampPhase ? ` (${s.fightCampPhase})` : ""}`
      : "";
  lines.push(`Current: ${w} -> ${tw} ${over}${dtf}`.trim());

  // Identity
  const idBits: string[] = [];
  if (s.sex) idBits.push(s.sex);
  if (s.age != null) idBits.push(`${s.age}y`);
  if (s.heightCm != null) idBits.push(`${s.heightCm}cm`);
  if (s.sport) idBits.push(s.sport);
  if (s.weightClass) idBits.push(s.weightClass);
  if (idBits.length) lines.push(`Athlete: ${idBits.join(", ")}`);

  // Energy
  const energyBits: string[] = [];
  if (s.bmr != null) energyBits.push(`BMR ${s.bmr}`);
  if (s.tdee != null) energyBits.push(`TDEE ${s.tdee}`);
  if (s.calorieAvg7d != null) energyBits.push(`7d avg intake ${s.calorieAvg7d} kcal`);
  if (s.proteinAvg7d != null)
    energyBits.push(
      `${s.proteinAvg7d}P/${s.carbAvg7d ?? "?"}C/${s.fatAvg7d ?? "?"}F g`,
    );
  if (energyBits.length) lines.push(`Energy: ${energyBits.join(" | ")}`);

  // Weight trend
  if (s.weightSlope7d != null) {
    const direction = s.weightSlope7d < 0 ? "losing" : s.weightSlope7d > 0 ? "gaining" : "stable";
    const kgPerWeek = (s.weightSlope7d * 7).toFixed(2);
    let trend = `Trend: ${kgPerWeek}kg/wk (${direction})`;
    if (s.weightProjectionAtFight != null) {
      trend += ` -> projection at fight ${s.weightProjectionAtFight.toFixed(1)}kg`;
    }
    lines.push(trend);
  }

  // Training
  const trainBits: string[] = [];
  if (s.trainingSessions7d != null) trainBits.push(`${s.trainingSessions7d} sessions`);
  if (s.hardSessions7d != null) trainBits.push(`${s.hardSessions7d} hard (RPE>=8)`);
  if (s.trainingVolumeKg7d != null) trainBits.push(`${s.trainingVolumeKg7d.toLocaleString()} kg volume`);
  if (trainBits.length) lines.push(`Training (7d): ${trainBits.join(", ")}`);

  // Recovery
  const recBits: string[] = [];
  if (s.sleepAvgHours7d != null) recBits.push(`sleep ${s.sleepAvgHours7d}h`);
  if (s.hydrationMlAvg7d != null) recBits.push(`hydration ${s.hydrationMlAvg7d}ml`);
  if (s.recoveryStatus) recBits.push(`status ${s.recoveryStatus}`);
  if (s.glycogenStatus) recBits.push(`glycogen ${s.glycogenStatus}`);
  if (recBits.length) lines.push(`Recovery (7d): ${recBits.join(", ")}`);

  // Adherence
  if (s.adherenceScore != null) lines.push(`Adherence: ${s.adherenceScore}% days fully logged (last 7)`);

  return lines.join("\n");
}
