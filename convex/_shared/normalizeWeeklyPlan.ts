/** Ported as-is from supabase/functions/_shared/normalizeWeeklyPlan.ts. */

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

function pickRow(rows: Partial<WeeklyPlanRow>[], week: number) {
  return rows.find((r) => Number(r?.week) === week);
}

function nearestFilled(rows: Partial<WeeklyPlanRow>[], week: number) {
  const sorted = [...rows]
    .filter((r) => r && Number.isFinite(Number(r.week)))
    .sort((a, b) => Math.abs(Number(a.week) - week) - Math.abs(Number(b.week) - week));
  return sorted[0];
}

export function normaliseWeeklyPlan(input: NormaliseInput): WeeklyPlanRow[] {
  const { weekCount, startWeight, finalTarget } = input;
  const rows = Array.isArray(input.weeklyPlan) ? input.weeklyPlan : [];
  const totalDelta = finalTarget - startWeight;
  const out: WeeklyPlanRow[] = [];
  for (let i = 0; i < weekCount; i++) {
    const weekNum = i + 1;
    const fraction = weekCount === 1 ? 1 : (i + 1) / weekCount;
    const interp = round1(startWeight + totalDelta * fraction);
    const llm = pickRow(rows, weekNum);
    const fallback = nearestFilled(rows, weekNum);
    const isFinal = i === weekCount - 1;
    const targetWeightRaw = isFinal
      ? finalTarget
      : Number.isFinite(Number(llm?.targetWeight))
        ? Number(llm!.targetWeight)
        : interp;
    const pick = (k: keyof WeeklyPlanRow, def: number) =>
      Number.isFinite(Number(llm?.[k]))
        ? Math.round(Number(llm![k]))
        : Number.isFinite(Number(fallback?.[k]))
          ? Math.round(Number(fallback![k]))
          : def;
    out.push({
      week: weekNum,
      targetWeight: round1(targetWeightRaw),
      calories: pick("calories", input.defaultCalories),
      protein_g: pick("protein_g", input.defaultProtein),
      carbs_g: pick("carbs_g", input.defaultCarbs),
      fats_g: pick("fats_g", input.defaultFats),
      focus: typeof llm?.focus === "string" ? llm.focus : "",
    });
  }
  return out;
}
