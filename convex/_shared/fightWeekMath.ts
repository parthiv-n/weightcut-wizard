/**
 * Deterministic fight-week math, server-side authoritative.
 *
 * Ported from src/utils/fightWeekEngine.ts so the Convex action computes the
 * same numbers the client engine produces. Pure TS, no DOM / no Convex deps.
 * Sources: ISSN 2025 Position Stand (Ricci et al.), Reale et al. 2017, SSE #183.
 */

export type FightWeekSafety = "green" | "orange" | "red";
export type FightWeekSex = "male" | "female";

export interface FightWeekDayProjection {
  day: number;
  label: string;
  projectedWeight: number;
  carbTarget_g: number;
  fibreTarget_g: number;
  sodiumTarget_mg: number;
  fluidTarget_ml: number;
  calorieTarget?: number;
  actions: string[];
  notes?: string;
}

export interface FightWeekBreakdown {
  totalToCut: number;
  percentBW: number;
  glycogenLoss: number;
  fibreLoss: number;
  sodiumLoss: number;
  waterLoadingLoss: number;
  dietTotal: number;
  dehydrationNeeded: number;
}

export interface FightWeekDehydration {
  percentBW: number;
  safety: FightWeekSafety;
  saunaSessions: number;
}

export interface FightWeekProjection {
  breakdown: FightWeekBreakdown;
  dehydration: FightWeekDehydration;
  timeline: FightWeekDayProjection[];
  maxSafeAWL: number;
  riskLevel: FightWeekSafety;
  safetyWarning: string | null;
}

// ── Component depletion estimates ───────────────────────────────

export function glycogenDepletion(bodyweightKg: number, daysAvailable: number): number {
  // ~1.2% BW (capped) as a stable estimate; reduced if <3 days.
  const base = Math.min(bodyweightKg * 0.012, 1.6);
  return daysAvailable < 3 ? base * 0.3 : base;
}

export function fibreReduction(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 2) return 0;
  if (daysAvailable < 4) return bodyweightKg * 0.0015;
  return bodyweightKg * 0.003;
}

export function sodiumManipulation(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 3) return 0;
  return Math.min(bodyweightKg * 0.002, 0.6);
}

export function waterLoadingBenefit(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 4) return 0;
  return bodyweightKg * 0.005;
}

// ── Safety zones ────────────────────────────────────────────────

export function getDehydrationSafety(
  dehydrationKg: number,
  bodyweightKg: number,
): FightWeekSafety {
  if (dehydrationKg <= 0 || bodyweightKg <= 0) return "green";
  const percent = (dehydrationKg / bodyweightKg) * 100;
  if (percent <= 3) return "green";
  if (percent <= 5) return "orange";
  return "red";
}

export function maxSafeCut(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable >= 3) return bodyweightKg * 0.067;
  if (daysAvailable >= 2) return bodyweightKg * 0.057;
  return bodyweightKg * 0.044;
}

export function estimateSaunaSessions(
  dehydrationKg: number,
  _bodyweightKg: number,
): number {
  if (dehydrationKg <= 0) return 0;
  // ~0.6 kg loss per sauna session (4x10min). Cap at 6 sessions/week.
  return Math.min(6, Math.ceil(dehydrationKg / 0.6));
}

// ── Timeline builder ────────────────────────────────────────────

