import { describe, it, expect } from "vitest";
import { computeSleep } from "../subScores/sleep";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

function genSleep(date: string, hours: number) { return { date, hours }; }

function week(asOf: string, hoursPerNight: number) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(asOf + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    out.push(genSleep(d.toISOString().slice(0, 10), hoursPerNight));
  }
  return out;
}

describe("computeSleep", () => {
  it("returns 100 when full 8h × 7 nights", () => {
    const r = computeSleep(week("2026-05-01", 8), "2026-05-01", cfg);
    expect(r.value).toBe(100);
  });
  it("penalises sleep debt — 1h short × 7 nights = 7h debt → 100 − 56 = 44", () => {
    const r = computeSleep(week("2026-05-01", 7), "2026-05-01", cfg);
    expect(r.value).toBe(44);
  });
  it("floors at 0 for catastrophic debt", () => {
    const r = computeSleep(week("2026-05-01", 2), "2026-05-01", cfg);
    expect(r.value).toBe(0);
  });
  it("handles missing logs as zero hours", () => {
    const r = computeSleep([], "2026-05-01", cfg);
    expect(r.value).toBe(0);
    expect(r.reason).toMatch(/no sleep/i);
  });

  describe("assumedSleepDates", () => {
    it("treats a 7h assumed entry like a real log so the target day isn't penalised", () => {
      // 6 prior nights at 8h + assumed 7h today → total 55h vs 56h target = 1h debt.
      const real = week("2026-05-01", 8).filter((s) => s.date !== "2026-05-01");
      const withAssumed = [...real, { date: "2026-05-01", hours: 7 }];
      const r = computeSleep(withAssumed, "2026-05-01", cfg, ["2026-05-01"]);
      expect(r.value).toBe(92); // 100 - 1*8
    });

    it("appends an 'assumed' annotation to the reason when an in-window date matches", () => {
      const real = week("2026-05-01", 8).filter((s) => s.date !== "2026-05-01");
      const withAssumed = [...real, { date: "2026-05-01", hours: 7 }];
      const r = computeSleep(withAssumed, "2026-05-01", cfg, ["2026-05-01"]);
      expect(r.reason).toMatch(/assumed 7h on 1 day/);
    });

    it("doesn't annotate when the assumed date is outside the 7-day window", () => {
      // Assumed date is 30 days ago — outside the 7-day window so it shouldn't bleed into reason text.
      const r = computeSleep(week("2026-05-01", 8), "2026-05-01", cfg, ["2026-04-01"]);
      expect(r.reason).not.toMatch(/assumed/);
      expect(r.value).toBe(100);
    });

    it("is a no-op when assumedSleepDates is omitted (back-compat)", () => {
      const r = computeSleep(week("2026-05-01", 8), "2026-05-01", cfg);
      expect(r.value).toBe(100);
      expect(r.reason).not.toMatch(/assumed/);
    });
  });
});
