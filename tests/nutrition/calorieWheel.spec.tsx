/**
 * Component test for the calorie wheel (`MacroPieChart`).
 *
 * Spec references:
 *   - docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md Acceptance #1:
 *     "On hard refresh (10 consecutive attempts on iOS + web), the calorie wheel
 *      shows correct consumed/target within 8s on wifi…"
 *   - Cold-render bug: target renders from cached profile but consumed stuck at 0.
 *
 * This suite renders the chart via react-dom/server (no DOM env needed) and
 * verifies:
 *
 *   (a) On cold render with a loaded profile (calorieTarget>0) but zero meals,
 *       the center shows 0 kcal, "Goal" matches the target, and "Left" equals
 *       the target. The progress arc has full strokeDashoffset (no fill).
 *
 *   (b) When meals arrive (e.g. calories=500 of 2000), "Eaten" shows 500,
 *       "Left" shows 1500, and the % label reads 25%.
 *
 * Using react-dom/server keeps the test free of @testing-library deps; we
 * parse the rendered HTML string for the assertion signals above.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MacroPieChart } from "@/components/nutrition/MacroPieChart";

function render(props: React.ComponentProps<typeof MacroPieChart>): string {
  return renderToStaticMarkup(React.createElement(MacroPieChart, props));
}

describe("MacroPieChart — cold render with profile, zero meals", () => {
  const coldProps: React.ComponentProps<typeof MacroPieChart> = {
    calories: 0,
    calorieTarget: 2000,
    protein: 0,
    carbs: 0,
    fats: 0,
    proteinGoal: 160,
    carbsGoal: 220,
    fatsGoal: 60,
  };

  it("renders target value from profile (Goal = 2000)", () => {
    const html = render(coldProps);
    expect(html).toContain(">2000<"); // Goal stat
  });

  it("consumed is 0 in the center ring label", () => {
    const html = render(coldProps);
    // Center ring shows `${Math.round(calories)}` then "kcal". We look for 0
    // adjacent to the kcal label marker.
    expect(html).toMatch(/>0<[^]*?kcal/);
  });

  it("'Left' equals the full target (2000)", () => {
    const html = render(coldProps);
    // Left stat shows the difference; since consumed=0 it must render 2000.
    // There will be two '>2000<' occurrences (Goal and Left) — that's fine.
    const matches = html.match(/>2000</g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT show 'Over' label when consumed=0", () => {
    const html = render(coldProps);
    expect(html).not.toMatch(/>Over</);
    expect(html).toMatch(/>Left</);
  });

  it("progress arc has strokeDashoffset equal to full circumference (no fill)", () => {
    const html = render(coldProps);
    // RADIUS=44, CIRCUMFERENCE = 2π·44 ≈ 276.46 — strokeDashoffset equals
    // CIRCUMFERENCE when calPct=0, so it'll match that numeric string prefix.
    // React server renderer emits SVG attrs as kebab-case (stroke-dasharray).
    const dashArrayMatch = html.match(/stroke-dasharray="([0-9.]+)"/);
    const dashOffsetMatch = html.match(/stroke-dashoffset="([0-9.]+)"/);
    expect(dashArrayMatch, `expected stroke-dasharray in rendered SVG: ${html.slice(0, 300)}`).not.toBeNull();
    expect(dashOffsetMatch).not.toBeNull();
    expect(dashArrayMatch![1]).toBe(dashOffsetMatch![1]);
  });

  it("progress % label reads 0% at cold render", () => {
    const html = render(coldProps);
    expect(html).toContain("0% of daily goal");
  });

  it("renders macro rows for Protein / Carbs / Fat even with zero values", () => {
    const html = render(coldProps);
    expect(html).toContain(">Protein<");
    expect(html).toContain(">Carbs<");
    expect(html).toContain(">Fat<");
  });
});

describe("MacroPieChart — meals arrive, partial fill", () => {
  const partialProps: React.ComponentProps<typeof MacroPieChart> = {
    calories: 500,
    calorieTarget: 2000,
    protein: 40,
    carbs: 55,
    fats: 15,
    proteinGoal: 160,
    carbsGoal: 220,
    fatsGoal: 60,
  };

  it("Eaten stat shows 500", () => {
    const html = render(partialProps);
    expect(html).toContain(">500<");
  });

  it("Left stat shows 1500 (= 2000 - 500)", () => {
    const html = render(partialProps);
    expect(html).toContain(">1500<");
  });

  it("center kcal label shows 500", () => {
    const html = render(partialProps);
    expect(html).toMatch(/>500<[^]*?kcal/);
  });

  it("progress % label reads 25% of daily goal", () => {
    const html = render(partialProps);
    expect(html).toContain("25% of daily goal");
  });

  it("does NOT render 'Over' label below target", () => {
    const html = render(partialProps);
    expect(html).not.toMatch(/>Over</);
  });
});

describe("MacroPieChart — over-target edge case", () => {
  it("switches to 'Over' label when consumed > target", () => {
    const html = render({
      calories: 2400,
      calorieTarget: 2000,
      protein: 180,
      carbs: 260,
      fats: 80,
      proteinGoal: 160,
      carbsGoal: 220,
      fatsGoal: 60,
    });
    expect(html).toMatch(/>Over</);
    expect(html).not.toMatch(/>Left</);
    expect(html).toContain(">400<"); // amount over
  });
});

describe("MacroPieChart — missing/zero target fallback (guarded against divide-by-zero)", () => {
  it("calorieTarget=0 does not divide-by-zero and renders 0%", () => {
    const html = render({
      calories: 0,
      calorieTarget: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      proteinGoal: 0,
      carbsGoal: 0,
      fatsGoal: 0,
    });
    expect(html).toContain("0% of daily goal");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
});