function buildTimeline(
  currentWeight: number,
  targetWeighIn: number,
  daysUntilWeighIn: number,
  breakdown: FightWeekBreakdown,
  hasWaterLoading: boolean,
): FightWeekDayProjection[] {
  const days = Math.max(1, daysUntilWeighIn);
  const timeline: FightWeekDayProjection[] = [];
  const dietDays = Math.max(1, days - (breakdown.dehydrationNeeded > 0 ? 1 : 0));

  for (let i = 0; i < days; i++) {
    const dayNumber = -(days - 1 - i);
    const daysOut = days - 1 - i;
    const isWeighIn = i === days - 1;
    const isLastDay = i === days - 2;

    let label: string;
    if (isWeighIn) label = "Weigh-In Day";
    else if (daysOut === 1) label = "1 Day Out";
    else label = `${daysOut} Days Out`;

    // Carb targets
    let carbTarget_g: number;
    if (isWeighIn) {
      carbTarget_g = 30;
    } else if (daysOut >= days - 2 && days >= 4) {
      carbTarget_g = Math.round(currentWeight * 2);
    } else {
      carbTarget_g = 50;
    }

    // Fibre targets
    let fibreTarget_g: number;
    if (daysOut >= Math.floor(days * 0.7)) fibreTarget_g = 15;
    else if (daysOut >= 1) fibreTarget_g = 8;
    else fibreTarget_g = 0;

    // Sodium targets
    let sodiumTarget_mg: number;
    if (daysOut >= Math.floor(days * 0.6)) sodiumTarget_mg = 2500;
    else if (daysOut >= 1) sodiumTarget_mg = 2000;
    else sodiumTarget_mg = 1500;

    // Fluid targets (water-loading vs normal)
    let fluidTarget_ml: number;
    if (days >= 4 && hasWaterLoading) {
      if (i < 3) fluidTarget_ml = Math.round(currentWeight * 100);
      else if (daysOut >= 1) fluidTarget_ml = Math.round(currentWeight * 15);
      else fluidTarget_ml = Math.round(currentWeight * 5);
    } else {
      if (daysOut >= 2) fluidTarget_ml = Math.round(currentWeight * 40);
      else if (daysOut === 1) fluidTarget_ml = Math.round(currentWeight * 15);
      else fluidTarget_ml = Math.round(currentWeight * 5);
    }

    const actions: string[] = [];
    if (i === 0 && days >= 3) actions.push("Begin low-carb protocol (<50g/day target)");
    if (i === 0 && days >= 4) actions.push("Start fibre reduction (<10g/day)");
    if (i === 0 && days >= 4) actions.push("Begin water loading (100ml/kg/day)");
    if (i === 0 && days >= 3) actions.push("Reduce sodium to <2300mg/day");
    if (i === 2 && days >= 4) actions.push("Last day of water loading");
    if (i === 3 && days >= 5) actions.push("Switch to water restriction (15ml/kg)");
    if (isLastDay && breakdown.dehydrationNeeded > 0) {
      const sessions = estimateSaunaSessions(breakdown.dehydrationNeeded, currentWeight);
      actions.push(`Dehydration protocol: ~${sessions} sauna sessions (4x10min at 90C)`);
      actions.push("Monitor for dizziness; keep electrolytes on hand.");
    }
    if (isWeighIn) {
      actions.push("Weigh-in day: minimal food and fluid until you step off.");
      if (breakdown.dehydrationNeeded > 0) {
        actions.push("Post weigh-in: begin aggressive rehydration immediately.");
        actions.push("ORS 50-90 mmol/L sodium, carbs 8-12 g/kg over the recovery window.");
      }
    }

    let projectedWeight: number;
    if (isWeighIn) {
      projectedWeight = targetWeighIn;
    } else {
      const dietProgressFraction = Math.min((i + 1) / dietDays, 1);
      const dietLossSoFar = breakdown.dietTotal * dietProgressFraction;
      const dehydrationSoFar =
        isLastDay && breakdown.dehydrationNeeded > 0 ? breakdown.dehydrationNeeded : 0;
      projectedWeight = Math.max(
        targetWeighIn,
        currentWeight - dietLossSoFar - dehydrationSoFar,
      );
    }
    projectedWeight = parseFloat(projectedWeight.toFixed(1));

    timeline.push({
      day: dayNumber,
      label,
      projectedWeight,
      carbTarget_g,
      fibreTarget_g,
      sodiumTarget_mg,
      fluidTarget_ml,
      actions,
    });
  }

  return timeline;
}

