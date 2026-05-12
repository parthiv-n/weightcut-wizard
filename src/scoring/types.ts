export type SubScoreKey =
  | "trainingLoad"
  | "sleep"
  | "weightCut"
  | "wellness"
  | "nutritionAdherence";

export type SubScore = { value: number; weight: number; reason: string };

export type ScoringPhase = "build" | "peak" | "fightWeek";

export type FightFormState = "ok" | "calibrating" | "no_camp" | "paused";

export type FightFormLabel = "sharp" | "sharpening" | "off_pace" | "at_risk";

export type FightFormScore = {
  score: number;          // 0–100 displayed (EMA)
  rawScore: number;
  label: FightFormLabel;
  state: FightFormState;
  phase: ScoringPhase | null;
  campAge: { weeksAhead: number } | null;
  subScores: Record<SubScoreKey, SubScore>;
  topDriver: SubScoreKey;
  topLimiter: SubScoreKey;
  appliedCeiling: { ruleId: string; cap: number } | null;
  algorithmVersion: string;
};

export type ScoringInputs = {
  date: string;                  // ISO YYYY-MM-DD (user-local)
  fightDate: string | null;      // ISO; null if no camp
  campStartDate: string | null;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  currentWeightKg: number | null;
  isCampPaused?: boolean;
  isCampCompleted?: boolean;
  sessions: Array<{ date: string; rpe: number; durationMinutes: number }>;
  sleepHours: Array<{ date: string; hours: number }>;
  weights: Array<{ date: string; weightKg: number }>;
  hooperByDate: Array<{ date: string; hooper: number }>;
  meals: Array<{ date: string; calories: number; proteinG: number }>;
  targets: { calories: number | null; proteinG: number | null };
  priorRawScores: Array<{ date: string; rawScore: number }>; // for EMA
};

export type ScoringConfig = {
  version: string;
  weights: Record<ScoringPhase, Record<SubScoreKey, number>>;
  phaseThresholdsDays: { fightWeek: number; peak: number };
  trainingLoad: {
    acwrSweetSpot: [number, number];
    acwrPenaltyEdges: [number, number];
    acwrFloor: number;
    acuteWindowDays: number;
    chronicWindowDays: number;
  };
  sleep: { targetHoursPerNight: number; debtPenaltyPerHour: number };
  weightCut: {
    sustainableRatePctPerWeek: [number, number];
    decayEdgePct: number;
    dangerEdgePct: number;
    onPaceMissPenalty: number;
  };
  wellness: { hooperFloor: number; hooperScalar: number };
  nutrition: {
    calorieToleranceFraction: number;
    proteinShortfallThresholdPct: number;
    proteinPenaltyPerDay: number;
  };
  ceilings: Array<{ id: string; cap: number }>;
  smoothing: { emaDays: number };
  coldStart: { minDaysOfDataIn7d: number };
  labelThresholds: { sharp: number; sharpening: number; offPace: number };
  campAge: { maxWeeksDisplay: number };
};
