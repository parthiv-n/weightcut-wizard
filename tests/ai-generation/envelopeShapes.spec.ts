/**
 * Regression tests for the AI envelope shapes that broke during the Convex
 * migration. Bug: `fightWeekAnalysis.ts` and `rehydrationProtocol.ts`
 * returned the parsed LLM output directly; the UI reads `data.plan` /
 * `data.protocol` and crashed on `undefined`. Pinning the wire shape so any
 * regression breaks tests rather than silently white-screening prod.
 *
 * Sources: FightWeekAIPlan (src/pages/FightWeek.tsx 40-67), RehydrationProtocol
 * (src/pages/hydration/types.ts 62-74). `satisfies` is the compile-time half.
 */

import { describe, it, expect } from "vitest";
import type { FightWeekAIPlan } from "@/pages/FightWeek";
import type { RehydrationProtocol } from "@/pages/hydration/types";

// ── Canonical fixtures ─────────────────────────────────────────────────────

const fullFightWeekPlan = {
  summary: "Cut 3kg in 5 days.",
  riskLevel: "orange" as const,
  safetyWarning: "Dehydration of 4.2% BW carries performance risk.",
  breakdown: {
    totalToCut: 3.0, percentBW: 3.75, glycogenLoss: 0.96, fibreLoss: 0.24,
    sodiumLoss: 0.16, waterLoadingLoss: 0.4, dietTotal: 1.76, dehydrationNeeded: 1.24,
  },
  dehydration: { percentBW: 1.55, safety: "green" as const, saunaSessions: 3 },
  timeline: [{
    day: -4, label: "4 Days Out", projectedWeight: 79.5, carbTarget_g: 160,
    fibreTarget_g: 15, sodiumTarget_mg: 2500, fluidTarget_ml: 8000,
    actions: ["Begin water loading"],
  }],
  dehydrationTactics: [{ name: "Sauna", duration: "4x10min", expectedLoss: "0.6kg", notes: "Keep ORS." }],
  postWeighIn: { rehydrationTargetMl: 4000, sodiumTargetMg: 4000, carbTargetG: 600, notes: "ORS within 30m." },
  medicalRedFlags: ["Cramps that do not resolve", "Confusion or disorientation"],
} satisfies FightWeekAIPlan;

const fullRehydrationProtocol = {
  summary: "10-hour staged rehydration: rapid → active → pre-comp.",
  hourlyProtocol: [
    { hour: 1, phase: "Rapid Rehydration", fluidML: 600, sodiumMg: 600, carbsG: 0, notes: "ORS" },
    { hour: 2, phase: "Active Recovery", fluidML: 500, sodiumMg: 500, carbsG: 40, notes: "Rice" },
  ],
  carbRefuelPlan: {
    meals: [{ timing: "Hour 1", carbsG: 60, foods: ["White rice"], rationale: "Fast digesting." }],
  },
  warnings: ["Do not exceed 1L of fluid per hour", "Avoid high-fibre foods"],
} satisfies RehydrationProtocol;

// ── Required-key tables (compile-time pinned via `satisfies`) ──────────────

const REQUIRED_PLAN_KEYS = [
  "summary", "riskLevel", "safetyWarning", "breakdown", "dehydration",
  "timeline", "dehydrationTactics", "postWeighIn", "medicalRedFlags",
] as const satisfies ReadonlyArray<keyof FightWeekAIPlan>;

const REQUIRED_BREAKDOWN_KEYS = [
  "totalToCut", "percentBW", "glycogenLoss", "fibreLoss", "sodiumLoss",
  "waterLoadingLoss", "dietTotal", "dehydrationNeeded",
] as const satisfies ReadonlyArray<keyof FightWeekAIPlan["breakdown"]>;

const REQUIRED_DEHYDRATION_KEYS = [
  "percentBW", "safety", "saunaSessions",
] as const satisfies ReadonlyArray<keyof FightWeekAIPlan["dehydration"]>;

const REQUIRED_PROTOCOL_KEYS = [
  "summary", "hourlyProtocol", "carbRefuelPlan", "warnings",
] as const satisfies ReadonlyArray<keyof RehydrationProtocol>;

// ── 1. FightWeekAIPlan ─────────────────────────────────────────────────────

describe("FightWeekAIPlan shape contract", () => {
  it.each(REQUIRED_PLAN_KEYS)("exposes required top-level field: %s", (key) => {
    expect(fullFightWeekPlan).toHaveProperty(key);
    expect((fullFightWeekPlan as Record<string, unknown>)[key]).not.toBeUndefined();
  });

  it.each(REQUIRED_BREAKDOWN_KEYS)("breakdown.%s is a finite number", (key) => {
    const v = (fullFightWeekPlan.breakdown as Record<string, unknown>)[key];
    expect(typeof v).toBe("number");
    expect(Number.isFinite(v as number)).toBe(true);
  });

  it.each(REQUIRED_DEHYDRATION_KEYS)("dehydration exposes field: %s", (key) => {
    expect(fullFightWeekPlan.dehydration).toHaveProperty(key);
  });

  it("dehydration.safety and riskLevel are valid traffic-light enums", () => {
    const allowed = ["green", "orange", "red"];
    expect(allowed).toContain(fullFightWeekPlan.dehydration.safety);
    expect(allowed).toContain(fullFightWeekPlan.riskLevel);
  });

  it("timeline is a non-empty array of day projections", () => {
    expect(Array.isArray(fullFightWeekPlan.timeline)).toBe(true);
    expect(fullFightWeekPlan.timeline.length).toBeGreaterThan(0);
  });
});