// ── Master computation ──────────────────────────────────────────

export function computeFightWeekProjection(input: {
  currentWeight: number;
  targetWeighIn: number;
  daysUntilWeighIn: number;
  sex?: FightWeekSex;
}): FightWeekProjection {
  const currentWeight = Math.max(1, input.currentWeight);
  const targetWeighIn = Math.max(1, input.targetWeighIn);
  const days = Math.max(1, input.daysUntilWeighIn);

  const totalToCut = Math.max(0, currentWeight - targetWeighIn);
  const percentBW = (totalToCut / currentWeight) * 100;

  const glycogenLoss = glycogenDepletion(currentWeight, days);
  const fibreLoss = fibreReduction(currentWeight, days);
  const sodiumLoss = sodiumManipulation(currentWeight, days);
  const waterLoadingLoss = waterLoadingBenefit(currentWeight, days);

  const dietTotal = glycogenLoss + fibreLoss + sodiumLoss + waterLoadingLoss;
  const dehydrationNeeded = Math.max(0, totalToCut - dietTotal);
  const dehydrationPercentBW = (dehydrationNeeded / currentWeight) * 100;

  const dehydrationSafety = getDehydrationSafety(dehydrationNeeded, currentWeight);
  const saunaSessions = estimateSaunaSessions(dehydrationNeeded, currentWeight);
  const maxSafeAWL = maxSafeCut(currentWeight, days);

  // Risk level rules (spec):
  // red if dehydrationNeeded/bw > 5% OR (days<3 AND totalToCut > 2*days*bw*0.005)
  // orange if 3% < dehydrationNeeded/bw <= 5%
  // green otherwise
  const dehydrationFraction = dehydrationNeeded / currentWeight;
  let riskLevel: FightWeekSafety = "green";
  if (
    dehydrationFraction > 0.05 ||
    (days < 3 && totalToCut > 2 * days * currentWeight * 0.005)
  ) {
    riskLevel = "red";
  } else if (dehydrationFraction > 0.03) {
    riskLevel = "orange";
  }

  let safetyWarning: string | null = null;
  if (riskLevel === "red") {
    safetyWarning =
      dehydrationFraction > 0.05
        ? `Dehydration target ${dehydrationPercentBW.toFixed(1)}% BW exceeds the 5% ISSN safety ceiling. Reduce cut size or extend timeline.`
        : `${totalToCut.toFixed(1)}kg in ${days} day${days === 1 ? "" : "s"} exceeds safe acute-weight-loss limits. Consult a sports medic before continuing.`;
  } else if (riskLevel === "orange") {
    safetyWarning = `Dehydration of ${dehydrationPercentBW.toFixed(1)}% BW carries performance risk. Confirm rehydration window of at least 12h and keep electrolytes ready.`;
  }

  const breakdown: FightWeekBreakdown = {
    totalToCut: round2(totalToCut),
    percentBW: round1(percentBW),
    glycogenLoss: round2(glycogenLoss),
    fibreLoss: round2(fibreLoss),
    sodiumLoss: round2(sodiumLoss),
    waterLoadingLoss: round2(waterLoadingLoss),
    dietTotal: round2(dietTotal),
    dehydrationNeeded: round2(dehydrationNeeded),
  };

  const timeline = buildTimeline(
    currentWeight,
    targetWeighIn,
    days,
    breakdown,
    waterLoadingLoss > 0,
  );

  return {
    breakdown,
    dehydration: {
      percentBW: round1(dehydrationPercentBW),
      safety: dehydrationSafety,
      saunaSessions,
    },
    timeline,
    maxSafeAWL: round1(maxSafeAWL),
    riskLevel,
    safetyWarning,
  };
}

function round1(n: number) {
  return parseFloat(n.toFixed(1));
}

function round2(n: number) {
  return parseFloat(n.toFixed(2));
}
