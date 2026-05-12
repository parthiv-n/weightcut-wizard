import type { ScoringConfig } from "./types";

type Input = {
  campStartDate: string | null;
  fightDate: string | null;
  asOfDate: string;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  currentWeightKg: number | null;
};

function daysBetween(a: string, b: string): number {
  return (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
}

export function computeCampAge(input: Input, cfg: ScoringConfig): { weeksAhead: number } | null {
  const { campStartDate, fightDate, asOfDate, startingWeightKg, goalWeightKg, currentWeightKg } = input;
  if (!campStartDate || !fightDate || !startingWeightKg || !goalWeightKg || currentWeightKg == null) return null;
  const campLengthDays = Math.max(1, daysBetween(campStartDate, fightDate));
  const daysElapsed = Math.max(0, daysBetween(campStartDate, asOfDate));
  const campLengthWeeks = campLengthDays / 7;
  const expectedPct = Math.min(1, daysElapsed / campLengthDays);
  const totalCut = startingWeightKg - goalWeightKg;
  if (totalCut <= 0) return { weeksAhead: 0 };
  const actualPct = Math.min(1, (startingWeightKg - currentWeightKg) / totalCut);
  let weeksAhead = (actualPct - expectedPct) * campLengthWeeks;
  const max = cfg.campAge.maxWeeksDisplay;
  weeksAhead = Math.max(-max, Math.min(max, weeksAhead));
  // Round to nearest whole week; sub-half-week noise from calendar asymmetry snaps to 0.
  return { weeksAhead: Math.round(weeksAhead) };
}
