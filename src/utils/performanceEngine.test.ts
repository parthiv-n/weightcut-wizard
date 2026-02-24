import { describe, it, expect } from 'vitest';
import {
  sessionLoad,
  dailyLoad,
  calculateStrain,
  applyRestDayRecovery,
  computeAllMetrics,
  deriveCalibration,
  computeReadiness,
  detectTrends,
  clamp,
  mapRange,
  getRecentSleepValues,
  getRecentSorenessValues,
  type SessionRow,
  type AthleteCalibration,
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

// ─── Utility Functions ──────────────────────────────────────

describe('clamp', () => {
  it('clamps value within range', () => {
    expect(clamp(0, 100, 50)).toBe(50);
    expect(clamp(0, 100, -10)).toBe(0);
    expect(clamp(0, 100, 150)).toBe(100);
  });
});

describe('mapRange', () => {
  it('maps value from one range to another', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(0, 0, 10, 0, 100)).toBe(0);
    expect(mapRange(10, 0, 10, 0, 100)).toBe(100);
  });

  it('clamps input to input range', () => {
    expect(mapRange(-5, 0, 10, 0, 100)).toBe(0);
    expect(mapRange(15, 0, 10, 0, 100)).toBe(100);
  });
});

// ─── Session Load ───────────────────────────────────────────

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

// ─── Daily Load ─────────────────────────────────────────────

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

// ─── Calculate Strain ───────────────────────────────────────

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

  it('uses custom divisor when provided', () => {
    const defaultStrain = calculateStrain(500, 1000);
    const higherDivisor = calculateStrain(500, 1400);
    const lowerDivisor = calculateStrain(500, 700);

    // Higher divisor = lower strain for same load (advanced athlete)
    expect(higherDivisor).toBeLessThan(defaultStrain);
    // Lower divisor = higher strain for same load (beginner)
    expect(lowerDivisor).toBeGreaterThan(defaultStrain);
  });

  it('default divisor (1000) backward compat — same results as before', () => {
    expect(calculateStrain(500)).toBeCloseTo(calculateStrain(500, 1000), 5);
    expect(calculateStrain(1000)).toBeCloseTo(calculateStrain(1000, 1000), 5);
  });
});

// ─── Derive Calibration ─────────────────────────────────────

describe('deriveCalibration', () => {
  it('assigns beginner tier for low frequency', () => {
    const cal = deriveCalibration(1, null, []);
    expect(cal.tier).toBe('beginner');
    expect(cal.loadRatioThresholds.caution).toBe(1.1);
    expect(cal.strainDivisor).toBe(700);
  });

  it('assigns developing tier for moderate frequency', () => {
    const cal = deriveCalibration(2, 'moderately_active', []);
    expect(cal.tier).toBe('developing');
    expect(cal.rpeCeiling).toBe(7);
  });

  it('assigns intermediate tier for 4+ sessions', () => {
    const cal = deriveCalibration(4, 'very_active', []);
    expect(cal.tier).toBe('intermediate');
    expect(cal.sessionFrequencyFlagThreshold).toBe(6);
  });

  it('assigns advanced tier for 6+ sessions or extra_active', () => {
    const cal = deriveCalibration(6, 'extra_active', []);
    expect(cal.tier).toBe('advanced');
    expect(cal.strainDivisor).toBe(1400);
    expect(cal.loadRatioThresholds.danger).toBe(1.6);
  });

  it('uses activity level as fallback when frequency is null', () => {
    expect(deriveCalibration(null, 'extra_active', []).tier).toBe('advanced');
    expect(deriveCalibration(null, 'very_active', []).tier).toBe('intermediate');
    expect(deriveCalibration(null, 'moderately_active', []).tier).toBe('developing');
    expect(deriveCalibration(null, null, []).tier).toBe('beginner');
  });

  it('applies personal overrides with 7+ unique training days', () => {
    const sessions: SessionRow[] = [];
    // Create 10 unique training days over 28 days
    for (let i = 0; i < 10; i++) {
      sessions.push(makeSession({
        date: dateStr(i * 2),
        rpe: 6,
        duration_minutes: 60,
        intensity_level: 3,
      }));
    }

    const cal = deriveCalibration(3, 'moderately_active', sessions);
    // Should have personal overrides
    expect(cal.rpeCeiling).toBeCloseTo(7.5, 0); // avg 6 + 1.5
    expect(cal.normalSessionsPerWeek).toBeGreaterThan(0);
    expect(cal.strainDivisor).not.toBe(900); // should be personalized, not default
  });

  it('defaults to developing when no profile provided', () => {
    const cal = deriveCalibration(null, null, []);
    expect(cal.tier).toBe('beginner');
  });
});

// ─── Detect Trends ──────────────────────────────────────────

