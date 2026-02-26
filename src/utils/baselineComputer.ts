// Baseline Computer — fetches historical data and computes rolling statistics
// Called after check-in submission and on dashboard mount if stale (>24h)

import { supabase } from "@/integrations/supabase/client";
import { AIPersistence } from "@/lib/aiPersistence";
import type { PersonalBaseline } from "./performanceEngine";

const BASELINE_CACHE_KEY = 'personal_baseline';
const BASELINE_CACHE_HOURS = 24;

interface WellnessRow {
  date: string;
  sleep_quality: number;
  stress_level: number;
  fatigue_level: number;
  soreness_level: number;
  hooper_index: number;
  sleep_hours: number | null;
}

interface NutritionDayTotal {
  date: string;
  totalCalories: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function cv(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return std(values) / m;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function computeAndStoreBaseline(userId: string, tdee?: number | null): Promise<PersonalBaseline | null> {
  try {
    const ninetyDaysAgo = daysAgo(90);
    const today = new Date().toISOString().split('T')[0];

    // Fetch wellness check-ins (last 90 days)
    const { data: wellnessData } = await supabase
      .from('daily_wellness_checkins')
      .select('date, sleep_quality, stress_level, fatigue_level, soreness_level, hooper_index, sleep_hours')
      .eq('user_id', userId)
      .gte('date', ninetyDaysAgo)
      .order('date', { ascending: true });

    const wellness: WellnessRow[] = (wellnessData ?? []) as WellnessRow[];

    if (wellness.length < 3) {
      // Not enough data to compute meaningful baselines
      return null;
    }

    // Fetch nutrition logs (last 90 days) for deficit calculation
    const { data: nutritionData } = await supabase
      .from('nutrition_logs')
      .select('date, calories')
      .eq('user_id', userId)
      .gte('date', ninetyDaysAgo)
      .order('date', { ascending: true });

    // Aggregate nutrition by day
    const nutritionByDay = new Map<string, number>();
    for (const row of nutritionData ?? []) {
      const existing = nutritionByDay.get(row.date) ?? 0;
      nutritionByDay.set(row.date, existing + (row.calories ?? 0));
    }

    // Fetch daily loads from fight_camp_calendar (last 90 days)
    const { data: sessionData } = await supabase
      .from('fight_camp_calendar')
      .select('date, duration_minutes, rpe, intensity, intensity_level, session_type')
      .eq('user_id', userId)
      .gte('date', ninetyDaysAgo)
      .order('date', { ascending: true });

    // Compute daily loads
    const loadByDay = new Map<string, number>();
    for (const s of sessionData ?? []) {
      if (s.session_type === 'Rest' || s.session_type === 'Recovery') continue;
      const intensityLevel = s.intensity_level ?? (s.intensity === 'low' ? 1 : s.intensity === 'high' ? 5 : 3);
      const multipliers: Record<number, number> = { 1: 0.8, 2: 1.0, 3: 1.15, 4: 1.3, 5: 1.5 };
      const load = (s.rpe ?? 5) * (s.duration_minutes ?? 0) * (multipliers[intensityLevel] ?? 1.0);
      const existing = loadByDay.get(s.date) ?? 0;
      loadByDay.set(s.date, existing + load);
    }

    // Split into 14-day and 60-day windows
    const fourteenDaysAgo = daysAgo(14);
    const sixtyDaysAgo = daysAgo(60);

    const recent14 = wellness.filter(w => w.date >= fourteenDaysAgo);
    const recent60 = wellness.filter(w => w.date >= sixtyDaysAgo);

    // Helper to extract metric values
    const extract = (rows: WellnessRow[], fn: (w: WellnessRow) => number | null): number[] =>
      rows.map(fn).filter((v): v is number => v != null);

    // Compute baseline object
    const baseline: PersonalBaseline = {
      sleep_hours_mean_14d: recent14.length > 0 ? mean(extract(recent14, w => w.sleep_hours)) : null,
      sleep_hours_std_14d: recent14.length > 1 ? std(extract(recent14, w => w.sleep_hours)) : null,
      soreness_mean_14d: recent14.length > 0 ? mean(recent14.map(w => w.soreness_level)) : null,
      soreness_std_14d: recent14.length > 1 ? std(recent14.map(w => w.soreness_level)) : null,
      fatigue_mean_14d: recent14.length > 0 ? mean(recent14.map(w => w.fatigue_level)) : null,
      fatigue_std_14d: recent14.length > 1 ? std(recent14.map(w => w.fatigue_level)) : null,
      stress_mean_14d: recent14.length > 0 ? mean(recent14.map(w => w.stress_level)) : null,
      stress_std_14d: recent14.length > 1 ? std(recent14.map(w => w.stress_level)) : null,
      hooper_mean_14d: recent14.length > 0 ? mean(recent14.map(w => w.hooper_index)) : null,
      hooper_std_14d: recent14.length > 1 ? std(recent14.map(w => w.hooper_index)) : null,
      daily_load_mean_14d: null,
      daily_load_std_14d: null,

      sleep_hours_mean_60d: recent60.length > 0 ? mean(extract(recent60, w => w.sleep_hours)) : null,
      sleep_hours_std_60d: recent60.length > 1 ? std(extract(recent60, w => w.sleep_hours)) : null,
      soreness_mean_60d: recent60.length > 0 ? mean(recent60.map(w => w.soreness_level)) : null,
      soreness_std_60d: recent60.length > 1 ? std(recent60.map(w => w.soreness_level)) : null,
      fatigue_mean_60d: recent60.length > 0 ? mean(recent60.map(w => w.fatigue_level)) : null,
      fatigue_std_60d: recent60.length > 1 ? std(recent60.map(w => w.fatigue_level)) : null,
      stress_mean_60d: recent60.length > 0 ? mean(recent60.map(w => w.stress_level)) : null,
      stress_std_60d: recent60.length > 1 ? std(recent60.map(w => w.stress_level)) : null,
      hooper_mean_60d: recent60.length > 0 ? mean(recent60.map(w => w.hooper_index)) : null,
      hooper_std_60d: recent60.length > 1 ? std(recent60.map(w => w.hooper_index)) : null,
      daily_load_mean_60d: null,
      daily_load_std_60d: null,

      hooper_cv_14d: recent14.length >= 3 ? cv(recent14.map(w => w.hooper_index)) : null,

      avg_deficit_7d: null,
      avg_deficit_14d: null,
    };

    // Compute daily load stats for 14d and 60d windows
    const loadValues14d: number[] = [];
    const loadValues60d: number[] = [];
    for (let i = 0; i < 60; i++) {
      const d = daysAgo(i);
      const load = loadByDay.get(d) ?? 0;
      if (i < 14) loadValues14d.push(load);
      loadValues60d.push(load);
    }
    if (loadValues14d.length > 0) {
      baseline.daily_load_mean_14d = mean(loadValues14d);
      baseline.daily_load_std_14d = std(loadValues14d);
    }
    if (loadValues60d.length > 0) {
      baseline.daily_load_mean_60d = mean(loadValues60d);
      baseline.daily_load_std_60d = std(loadValues60d);
    }

    // Compute caloric deficit if TDEE is available
    if (tdee && tdee > 0) {
      const deficits7d: number[] = [];
      const deficits14d: number[] = [];
      for (let i = 0; i < 14; i++) {
        const d = daysAgo(i);
        const intake = nutritionByDay.get(d);
        if (intake != null) {
          const deficit = tdee - intake; // positive = deficit
          if (i < 7) deficits7d.push(deficit);
          deficits14d.push(deficit);
        }
      }
      if (deficits7d.length > 0) baseline.avg_deficit_7d = mean(deficits7d);
      if (deficits14d.length > 0) baseline.avg_deficit_14d = mean(deficits14d);
    }

    // Persist to database
    await supabase.from('personal_baselines').upsert({
      user_id: userId,
      baseline_date: today,
      ...baseline,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,baseline_date' });

    // Cache locally
    AIPersistence.save(userId, BASELINE_CACHE_KEY, baseline, BASELINE_CACHE_HOURS);

    return baseline;
  } catch (err) {
    console.error('[BaselineComputer] Error computing baseline:', err);
    return null;
  }
}

export function loadCachedBaseline(userId: string): PersonalBaseline | null {
  return AIPersistence.load(userId, BASELINE_CACHE_KEY);
}

export async function loadOrComputeBaseline(userId: string, tdee?: number | null): Promise<PersonalBaseline | null> {
  // Try cache first
  const cached = loadCachedBaseline(userId);
  if (cached) return cached;

  // Compute fresh
  return computeAndStoreBaseline(userId, tdee);
}

export async function storeReadinessScore(userId: string, date: string, score: number): Promise<void> {
  try {
    await supabase
      .from('daily_wellness_checkins')
      .update({ readiness_score: score })
      .eq('user_id', userId)
      .eq('date', date);
  } catch (err) {
    console.error('[BaselineComputer] Error storing readiness score:', err);
  }
}
