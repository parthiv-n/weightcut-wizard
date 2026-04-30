/**
 * Regression test for the Quick Add duplicate-meal bug.
 *
 * Bug: `supabase/functions/analyze-meal/index.ts` defaults to `persist=true`
 * and auto-saves a meal as `meal_type: "snack"` whenever the client omits the
 * flag. The client then ALSO saves via `saveMealToDb` with the
 * user-selected meal_type — two rows for one user action.
 *
 * Fix: every client call site of `analyze-meal` in
 * `src/hooks/nutrition/useAIMealAnalysis.ts` must include `persist: false`
 * in the request body. This test reads the file and asserts that every
 * `supabase.functions.invoke("analyze-meal", …)` body and every raw
 * `fetch(".../analyze-meal" …)` body contains `persist: false`.
 *
 * Static-source contract test (no React render needed). The hook is too
 * tightly coupled to React state + multiple contexts to mount cleanly under
 * the project's node-only vitest env, so we verify the contract that
 * actually matters: the body shape on the wire.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const HOOK_PATH = path.resolve(
  __dirname,
  "../../src/hooks/nutrition/useAIMealAnalysis.ts",
);

describe("Quick Add — no server-side persistence", () => {
  const source = readFileSync(HOOK_PATH, "utf8");

  it("every analyze-meal call site sends persist:false in the body", () => {
    // Find every call to the analyze-meal edge function (invoke + raw fetch).
    // Each must be followed (within ~400 chars, i.e. the same body literal)
    // by `persist: false`.
    const callSiteRegex =
      /(supabase\.functions\.invoke\(\s*["']analyze-meal["']|\/functions\/v1\/analyze-meal)/g;

    const matches = [...source.matchAll(callSiteRegex)];
    expect(
      matches.length,
      "Expected at least one analyze-meal call site in useAIMealAnalysis.ts",
    ).toBeGreaterThan(0);

    for (const match of matches) {
      const start = match.index ?? 0;
      const window = source.slice(start, start + 400);
      expect(
        window,
        `analyze-meal call at offset ${start} is missing 'persist: false' in the body — server will auto-persist a duplicate snack row`,
      ).toMatch(/persist:\s*false/);
    }
  });
});
