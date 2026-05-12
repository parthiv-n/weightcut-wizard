import type { ScoringConfig, ScoringPhase, SubScoreKey } from "./types";

export function resolvePhase(asOfDate: string, fightDate: string, cfg: ScoringConfig): ScoringPhase {
  const days = (new Date(fightDate + "T00:00:00Z").getTime() - new Date(asOfDate + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
  if (days <= cfg.phaseThresholdsDays.fightWeek) return "fightWeek";
  if (days <= cfg.phaseThresholdsDays.peak) return "peak";
  return "build";
}

export function weightsForPhase(phase: ScoringPhase, cfg: ScoringConfig): Record<SubScoreKey, number> {
  return cfg.weights[phase];
}
