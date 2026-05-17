import type { ScoringConfig } from "../types";

export const ScoringConfigV1: ScoringConfig = {
  version: "1.0.0",
  weights: {
    build:     { trainingLoad: 0.20, sleep: 0.20, weightCut: 0.25, wellness: 0.20, nutritionAdherence: 0.15 },
    peak:      { trainingLoad: 0.10, sleep: 0.25, weightCut: 0.30, wellness: 0.20, nutritionAdherence: 0.15 },
    fightWeek: { trainingLoad: 0.05, sleep: 0.25, weightCut: 0.40, wellness: 0.20, nutritionAdherence: 0.10 },
  },
  phaseThresholdsDays: { fightWeek: 7, peak: 14 },
  trainingLoad: {
    acwrSweetSpot: [0.8, 1.3],
    acwrPenaltyEdges: [0.5, 1.5],
    acwrFloor: 20,
    acuteWindowDays: 7,
    chronicWindowDays: 28,
  },
  sleep: {
    targetHoursPerNight: 8,
    debtPenaltyPerHour: 8,
    defaultAssumedHours: 7,
    minTrainingDurationForAssumption: 20,
  },
  weightCut: {
    sustainableRatePctPerWeek: [0.3, 1.0],
    decayEdgePct: 1.5,
    dangerEdgePct: 2.0,
    onPaceMissPenalty: 10,
  },
  wellness: { hooperFloor: 4, hooperScalar: 4.2 },
  nutrition: {
    calorieToleranceFraction: 0.10,
    proteinShortfallThresholdPct: 80,
    proteinPenaltyPerDay: 5,
  },
  ceilings: [
    { id: "weight_cut_dangerous", cap: 50 },
    { id: "sleep_debt", cap: 65 },
    { id: "training_spike", cap: 45 },
  ],
  smoothing: { emaDays: 3 },
  coldStart: { minDaysOfDataIn7d: 3 },
  labelThresholds: { sharp: 80, sharpening: 60, offPace: 40 },
  campAge: { maxWeeksDisplay: 4 },
};