describe('detectTrends', () => {
  it('returns no alerts with insufficient data', () => {
    const trends = detectTrends([], []);
    expect(trends.alerts).toHaveLength(0);
    expect(trends.sorenessRising).toBe(false);
    expect(trends.sleepDeclining).toBe(false);
    expect(trends.loadEscalating).toBe(false);
    expect(trends.rpeCreeping).toBe(false);
  });

  it('detects rising soreness over 3 days', () => {
    const sessions = [
      makeSession({ date: dateStr(0), soreness_level: 8 }),
      makeSession({ date: dateStr(1), soreness_level: 6 }),
      makeSession({ date: dateStr(2), soreness_level: 4 }),
    ];
    const trends = detectTrends(sessions, []);
    expect(trends.sorenessRising).toBe(true);
    expect(trends.alerts.length).toBeGreaterThan(0);
  });

  it('does not flag soreness when not consistently rising', () => {
    const sessions = [
      makeSession({ date: dateStr(0), soreness_level: 5 }),
      makeSession({ date: dateStr(1), soreness_level: 7 }), // dip
      makeSession({ date: dateStr(2), soreness_level: 4 }),
    ];
    const trends = detectTrends(sessions, []);
    expect(trends.sorenessRising).toBe(false);
  });

  it('detects declining sleep over 4 nights', () => {
    const sessions = [
      makeSession({ date: dateStr(0), sleep_hours: 5 }),
      makeSession({ date: dateStr(1), sleep_hours: 6 }),
      makeSession({ date: dateStr(2), sleep_hours: 7 }),
      makeSession({ date: dateStr(3), sleep_hours: 8 }),
    ];
    const trends = detectTrends(sessions, []);
    expect(trends.sleepDeclining).toBe(true);
  });

  it('detects load escalating over 3 days', () => {
    const dailyLoads = [
      { date: dateStr(3), load: 200 },
      { date: dateStr(2), load: 300 },
      { date: dateStr(1), load: 500 },
      { date: dateStr(0), load: 700 },
    ];
    const trends = detectTrends([], dailyLoads);
    expect(trends.loadEscalating).toBe(true);
  });

  it('does not flag load escalating when rest days present', () => {
    const dailyLoads = [
      { date: dateStr(2), load: 300 },
      { date: dateStr(1), load: 0 }, // rest day
      { date: dateStr(0), load: 700 },
    ];
    const trends = detectTrends([], dailyLoads);
    expect(trends.loadEscalating).toBe(false);
  });

  it('detects RPE creeping up', () => {
    const sessions = [
      // Recent 3 sessions: high RPE
      makeSession({ date: dateStr(0), rpe: 9, created_at: new Date().toISOString() }),
      makeSession({ date: dateStr(1), rpe: 9, created_at: new Date(Date.now() - 86400000).toISOString() }),
      makeSession({ date: dateStr(2), rpe: 8, created_at: new Date(Date.now() - 172800000).toISOString() }),
      // Prior 3: low RPE
      makeSession({ date: dateStr(3), rpe: 6, created_at: new Date(Date.now() - 259200000).toISOString() }),
      makeSession({ date: dateStr(4), rpe: 5, created_at: new Date(Date.now() - 345600000).toISOString() }),
      makeSession({ date: dateStr(5), rpe: 6, created_at: new Date(Date.now() - 432000000).toISOString() }),
    ];
    const trends = detectTrends(sessions, []);
    expect(trends.rpeCreeping).toBe(true);
  });
});

// ─── Apply Rest Day Recovery ────────────────────────────────

describe('applyRestDayRecovery', () => {
  // Original 3-arg tests (backward compat)
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

  // New granular recovery tests
  it('gives maximum recovery with all ideal conditions', () => {
    // good sleep quality (+8), 8h+ sleep (+5), soreness ≤2 (+5), fatigue ≤3 (+4), mobility (+3) = 25% + 5% base = 30% → capped at 25%
    const result = applyRestDayRecovery(100, 1, 'good', 9, 2, true);
    // 25% reduction → 75
    expect(result).toBeCloseTo(75, 0);
  });

  it('gives minimum recovery with all poor conditions', () => {
    // null sleep quality (+0), 5h sleep (+0), soreness 9 (+0), fatigue 9 (+0), no mobility (+0) = 5% base
    const result = applyRestDayRecovery(100, 9, null, 5, 9, false);
    // 5% reduction → 95
    expect(result).toBeCloseTo(95, 0);
  });

  it('gives moderate recovery with mixed conditions', () => {
    // good sleep quality (+8), 7h sleep (+3), soreness 4 (+3), fatigue 5 (+2), no mobility (+0) = base 5 + 16 = 21%
    const result = applyRestDayRecovery(80, 4, 'good', 7, 5, false);
    expect(result).toBeCloseTo(80 * (1 - 0.21), 0);
  });

  it('handles null optional params in granular mode', () => {
    // Even with undefined fatigueLevel and mobilityDone, entering granular mode (sleepHours provided)
    const result = applyRestDayRecovery(80, 3, 'good', 8, null, null);
    // good sleep (+8), 8h+ sleep (+5), soreness ≤4 (+3), fatigue null→10 (+0), mobility null (+0) = 5+16 = 21%
    expect(result).toBeCloseTo(80 * (1 - 0.21), 0);
  });

  it('sleep hours contribution is graduated', () => {
    const base = 100;
    const r8 = applyRestDayRecovery(base, 5, null, 8, 5, false);
    const r7 = applyRestDayRecovery(base, 5, null, 7, 5, false);
    const r6 = applyRestDayRecovery(base, 5, null, 6, 5, false);
    const r5 = applyRestDayRecovery(base, 5, null, 5, 5, false);

    // More sleep = more recovery = lower OT score
    expect(r8).toBeLessThan(r7);
    expect(r7).toBeLessThan(r6);
    expect(r6).toBeLessThan(r5);
  });
});

