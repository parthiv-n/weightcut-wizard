/**
 * Pure helpers for rendering the floating macro-bubble labels over the AI
 * meal photo. Split into three steps so each piece can be unit-tested:
 *
 *   1. `selectLabeledItems` — pick the items that deserve a bubble (the
 *      most calorie-heavy, capped by a hard count and an 80% cumulative
 *      contribution rule so we don't waste a bubble on a 5-cal garnish).
 *   2. `shortName` — collapse "French Fries" → "Fries", "Spicy Grilled
 *      Chicken" → "Chicken", etc., so the label fits inside a small pill.
 *   3. `layoutLabels` — given the chosen items, decide where each bubble
 *      goes in normalized [0,1] coords. Anchors to the vision bbox when
 *      present, clamps to an edge inset to prevent clipping, and nudges
 *      overlapping bubbles apart so labels stay readable.
 */

import type { AiLineItem } from "@/pages/nutrition/types";

// Items below this calorie count never earn a bubble — they're rounding
// noise relative to the macro story (garnish, lettuce leaf, lemon wedge).
const MIN_CALORIES_FOR_LABEL = 10;
// Stop adding bubbles once the selected items together explain this much
// of the meal's total energy. Keeps the photo readable on small phones.
const CUMULATIVE_CAL_THRESHOLD = 0.8;

// Words we drop from the front of a name because they're descriptors, not
// the food itself. "French Fries" → "Fries"; "Spicy Grilled Chicken" →
// "Chicken". Includes cooking methods, intensities, and broad cuisine tags.
const LEADING_STOPWORDS = new Set<string>([
  // Cooking methods
  "grilled", "roasted", "fried", "deep-fried", "stir-fried", "pan-seared",
  "seared", "baked", "steamed", "boiled", "poached", "broiled", "smoked",
  "raw", "cooked", "blackened", "charred", "braised", "glazed",
  // Texture / preparation
  "crispy", "crunchy", "fresh", "frozen", "dried", "sliced", "diced",
  "minced", "chopped", "shredded", "whole", "half", "quarter",
  // Intensity / flavor descriptors
  "spicy", "mild", "sweet", "savory", "salty", "hot", "cold", "iced",
  "warm", "tangy", "buttery", "creamy",
  // Cuisine / origin adjectives that aren't part of the canonical name
  "french", "italian", "mexican", "asian", "chinese", "japanese", "indian",
  "thai", "korean", "vietnamese", "greek", "american", "spanish",
  // Common brand / style descriptors
  "buffalo", "bbq", "barbecue", "honey", "garlic", "lemon", "soy",
  "small", "medium", "large", "mini", "jumbo", "regular",
]);

// Stop-words that appear in the middle of a name and should just be
// dropped before picking the canonical noun.
const CONNECTORS = new Set<string>([
  "and", "with", "in", "on", "or", "of", "a", "an", "the", "&",
]);

// When a name has this as its trailing token, that's the dish name —
// "Beef Burger" → "Burger", "Chicken Caesar Salad" → "Salad". Order in
// the source name beats the leading stopword stripping for these.
const TRAILING_DISH_NOUNS = new Set<string>([
  "burger", "burgers",
  "fries",
  "salad", "salads",
  "bowl", "bowls",
  "wings",
  "wrap", "wraps",
  "sandwich", "sandwiches",
  "pizza",
  "soup",
  "pasta",
  "stew",
  "roll", "rolls",
  "taco", "tacos",
  "burrito", "burritos",
  "noodles",
  "rice",
  "curry",
  "steak",
  "sushi",
]);

const MAX_SHORT_NAME_LEN = 10;

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Produce a short, readable label from a food name. Designed to fit in a
 * ~6-10 character pill on a photo overlay. Falls back to the original
 * name (truncated) when no rule fires.
 */
export function shortName(name: string): string {
  if (!name) return "";
  // Strip parenthetical clarifiers: "Rice (white)" → "Rice".
  const noParens = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const words = noParens.split(/[\s,/]+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, MAX_SHORT_NAME_LEN);
  if (words.length === 1) return capitalize(words[0]).slice(0, MAX_SHORT_NAME_LEN);

  // 1) Trailing dish-noun beats everything else: "Beef Burger" → "Burger".
  const lastLower = words[words.length - 1].toLowerCase();
  if (TRAILING_DISH_NOUNS.has(lastLower)) {
    return capitalize(words[words.length - 1]).slice(0, MAX_SHORT_NAME_LEN);
  }

  // 2) Drop connectors anywhere in the phrase.
  const noConnectors = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
  if (noConnectors.length === 0) {
    return capitalize(words[0]).slice(0, MAX_SHORT_NAME_LEN);
  }

  // 3) Drop leading adjective stopwords but always keep at least one word.
  let start = 0;
  while (start < noConnectors.length - 1 && LEADING_STOPWORDS.has(noConnectors[start].toLowerCase())) {
    start++;
  }
  const trimmed = noConnectors.slice(start);

  // 4) Re-check trailing-noun after stripping (e.g. "Crispy French Fries"
  //    → trimmed=["Fries"], handled by single-word branch above, but if
  //    multiple remain we still prefer the trailing dish-noun).
  const trimLastLower = trimmed[trimmed.length - 1].toLowerCase();
  if (trimmed.length > 1 && TRAILING_DISH_NOUNS.has(trimLastLower)) {
    return capitalize(trimmed[trimmed.length - 1]).slice(0, MAX_SHORT_NAME_LEN);
  }

  // 5) Default: take the first remaining word — usually the main noun
  //    once adjectives are stripped ("Spicy Grilled Chicken" → "Chicken").
  return capitalize(trimmed[0]).slice(0, MAX_SHORT_NAME_LEN);
}

