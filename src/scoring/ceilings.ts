import type { ScoringConfig } from "./types";

export type CeilingSignals = {
  weightCutDangerousDays: number;  // consecutive days >2%/wk
  sleepDebt7d: number;             // hours
  acwr: number;
};

export function applyCeilings(
  score: number,
  signals: CeilingSignals,
  cfg: ScoringConfig,
): { score: number; applied: { ruleId: string; cap: number } | null } {
  const caps: Array<{ ruleId: string; cap: number }> = [];
  for (const rule of cfg.ceilings) {
    let trigger = false;
    if (rule.id === "weight_cut_dangerous" && signals.weightCutDangerousDays >= 3) trigger = true;
    if (rule.id === "sleep_debt" && signals.sleepDebt7d > 10) trigger = true;
    if (rule.id === "training_spike" && signals.acwr > 1.8) trigger = true;
    if (trigger) caps.push({ ruleId: rule.id, cap: rule.cap });
  }
  if (caps.length === 0) return { score, applied: null };
  const tightest = caps.reduce((min, c) => (c.cap < min.cap ? c : min), caps[0]);
  return { score: Math.min(score, tightest.cap), applied: tightest };
}