// ─── Compute Readiness ──────────────────────────────────────

describe('computeReadiness', () => {
  const defaultCalibration: AthleteCalibration = {
    tier: 'developing',
    loadRatioThresholds: { caution: 1.2, danger: 1.4 },
    rpeCeiling: 7,
    normalSessionsPerWeek: 3,
    strainDivisor: 900,
    sessionFrequencyFlagThreshold: 4,
  };

  function buildDailyLoadsForTest(loadPattern: number[]): { date: string; load: number; sessions: SessionRow[] }[] {
    return loadPattern.map((load, i) => ({
      date: dateStr(loadPattern.length - 1 - i),
      load,
      sessions: load > 0
        ? [makeSession({ date: dateStr(loadPattern.length - 1 - i), rpe: 7, duration_minutes: 60 })]
        : [],
    }));
  }

  it('returns neutral readiness (50) with no data', () => {
    const dailyLoads = buildDailyLoadsForTest(new Array(28).fill(0));
    const result = computeReadiness([], dailyLoads, 0, defaultCalibration);
    // Sleep: 50 (no data), Soreness: 80 (no data default), Load: 70 (detraining), Recovery: high, Consistency: 50
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it('labels peaked for high score', () => {
    // Good sleep, low soreness, optimal load ratio, good rest pattern
    const sessions = [
      makeSession({ date: dateStr(0), sleep_hours: 9, soreness_level: 1 }),
      makeSession({ date: dateStr(1), sleep_hours: 8.5, soreness_level: 1 }),
      makeSession({ date: dateStr(2), sleep_hours: 8, soreness_level: 2 }),
    ];
    // Build 28 days with moderate load to get good load ratio
    const loads = new Array(28).fill(0);
    for (let i = 0; i < 28; i++) loads[i] = i < 21 ? 400 : 450; // slight increase
    const dailyLoads = buildDailyLoadsForTest(loads);
    // Add sessions to last 3 days
    dailyLoads[25].sessions = [sessions[2]];
    dailyLoads[26].sessions = [sessions[1]];
    dailyLoads[27].sessions = [sessions[0]];
    // Set some rest days
    dailyLoads[24].load = 0;
    dailyLoads[24].sessions = [];

    const result = computeReadiness(sessions, dailyLoads, 1.0, defaultCalibration);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(['peaked', 'ready']).toContain(result.label);
  });

  it('labels strained for low score', () => {
    const sessions = [
      makeSession({ date: dateStr(0), sleep_hours: 4, soreness_level: 9 }),
      makeSession({ date: dateStr(1), sleep_hours: 4.5, soreness_level: 8 }),
      makeSession({ date: dateStr(2), sleep_hours: 5, soreness_level: 8 }),
    ];
    const loads = new Array(28).fill(500);
    const dailyLoads = buildDailyLoadsForTest(loads);

    const result = computeReadiness(sessions, dailyLoads, 1.8, defaultCalibration);
    expect(result.score).toBeLessThan(40);
    expect(['strained', 'recovering']).toContain(result.label);
  });

  it('has all breakdown components', () => {
    const dailyLoads = buildDailyLoadsForTest(new Array(28).fill(300));
    const result = computeReadiness([], dailyLoads, 1.0, defaultCalibration);
    expect(result.breakdown).toHaveProperty('sleepScore');
    expect(result.breakdown).toHaveProperty('sorenessScore');
    expect(result.breakdown).toHaveProperty('loadBalanceScore');
    expect(result.breakdown).toHaveProperty('recoveryScore');
    expect(result.breakdown).toHaveProperty('consistencyScore');
  });

  it('sleep component responds to sleep data', () => {
    // Use a shared baseline of mixed sleep hours so that 28d avg sits around 7h
    const baselineSessions: SessionRow[] = [];
    for (let i = 3; i < 20; i++) {
      baselineSessions.push(makeSession({ date: dateStr(i), sleep_hours: 7 }));
    }

    const goodSleep = [
      ...baselineSessions,
      makeSession({ date: dateStr(0), sleep_hours: 9 }),
      makeSession({ date: dateStr(1), sleep_hours: 9 }),
      makeSession({ date: dateStr(2), sleep_hours: 9 }),
    ];
    const badSleep = [
      ...baselineSessions,
      makeSession({ date: dateStr(0), sleep_hours: 4 }),
      makeSession({ date: dateStr(1), sleep_hours: 4 }),
      makeSession({ date: dateStr(2), sleep_hours: 4 }),
    ];
    const dailyLoads = buildDailyLoadsForTest(new Array(28).fill(300));

    const goodResult = computeReadiness(goodSleep, dailyLoads, 1.0, defaultCalibration);
    const badResult = computeReadiness(badSleep, dailyLoads, 1.0, defaultCalibration);

    expect(goodResult.breakdown.sleepScore).toBeGreaterThan(badResult.breakdown.sleepScore);
  });
});

// ─── Compute All Metrics ────────────────────────────────────

describe('computeAllMetrics', () => {
  it('handles empty sessions (new user)', () => {
    const metrics = computeAllMetrics([]);
    expect(metrics.strain).toBe(0);
    expect(metrics.acuteLoad).toBe(0);
    expect(metrics.chronicLoad).toBe(0);
    expect(metrics.loadRatio).toBe(0);
    expect(metrics.overtrainingRisk.zone).toBe('low');
    expect(metrics.strainHistory).toHaveLength(7);
    // New fields present
    expect(metrics.readiness).toBeDefined();
    expect(metrics.readiness.score).toBeGreaterThanOrEqual(0);
    expect(metrics.readiness.label).toBeDefined();
    expect(metrics.readiness.breakdown).toBeDefined();
    expect(metrics.trends).toBeDefined();
    expect(metrics.trends.alerts).toHaveLength(0);
    expect(metrics.calibration).toBeDefined();
    expect(metrics.calibration.tier).toBe('beginner');
    expect(typeof metrics.sleepScore).toBe('number');
    expect(typeof metrics.avgSleepLast3).toBe('number');
  });

  it('calculates strain for today\'s sessions', () => {
    const today = dateStr(0);
    const sessions = [
      makeSession({ date: today, rpe: 8, duration_minutes: 90, intensity_level: 4 }),
    ];
    const metrics = computeAllMetrics(sessions);
    // Strain now uses personalized divisor (beginner: 700 with no profile)
    expect(metrics.strain).toBeGreaterThan(0);
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

  it('backward compat — works without profile params', () => {
    const sessions = [
      makeSession({ date: dateStr(0), rpe: 7, duration_minutes: 60, intensity_level: 3, sleep_hours: 7 }),
    ];
    // 1-arg call should still work
    const metrics = computeAllMetrics(sessions);
    expect(metrics.strain).toBeGreaterThan(0);
    expect(metrics.readiness).toBeDefined();
    expect(metrics.calibration.tier).toBe('beginner');
  });

  it('uses profile params for calibration when provided', () => {
    const sessions = [
      makeSession({ date: dateStr(0), rpe: 7, duration_minutes: 60, intensity_level: 3 }),
    ];
    const metricsAdvanced = computeAllMetrics(sessions, 6, 'extra_active');
    const metricsDefault = computeAllMetrics(sessions);

    expect(metricsAdvanced.calibration.tier).toBe('advanced');
    expect(metricsDefault.calibration.tier).toBe('beginner');
    // Advanced should have higher strain divisor → lower strain
    expect(metricsAdvanced.calibration.strainDivisor).toBeGreaterThan(metricsDefault.calibration.strainDivisor);
  });

  it('populates new fields with data', () => {
    const sessions: SessionRow[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(makeSession({
        date: dateStr(i),
        rpe: 7,
        duration_minutes: 60,
        intensity_level: 3,
        sleep_hours: 7.5,
        soreness_level: 3,
      }));
    }
    const metrics = computeAllMetrics(sessions, 4, 'very_active');
    expect(metrics.sleepScore).toBeGreaterThan(0);
    expect(metrics.avgSleepLast3).toBeGreaterThan(0);
    expect(metrics.readiness.score).toBeGreaterThanOrEqual(0);
    expect(metrics.readiness.score).toBeLessThanOrEqual(100);
    expect(metrics.trends).toBeDefined();
    expect(metrics.calibration.tier).toBe('intermediate');
  });
});
