// Fight Week Deterministic Projection Engine
// All calculations are research-backed — LLM only interprets, never calculates
// Sources: ISSN 2025 Position Stand (Ricci et al.), Reale et al. 2017, SSE #183

// ─── Types ──────────────────────────────────────────────────

export interface FightWeekInput {
  currentWeight: number;       // kg
  targetWeight: number;        // kg (weigh-in weight)
  daysUntilWeighIn: number;    // 1–14
  sex: "male" | "female";
}

export interface DayProjection {
  day: number;              // negative countdown: -7, -6, ..., 0 (weigh-in)
  label: string;            // "7 Days Out", "Weigh-In"
  projectedWeight: number;
  carbTarget_g: number;     // taper: 2g/kg → 1g/kg → <50g
  fibreTarget_g: number;    // taper: 15g → <10g → <5g
  sodiumTarget_mg: number;  // taper: 2500 → <2300 → <1500
  fluidTarget_ml: number;   // water load 100ml/kg → restrict 15ml/kg
  actions: string[];        // protocol notes for this day
}

export type SafetyZone = "green" | "orange" | "red";

export interface FightWeekProjection {
  totalToCut: number;
  glycogenLoss: number;
  fibreLoss: number;
  sodiumLoss: number;
  waterLoadingLoss: number;
  dietTotal: number;           // sum of above 4
  dehydrationNeeded: number;   // max(0, totalToCut - dietTotal)
  dehydrationPercentBW: number;
  dehydrationSafety: SafetyZone;
  overallSafety: SafetyZone;
  maxSafeAWL: number;          // max safe acute weight loss for this timeline
  percentBW: number;           // totalToCut as % of BW
  saunaSessions: number;       // estimated sauna sessions needed (0 if no dehydration)
  timeline: DayProjection[];
}

// ─── Component Calculations ─────────────────────────────────
// Each returns kg of weight loss achievable via that mechanism

/**
 * Glycogen + bound water depletion
 * ISSN 2025 §5.4.1: 1g glycogen binds 2.7g water
 * Protocol: <50g carbs/day for 3–7 days → ~2% BW loss
 * Reduced by 70% if <3 days available (insufficient depletion time)
 */
export function glycogenDepletion(bodyweightKg: number, daysAvailable: number): number {
  const base = Math.min(bodyweightKg * 0.02, 2.5);
  // Less than 3 days = only ~30% depletion achievable
  return daysAvailable < 3 ? base * 0.3 : base;
}

/**
 * Fibre / gut content reduction
 * ISSN 2025 §5.4.2: low-fibre (<10g/day) for 4–7 days
 * Gut transit time: 10–96h (individual variation)
 */
export function fibreReduction(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 2) return 0;
  if (daysAvailable < 4) return bodyweightKg * 0.004; // ~0.4% BM
  if (daysAvailable < 7) return bodyweightKg * 0.007; // ~0.7% BM
  return Math.min(bodyweightKg * 0.01, 1.0);           // cap at 1kg
}

/**
 * Sodium manipulation → extracellular water loss
 * ISSN 2025 §5.4.3: <2300mg/day for 3–5 days
 * Balance takes 2–3 days to shift
 */
export function sodiumManipulation(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 3) return 0;
  return Math.min(bodyweightKg * 0.007, 1.0); // ~0.7% BM, cap 1kg
}

/**
 * Water loading protocol benefit
 * ISSN 2025 §5.4.4: 100ml/kg/day × 3 days → 15ml/kg/day restriction
 * Result: 3.2% BM loss (water-loading group) vs 2.4% (control) → ~0.8% extra
 * Requires ≥4 days (3 loading + 1 restriction)
 */
export function waterLoadingBenefit(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable < 4) return 0;
  return bodyweightKg * 0.008; // ~0.8% BM extra from water loading
}

// ─── Safety Thresholds ──────────────────────────────────────

/**
 * Dehydration safety zones (ISSN 2025 §5.4.5)
 * GREEN: ≤2% BW — minimal performance impact
 * ORANGE: 2–4% BW — needs ≥12h recovery + aggressive rehydration
 * RED: >4% BW — significant performance decrement
 */
export function getDehydrationSafety(dehydrationKg: number, bodyweightKg: number): SafetyZone {
  const percent = (dehydrationKg / bodyweightKg) * 100;
  if (percent <= 2) return "green";
  if (percent <= 4) return "orange";
  return "red";
}

/**
 * Safe AWL by timeline (ISSN 2025 Position 7, UFC data)
 * ≥3 days: 6.7% BW
 * 2 days: 5.7% BW
 * 1 day: 4.4% BW
 */