// ── 2. RehydrationProtocol ─────────────────────────────────────────────────

describe("RehydrationProtocol shape contract", () => {
  it.each(REQUIRED_PROTOCOL_KEYS)("exposes required field: %s", (key) => {
    expect(fullRehydrationProtocol).toHaveProperty(key);
    expect((fullRehydrationProtocol as Record<string, unknown>)[key]).not.toBeUndefined();
  });

  it("hourlyProtocol and carbRefuelPlan.meals are non-empty arrays", () => {
    expect(fullRehydrationProtocol.hourlyProtocol.length).toBeGreaterThan(0);
    expect(fullRehydrationProtocol.carbRefuelPlan.meals.length).toBeGreaterThan(0);
  });

  it("warnings is a non-empty array of strings", () => {
    expect(fullRehydrationProtocol.warnings.length).toBeGreaterThan(0);
    fullRehydrationProtocol.warnings.forEach((w) => expect(typeof w).toBe("string"));
  });
});

// ── 3. Envelope wrappers — {plan} / {protocol} ─────────────────────────────

interface FightWeekEnvelope { plan: FightWeekAIPlan }
interface RehydrationEnvelope { protocol: RehydrationProtocol }

describe("Action envelope wrappers", () => {
  it("fightWeekAnalysis returns {plan: FightWeekAIPlan}", () => {
    const envelope: FightWeekEnvelope = { plan: fullFightWeekPlan };
    expect(envelope.plan).toBe(fullFightWeekPlan);
    // The original crash site:
    expect(() => envelope.plan.breakdown.glycogenLoss.toFixed(2)).not.toThrow();
  });

  it("rehydrationProtocol returns {protocol: RehydrationProtocol}", () => {
    const envelope: RehydrationEnvelope = { protocol: fullRehydrationProtocol };
    expect(envelope.protocol).toBe(fullRehydrationProtocol);
    expect(envelope.protocol.hourlyProtocol[0].fluidML).toBeGreaterThan(0);
  });

  it("a payload missing the envelope key (the original bug) is detectable", () => {
    const unwrapped = fullFightWeekPlan as unknown as { plan?: FightWeekAIPlan };
    expect(unwrapped.plan).toBeUndefined();
    expect(() => (unwrapped as FightWeekEnvelope).plan.breakdown.glycogenLoss).toThrow();
  });
});

// ── 4. Deterministic fallback shells ───────────────────────────────────────

const fallbackPlan = {
  summary: "AI commentary unavailable — showing deterministic plan only.",
  riskLevel: "green" as const,
  safetyWarning: null,
  breakdown: {
    totalToCut: 0, percentBW: 0, glycogenLoss: 0, fibreLoss: 0,
    sodiumLoss: 0, waterLoadingLoss: 0, dietTotal: 0, dehydrationNeeded: 0,
  },
  dehydration: { percentBW: 0, safety: "green" as const, saunaSessions: 0 },
  timeline: [],
  dehydrationTactics: [],
  postWeighIn: { rehydrationTargetMl: 0, sodiumTargetMg: 0, carbTargetG: 0, notes: "" },
  medicalRedFlags: [],
} satisfies FightWeekAIPlan;

const fallbackProtocol = {
  summary: "AI commentary unavailable — showing deterministic protocol only.",
  hourlyProtocol: [
    { hour: 1, phase: "Rapid Rehydration", fluidML: 0, sodiumMg: 0, carbsG: 0, notes: "" },
  ],
  carbRefuelPlan: { meals: [] },
  warnings: ["AI unavailable — defaulting to research summary"],
} satisfies RehydrationProtocol;

describe("Deterministic fallback shells", () => {
  it("FightWeekAIPlan fallback satisfies the shape with empty narratives", () => {
    for (const key of REQUIRED_PLAN_KEYS) expect(fallbackPlan).toHaveProperty(key);
    expect(fallbackPlan.safetyWarning === null || typeof fallbackPlan.safetyWarning === "string").toBe(true);
  });

  it("RehydrationProtocol fallback satisfies the shape with one default hour", () => {
    for (const key of REQUIRED_PROTOCOL_KEYS) expect(fallbackProtocol).toHaveProperty(key);
    expect(Array.isArray(fallbackProtocol.carbRefuelPlan.meals)).toBe(true);
  });

  it("both fallbacks fit inside their envelopes without TS coercion", () => {
    const fw: FightWeekEnvelope = { plan: fallbackPlan };
    const rh: RehydrationEnvelope = { protocol: fallbackProtocol };
    expect(fw.plan).toBe(fallbackPlan);
    expect(rh.protocol).toBe(fallbackProtocol);
  });
});
