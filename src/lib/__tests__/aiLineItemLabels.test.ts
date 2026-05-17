import { describe, it, expect } from "vitest";
import type { AiLineItem } from "@/pages/nutrition/types";
import {
  shortName,
  selectLabeledItems,
  layoutLabels,
} from "../aiLineItemLabels";

function item(
  name: string,
  calories: number,
  bbox?: { x: number; y: number; w: number; h: number },
): AiLineItem {
  return { name, quantity: "", calories, protein_g: 0, carbs_g: 0, fats_g: 0, bbox };
}

describe("shortName", () => {
  it("'French Fries' → 'Fries' via trailing dish-noun rule", () => {
    expect(shortName("French Fries")).toBe("Fries");
  });
  it("'Beef Burger' → 'Burger'", () => {
    expect(shortName("Beef Burger")).toBe("Burger");
  });
  it("'Spicy Grilled Chicken' → 'Chicken' (strips two leading adjectives)", () => {
    expect(shortName("Spicy Grilled Chicken")).toBe("Chicken");
  });
  it("'Chicken Caesar Salad' → 'Salad' (trailing dish-noun wins)", () => {
    expect(shortName("Chicken Caesar Salad")).toBe("Salad");
  });
  it("'Chicken and Rice' → 'Rice' (trailing dish-noun rules)", () => {
    expect(shortName("Chicken and Rice")).toBe("Rice");
  });
  it("preserves single-word foods", () => {
    expect(shortName("Egg")).toBe("Egg");
  });
  it("strips parenthetical clarifications", () => {
    expect(shortName("Rice (white, cooked)")).toBe("Rice");
  });
  it("returns first non-stopword for non-trailing-noun phrases", () => {
    // No trailing dish-noun → after stripping "Spicy" the head is "Tuna".
    expect(shortName("Spicy Tuna")).toBe("Tuna");
  });
  it("caps output at 10 characters", () => {
    expect(shortName("Carbonarawesomeness").length).toBeLessThanOrEqual(10);
  });
  it("falls back gracefully on empty input", () => {
    expect(shortName("")).toBe("");
  });
});

describe("selectLabeledItems", () => {
  it("picks the highest-calorie items, drops <10 cal noise", () => {
    const items = [
      item("lettuce", 5),
      item("burger", 600),
      item("fries", 380),
      item("lemon wedge", 2),
    ];
    const result = selectLabeledItems(items);
    const names = result.map((r) => r.name);
    expect(names).toContain("burger");
    expect(names).toContain("fries");
    expect(names).not.toContain("lettuce");
    expect(names).not.toContain("lemon wedge");
  });

  it("respects the hard cap", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`item${i}`, 200 - i * 5));
    expect(selectLabeledItems(items, 3)).toHaveLength(3);
  });

  it("stops once 80% of total calories is covered", () => {
    // 800 alone is 80% of 1000 → just one bubble suffices.
    const items = [item("big", 800), item("med", 100), item("small", 50), item("tiny", 50)];
    expect(selectLabeledItems(items)).toHaveLength(1);
  });

  it("never returns empty when all items are sub-threshold", () => {
    const items = [item("a", 5), item("b", 4)];
    expect(selectLabeledItems(items)).toHaveLength(2);
  });

  it("re-sorts selected items left-to-right by bbox.x", () => {
    const items = [
      item("burger", 600, { x: 0.6, y: 0.5, w: 0.2, h: 0.2 }),
      item("fries", 380, { x: 0.1, y: 0.5, w: 0.2, h: 0.2 }),
    ];
    const result = selectLabeledItems(items);
    expect(result[0].name).toBe("fries");
    expect(result[1].name).toBe("burger");
  });
});

describe("layoutLabels", () => {
  it("clamps bbox centers to the edge inset so bubbles don't clip", () => {
    const placed = layoutLabels([item("a", 100, { x: 0, y: 0, w: 0.05, h: 0.05 })]);
    expect(placed[0].x).toBeGreaterThanOrEqual(0.08);
    expect(placed[0].y).toBeGreaterThanOrEqual(0.08);
  });

  it("clamps near the bottom-right corner too", () => {
    const placed = layoutLabels([item("a", 100, { x: 0.96, y: 0.96, w: 0.05, h: 0.05 })]);
    expect(placed[0].x).toBeLessThanOrEqual(0.92);
    expect(placed[0].y).toBeLessThanOrEqual(0.92);
  });

  it("nudges overlapping bubbles apart", () => {
    const bb = { x: 0.4, y: 0.4, w: 0.05, h: 0.05 };
    const items = [item("a", 100, bb), item("b", 100, bb)];
    const [p1, p2] = layoutLabels(items);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    expect(dist).toBeGreaterThan(0.10);
  });

  it("uses the 4-quadrant fallback when no bbox is provided", () => {
    const items = [item("a", 100), item("b", 100), item("c", 100), item("d", 100)];
    const placed = layoutLabels(items);
    // All four placed at distinct positions (the quadrant grid).
    const uniquePositions = new Set(placed.map((p) => `${p.x},${p.y}`));
    expect(uniquePositions.size).toBe(4);
  });
});
