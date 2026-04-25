/**
 * Mock-based tests for the post-migration `useMealOperations` insert paths.
 *
 * Spec references:
 *   - docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md §3.2, §4.3
 *   - Insert flow: client must call RPC `create_meal_with_items(p_date, p_meal_type,
 *     p_meal_name, p_notes, p_is_ai_generated, p_items)`. Direct
 *     `supabase.from("nutrition_logs").insert(...)` is banned post-migration.
 *   - `p_meal_name` MUST be non-empty and must NEVER be the literal "Untitled"
 *     (coerceMealName helper enforces this; §1.3).
 *
 * Round-2 note: the coder shipped `buildCreateMealRpcArgs({ header, items,
 * fallbackTotals? })` → `{ p_date, p_meal_type, p_meal_name, p_notes,
 * p_is_ai_generated, p_items }` (flat args, matching the RPC signature in
 * supabase/migrations/20260419150000_create_meal_with_items_rpc.sql). This
 * suite exercises that actual contract.
 *
 * We mock the supabase client + toast + UserContext + caches so we can invoke
 * the helper outside of React. Tests target the pure builder directly to avoid
 * any React runtime dependency.
 */
import { describe, expect, it, vi } from "vitest";

// Stub the supabase client + react-context deps before the hook is imported.
// Vitest hoists vi.mock() to the top of the file, so the import below resolves
// to a harmless shim and no Auth/localStorage code runs in node.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({ data: { meal_id: "mock" }, error: null }),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ userId: "user-A" }) }));
vi.mock("@/hooks/useSafeAsync", () => ({ useSafeAsync: () => ({ isMounted: () => true }) }));
vi.mock("@/lib/haptics", () => ({ celebrateSuccess: vi.fn(), confirmDelete: vi.fn() }));
vi.mock("@/lib/syncQueue", () => ({
  syncQueue: { enqueue: vi.fn(), dequeueByRecordId: vi.fn() },
}));
vi.mock("@/lib/localCache", () => ({
  localCache: { setForDate: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/lib/nutritionCache", () => ({ nutritionCache: { setMeals: vi.fn() } }));
vi.mock("@/lib/aiPersistence", () => ({ AIPersistence: { remove: vi.fn() } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/timeoutWrapper", () => ({
  withSupabaseTimeout: async (p: unknown) => await p,
  withAuthTimeout: async (p: unknown) => await p,
}));

// Post-migration contract (see src/lib/buildMealRpcArgs.ts):
//
//   buildCreateMealRpcArgs({
//     header: { meal_name, meal_type, date, notes?, is_ai_generated? },
//     items?: RpcItemInput[],
//     fallbackTotals?: { calories, protein_g?, carbs_g?, fats_g?, grams?, name? },
//   }) => {
//     p_date, p_meal_type, p_meal_name, p_notes, p_is_ai_generated, p_items
//   }
//
// The helper is re-exported from `@/hooks/nutrition/useMealOperations` per the
// tester gate established in round 1, but also lives at `@/lib/buildMealRpcArgs`.
type RpcItemPayload = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  food_id: string | null;
  position: number;
};

type CreateMealRpcArgs = {
  p_date: string;
  p_meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  p_meal_name: string;
  p_notes: string | null;
  p_is_ai_generated: boolean;
  p_items: RpcItemPayload[];
};

let buildCreateMealRpcArgs:
  | ((input: unknown) => CreateMealRpcArgs)
  | null = null;
let importError: unknown = null;
try {
  const mod = await import("@/hooks/nutrition/useMealOperations");
  buildCreateMealRpcArgs =
    (mod as unknown as { buildCreateMealRpcArgs?: typeof buildCreateMealRpcArgs })
      .buildCreateMealRpcArgs ?? null;
} catch (err) {
  importError = err;
}

// Guard: if the migration hasn't shipped, skip instead of hard-failing, and
// leave a clear breadcrumb.
const describeIfReady =
  buildCreateMealRpcArgs !== null ? describe : describe.skip;

describe("useMealOperations RPC contract (post-migration)", () => {
  it("exports buildCreateMealRpcArgs — coder gate", () => {
    if (importError) {
      // eslint-disable-next-line no-console
      console.warn("[mealOperations.spec] import error:", importError);
    }
    expect(
      buildCreateMealRpcArgs,
      "buildCreateMealRpcArgs export missing from useMealOperations. Coder agent must add a pure builder helper and have every insert path route through it.",
    ).toBeTypeOf("function");
  });
});

describeIfReady("useMealOperations RPC argument shape", () => {
  const build = (input: unknown) => buildCreateMealRpcArgs!(input);
  const date = "2026-04-19";

  it("Path A — manual meal with all fields → valid RPC args", () => {
    const rpc = build({
      header: {
        meal_name: "Grilled chicken and rice",
        meal_type: "lunch",
        date,
        is_ai_generated: false,
      },
      items: [
        { name: "Chicken breast", grams: 150, calories: 247, protein_g: 46, carbs_g: 0, fats_g: 5 },
        { name: "White rice",     grams: 200, calories: 260, protein_g: 5,  carbs_g: 56, fats_g: 1 },
      ],
    });
    expect(rpc.p_meal_name.trim().length).toBeGreaterThan(0);
    expect(rpc.p_meal_name).not.toBe("Untitled");
    expect(["breakfast", "lunch", "dinner", "snack"]).toContain(rpc.p_meal_type);
    expect(rpc.p_items.length).toBe(2);
    for (const it of rpc.p_items) {
      expect(it.grams).toBeGreaterThan(0);
      expect(it.calories).toBeGreaterThanOrEqual(0);
    }
  });

  it("Path B — food-search result (single item) → valid RPC args, name coerced from meal_type", () => {
    const rpc = build({
      header: {
        meal_type: "snack",
        date,
        is_ai_generated: false,
        // meal_name intentionally omitted — builder falls through to coerceMealName → "Snack".
      },
      items: [
        { name: "Apple", grams: 182, calories: 95, protein_g: 0.5, carbs_g: 25, fats_g: 0.3 },
      ],
    });
    expect(rpc.p_meal_name.trim().length).toBeGreaterThan(0);
    expect(rpc.p_meal_name).not.toBe("Untitled");
    expect(rpc.p_meal_type).toBe("snack");
    expect(rpc.p_meal_name).toBe("Snack");
  });

  it("Path C — barcode scan with empty meal_name → coerced to meal-type default", () => {
    const rpc = build({
      header: {
        meal_name: "   ",
        meal_type: "breakfast",
        date,
        is_ai_generated: false,
      },
      items: [
        { name: "Oats", grams: 50, calories: 190, protein_g: 6, carbs_g: 33, fats_g: 3 },
      ],
    });
    expect(rpc.p_meal_name).toBe("Breakfast");
  });

  it("Path D — AI meal-plan idea (multi-item) → name preserved, items have position ordering", () => {
    const rpc = build({
      header: {
        meal_name: "AI suggestion: post-fight breakfast",
        meal_type: "breakfast",
        date,
        is_ai_generated: true,
      },
      items: [
        { name: "Scrambled eggs", grams: 120, calories: 180, protein_g: 13, carbs_g: 2, fats_g: 13 },
        { name: "Avocado toast",  grams: 100, calories: 220, protein_g: 5,  carbs_g: 30, fats_g: 9  },
        { name: "Banana",         grams: 118, calories: 105, protein_g: 1,  carbs_g: 27, fats_g: 0  },
      ],
    });
    expect(rpc.p_is_ai_generated).toBe(true);
    expect(rpc.p_meal_name).toBe("AI suggestion: post-fight breakfast");
    const positions = rpc.p_items.map((i) => i.position);
    // Positions must be unique and monotonically non-decreasing.
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("Path E — unknown meal_type → falls back to 'snack' per spec", () => {
    const rpc = build({
      header: {
        meal_name: "Midnight raid",
        meal_type: "midnight",
        date,
        is_ai_generated: false,
      },
      items: [
        { name: "Water", grams: 250, calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
      ],
    });
    expect(rpc.p_meal_type).toBe("snack");
    expect(rpc.p_meal_name).toBe("Midnight raid");
  });

  it("never emits empty meal_name across any combination of empty raw + valid meal_type", () => {
    const raws: (string | null | undefined)[] = ["", "   ", null, undefined];
    const types: Array<"breakfast" | "lunch" | "dinner" | "snack"> = [
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ];
    for (const raw of raws) {
      for (const t of types) {
        const rpc = build({
          header: { meal_name: raw, meal_type: t, date, is_ai_generated: false },
          items: [
            { name: "x", grams: 1, calories: 1, protein_g: 0, carbs_g: 0, fats_g: 0 },
          ],
        });
        expect(rpc.p_meal_name.trim().length).toBeGreaterThan(0);
        expect(rpc.p_meal_name).not.toBe("Untitled");
      }
    }
  });

  it("emits the RPC argument object shape, not a .from('nutrition_logs') payload", () => {
    const rpc = build({
      header: { meal_name: "x", meal_type: "lunch", date, is_ai_generated: false },
      items: [
        { name: "x", grams: 1, calories: 1, protein_g: 0, carbs_g: 0, fats_g: 0 },
      ],
    });
    // The flat RPC shape (matches migration 20260419150000) has these keys —
    // a legacy nutrition_logs row would have user_id, ingredients, etc.
    const keys = Object.keys(rpc).sort();
    expect(keys).toEqual([
      "p_date",
      "p_is_ai_generated",
      "p_items",
      "p_meal_name",
      "p_meal_type",
      "p_notes",
    ]);
    // No legacy keys leaked in.
    expect((rpc as unknown as { user_id?: unknown }).user_id).toBeUndefined();
    expect((rpc as unknown as { ingredients?: unknown }).ingredients).toBeUndefined();
  });

  it("auto-assigns position from array index when callers omit it", () => {
    const rpc = build({
      header: { meal_name: "Bowl", meal_type: "dinner", date, is_ai_generated: false },
      items: [
        { name: "a", grams: 10, calories: 10, protein_g: 0, carbs_g: 0, fats_g: 0 },
        { name: "b", grams: 10, calories: 10, protein_g: 0, carbs_g: 0, fats_g: 0 },
        { name: "c", grams: 10, calories: 10, protein_g: 0, carbs_g: 0, fats_g: 0 },
      ],
    });
    expect(rpc.p_items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("synthesises a catch-all item from fallbackTotals when items are omitted", () => {
    const rpc = build({
      header: { meal_name: "Mystery bar", meal_type: "snack", date, is_ai_generated: false },
      fallbackTotals: {
        calories: 210,
        protein_g: 20,
        carbs_g: 18,
        fats_g: 7,
        grams: 60,
      },
    });
    expect(rpc.p_items).toHaveLength(1);
    const only = rpc.p_items[0];
    expect(only.calories).toBe(210);
    expect(only.protein_g).toBe(20);
    expect(only.carbs_g).toBe(18);
    expect(only.fats_g).toBe(7);
    expect(only.grams).toBeGreaterThan(0);
    expect(only.position).toBe(0);
    expect(only.food_id).toBeNull();
  });

  it("trims notes and emits null for whitespace-only notes", () => {
    const rpcNull = build({
      header: { meal_name: "x", meal_type: "lunch", date, notes: "   ", is_ai_generated: false },
      items: [{ name: "x", grams: 1, calories: 1, protein_g: 0, carbs_g: 0, fats_g: 0 }],
    });
    expect(rpcNull.p_notes).toBeNull();

    const rpcText = build({
      header: { meal_name: "x", meal_type: "lunch", date, notes: "post-workout", is_ai_generated: false },
      items: [{ name: "x", grams: 1, calories: 1, protein_g: 0, carbs_g: 0, fats_g: 0 }],
    });
    expect(rpcText.p_notes).toBe("post-workout");
  });
});
