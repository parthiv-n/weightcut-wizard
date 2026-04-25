/**
 * Unit tests for `normaliseWeeklyPlan` — the deterministic post-processor that
 * sits between the LLM and the client for both generate-cut-plan and
 * generate-weight-plan. The contract:
 *
 *   1. Output length === weekCount, regardless of LLM output length.
 *   2. Output[i].week === i + 1.
 *   3. Output[weekCount - 1].targetWeight === finalTarget exactly.
 *   4. Missing rows have linearly-interpolated targetWeight between
 *      startWeight and finalTarget.
 *   5. Missing macros inherit from the nearest LLM-provided row, falling
 *      back to defaults when no rows are usable.
 *
 * Source: supabase/functions/_shared/normalizeWeeklyPlan.ts
 */

import { describe, it, expect } from "vitest";
import { normaliseWeeklyPlan } from "../../supabase/functions/_shared/normalizeWeeklyPlan";

const defaults = {
  defaultCalories: 2000,
  defaultProtein: 160,
  defaultCarbs: 200,
  defaultFats: 70,
};

describe("normaliseWeeklyPlan", () => {
  it("pads a too-short LLM response to the requested week count", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 6,
      startWeight: 80,
      finalTarget: 74,
      weeklyPlan: [
        { week: 1, targetWeight: 79, calories: 2100, protein_g: 160, carbs_g: 220, fats_g: 70 },
        { week: 2, targetWeight: 78, calories: 2050, protein_g: 160, carbs_g: 200, fats_g: 70 },
      ],
    });

    expect(out).toHaveLength(6);
    expect(out.map((r) => r.week)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("trims a too-long LLM response to the requested week count", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 4,
      startWeight: 80,
      finalTarget: 76,
      weeklyPlan: Array.from({ length: 10 }, (_, i) => ({
        week: i + 1,
        targetWeight: 80 - i,
        calories: 1900,
        protein_g: 160,
        carbs_g: 180,
        fats_g: 65,
      })),
    });

    expect(out).toHaveLength(4);
    expect(out[3].week).toBe(4);
  });

  it("forces the final week's targetWeight to equal finalTarget exactly", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 5,
      startWeight: 75,
      finalTarget: 70.5, // fight-week target — must land exactly here
      weeklyPlan: [
        // LLM rounds the final week to "71" — the normaliser must correct it
        { week: 5, targetWeight: 71, calories: 1800, protein_g: 150, carbs_g: 100, fats_g: 60 },
      ],
    });

    expect(out[out.length - 1].targetWeight).toBe(70.5);
  });

  it("linearly interpolates missing weeks between start and final", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 4,
      startWeight: 80,
      finalTarget: 76, // 1 kg loss per week, ending at 76
      weeklyPlan: [], // no LLM rows at all
    });

    // Week 1 = 79, week 2 = 78, week 3 = 77, week 4 = 76 (final, exact)
    expect(out.map((r) => r.targetWeight)).toEqual([79, 78, 77, 76]);
  });

  it("uses defaults for macros when LLM omits all rows", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 3,
      startWeight: 70,
      finalTarget: 68,
      weeklyPlan: null,
    });

    for (const row of out) {
      expect(row.calories).toBe(defaults.defaultCalories);
      expect(row.protein_g).toBe(defaults.defaultProtein);
      expect(row.carbs_g).toBe(defaults.defaultCarbs);
      expect(row.fats_g).toBe(defaults.defaultFats);
    }
  });

  it("backfills macros from the nearest filled row when one is provided", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 4,
      startWeight: 80,
      finalTarget: 76,
      weeklyPlan: [
        { week: 2, targetWeight: 78, calories: 1850, protein_g: 170, carbs_g: 150, fats_g: 65 },
      ],
    });

    // Week 1 has no row → nearest filled is week 2; macros should inherit.
    expect(out[0].calories).toBe(1850);
    expect(out[0].protein_g).toBe(170);
    expect(out[0].carbs_g).toBe(150);
    expect(out[0].fats_g).toBe(65);
  });

  it("preserves LLM-provided macros for filled rows (does not overwrite)", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 3,
      startWeight: 75,
      finalTarget: 72,
      weeklyPlan: [
        { week: 1, targetWeight: 74, calories: 2100, protein_g: 165, carbs_g: 230, fats_g: 70 },
        { week: 2, targetWeight: 73, calories: 2000, protein_g: 165, carbs_g: 200, fats_g: 65 },
        { week: 3, targetWeight: 72, calories: 1900, protein_g: 165, carbs_g: 170, fats_g: 60 },
      ],
    });

    expect(out[0].calories).toBe(2100);
    expect(out[1].calories).toBe(2000);
    expect(out[2].calories).toBe(1900);
  });

  it("handles a single-week plan correctly (final week === only week)", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 1,
      startWeight: 70,
      finalTarget: 69,
      weeklyPlan: [{ week: 1, targetWeight: 999, calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 70 }],
    });

    expect(out).toHaveLength(1);
    expect(out[0].targetWeight).toBe(69);
  });

  it("works for a weight-loss plan ending at goal_weight (non-fighter case)", () => {
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 8,
      startWeight: 90,
      finalTarget: 82, // user's chosen goal weight
      weeklyPlan: [],
    });

    expect(out[0].targetWeight).toBe(89);
    expect(out[7].targetWeight).toBe(82);
  });

  it("works for a fight-camp plan ending at fight_week_target (not goal_weight)", () => {
    // Fighter at 75 kg cutting to 70 kg fight class with 5.5% water cut.
    // Fight-week target = 70 * 1.055 ≈ 73.85, rounded to 73.9.
    // The normaliser must ensure week N targetWeight === 73.9, not 70.
    const out = normaliseWeeklyPlan({
      ...defaults,
      weekCount: 6,
      startWeight: 75,
      finalTarget: 73.9,
      weeklyPlan: [
        { week: 6, targetWeight: 70, calories: 2200, protein_g: 175, carbs_g: 40, fats_g: 90 },
      ],
    });

    expect(out[out.length - 1].targetWeight).toBe(73.9);
  });
});
