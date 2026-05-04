/**
 * Deterministic math utilities for plan generation.
 *
 * All functions here are pure TypeScript — no LLM calls. Use these to compute
 * facts (BMR, TDEE, deficits, macros, projections) and inject them into prompts
 * so the model never invents numbers.
 *
 * Deno-compatible: no npm imports.
 */

// ─── BMR / TDEE ────────────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor BMR (kcal/day).
 * Reference: Mifflin et al. 1990, J Am Diet Assoc.
 *   Male:   10W + 6.25H − 5A + 5
 *   Female: 10W + 6.25H − 5A − 161
 */
export function mifflinStJeor(opts: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "male" | "female";
}): number {
  const { weightKg, heightCm, ageYears, sex } = opts;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const bmr = sex === "male" ? base + 5 : base - 161;
  return Math.round(bmr);
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,    // little to no exercise
  light: 1.375,      // light exercise 1-3x/wk
  moderate: 1.55,    // moderate exercise 3-5x/wk
  very: 1.725,       // hard exercise 6-7x/wk
  athlete: 1.9,      // 2x/day training, fight camp
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_MULTIPLIERS;

export function tdee(bmr: number, activityLevel: ActivityLevel): number {
  const mult = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderate;
  return Math.round(bmr * mult);
}

// ─── Macros ────────────────────────────────────────────────────────────────

/**
 * Compute macro split (grams) for a given kcal target.
 *  - cut:      protein 2.2 g/kg, fat 0.9 g/kg, carb = remainder
 *  - recomp:   protein 2.0 g/kg, fat 0.9 g/kg, carb = remainder
 *  - maintain: protein 1.8 g/kg, fat 0.9 g/kg, carb = remainder
 *
 * Carb minimum is floored at 20g to avoid negative values on extreme cuts.
 */
export function macroSplit(
  kcal: number,
  weightKg: number,
  goal: "cut" | "maintain" | "recomp",
): { protein_g: number; carb_g: number; fat_g: number } {
  const proteinPerKg = goal === "cut" ? 2.2 : goal === "recomp" ? 2.0 : 1.8;
  const fatPerKg = 0.9;

  const protein_g = Math.round(weightKg * proteinPerKg);
  const fat_g = Math.round(weightKg * fatPerKg);
  const remainderKcal = kcal - protein_g * 4 - fat_g * 9;
  const carb_g = Math.max(20, Math.round(remainderKcal / 4));

  return { protein_g, carb_g, fat_g };
}

// ─── Deficit / projection ──────────────────────────────────────────────────

/**
 * Required daily kcal deficit to lose a given amount of fat over N days.
 * Uses 7700 kcal/kg fat (standard energy density).
 *
 * Caps the deficit at 25% of TDEE. Callers should pass `tdee` whenever they
 * have the user's real maintenance — the `currentKg * 30` fallback is a
 * conservative floor that under-estimates athletes (typical 35-40 kcal/kg)
 * and would otherwise throttle their deficit aggressively.
 *
 * `waterCutAllowanceKg` lets you subtract a planned water-cut amount from the
 * total to lose through diet (used in fight-camp flows).
 */
export function requiredDeficit(opts: {
  currentKg: number;
  targetKg: number;
  daysRemaining: number;
  waterCutAllowanceKg?: number;
  tdee?: number;
}): { dailyDeficitKcal: number; estimatedFatLossKg: number; estimatedWaterLossKg: number } {
  const { currentKg, targetKg, daysRemaining } = opts;
  const waterCutAllowanceKg = Math.max(0, opts.waterCutAllowanceKg ?? 0);

  const totalToLose = Math.max(0, currentKg - targetKg);
  const fatLossKg = Math.max(0, totalToLose - waterCutAllowanceKg);
  const days = Math.max(1, Math.round(daysRemaining));

  const rawDeficit = (fatLossKg * 7700) / days;
  // Safety cap: 25% of TDEE. Prefer the caller-supplied tdee (accurate); fall
  // back to currentKg × 30 only when unavailable. Real TDEE check still
  // happens in safetyBounds downstream.
  const estTdee = opts.tdee && opts.tdee > 0 ? opts.tdee : currentKg * 30;
  const cappedDeficit = Math.min(rawDeficit, estTdee * 0.25);

  return {
    dailyDeficitKcal: Math.round(cappedDeficit),
    estimatedFatLossKg: Number(fatLossKg.toFixed(2)),
    estimatedWaterLossKg: Number(waterCutAllowanceKg.toFixed(2)),
  };
}

/**
 * Linear regression projection over the last 14 days of weight logs.
 * Returns `null` if there are fewer than 4 valid points in that window.
 *
 * `daysAhead` is days from the *latest log date* (not from today).
 */
export function projectWeight(
  weightLogs: Array<{ date: string; weight: number }>,
  daysAhead: number,
): number | null {
  if (!Array.isArray(weightLogs) || weightLogs.length < 4) return null;

  // Sort ascending and take last 14 days from the latest log's date.
  const parsed = weightLogs
    .map((l) => ({ t: new Date(l.date).getTime(), w: Number(l.weight) }))
    .filter((l) => Number.isFinite(l.t) && Number.isFinite(l.w))
    .sort((a, b) => a.t - b.t);

  if (parsed.length < 4) return null;

  const latestT = parsed[parsed.length - 1].t;
  const cutoff = latestT - 14 * 24 * 60 * 60 * 1000;
  const window = parsed.filter((p) => p.t >= cutoff);
  if (window.length < 4) return null;

  // Convert times to days-from-first-point for numerical stability.
  const t0 = window[0].t;
  const xs = window.map((p) => (p.t - t0) / (24 * 60 * 60 * 1000));
  const ys = window.map((p) => p.w);
  const n = xs.length;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den; // kg/day
  const intercept = meanY - slope * meanX;

  const xTarget = (latestT - t0) / (24 * 60 * 60 * 1000) + daysAhead;
  return Number((slope * xTarget + intercept).toFixed(2));
}

// ─── Safety bounds ─────────────────────────────────────────────────────────

/**
 * Validate that a generated plan meets minimum safety thresholds.
 * Returns `ok: true` only if all checks pass.
 */
export function safetyBounds(plan: {
  dailyKcal: number;
  proteinG: number;
  weightLossPerWeekKg: number;
  weightKg: number;
  bmr: number;
}): { ok: boolean; violations: string[] } {
  const violations: string[] = [];

  if (plan.dailyKcal < plan.bmr * 0.85) {
    violations.push(
      `dailyKcal (${plan.dailyKcal}) is below 85% of BMR (${Math.round(plan.bmr * 0.85)})`,
    );
  }
  // Hard floor for adults regardless of BMR
  if (plan.dailyKcal < 1200) {
    violations.push(`dailyKcal (${plan.dailyKcal}) is below absolute floor 1200 kcal`);
  }
  if (plan.proteinG < plan.weightKg * 1.4) {
    violations.push(
      `proteinG (${plan.proteinG}) is below 1.4 g/kg minimum (${Math.round(plan.weightKg * 1.4)}g)`,
    );
  }
  const maxWeeklyLoss = plan.weightKg * 0.015; // 1.5% bw/wk
  if (plan.weightLossPerWeekKg > maxWeeklyLoss) {
    violations.push(
      `weightLossPerWeekKg (${plan.weightLossPerWeekKg.toFixed(2)}) exceeds 1.5% bw/wk (${maxWeeklyLoss.toFixed(2)}kg)`,
    );
  }

  return { ok: violations.length === 0, violations };
}

// ─── Macro sum validation (meals → daily target) ──────────────────────────

/**
 * Verify that a list of meals sums to roughly the target kcal AND that the
 * macro grams (4P + 4C + 9F) reconcile with the stated kcal per meal.
 *
 * Tolerances:
 *  - Sum of meal kcal ≈ target_kcal ± 3%
 *  - For each meal: (4P + 4C + 9F) ≈ kcal ± 5%
 */
export function macroSumValid(
  meals: Array<{ kcal: number; protein_g: number; carb_g: number; fat_g: number }>,
  target_kcal: number,
): { ok: boolean; sumKcal: number; macroKcalCheck: boolean } {
  if (!Array.isArray(meals) || meals.length === 0) {
    return { ok: false, sumKcal: 0, macroKcalCheck: false };
  }

  const sumKcal = meals.reduce((a, m) => a + (Number(m.kcal) || 0), 0);
  const sumOk = Math.abs(sumKcal - target_kcal) / Math.max(1, target_kcal) <= 0.03;

  let macroKcalCheck = true;
  for (const m of meals) {
    const computed = 4 * (Number(m.protein_g) || 0) + 4 * (Number(m.carb_g) || 0) + 9 * (Number(m.fat_g) || 0);
    const stated = Number(m.kcal) || 0;
    if (stated <= 0 || Math.abs(computed - stated) / stated > 0.05) {
      macroKcalCheck = false;
      break;
    }
  }

  return { ok: sumOk && macroKcalCheck, sumKcal: Math.round(sumKcal), macroKcalCheck };
}

// ─── Reid Reale water-cut protocol (deterministic) ─────────────────────────

/**
 * Evidence-based 2-day water taper (Reale et al. 2018, IJSNEM).
 *
 * Day -2 (high load):  fluid 100 ml/kg, sodium 100 mg/kg
 * Day -1 (taper):      fluid  50 ml/kg, sodium  50 mg/kg
 * Day  0 (cut day):    fluid   0 ml,    sodium   0 mg
 *
 * Returns deterministic protocol numbers — the LLM should only narrate, never
 * recompute these values.
 */
export function reidRealeWaterCut(weightKg: number): {
  dayMinus2: { fluidML: number; sodiumMg: number };
  dayMinus1: { fluidML: number; sodiumMg: number };
  dayZero: { fluidML: number; sodiumMg: number };
} {
  const w = Math.max(40, weightKg);
  return {
    dayMinus2: { fluidML: Math.round(w * 100), sodiumMg: Math.round(w * 100) },
    dayMinus1: { fluidML: Math.round(w * 50), sodiumMg: Math.round(w * 50) },
    dayZero: { fluidML: 0, sodiumMg: 0 },
  };
}
