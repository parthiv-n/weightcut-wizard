import { describe, it, expect } from "vitest";
import { computeNutritionAdherence } from "../subScores/nutritionAdherence";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

function dayMeals(date: string, calories: number, proteinG: number) {
  return { date, calories, proteinG };
}

describe("computeNutritionAdherence", () => {
  it("returns 100 when all 7 days hit calorie target within tolerance and protein met", () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return dayMeals(d.toISOString().slice(0, 10), 2500, 180);
    });
    const r = computeNutritionAdherence(
      days, { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(100);
  });
  it("penalises protein shortfall — 7 days at 50% protein → big deduction", () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return dayMeals(d.toISOString().slice(0, 10), 2500, 90);
    });
    const r = computeNutritionAdherence(
      days, { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(100 - 7 * cfg.nutrition.proteinPenaltyPerDay);
  });
  it("returns 0 when no meals logged and targets exist", () => {
    const r = computeNutritionAdherence(
      [], { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(0);
  });
  it("returns 50 fallback when no targets configured", () => {
    const r = computeNutritionAdherence([], { calories: null, proteinG: null }, "2026-05-01", cfg);
    expect(r.value).toBe(50);
    expect(r.reason).toMatch(/target/i);
  });
});
