import { describe, it, expect } from 'vitest';
import {
  sessionLoad,
  dailyLoad,
  calculateStrain,
  applyRestDayRecovery,
  computeAllMetrics,
  type SessionRow,
} from './performanceEngine';

// Helper to create a session row
function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'test-id',
    date: new Date().toISOString().split('T')[0],
    session_type: 'BJJ',
    duration_minutes: 60,
    rpe: 7,
    intensity: 'moderate',
    intensity_level: 3,
    soreness_level: 0,
    sleep_hours: 8,
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

describe('sessionLoad', () => {
  it('calculates RPE × Minutes × IntensityMultiplier', () => {
    const s = makeSession({ rpe: 7, duration_minutes: 60, intensity_level: 3 });
    // 7 × 60 × 1.15 = 483
    expect(sessionLoad(s)).toBeCloseTo(483, 0);
  });

  it('returns 0 for Rest sessions', () => {
    const s = makeSession({ session_type: 'Rest' });
    expect(sessionLoad(s)).toBe(0);
  });

  it('returns 0 for Recovery sessions', () => {
    const s = makeSession({ session_type: 'Recovery' });
    expect(sessionLoad(s)).toBe(0);
  });

  it('uses legacy intensity when intensity_level is null', () => {
    const s = makeSession({ intensity_level: null, intensity: 'high', rpe: 5, duration_minutes: 30 });
    // high → level 5 → multiplier 1.5 → 5 * 30 * 1.5 = 225
    expect(sessionLoad(s)).toBeCloseTo(225, 0);
  });

  it('applies correct multipliers for each intensity level', () => {
    const base = { rpe: 10, duration_minutes: 100 }; // base = 1000
    expect(sessionLoad(makeSession({ ...base, intensity_level: 1 }))).toBeCloseTo(800, 0);
    expect(sessionLoad(makeSession({ ...base, intensity_level: 2 }))).toBeCloseTo(1000, 0);
    expect(sessionLoad(makeSession({ ...base, intensity_level: 3 }))).toBeCloseTo(1150, 0);
    expect(sessionLoad(makeSession({ ...base, intensity_level: 4 }))).toBeCloseTo(1300, 0);
    expect(sessionLoad(makeSession({ ...base, intensity_level: 5 }))).toBeCloseTo(1500, 0);
  });
});

describe('dailyLoad', () => {
  it('sums session loads for a single session', () => {
    const sessions = [makeSession({ rpe: 7, duration_minutes: 60, intensity_level: 3 })];
    expect(dailyLoad(sessions)).toBeCloseTo(483, 0);
  });

  it('applies 1.1x CNS multiplier for multiple sessions', () => {
    const sessions = [
      makeSession({ rpe: 7, duration_minutes: 60, intensity_level: 3 }),
      makeSession({ rpe: 5, duration_minutes: 30, intensity_level: 2 }),
    ];
    // Session 1: 7*60*1.15 = 483, Session 2: 5*30*1.0 = 150
    // Total: 633, CNS: 633 * 1.1 = 696.3
    expect(dailyLoad(sessions)).toBeCloseTo(696.3, 0);
  });

  it('returns 0 for empty array', () => {
    expect(dailyLoad([])).toBe(0);
  });

  it('returns 0 for only rest sessions', () => {
    expect(dailyLoad([makeSession({ session_type: 'Rest' })])).toBe(0);
  });
});

describe('calculateStrain', () => {
  it('returns 0 for 0 load', () => {
    expect(calculateStrain(0)).toBe(0);
  });

  it('follows diminishing returns curve', () => {
    const s500 = calculateStrain(500);
    const s1000 = calculateStrain(1000);
    const s2000 = calculateStrain(2000);

    expect(s500).toBeGreaterThan(0);
    expect(s1000).toBeGreaterThan(s500);
    expect(s2000).toBeGreaterThan(s1000);

    // Diminishing returns: gap from 500→1000 > gap from 1000→2000
    expect(s1000 - s500).toBeGreaterThan(s2000 - s1000);
  });

  it('approaches but never exceeds 21', () => {
    expect(calculateStrain(10000)).toBeLessThanOrEqual(21);
    expect(calculateStrain(10000)).toBeGreaterThan(20);
  });

  it('gives ~8.1 for load of 500', () => {
    // 21 * (1 - e^(-500/1000)) = 21 * (1 - e^(-0.5)) = 21 * 0.3935 = 8.26
    expect(calculateStrain(500)).toBeCloseTo(8.26, 1);
  });
});