/**
 * Pick which items earn a label on the photo. Highest-calorie first,
 * capped at `hardCap`, and short-circuits once the selected set covers
 * 80% of the meal's total calories. Re-sorted left-to-right by bbox.x at
 * the end so the eye reads them in natural visual order.
 */
export function selectLabeledItems(
  items: ReadonlyArray<AiLineItem>,
  hardCap: number = 4,
): AiLineItem[] {
  if (items.length === 0) return [];

  // Drop trivia (<10 cal). If everything is trivial — rare — fall back to
  // the full list so we still show *something*.
  let candidates = items.filter((it) => (it.calories ?? 0) >= MIN_CALORIES_FOR_LABEL);
  if (candidates.length === 0) candidates = [...items];

  const sorted = [...candidates].sort((a, b) => (b.calories ?? 0) - (a.calories ?? 0));
  const totalCal = candidates.reduce((s, it) => s + (it.calories ?? 0), 0);
  const target = totalCal * CUMULATIVE_CAL_THRESHOLD;

  const selected: AiLineItem[] = [];
  let running = 0;
  for (const it of sorted) {
    selected.push(it);
    running += it.calories ?? 0;
    if (selected.length >= hardCap) break;
    if (running >= target) break;
  }

  // Final pass: re-sort by bbox.x for natural left-to-right reading.
  // Items without a bbox fall to the front (x defaults to 0) — that's
  // fine because the layout step gives them deterministic fallback slots.
  return selected.sort((a, b) => (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0));
}

export type PlacedLabel = { x: number; y: number; item: AiLineItem };

// Layout tunables — kept inside the helper so the test suite can also
// reason about them via the public behaviour.
const EDGE_INSET = 0.08; // 8% margin so bubbles don't clip off the image
const COLLISION_THRESHOLD = 0.16; // nudge bubbles closer than this apart
// 8-direction offsets we try when resolving a collision. Vertical moves
// first (cleanest visually for stacked plates), then horizontal, then
// diagonals as a last resort.
const COLLISION_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -0.14 }, { dx: 0, dy: 0.14 },
  { dx: -0.14, dy: 0 }, { dx: 0.14, dy: 0 },
  { dx: -0.12, dy: -0.12 }, { dx: 0.12, dy: -0.12 },
  { dx: -0.12, dy: 0.12 }, { dx: 0.12, dy: 0.12 },
];
// Smarter no-bbox fallback than the previous fixed positions: a 2×2
// quadrant grid distributes labels across the photo when the AI doesn't
// give us coordinates.
const FALLBACK_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.25, y: 0.75 },
  { x: 0.75, y: 0.75 },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Resolve final on-image positions for the labels. Pure function — given
 * the same input items, returns the same `{x, y}` (in [0,1]) for each.
 */
export function layoutLabels(items: ReadonlyArray<AiLineItem>): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  const collidesWith = (px: number, py: number) =>
    placed.some((p) => Math.hypot(p.x - px, p.y - py) < COLLISION_THRESHOLD);

  items.forEach((item, idx) => {
    let x: number;
    let y: number;
    if (item.bbox) {
      x = clamp(item.bbox.x + item.bbox.w / 2, EDGE_INSET, 1 - EDGE_INSET);
      y = clamp(item.bbox.y + item.bbox.h / 2, EDGE_INSET, 1 - EDGE_INSET);
    } else {
      const fb = FALLBACK_POSITIONS[idx % FALLBACK_POSITIONS.length];
      x = fb.x;
      y = fb.y;
    }

    if (collidesWith(x, y)) {
      for (const off of COLLISION_OFFSETS) {
        const cx = clamp(x + off.dx, EDGE_INSET, 1 - EDGE_INSET);
        const cy = clamp(y + off.dy, EDGE_INSET, 1 - EDGE_INSET);
        if (!collidesWith(cx, cy)) {
          x = cx;
          y = cy;
          break;
        }
      }
      // If every offset still collides we accept the overlap — better than
      // dropping the label entirely. With items capped at 4 this is rare.
    }

    placed.push({ x, y, item });
  });

  return placed;
}
