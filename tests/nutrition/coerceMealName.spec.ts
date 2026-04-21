/**
 * Unit tests for the `coerceMealName` helper (Phase 1.3 of the nutrition
 * overhaul spec, docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md).
 *
 * Contract (from spec §1.3):
 *   coerceMealName(raw: string | null | undefined, mealType: string): string
 *   - Trim `raw`. If non-empty, return it verbatim.
 *   - If empty/whitespace/undefined/null, return `defaultNameFor(mealType)`:
 *       breakfast → "Breakfast"
 *       lunch     → "Lunch"
 *       dinner    → "Dinner"
 *       snack     → "Snack"
 *       anything else (including empty meal_type) → "Logged meal"
 *
 * Module path: src/lib/mealName.ts (exports `coerceMealName` and
 * `defaultNameFor`). Coder round-1 landed the helper at `@/lib/mealName`
 * rather than the speculative `@/lib/coerceMealName`; tester round-2
 * updated this import accordingly.
 */
import { describe, expect, it } from "vitest";
import { coerceMealName, defaultNameFor } from "@/lib/mealName";

describe("coerceMealName", () => {
  describe("falsy / empty / whitespace inputs fall back to meal-type default", () => {
    it("empty string → 'Breakfast' when meal_type=breakfast", () => {
      expect(coerceMealName("", "breakfast")).toBe("Breakfast");
    });

    it("whitespace-only string → 'Lunch' when meal_type=lunch", () => {
      expect(coerceMealName("   ", "lunch")).toBe("Lunch");
    });

    it("tab/newline-only string → 'Dinner' when meal_type=dinner", () => {
      expect(coerceMealName("\t\n  ", "dinner")).toBe("Dinner");
    });

    it("undefined → 'Snack' when meal_type=snack", () => {
      expect(coerceMealName(undefined, "snack")).toBe("Snack");
    });

    it("null → 'Breakfast' when meal_type=breakfast", () => {
      expect(coerceMealName(null, "breakfast")).toBe("Breakfast");
    });
  });

  describe("all four valid meal types produce correctly-cased defaults", () => {
    it.each([
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
      ["dinner", "Dinner"],
      ["snack", "Snack"],
    ])("meal_type=%s → %s", (mealType, expected) => {
      expect(coerceMealName("", mealType)).toBe(expected);
      expect(coerceMealName(null, mealType)).toBe(expected);
      expect(coerceMealName(undefined, mealType)).toBe(expected);
      expect(defaultNameFor(mealType)).toBe(expected);
    });
  });

  describe("unknown / missing meal_type falls back to generic 'Logged meal'", () => {
    it("unknown meal_type string → 'Logged meal'", () => {
      expect(coerceMealName("", "brunch")).toBe("Logged meal");
      expect(coerceMealName(null, "midnight")).toBe("Logged meal");
      expect(defaultNameFor("brunch")).toBe("Logged meal");
    });

    it("empty meal_type → 'Logged meal'", () => {
      expect(coerceMealName("", "")).toBe("Logged meal");
      expect(coerceMealName(undefined, "")).toBe("Logged meal");
    });

    it("undefined meal_type (ignoring TS types) → 'Logged meal'", () => {
      // @ts-expect-error exercising runtime defence, not type path.
      expect(coerceMealName(null, undefined)).toBe("Logged meal");
      // @ts-expect-error same.
      expect(defaultNameFor(undefined)).toBe("Logged meal");
    });

    it("meal_type is case-sensitive: 'Breakfast' (capitalised) is NOT a known type", () => {
      // Spec defines enum as lowercase; uppercase input is treated as unknown.
      expect(coerceMealName("", "Breakfast")).toBe("Logged meal");
    });
  });

  describe("non-empty names pass through with trimming only", () => {
    it("preserves verbatim non-empty names regardless of meal_type", () => {
      expect(coerceMealName("Chicken Rice", "breakfast")).toBe("Chicken Rice");
      expect(coerceMealName("Post-workout shake", "snack")).toBe("Post-workout shake");
      expect(coerceMealName("eggs", "unknown")).toBe("eggs");
    });

    it("trims leading/trailing whitespace", () => {
      expect(coerceMealName("  Oatmeal  ", "breakfast")).toBe("Oatmeal");
      expect(coerceMealName("\tSteak\n", "dinner")).toBe("Steak");
    });

    it("preserves interior whitespace", () => {
      expect(coerceMealName("Peanut   butter", "snack")).toBe("Peanut   butter");
    });

    it("does not crash on unusual-but-truthy inputs", () => {
      expect(coerceMealName("0", "breakfast")).toBe("0");
      expect(coerceMealName("null", "lunch")).toBe("null");
    });
  });

  describe("acceptance-criterion-level invariants", () => {
    it("NEVER returns an empty string", () => {
      const mealTypes = ["breakfast", "lunch", "dinner", "snack", "unknown", "", "X"];
      const inputs: (string | null | undefined)[] = [null, undefined, "", " ", "\n\t"];
      for (const t of mealTypes) {
        for (const raw of inputs) {
          const out = coerceMealName(raw, t);
          expect(out.length).toBeGreaterThan(0);
          expect(out.trim()).toBe(out);
        }
      }
    });

    it("NEVER returns the literal 'Untitled' (the old buggy fallback)", () => {
      const inputs: (string | null | undefined)[] = [null, undefined, "", " "];
      for (const raw of inputs) {
        for (const t of ["breakfast", "lunch", "dinner", "snack", "unknown"]) {
          expect(coerceMealName(raw, t)).not.toBe("Untitled");
        }
      }
    });
  });
});