describe('applyRestDayRecovery', () => {
  it('reduces score by 15% with good recovery conditions', () => {
    expect(applyRestDayRecovery(60, 3, 'good')).toBeCloseTo(51, 0);
  });

  it('reduces score by only 5% with poor conditions', () => {
    expect(applyRestDayRecovery(60, 7, 'poor')).toBeCloseTo(57, 0);
  });

  it('reduces by 5% when soreness is high even with good sleep', () => {
    expect(applyRestDayRecovery(60, 6, 'good')).toBeCloseTo(57, 0);
  });

  it('never goes below 0', () => {
    expect(applyRestDayRecovery(1, 1, 'good')).toBeGreaterThanOrEqual(0);
  });
});

describe('computeAllMetrics', () => {
  it('handles empty sessions (new user)', () => {
    const metrics = computeAllMetrics([]);
    expect(metrics.strain).toBe(0);
    expect(metrics.acuteLoad).toBe(0);
    expect(metrics.chronicLoad).toBe(0);
    expect(metrics.loadRatio).toBe(0);
    expect(metrics.overtrainingRisk.zone).toBe('low');
    expect(metrics.strainHistory).toHaveLength(7);
  });

  it('calculates strain for today\'s sessions', () => {
    const today = dateStr(0);
    const sessions = [
      makeSession({ date: today, rpe: 8, duration_minutes: 90, intensity_level: 4 }),
    ];
    const metrics = computeAllMetrics(sessions);
    // 8 * 90 * 1.3 = 936 → strain ≈ 21*(1-e^(-0.936)) ≈ 12.9
    expect(metrics.strain).toBeGreaterThan(10);
    expect(metrics.strain).toBeLessThan(15);
  });

  it('detects consecutive high strain days', () => {
    const sessions: SessionRow[] = [];
    // 3 consecutive days of very high sessions
    for (let i = 0; i < 3; i++) {
      sessions.push(makeSession({
        date: dateStr(i),
        rpe: 10,
        duration_minutes: 120,
        intensity_level: 5,
      }));
    }
    const metrics = computeAllMetrics(sessions);
    expect(metrics.consecutiveHighDays).toBeGreaterThanOrEqual(3);
  });

  it('calculates load ratio correctly', () => {
    const sessions: SessionRow[] = [];
    // Put high sessions only in last 7 days, nothing in the 21 before
    for (let i = 0; i < 7; i++) {
      sessions.push(makeSession({
        date: dateStr(i),
        rpe: 8,
        duration_minutes: 60,
        intensity_level: 3,
      }));
    }
    const metrics = computeAllMetrics(sessions);
    // All load is in acute period, very little chronic → high ratio
    expect(metrics.loadRatio).toBeGreaterThan(1);
  });

  it('returns 7 entries in strainHistory', () => {
    const metrics = computeAllMetrics([]);
    expect(metrics.strainHistory).toHaveLength(7);
    metrics.strainHistory.forEach(entry => {
      expect(entry.strain).toBe(0);
      expect(entry.date).toBeTruthy();
    });
  });

  it('provides forecast data', () => {
    const sessions = [
      makeSession({ date: dateStr(0), rpe: 7, duration_minutes: 60, intensity_level: 3 }),
      makeSession({ date: dateStr(1), rpe: 6, duration_minutes: 45, intensity_level: 2 }),
      makeSession({ date: dateStr(2), rpe: 8, duration_minutes: 60, intensity_level: 4 }),
    ];
    const metrics = computeAllMetrics(sessions);
    expect(metrics.forecast.predictedStrain).toBeGreaterThan(0);
    expect(metrics.forecast.predictedLoadRatio).toBeGreaterThan(0);
  });

  it('flags high overtraining risk for extreme training', () => {
    const sessions: SessionRow[] = [];
    // 7 days of double sessions at max intensity
    for (let i = 0; i < 7; i++) {
      sessions.push(makeSession({
        date: dateStr(i),
        rpe: 9,
        duration_minutes: 90,
        intensity_level: 5,
        soreness_level: 8,
      }));
      sessions.push(makeSession({
        date: dateStr(i),
        rpe: 8,
        duration_minutes: 60,
        intensity_level: 4,
        soreness_level: 7,
      }));
    }
    const metrics = computeAllMetrics(sessions);
    expect(metrics.overtrainingRisk.score).toBeGreaterThan(50);
    expect(['high', 'critical']).toContain(metrics.overtrainingRisk.zone);
  });
});
