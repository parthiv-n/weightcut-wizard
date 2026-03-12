import { logger } from "@/lib/logger";
import type { SessionRow } from "./types";
import { getIntensityMultiplier } from "./helpers";

// sessionLoad = (RPE x Minutes) x IntensityMultiplier
export function sessionLoad(session: SessionRow): number {
  if (session.session_type === 'Rest' || session.session_type === 'Recovery') {
    return 0;
  }
  return session.rpe * session.duration_minutes * getIntensityMultiplier(session);
}

// Sum of session loads. If sessions > 1, multiply by 1.1 (CNS fatigue)
export function dailyLoad(sessions: SessionRow[]): number {
  const trainingSessions = sessions.filter(s => s.session_type !== 'Rest');
  if (trainingSessions.length === 0) return 0;

  const total = trainingSessions.reduce((sum, s) => sum + sessionLoad(s), 0);
  const withCNS = trainingSessions.length > 1 ? total * 1.1 : total;

  logger.info('[PE] dailyLoad', {
    sessions: trainingSessions.length,
    rawTotal: total,
    cnsMultiplied: trainingSessions.length > 1,
    result: withCNS,
  });

  return withCNS;
}

// strain = 21 * (1 - e^(-dailyLoad / divisor))
// Clamped 0-21. Diminishing returns at high loads.
export function calculateStrain(load: number, divisor: number = 1000): number {
  const strain = 21 * (1 - Math.exp(-load / divisor));
  const clamped = Math.min(21, Math.max(0, strain));

  logger.info('[PE] strain', { load, divisor, strain: clamped });

  return clamped;
}
