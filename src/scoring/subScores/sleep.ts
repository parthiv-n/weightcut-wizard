import type { ScoringConfig, SubScore } from "../types";

export function computeSleep(
  sleepHours: Array<{ date: string; hours: number }>,
  asOfDate: string,
  cfg: ScoringConfig,
  assumedSleepDates: ReadonlyArray<string> = [],
): SubScore {
  const target = cfg.sleep.targetHoursPerNight;
  const penalty = cfg.sleep.debtPenaltyPerHour;
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  let total = 0;
  let nights = 0;
  let assumedNights = 0;
  const assumedSet = new Set(assumedSleepDates);
  for (const log of sleepHours) {
    const t = new Date(log.date + "T00:00:00Z").getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    total += log.hours;
    nights++;
    if (assumedSet.has(log.date)) assumedNights++;
  }
  if (nights === 0) {
    return { value: 0, weight: 0, reason: "No sleep logs in last 7 days" };
  }
  const targetTotal = 7 * target;
  const debt = Math.max(0, targetTotal - total);
  const value = Math.max(0, Math.min(100, 100 - debt * penalty));
  const baseReason = debt > 0 ? `${debt.toFixed(1)}h sleep debt vs ${target}h target` : "On target";
  const reason = assumedNights > 0
    ? `${baseReason} (assumed ${cfg.sleep.defaultAssumedHours}h on ${assumedNights} day${assumedNights === 1 ? "" : "s"} — log to refine)`
    : baseReason;
  return {
    value: Math.round(value),
    weight: 0,
    reason,
  };
}
