import type { ScoringConfig, SubScore } from "../types";

export function computeNutritionAdherence(
  meals: Array<{ date: string; calories: number; proteinG: number }>,
  targets: { calories: number | null; proteinG: number | null },
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  if (!targets.calories || !targets.proteinG) {
    return { value: 50, weight: 0, reason: "No calorie/protein targets configured" };
  }
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);

  const byDay = new Map<string, { calories: number; proteinG: number }>();
  for (const m of meals) {
    const t = new Date(m.date + "T00:00:00Z").getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    const cur = byDay.get(m.date) ?? { calories: 0, proteinG: 0 };
    cur.calories += m.calories;
    cur.proteinG += m.proteinG;
    byDay.set(m.date, cur);
  }

  const tolerance = cfg.nutrition.calorieToleranceFraction;
  const proteinPct = cfg.nutrition.proteinShortfallThresholdPct;
  let daysHitCalories = 0;
  let daysProteinShort = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (!day) {
      daysProteinShort++;
      continue;
    }
    const calorieMin = targets.calories * (1 - tolerance);
    const calorieMax = targets.calories * (1 + tolerance);
    if (day.calories >= calorieMin && day.calories <= calorieMax) daysHitCalories++;
    if (day.proteinG < targets.proteinG * (proteinPct / 100)) daysProteinShort++;
  }

  const calorieScore = (daysHitCalories / 7) * 100;
  const proteinPenalty = daysProteinShort * cfg.nutrition.proteinPenaltyPerDay;
  const value = Math.max(0, Math.min(100, calorieScore - proteinPenalty));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `${daysHitCalories}/7 days on target; ${daysProteinShort} low-protein day(s)`,
  };
}
