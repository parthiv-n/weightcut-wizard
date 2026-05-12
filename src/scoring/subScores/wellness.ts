import type { ScoringConfig, SubScore } from "../types";

export function computeWellness(
  hooperByDate: Array<{ date: string; hooper: number }>,
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const valid = hooperByDate
    .filter((d) => {
      const t = new Date(d.date + "T00:00:00Z").getTime();
      return t >= start.getTime() && t <= end.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length === 0) {
    return { value: 50, weight: 0, reason: "No wellness check-ins in 7 days" };
  }

  // EMA over available days
  const alpha = 2 / (valid.length + 1);
  let ema = valid[0].hooper;
  for (let i = 1; i < valid.length; i++) ema = alpha * valid[i].hooper + (1 - alpha) * ema;

  const { hooperFloor, hooperScalar } = cfg.wellness;
  const value = Math.max(0, Math.min(100, 100 - (ema - hooperFloor) * hooperScalar));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `Hooper EMA ${ema.toFixed(1)} (lower is better, floor ${hooperFloor})`,
  };
}
