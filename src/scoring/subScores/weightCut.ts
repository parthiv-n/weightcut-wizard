import type { ScoringConfig, SubScore } from "../types";

type Input = {
  weights: Array<{ date: string; weightKg: number }>;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  campStartDate: string | null;
  fightDate: string | null;
};

function daysBetween(a: string, b: string): number {
  return (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
}

export function computeWeightCut(input: Input, asOfDate: string, cfg: ScoringConfig): SubScore {
  const { weights, startingWeightKg, goalWeightKg, campStartDate, fightDate } = input;
  if (!startingWeightKg || !goalWeightKg || !campStartDate) {
    return { value: 50, weight: 0, reason: "Camp data incomplete" };
  }
  if (weights.length === 0) {
    return { value: 50, weight: 0, reason: "No weight logs yet" };
  }
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const daysElapsed = Math.max(1, daysBetween(campStartDate, current.date));
  const weeksElapsed = daysElapsed / 7;
  const kgLost = startingWeightKg - current.weightKg;
  const ratePctPerWeek = (kgLost / startingWeightKg / weeksElapsed) * 100;

  const c = cfg.weightCut;
  const [lo, hi] = c.sustainableRatePctPerWeek;
  let value: number;
  if (ratePctPerWeek <= 0) {
    value = 30; // gaining weight
  } else if (ratePctPerWeek >= lo && ratePctPerWeek <= hi) {
    value = 100;
  } else if (ratePctPerWeek < lo) {
    value = 60 + (ratePctPerWeek / lo) * 40;
  } else if (ratePctPerWeek <= c.decayEdgePct) {
    value = 100 - ((ratePctPerWeek - hi) / (c.decayEdgePct - hi)) * 50;
  } else if (ratePctPerWeek <= c.dangerEdgePct) {
    value = 50 - ((ratePctPerWeek - c.decayEdgePct) / (c.dangerEdgePct - c.decayEdgePct)) * 30;
  } else {
    value = 20;
  }

  // On-pace check: if we won't hit goalWeight by fightDate at current rate, deduct.
  if (fightDate) {
    const daysToFight = daysBetween(asOfDate, fightDate);
    const kgRemaining = current.weightKg - goalWeightKg;
    if (kgRemaining > 0 && daysToFight > 0) {
      const requiredKgPerDay = kgRemaining / daysToFight;
      const observedKgPerDay = kgLost / daysElapsed;
      if (observedKgPerDay < requiredKgPerDay * 0.7) {
        value -= c.onPaceMissPenalty;
      }
    }
  }

  value = Math.max(0, Math.min(100, value));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `${ratePctPerWeek.toFixed(2)}%/wk (target ${lo}–${hi}%)`,
  };
}
