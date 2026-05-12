import { describe, it, expect } from "vitest";
import { computeWellness } from "../subScores/wellness";
import { ScoringConfigV1 } from "../config/v1";

describe("computeWellness", () => {
  it("returns 100 when Hooper is at floor (4)", () => {
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return { date: d.toISOString().slice(0, 10), hooper: 4 };
    });
    const r = computeWellness(data, "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(100);
  });
  it("decreases linearly as Hooper rises", () => {
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return { date: d.toISOString().slice(0, 10), hooper: 14 };
    });
    const r = computeWellness(data, "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(58); // 100 - (14-4)*4.2 = 58
  });
  it("returns 50 fallback with no check-ins", () => {
    const r = computeWellness([], "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(50);
    expect(r.reason).toMatch(/no.*check-in/i);
  });
});
