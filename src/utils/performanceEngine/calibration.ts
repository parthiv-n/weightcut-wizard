import type { AthleteTier, AthleteCalibration, SessionRow } from "./types";
import { clamp } from "./helpers";
import { sessionLoad } from "./load";

const TIER_DEFAULTS: Record<AthleteTier, Omit<AthleteCalibration, 'tier'>> = {
  advanced: {
    loadRatioThresholds: { caution: 1.4, danger: 1.6 },
    rpeCeiling: 8,
    normalSessionsPerWeek: 6,
    strainDivisor: 1400,
    sessionFrequencyFlagThreshold: 8,
  },
  intermediate: {
    loadRatioThresholds: { caution: 1.3, danger: 1.5 },
    rpeCeiling: 7,
    normalSessionsPerWeek: 4,
    strainDivisor: 1100,
    sessionFrequencyFlagThreshold: 6,
  },
  developing: {
    loadRatioThresholds: { caution: 1.2, danger: 1.4 },
    rpeCeiling: 7,
    normalSessionsPerWeek: 3,
    strainDivisor: 900,
    sessionFrequencyFlagThreshold: 4,
  },
  beginner: {
    loadRatioThresholds: { caution: 1.1, danger: 1.3 },
    rpeCeiling: 6,
    normalSessionsPerWeek: 1,
    strainDivisor: 700,
    sessionFrequencyFlagThreshold: 3,
  },
};

function determineTier(profileFreq: number | null, activityLevel: string | null): AthleteTier {
  const f = profileFreq ?? 0;
  if (f >= 6 || activityLevel === 'extra_active') return 'advanced';
  if (f >= 4 || activityLevel === 'very_active') return 'intermediate';
  if (f >= 2 || activityLevel === 'moderately_active') return 'developing';
  return 'beginner';
}

export function deriveCalibration(
  profileFreq: number | null,
  activityLevel: string | null,
  sessions28d: SessionRow[],
): AthleteCalibration {
  const tier = determineTier(profileFreq, activityLevel);
  const defaults = TIER_DEFAULTS[tier];
  const calibration: AthleteCalibration = { tier, ...defaults };

  const trainingSessions = sessions28d.filter(s => s.session_type !== 'Rest' && s.session_type !== 'Recovery');
  const uniqueTrainingDays = new Set(trainingSessions.map(s => s.date)).size;

  if (uniqueTrainingDays >= 7) {
    const avgRPE = trainingSessions.reduce((sum, s) => sum + s.rpe, 0) / trainingSessions.length;
    calibration.rpeCeiling = clamp(4, 10, avgRPE + 1.5);

    calibration.normalSessionsPerWeek = Math.round((uniqueTrainingDays / 4) * 10) / 10;

    const avgSessionLoad = trainingSessions.reduce((sum, s) => sum + sessionLoad(s), 0) / trainingSessions.length;
    const targetStrain = 8.5;
    const ratio = 1 - targetStrain / 21;
    if (ratio > 0 && avgSessionLoad > 0) {
      calibration.strainDivisor = clamp(400, 2500, -avgSessionLoad / Math.log(ratio));
    }

    calibration.sessionFrequencyFlagThreshold = Math.ceil(calibration.normalSessionsPerWeek + 2);
  }

  return calibration;
}
