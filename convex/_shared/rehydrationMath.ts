/**
 * Deterministic rehydration protocol math (server-authoritative).
 *
 * Computes totals (fluid, electrolytes, carbs) and distributes them across an
 * N-hour window in three phases per Reale 2018 / ISSN 2025. The LLM only fills
 * narrative fields (summary, notes, drinkRecipe, foods, carbRefuelPlan).
 */

export interface RehydrationTotals {
  totalFluidLitres: number;
  totalSodiumMg: number;
  totalPotassiumMg: number;
  totalMagnesiumMg: number;
  totalCarbsG: number;
  carbTargetPerKg: string;
  maxCarbsPerHour: number;
  rehydrationWindowHours: number;
  bodyWeightKg: number;
  caffeineLowMg: number;
  caffeineHighMg: number;
}

export interface HourlyStepDeterministic {
  hour: number;
  phase: string;
  fluidML: number;
  sodiumMg: number;
  potassiumMg: number;
  magnesiumMg: number;
  carbsG: number;
}

export interface RehydrationDeterministic {
  totals: RehydrationTotals;
  hourlyProtocol: HourlyStepDeterministic[];
  electrolyteRatio: { sodium: string; potassium: string; magnesium: string };
}

// Default safety warnings — duplicated verbatim from
// src/pages/hydration/types.ts (DEFAULT_WARNINGS) because Convex actions
// cannot import from src/.
export const DEFAULT_WARNINGS = [
  "Do not exceed 1L of fluid per hour. Exceeding gastric emptying rate causes bloating and impairs absorption.",
  "Avoid high-fibre and high-fat foods until after competition. They slow gastric emptying and nutrient absorption.",
  "Monitor urine colour and aim for pale yellow. Clear urine may indicate over-hydration risk (hyponatremia).",
  "If you feel nauseous, dizzy, or confused, stop the protocol and seek medical attention immediately.",
  "This protocol assumes weight was lost via dehydration. If weight was lost via other means, fluid targets may be excessive.",
];

export function computeRehydrationTotals(args: {
  weighInWeightKg: number;
  fightWeightKg?: number;
  hoursUntilFight: number;
}): RehydrationTotals {
  const bw = Math.max(40, args.weighInWeightKg);
  const hours = Math.max(1, Math.round(args.hoursUntilFight));

  // Fluid deficit estimate. 150% replacement of lost fluid.
  const deficitKg = args.fightWeightKg && args.fightWeightKg > args.weighInWeightKg
    ? args.fightWeightKg - args.weighInWeightKg
    : bw * 0.045;
  const totalFluidLitres = round2(Math.max(0.5, deficitKg * 1.5));

  // Electrolytes — 1g Na / L, 250mg K / L, 100mg Mg / L (Reale 2018)
  const totalSodiumMg = Math.round(totalFluidLitres * 1000);
  const totalPotassiumMg = Math.round(totalFluidLitres * 250);
  const totalMagnesiumMg = Math.round(totalFluidLitres * 100);

  // Carbs — 10 g/kg target, capped at 90 g/h gut ceiling.
  const carbCap = hours * 90;
  const totalCarbsG = Math.min(Math.round(bw * 10), carbCap);
  const carbTargetPerKg = `${(totalCarbsG / bw).toFixed(1)} g/kg`;

  // Pre-comp caffeine (3-6 mg/kg).
  const caffeineLowMg = Math.round(bw * 3);
  const caffeineHighMg = Math.round(bw * 6);

  return {
    totalFluidLitres,
    totalSodiumMg,
    totalPotassiumMg,
    totalMagnesiumMg,
    totalCarbsG,
    carbTargetPerKg,
    maxCarbsPerHour: 90,
    rehydrationWindowHours: hours,
    bodyWeightKg: round1(bw),
    caffeineLowMg,
    caffeineHighMg,
  };
}

/**
 * Distribute totals across hours using a 25%/50%/25% phased curve:
 *  - First 25% of hours: 40% of fluid + sodium ("Rapid Rehydration")
 *  - Middle 50%:         40% of fluid + sodium + 60% of carbs ("Active Recovery")
 *  - Last 25%:           20% of fluid + 40% of carbs ("Pre-Comp Top-Up")
 */
export function buildHourlyProtocol(totals: RehydrationTotals): HourlyStepDeterministic[] {
  const hours = totals.rehydrationWindowHours;
  const phaseAEnd = Math.max(1, Math.round(hours * 0.25));
  const phaseBEnd = Math.max(phaseAEnd + 1, Math.round(hours * 0.75));

  const phaseHours: Array<{ phase: string; share: { fluid: number; carbs: number } }> = [];
  for (let h = 1; h <= hours; h++) {
    if (h <= phaseAEnd)
      phaseHours.push({ phase: "Rapid Rehydration", share: { fluid: 0.4, carbs: 0 } });
    else if (h <= phaseBEnd)
      phaseHours.push({ phase: "Active Recovery", share: { fluid: 0.4, carbs: 0.6 } });
    else
      phaseHours.push({ phase: "Pre-Comp Top-Up", share: { fluid: 0.2, carbs: 0.4 } });
  }

  const counts: Record<string, number> = {};
  for (const p of phaseHours) counts[p.phase] = (counts[p.phase] ?? 0) + 1;

  const protocol: HourlyStepDeterministic[] = [];
  for (let i = 0; i < hours; i++) {
    const { phase, share } = phaseHours[i];
    const n = counts[phase] || 1;

    const fluidShare = share.fluid / n;
    const carbsShare = share.carbs / n;

    let fluidML = Math.round(totals.totalFluidLitres * 1000 * fluidShare);
    // Honour gastric emptying cap (max 1000 ml/h).
    if (fluidML > 1000) fluidML = 1000;

    const sodiumMg = Math.round(totals.totalSodiumMg * fluidShare);
    const potassiumMg = Math.round(totals.totalPotassiumMg * fluidShare);
    const magnesiumMg = Math.round(totals.totalMagnesiumMg * fluidShare);
    let carbsG = Math.round(totals.totalCarbsG * carbsShare);
    if (carbsG > totals.maxCarbsPerHour) carbsG = totals.maxCarbsPerHour;

    protocol.push({
      hour: i + 1,
      phase,
      fluidML,
      sodiumMg,
      potassiumMg,
      magnesiumMg,
      carbsG,
    });
  }
  return protocol;
}

export function buildDeterministicRehydration(args: {
  weighInWeightKg: number;
  fightWeightKg?: number;
  hoursUntilFight: number;
}): RehydrationDeterministic {
  const totals = computeRehydrationTotals(args);
  const hourlyProtocol = buildHourlyProtocol(totals);
  return {
    totals,
    hourlyProtocol,
    electrolyteRatio: {
      sodium: "1000 mg/L",
      potassium: "250 mg/L",
      magnesium: "100 mg/L",
    },
  };
}

function round1(n: number) {
  return parseFloat(n.toFixed(1));
}
function round2(n: number) {
  return parseFloat(n.toFixed(2));
}