export function maxSafeCut(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable >= 3) return bodyweightKg * 0.067;
  if (daysAvailable >= 2) return bodyweightKg * 0.057;
  return bodyweightKg * 0.044;
}

/**
 * Overall safety based on % BW cut
 * ≤5% = green, 5–8% = orange, >8% = red
 */
function getOverallSafety(percentBW: number): SafetyZone {
  if (percentBW <= 5) return "green";
  if (percentBW <= 8) return "orange";
  return "red";
}

/**
 * Sauna session estimates (ISSN 2025 §5.4.5)
 * Males: ~0.7% BW per session, Females: ~0.6%
 * Session = 4×10min at ~90°C
 */
function estimateSaunaSessions(dehydrationKg: number, bodyweightKg: number, sex: "male" | "female"): number {
  if (dehydrationKg <= 0) return 0;
  const lossPerSession = sex === "male"
    ? bodyweightKg * 0.007  // ~0.7% BW
    : bodyweightKg * 0.006; // ~0.6% BW
  return Math.ceil(dehydrationKg / lossPerSession);
}

// ─── Daily Projection Builder ───────────────────────────────

function buildTimeline(input: FightWeekInput, projection: {
  glycogenLoss: number;
  fibreLoss: number;
  sodiumLoss: number;
  waterLoadingLoss: number;
  dehydrationNeeded: number;
  dietTotal: number;
}): DayProjection[] {
  const { currentWeight, targetWeight, daysUntilWeighIn, sex } = input;
  const days = daysUntilWeighIn;
  const totalToCut = currentWeight - targetWeight;
  const timeline: DayProjection[] = [];

  // Distribute weight loss across days
  // Diet components taper in gradually, dehydration happens last 1-2 days
  const dietDays = Math.max(1, days - (projection.dehydrationNeeded > 0 ? 1 : 0));

  for (let i = 0; i < days; i++) {
    const dayNumber = -(days - 1 - i); // -7, -6, ..., 0
    const daysOut = days - 1 - i;
    const isWeighIn = i === days - 1;
    const isLastDay = i === days - 2;

    // Label
    let label: string;
    if (isWeighIn) label = "Weigh-In Day";
    else if (daysOut === 1) label = "1 Day Out";
    else label = `${daysOut} Days Out`;

    // Carb targets — taper schedule (ISSN: <50g for full depletion)
    let carbTarget_g: number;
    if (days <= 2) {
      carbTarget_g = i === 0 ? Math.round(currentWeight * 1) : 30;
    } else if (daysOut >= days - 1) {
      carbTarget_g = Math.round(currentWeight * 2); // 2g/kg start
    } else if (daysOut >= Math.floor(days / 2)) {
      carbTarget_g = Math.round(currentWeight * 1); // 1g/kg mid
    } else {
      carbTarget_g = 50; // <50g final days
    }
    if (isWeighIn) carbTarget_g = 0;

    // Fibre targets — taper (ISSN §5.4.2)
    let fibreTarget_g: number;
    if (daysOut >= Math.floor(days * 0.7)) {
      fibreTarget_g = 15;
    } else if (daysOut >= 1) {
      fibreTarget_g = 8;
    } else {
      fibreTarget_g = 0;
    }

    // Sodium targets — taper (ISSN §5.4.3)
    let sodiumTarget_mg: number;
    if (daysOut >= Math.floor(days * 0.6)) {
      sodiumTarget_mg = 2500;
    } else if (daysOut >= 1) {
      sodiumTarget_mg = 2000;
    } else {
      sodiumTarget_mg = 1500;
    }

    // Fluid targets — water loading protocol (ISSN §5.4.4)
    let fluidTarget_ml: number;
    if (days >= 4 && projection.waterLoadingLoss > 0) {
      // Water loading: first 3 days load, then restrict
      if (i < 3) {
        fluidTarget_ml = Math.round(currentWeight * 100); // 100ml/kg
      } else if (daysOut >= 1) {
        fluidTarget_ml = Math.round(currentWeight * 15); // 15ml/kg
      } else {
        fluidTarget_ml = Math.round(currentWeight * 5); // minimal sips
      }
    } else {
      // No water loading — normal then restrict
      if (daysOut >= 2) {
        fluidTarget_ml = Math.round(currentWeight * 40); // ~40ml/kg normal
      } else if (daysOut === 1) {
        fluidTarget_ml = Math.round(currentWeight * 15);
      } else {
        fluidTarget_ml = Math.round(currentWeight * 5);
      }
    }

    // Actions
    const actions: string[] = [];
    if (i === 0 && days >= 3) actions.push("Begin low-carb protocol (<50g/day target)");
    if (i === 0 && days >= 4) actions.push("Start fibre reduction (<10g/day)");
    if (i === 0 && days >= 4) actions.push("Begin water loading (100ml/kg/day)");
    if (i === 0 && days >= 3) actions.push("Reduce sodium to <2300mg/day");
    if (i === 2 && days >= 4) actions.push("Last day of water loading");
    if (i === 3 && days >= 5) actions.push("Switch to water restriction (15ml/kg)");
    if (isLastDay && projection.dehydrationNeeded > 0) {
      const sessions = estimateSaunaSessions(projection.dehydrationNeeded, currentWeight, sex);
      actions.push(`Dehydration protocol: ~${sessions} sauna sessions (4×10min at 90°C)`);
      actions.push("Monitor for dizziness — have electrolytes ready");
    }
    if (isWeighIn) {
      actions.push("Weigh-in day — minimal food/fluid");
      if (projection.dehydrationNeeded > 0) {
        actions.push("Post weigh-in: begin aggressive rehydration immediately");
        actions.push("ORS with 50-90 mmol/L sodium, carbs 8-12 g/kg");
      }
    }

    // Projected weight — distribute loss across days
    let projectedWeight: number;
    if (isWeighIn) {
      projectedWeight = targetWeight;
    } else {
      // Diet loss distributed evenly across diet days, dehydration on last day
      const dietProgressFraction = Math.min((i + 1) / dietDays, 1);
      const dietLossSoFar = projection.dietTotal * dietProgressFraction;
      // Dehydration only on last day before weigh-in
      const dehydrationSoFar = (isLastDay && projection.dehydrationNeeded > 0)
        ? projection.dehydrationNeeded
        : 0;
      projectedWeight = Math.max(
        targetWeight,
        currentWeight - dietLossSoFar - dehydrationSoFar
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

// ─── Master Computation ─────────────────────────────────────

export function computeFightWeekPlan(input: FightWeekInput): FightWeekProjection {
  const { currentWeight, targetWeight, daysUntilWeighIn, sex } = input;
  const totalToCut = Math.max(0, currentWeight - targetWeight);
  const percentBW = (totalToCut / currentWeight) * 100;

  // Calculate each component
  const glycogenLoss = glycogenDepletion(currentWeight, daysUntilWeighIn);
  const fibreLoss = fibreReduction(currentWeight, daysUntilWeighIn);
  const sodiumLoss = sodiumManipulation(currentWeight, daysUntilWeighIn);
  const waterLoadingLoss = waterLoadingBenefit(currentWeight, daysUntilWeighIn);

  const dietTotal = glycogenLoss + fibreLoss + sodiumLoss + waterLoadingLoss;
  const dehydrationNeeded = Math.max(0, totalToCut - dietTotal);
  const dehydrationPercentBW = (dehydrationNeeded / currentWeight) * 100;

  const dehydrationSafety = dehydrationNeeded > 0
    ? getDehydrationSafety(dehydrationNeeded, currentWeight)
    : "green" as SafetyZone;

  const overallSafety = getOverallSafety(percentBW);
  const maxSafeAWL = maxSafeCut(currentWeight, daysUntilWeighIn);
  const saunaSessions = estimateSaunaSessions(dehydrationNeeded, currentWeight, sex);

  const projectionData = { glycogenLoss, fibreLoss, sodiumLoss, waterLoadingLoss, dehydrationNeeded, dietTotal };
  const timeline = buildTimeline(input, projectionData);

  return {
    totalToCut: parseFloat(totalToCut.toFixed(2)),
    glycogenLoss: parseFloat(glycogenLoss.toFixed(2)),
    fibreLoss: parseFloat(fibreLoss.toFixed(2)),
    sodiumLoss: parseFloat(sodiumLoss.toFixed(2)),
    waterLoadingLoss: parseFloat(waterLoadingLoss.toFixed(2)),
    dietTotal: parseFloat(dietTotal.toFixed(2)),
    dehydrationNeeded: parseFloat(dehydrationNeeded.toFixed(2)),
    dehydrationPercentBW: parseFloat(dehydrationPercentBW.toFixed(1)),
    dehydrationSafety,
    overallSafety,
    maxSafeAWL: parseFloat(maxSafeAWL.toFixed(1)),
    percentBW: parseFloat(percentBW.toFixed(1)),
    saunaSessions,
    timeline,
  };
}
