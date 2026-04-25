// Deterministic post-processor for cut/weight plan AI output.
//
// The LLM is instructed to produce a `weeklyPlan` array with one row per week
// from now until the goal date, ending at the final target weight. In
// practice the LLM occasionally drifts: it returns fewer weeks than asked,
// rounds the final week's targetWeight to a "nice" number, or skips a week
// in the middle. This helper enforces:
//
//   1. weeklyPlan.length === weekCount (cap applied by caller).
//   2. weeklyPlan[i].week === i + 1 (sequential).
//   3. weeklyPlan[weekCount - 1].targetWeight === finalTarget (exact end).
//   4. Linear interpolation fills missing weeks/targetWeights.
//   5. Calories / macros: missing rows inherit from the closest filled row
//      (week 1 from week 2 / a default if absent), so the caller can always
//      surface a per-week macro plan to the user.
//
// We intentionally do NOT mutate the LLM's per-week macros for filled rows —
// AI tapers macros across the plan and that nuance is worth keeping.

export interface WeeklyPlanRow {
  week: number;
  targetWeight: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  focus?: string;
}

export interface NormaliseInput {
  weeklyPlan: Partial<WeeklyPlanRow>[] | null | undefined;
  weekCount: number;
  startWeight: number;
  finalTarget: number;
  defaultCalories: number;
  defaultProtein: number;
  defaultCarbs: number;
  defaultFats: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pickRow(rows: Partial<WeeklyPlanRow>[], week: number): Partial<WeeklyPlanRow> | undefined {
  return rows.find((r) => Number(r?.week) === week);
}

function nearestFilled(rows: Partial<WeeklyPlanRow>[], week: number): Partial<WeeklyPlanRow> | undefined {
  const sorted = [...rows].filter((r) => r && Number.isFinite(Number(r.week)))
    .sort((a, b) => Math.abs(Number(a.week) - week) - Math.abs(Number(b.week) - week));
  return sorted[0];
}

/**
 * Returns a fully-populated weeklyPlan of exactly `weekCount` rows, with
 * targetWeight linearly interpolated between startWeight and finalTarget,
 * and macros backfilled from the nearest LLM-provided row (or defaults).
 */
export function normaliseWeeklyPlan(input: NormaliseInput): WeeklyPlanRow[] {
  const { weekCount, startWeight, finalTarget } = input;
  const rows = Array.isArray(input.weeklyPlan) ? input.weeklyPlan : [];

  const totalDelta = finalTarget - startWeight; // negative for weight loss
  const out: WeeklyPlanRow[] = [];

  for (let i = 0; i < weekCount; i++) {
    const weekNum = i + 1;
    const fraction = weekCount === 1 ? 1 : (i + 1) / weekCount;
    const interpolatedTarget = round1(startWeight + totalDelta * fraction);

    const llm = pickRow(rows, weekNum);
    const fallback = nearestFilled(rows, weekNum);

    // Final week is always EXACTLY the goal — never trust the LLM to land it.
    const isFinal = i === weekCount - 1;

    const targetWeightRaw = isFinal
      ? finalTarget
      : (Number.isFinite(Number(llm?.targetWeight)) ? Number(llm!.targetWeight) : interpolatedTarget);

    const calories = Number.isFinite(Number(llm?.calories))
      ? Math.round(Number(llm!.calories))
      : Number.isFinite(Number(fallback?.calories))
        ? Math.round(Number(fallback!.calories))
        : input.defaultCalories;

    const protein_g = Number.isFinite(Number(llm?.protein_g))
      ? Math.round(Number(llm!.protein_g))
      : Number.isFinite(Number(fallback?.protein_g))
        ? Math.round(Number(fallback!.protein_g))
        : input.defaultProtein;

    const carbs_g = Number.isFinite(Number(llm?.carbs_g))
      ? Math.round(Number(llm!.carbs_g))
      : Number.isFinite(Number(fallback?.carbs_g))
        ? Math.round(Number(fallback!.carbs_g))
        : input.defaultCarbs;

    const fats_g = Number.isFinite(Number(llm?.fats_g))
      ? Math.round(Number(llm!.fats_g))
      : Number.isFinite(Number(fallback?.fats_g))
        ? Math.round(Number(fallback!.fats_g))
        : input.defaultFats;

    out.push({
      week: weekNum,
      targetWeight: round1(targetWeightRaw),
      calories,
      protein_g,
      carbs_g,
      fats_g,
      focus: typeof llm?.focus === "string" ? llm.focus : "",
    });
  }

  return out;
}
