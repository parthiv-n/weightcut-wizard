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
});
