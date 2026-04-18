# Nutrition: Instant & Consistent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate nutrition data-corruption bugs ("Untitled", snack jump, disappearing items) and make the Nutrition page feel instant (no skeleton flash, live cross-device updates) — without restructuring the `nutrition_logs` schema.

**Architecture:** Surgical fix. DB: add `NOT NULL` + `DEFAULT` on `meal_type` / `meal_name` and backfill nulls. Client: enforce a single typed `buildMealPayload` helper on every write path so partial writes are impossible. Replace silent syncQueue drops with a persistent `pendingMeals` wrapper and a user-visible pill. Add a global Supabase realtime subscription on `nutrition_logs` that patches `nutritionCache`; flip `loadMeals` to pure stale-while-revalidate so the skeleton shows only on cold start.

**Tech Stack:** React 18 + TypeScript + Vite; Supabase (Postgres + Realtime + RLS); Tailwind/shadcn UI; Capacitor iOS. No test framework installed — verification is `npm run build` + `npm run lint` + manual QA.

**Spec:** `docs/superpowers/specs/2026-04-18-nutrition-instant-sync-design.md`

---

## File Structure

**New files**
- `supabase/migrations/20260418000000_nutrition_integrity.sql` — backfill NULLs, add `NOT NULL` + `DEFAULT`, enable realtime publication.
- `src/lib/buildMealPayload.ts` — single typed helper for all `nutrition_logs` inserts. MealType enum, MealInput interface, payload builder.
- `src/lib/pendingMeals.ts` — thin wrapper over `syncQueue` that exposes nutrition-only pending ops with failed-state UI model + observers. No persistent state of its own.
- `src/hooks/useMealsRealtime.ts` — mounts a Supabase `postgres_changes` channel on `nutrition_logs`; patches `nutritionCache` on INSERT/UPDATE/DELETE.
- `src/components/nutrition/PendingSyncPill.tsx` — "N meals pending" pill with sheet listing per-item retry/delete.
- `src/components/SyncingIndicator.tsx` — subtle pulsing dot in header when a background fetch or pending sync is in flight.

**Modified files**
- `src/lib/syncQueue.ts` — add `persistOnFailure` flag to `SyncOp`; when true, mark `failed: true` instead of splicing on max retries.
- `src/lib/nutritionCache.ts` — add change-event emitter; raise meals TTL from 5 min to 30 min; add `applyRealtimeChange()` helper.
- `src/hooks/nutrition/useMealOperations.ts` — replace `...mealData` spreads with `buildMealPayload`; route queue inserts through `persistOnFailure: true`.
- `src/hooks/nutrition/useQuickMealActions.ts` — keep `"snack"` fallbacks but log warnings when hit; call sites unchanged (they flow through `saveMealToDb`).
- `src/hooks/nutrition/useNutritionData.ts` — remove null coercion; SWR skeleton policy; reconcile cache against DB + pendingMeals on every fetch; subscribe to cache change events.
- `src/contexts/UserContext.tsx` — mount `useMealsRealtime` once per authenticated session.
- `src/pages/Nutrition.tsx` — render `PendingSyncPill` + `SyncingIndicator` near the date navigator.

**Untouched (backward-compatible)**
- `supabase/functions/*` — all 6 edge functions continue reading same columns.
- `src/pages/Dashboard.tsx`, `src/components/nutrition/FoodSearchDialog.tsx`, `src/utils/baselineComputer.ts`, `src/hooks/useGamification.ts` — same query shapes still work.
- `src/hooks/gym/useGymSessions.ts` — uses the same syncQueue; new flag defaults to false, so gym behavior is unchanged.

---

## Task 1: Database migration (backfill + constraints + realtime)

**Files:**
- Create: `supabase/migrations/20260418000000_nutrition_integrity.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260418000000_nutrition_integrity.sql` with:

```sql
-- Nutrition integrity migration
-- 1) Backfill existing NULL meal_type using time-of-day inference from created_at
-- 2) Backfill existing NULL/empty meal_name with a safe default
-- 3) Add NOT NULL + DEFAULT on both columns
-- 4) Ensure nutrition_logs is part of the supabase_realtime publication

BEGIN;

UPDATE public.nutrition_logs
SET meal_type = CASE
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 4  AND 9  THEN 'breakfast'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 10 AND 13 THEN 'lunch'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 14 AND 16 THEN 'snack'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 17 AND 21 THEN 'dinner'
  ELSE 'snack'
END
WHERE meal_type IS NULL;

UPDATE public.nutrition_logs
SET meal_name = 'Logged meal'
WHERE meal_name IS NULL OR TRIM(meal_name) = '';

ALTER TABLE public.nutrition_logs
  ALTER COLUMN meal_type SET DEFAULT 'snack',
  ALTER COLUMN meal_type SET NOT NULL,
  ALTER COLUMN meal_name SET DEFAULT 'Logged meal',
  ALTER COLUMN meal_name SET NOT NULL;

-- Enable realtime on the table (idempotent: ignore if already added).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nutrition_logs;
  EXCEPTION WHEN duplicate_object THEN
    -- already in publication
    NULL;
  END;
END$$;

COMMIT;
```

- [ ] **Step 2: Verify migration syntactically**

Run: `cat supabase/migrations/20260418000000_nutrition_integrity.sql | head -5`
Expected: file opens with the migration header comment.

- [ ] **Step 3: Apply migration to the project**

Run: `supabase db push`
Expected: the new migration is reported as applied; no errors.

- [ ] **Step 4: Sanity-check the DB**

Run in Supabase SQL editor or `supabase db query`:
```sql
SELECT COUNT(*) FILTER (WHERE meal_type IS NULL) AS null_type,
       COUNT(*) FILTER (WHERE meal_name IS NULL OR TRIM(meal_name) = '') AS null_name
FROM public.nutrition_logs;
```
Expected: both columns return 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260418000000_nutrition_integrity.sql
git commit -m "feat(nutrition): integrity migration — NOT NULL + DEFAULT + realtime

Backfills NULL meal_type via time-of-day inference, NULL meal_name to 'Logged meal',
then enforces NOT NULL with DEFAULT. Enables realtime publication on nutrition_logs.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 2: Create the typed `buildMealPayload` helper

**Files:**
- Create: `src/lib/buildMealPayload.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/buildMealPayload.ts`:

```ts
import type { Ingredient } from "@/pages/nutrition/types";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function isMealType(v: unknown): v is MealType {
  return typeof v === "string" && (MEAL_TYPES as string[]).includes(v);
}

export interface MealInput {
  meal_name: string;
  meal_type: MealType;
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fats_g?: number | null;
  portion_size?: string | null;
  recipe_notes?: string | null;
  ingredients?: Ingredient[] | null;
  is_ai_generated?: boolean;
}

export interface MealDbPayload {
  id: string;
  user_id: string;
  date: string;
  meal_name: string;
  meal_type: MealType;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  portion_size: string | null;
  recipe_notes: string | null;
  ingredients: Ingredient[] | null;
  is_ai_generated: boolean;
}

const EMPTY_NAME_FALLBACK = "Logged meal";

/**
 * Normalize a raw meal_name: trim, drop empty, fall back to 'Logged meal'.
 * Clients never write NULL meal_name; the DB column is NOT NULL post-migration.
 */
export function normalizeMealName(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return v.length > 0 ? v : EMPTY_NAME_FALLBACK;
}

/**
 * Resolve a candidate meal_type to a valid enum value. Unknown/empty → 'snack'.
 */
export function resolveMealType(raw: string | null | undefined): MealType {
  return isMealType(raw) ? raw : "snack";
}

export function buildMealPayload(args: {
  userId: string;
  date: string;
  input: MealInput;
  id?: string;
}): MealDbPayload {
  const { userId, date, input, id } = args;
  return {
    id: id ?? crypto.randomUUID(),
    user_id: userId,
    date,
    meal_name: normalizeMealName(input.meal_name),
    meal_type: resolveMealType(input.meal_type),
    calories: Math.max(0, Math.round(input.calories ?? 0)),
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fats_g: input.fats_g ?? null,
    portion_size: input.portion_size ?? null,
    recipe_notes: input.recipe_notes ?? null,
    ingredients: input.ingredients ?? null,
    is_ai_generated: input.is_ai_generated ?? false,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: build succeeds with no errors referencing `buildMealPayload.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/buildMealPayload.ts
git commit -m "feat(nutrition): typed buildMealPayload helper

Single typed construction path for nutrition_logs inserts. Normalizes
meal_name and meal_type so no caller can write a partial/NULL payload.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 3: Wire `buildMealPayload` into `useMealOperations.saveMealToDb`

**Files:**
- Modify: `src/hooks/nutrition/useMealOperations.ts`

- [ ] **Step 1: Update the `saveMealToDb` block**

Replace the block `src/hooks/nutrition/useMealOperations.ts:35-104` with:

```ts
  const saveMealToDb = useCallback(async (mealData: {
    meal_name: string;
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fats_g: number | null;
    meal_type: string;
    portion_size: string | null;
    recipe_notes: string | null;
    ingredients: Ingredient[] | null;
    is_ai_generated: boolean;
  }) => {
    if (!userId) throw new Error("Not authenticated");

    const dbPayload = buildMealPayload({
      userId,
      date: selectedDate,
      input: {
        meal_name: mealData.meal_name,
        meal_type: resolveMealType(mealData.meal_type),
        calories: mealData.calories,
        protein_g: mealData.protein_g,
        carbs_g: mealData.carbs_g,
        fats_g: mealData.fats_g,
        portion_size: mealData.portion_size,
        recipe_notes: mealData.recipe_notes,
        ingredients: mealData.ingredients,
        is_ai_generated: mealData.is_ai_generated,
      },
    });

    const optimisticMeal: Meal = {
      id: dbPayload.id,
      meal_name: dbPayload.meal_name,
      calories: dbPayload.calories,
      protein_g: dbPayload.protein_g ?? undefined,
      carbs_g: dbPayload.carbs_g ?? undefined,
      fats_g: dbPayload.fats_g ?? undefined,
      meal_type: dbPayload.meal_type,
      portion_size: dbPayload.portion_size ?? undefined,
      recipe_notes: dbPayload.recipe_notes ?? undefined,
      ingredients: dbPayload.ingredients ?? undefined,
      is_ai_generated: dbPayload.is_ai_generated,
      date: selectedDate,
    };

    setMeals(prev => {
      const updatedMeals = [...prev, optimisticMeal];
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
      nutritionCache.setMeals(userId, selectedDate, updatedMeals);
      localCache.remove(userId, 'gamification_data');
      return updatedMeals;
    });

    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: dbPayload.id,
      timestamp: Date.now(),
      persistOnFailure: true,
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("nutrition_logs").insert(dbPayload as any),
        undefined,
        "Add manual meal"
      );

      if (error) throw error;

      celebrateSuccess();
      syncQueue.dequeueByRecordId(userId, dbPayload.id);
    } catch (error) {
      logger.error("Error adding meal (queued for sync)", error);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);
```

Add the import at the top of the file (next to existing imports):
```ts
import { buildMealPayload, resolveMealType } from "@/lib/buildMealPayload";
```

- [ ] **Step 2: Replace `handleLogMealIdea` payload construction**

Replace `src/hooks/nutrition/useMealOperations.ts:106-190` `handleLogMealIdea` body with:

```ts
  const handleLogMealIdea = useCallback(async (mealIdea: Meal, mealTypeOverride?: string) => {
    setLoggingMeal(mealIdea.id);
    try {
      if (!userId) throw new Error("Not authenticated");

      const consistentCalories =
        (mealIdea.protein_g || 0) * 4 + (mealIdea.carbs_g || 0) * 4 + (mealIdea.fats_g || 0) * 9;

      const dbPayload = buildMealPayload({
        userId,
        date: selectedDate,
        input: {
          meal_name: mealIdea.meal_name,
          meal_type: resolveMealType(mealTypeOverride ?? mealIdea.meal_type),
          calories: consistentCalories || mealIdea.calories,
          protein_g: mealIdea.protein_g ?? null,
          carbs_g: mealIdea.carbs_g ?? null,
          fats_g: mealIdea.fats_g ?? null,
          portion_size: mealIdea.portion_size ?? null,
          recipe_notes: mealIdea.recipe_notes ?? null,
          ingredients: mealIdea.ingredients ?? null,
          is_ai_generated: true,
        },
      });

      const optimisticMeal: Meal = {
        id: dbPayload.id,
        meal_name: dbPayload.meal_name,
        calories: dbPayload.calories,
        protein_g: dbPayload.protein_g ?? undefined,
        carbs_g: dbPayload.carbs_g ?? undefined,
        fats_g: dbPayload.fats_g ?? undefined,
        meal_type: dbPayload.meal_type,
        portion_size: dbPayload.portion_size ?? undefined,
        recipe_notes: dbPayload.recipe_notes ?? undefined,
        ingredients: dbPayload.ingredients ?? undefined,
        is_ai_generated: true,
        date: selectedDate,
      };

      setMeals(prev => {
        const updatedMeals = [...prev, optimisticMeal];
        localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
        nutritionCache.setMeals(userId, selectedDate, updatedMeals);
        localCache.remove(userId, 'gamification_data');
        return updatedMeals;
      });

      syncQueue.enqueue(userId, {
        table: "nutrition_logs",
        action: "insert",
        payload: dbPayload,
        recordId: dbPayload.id,
        timestamp: Date.now(),
        persistOnFailure: true,
      });

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("nutrition_logs").insert(dbPayload as any),
          undefined,
          "Log meal"
        );

        if (error) throw error;

        celebrateSuccess();
        toast({
          title: "Meal logged!",
          description: `${mealIdea.meal_name} added to your day`,
        });
        syncQueue.dequeueByRecordId(userId, dbPayload.id);
      } catch (error) {
        logger.error("Error logging meal (queued for sync)", error);
        celebrateSuccess();
        toast({ title: "Saved offline", description: "Will sync when connected." });
      }
    } catch (error) {
      logger.error("Error logging meal", error);
      toast({
        title: "Error",
        description: "Failed to log meal",
        variant: "destructive",
      });
    } finally {
      setLoggingMeal(null);
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);
```

- [ ] **Step 3: Replace `saveMealIdeasToDatabase` payload construction**

In `src/hooks/nutrition/useMealOperations.ts:192-292`, replace the per-meal payload construction inside the `for (const meal of mealIdeas)` loop (lines 203-248) with:

```ts
      for (const meal of mealIdeas) {
        const recalcCal = (meal.protein_g || 0) * 4 + (meal.carbs_g || 0) * 4 + (meal.fats_g || 0) * 9;

        const dbPayload = buildMealPayload({
          userId,
          date: selectedDate,
          input: {
            meal_name: meal.meal_name,
            meal_type: resolveMealType(meal.meal_type),
            calories: recalcCal || meal.calories,
            protein_g: meal.protein_g ?? null,
            carbs_g: meal.carbs_g ?? null,
            fats_g: meal.fats_g ?? null,
            portion_size: meal.portion_size ?? null,
            recipe_notes: meal.recipe_notes ?? null,
            ingredients: (meal.ingredients as Ingredient[] | null) ?? null,
            is_ai_generated: true,
          },
        });

        mealIds.push(dbPayload.id);
        optimisticMeals.push({
          id: dbPayload.id,
          meal_name: dbPayload.meal_name,
          calories: dbPayload.calories,
          protein_g: dbPayload.protein_g ?? undefined,
          carbs_g: dbPayload.carbs_g ?? undefined,
          fats_g: dbPayload.fats_g ?? undefined,
          meal_type: dbPayload.meal_type,
          portion_size: dbPayload.portion_size ?? undefined,
          recipe_notes: dbPayload.recipe_notes ?? undefined,
          ingredients: dbPayload.ingredients ?? undefined,
          is_ai_generated: true,
          date: selectedDate,
        });
        dbPayloads.push(dbPayload);

        syncQueue.enqueue(userId, {
          table: "nutrition_logs",
          action: "insert",
          payload: dbPayload,
          recordId: dbPayload.id,
          timestamp: Date.now(),
          persistOnFailure: true,
        });
      }
```

- [ ] **Step 4: Replace `handleFoodSearchSelected` payload construction**

Replace `src/hooks/nutrition/useMealOperations.ts:351-424` body with:

```ts
  const handleFoodSearchSelected = useCallback(async (food: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
    portion_size: string;
  }, foodSearchMealType: string) => {
    if (!userId) return;

    const dbPayload = buildMealPayload({
      userId,
      date: selectedDate,
      input: {
        meal_name: food.meal_name,
        meal_type: resolveMealType(foodSearchMealType),
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fats_g: food.fats_g,
        portion_size: food.portion_size,
        recipe_notes: null,
        ingredients: null,
        is_ai_generated: false,
      },
    });

    const optimisticMeal: Meal = {
      id: dbPayload.id,
      meal_name: dbPayload.meal_name,
      calories: dbPayload.calories,
      protein_g: dbPayload.protein_g ?? undefined,
      carbs_g: dbPayload.carbs_g ?? undefined,
      fats_g: dbPayload.fats_g ?? undefined,
      meal_type: dbPayload.meal_type,
      portion_size: dbPayload.portion_size ?? undefined,
      date: selectedDate,
      is_ai_generated: false,
    };

    setMeals(prev => {
      const updatedMeals = [...prev, optimisticMeal];
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
      nutritionCache.setMeals(userId, selectedDate, updatedMeals);
      return updatedMeals;
    });

    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: dbPayload.id,
      timestamp: Date.now(),
      persistOnFailure: true,
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("nutrition_logs").insert(dbPayload as any),
        undefined,
        "Log food"
      );

      if (error) throw error;

      celebrateSuccess();
      toast({ title: "Food logged!", description: `${food.meal_name} · ${food.calories} kcal` });
      syncQueue.dequeueByRecordId(userId, dbPayload.id);
    } catch (error) {
      logger.error("Error logging food (queued for sync)", error);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);
```

- [ ] **Step 5: Mark delete ops as persistOnFailure too**

In `src/hooks/nutrition/useMealOperations.ts:322-328`, update the `syncQueue.enqueue` inside `handleDeleteMeal`:

```ts
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "delete",
      payload: {},
      recordId: deletedId,
      timestamp: Date.now(),
      persistOnFailure: true,
    });
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`
Expected: build passes; lint has no new errors in `useMealOperations.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/nutrition/useMealOperations.ts
git commit -m "fix(nutrition): route all writes through buildMealPayload

Every nutrition_logs insert/delete now constructs its payload via the typed
helper. Eliminates spread-based partials that were writing NULL meal_type.
Queue ops are flagged persistOnFailure to prevent silent data loss.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 4: Log warnings in `useQuickMealActions` fallbacks

**Files:**
- Modify: `src/hooks/nutrition/useQuickMealActions.ts`

- [ ] **Step 1: Add warning logs**

In `src/hooks/nutrition/useQuickMealActions.ts`, at lines 113, 169, and 198, the code currently has `meal_type: mealType || template.meal_type || "snack"` (and variants). Before the call to `saveMealToDb`, add a guard log.

Replace `logFavorite` (lines 106-120) with:

```ts
  const logFavorite = useCallback(async (template: MealTemplate, mealType?: string) => {
    const resolvedType = mealType || template.meal_type;
    if (!resolvedType) {
      logger.warn("logFavorite: meal_type missing on template, defaulting to snack", {
        templateId: (template as any).id,
      });
    }
    await saveMealToDb({
      meal_name: template.meal_name,
      calories: template.calories,
      protein_g: template.protein_g ?? null,
      carbs_g: template.carbs_g ?? null,
      fats_g: template.fats_g ?? null,
      meal_type: resolvedType || "snack",
      portion_size: template.portion_size ?? null,
      recipe_notes: template.recipe_notes ?? null,
      ingredients: template.ingredients ?? null,
      is_ai_generated: false,
    });
    toast({ title: "Meal logged!", description: `${template.meal_name} · ${template.calories} kcal` });
  }, [saveMealToDb, toast]);
```

Replace the `meal_type` lines inside `copyPreviousDay` (line 169) and `repeatLastMeal` (line 198) with equivalent warn-then-default behavior:

For `copyPreviousDay` — replace the `saveMealToDb` call inside the `for` loop with:
```ts
        if (!meal.meal_type) {
          logger.warn("copyPreviousDay: source meal missing meal_type, defaulting to snack", { mealId: meal.id });
        }
        await saveMealToDb({
          meal_name: meal.meal_name,
          calories: meal.calories,
          protein_g: meal.protein_g ?? null,
          carbs_g: meal.carbs_g ?? null,
          fats_g: meal.fats_g ?? null,
          meal_type: meal.meal_type || "snack",
          portion_size: meal.portion_size ?? null,
          recipe_notes: meal.recipe_notes ?? null,
          ingredients: (meal.ingredients as Ingredient[]) ?? null,
          is_ai_generated: false,
        });
```

For `repeatLastMeal` — replace the body of the callback with:
```ts
  const repeatLastMeal = useCallback(async (mealType?: string) => {
    if (!lastMeal) return;
    const resolvedType = mealType || lastMeal.meal_type;
    if (!resolvedType) {
      logger.warn("repeatLastMeal: last meal missing meal_type, defaulting to snack", {
        mealId: lastMeal.id,
      });
    }
    await saveMealToDb({
      meal_name: lastMeal.meal_name,
      calories: lastMeal.calories,
      protein_g: lastMeal.protein_g ?? null,
      carbs_g: lastMeal.carbs_g ?? null,
      fats_g: lastMeal.fats_g ?? null,
      meal_type: resolvedType || "snack",
      portion_size: lastMeal.portion_size ?? null,
      recipe_notes: lastMeal.recipe_notes ?? null,
      ingredients: lastMeal.ingredients ?? null,
      is_ai_generated: false,
    });
    celebrateSuccess();
    toast({ title: "Meal repeated!", description: `${lastMeal.meal_name} · ${lastMeal.calories} kcal` });
  }, [lastMeal, saveMealToDb, toast]);
```

Ensure `logger` is imported (check top of file — if not present, add `import { logger } from "@/lib/logger";`).

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/nutrition/useQuickMealActions.ts
git commit -m "fix(nutrition): warn when quick-action meal_type defaults to snack

Keeps the 'snack' safety fallback for user recovery paths but surfaces any
case where the source row is missing meal_type. Helps track down residual
cases after the integrity migration.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 5: Remove null coercion in `useNutritionData.loadMeals`

**Files:**
- Modify: `src/hooks/nutrition/useNutritionData.ts`

- [ ] **Step 1: Update the pending-insert merge**

Replace `src/hooks/nutrition/useNutritionData.ts:252-268` with:

```ts
    for (const op of pendingInserts) {
      const p = op.payload as any;
      mergedMeals.push({
        id: op.recordId,
        meal_name: p.meal_name || "Logged meal",
        calories: p.calories,
        protein_g: p.protein_g ?? undefined,
        carbs_g: p.carbs_g ?? undefined,
        fats_g: p.fats_g ?? undefined,
        meal_type: p.meal_type || "snack",
        portion_size: p.portion_size ?? undefined,
        recipe_notes: p.recipe_notes ?? undefined,
        ingredients: p.ingredients ?? undefined,
        is_ai_generated: p.is_ai_generated,
        date: p.date ?? fetchDate,
      });
    }
```

The change: `meal_name: p.meal_name || null` → `"Logged meal"`; `meal_type: p.meal_type || null` → `"snack"`. After Task 3 those values are always set at write time, but this is a defensive fallback so the UI never renders "Untitled" from queue state.

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/nutrition/useNutritionData.ts
git commit -m "fix(nutrition): never merge null meal_type/meal_name from syncQueue

Previously queued pending inserts would surface as 'Untitled' in Snack due
to null coercion. Default to 'Logged meal' / 'snack' so the UI stays honest.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 6: Extend `SyncQueue` with `persistOnFailure`

**Files:**
- Modify: `src/lib/syncQueue.ts`

- [ ] **Step 1: Add the flag to `SyncOp`**

In `src/lib/syncQueue.ts:6-15`, replace the interface with:

```ts
export interface SyncOp {
  id: string;
  table: string;
  action: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  recordId: string;
  timestamp: number;
  retries: number;
  upsertConflict?: string;
  /** If true, op is never discarded after maxRetries — instead marked failed. */
  persistOnFailure?: boolean;
  /** Set when retries >= MAX_RETRIES and persistOnFailure === true. */
  failed?: boolean;
  /** When the most recent retry attempt completed (ms since epoch). */
  lastAttemptAt?: number;
}
```

- [ ] **Step 2: Accept the new field on enqueue**

Replace `src/lib/syncQueue.ts:45-50`:

```ts
  enqueue(userId: string, op: Omit<SyncOp, "id" | "retries" | "failed" | "lastAttemptAt">): void {
    const ops = this.readOps(userId);
    const newOp: SyncOp = { ...op, id: crypto.randomUUID(), retries: 0 };
    ops.push(newOp);
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }
```

Also modify `dequeue`, `dequeueByRecordId`, `clear` to emit the change:

```ts
  dequeue(userId: string, opId: string): void {
    const ops = this.readOps(userId).filter((o) => o.id !== opId);
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }

  dequeueByRecordId(userId: string, recordId: string): void {
    const ops = this.readOps(userId).filter((o) => o.recordId !== recordId);
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }

  clear(userId: string): void {
    localStorage.removeItem(this.queueKey(userId));
    notifySyncQueueChange(userId);
  }
```

And `process()` should emit at the end:

Add `notifySyncQueueChange(userId);` just before the `return flushed;` at `src/lib/syncQueue.ts:175`.

- [ ] **Step 3: Replace `_incrementRetry` to respect `persistOnFailure`**

Replace `src/lib/syncQueue.ts:178-189` with:

```ts
  private _incrementRetry(userId: string, op: SyncOp): void {
    const ops = this.readOps(userId);
    const idx = ops.findIndex((o) => o.id === op.id);
    if (idx === -1) return;

    ops[idx].retries++;
    ops[idx].lastAttemptAt = Date.now();

    if (ops[idx].retries >= MAX_RETRIES) {
      if (ops[idx].persistOnFailure) {
        ops[idx].failed = true;
        logger.warn(`SyncQueue: op ${op.id} marked failed after ${MAX_RETRIES} retries`, { op: ops[idx] });
      } else {
        logger.warn(`SyncQueue: discarding op ${op.id} after ${MAX_RETRIES} retries`, { op });
        ops.splice(idx, 1);
      }
    }
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }
```

Also update `process()` to skip `failed` ops by default — they must be re-queued via `retry()`. Replace `src/lib/syncQueue.ts:86` (the sort line) with:

```ts
      const ops = this.readOps(userId)
        .filter(o => !o.failed)
        .sort((a, b) => a.timestamp - b.timestamp);
```

- [ ] **Step 4: Add `retry` and `listFailed` methods**

Add these methods on the `SyncQueue` class (before `_incrementRetry`):

```ts
  listFailed(userId: string): SyncOp[] {
    return this.readOps(userId).filter((o) => o.failed);
  }

  retry(userId: string, opId: string): void {
    const ops = this.readOps(userId);
    const idx = ops.findIndex((o) => o.id === opId);
    if (idx === -1) return;
    ops[idx].failed = false;
    ops[idx].retries = 0;
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }

  retryAll(userId: string): void {
    const ops = this.readOps(userId);
    for (const op of ops) {
      if (op.failed) {
        op.failed = false;
        op.retries = 0;
      }
    }
    this.writeOps(userId, ops);
    notifySyncQueueChange(userId);
  }
```

- [ ] **Step 5: Add observer support at the top of the file**

Directly below the `MAX_RETRIES` constant (line 18), add:

```ts
type QueueListener = (userId: string) => void;
const listeners = new Set<QueueListener>();

export function onSyncQueueChange(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifySyncQueueChange(userId: string): void {
  for (const l of Array.from(listeners)) {
    try { l(userId); } catch { /* ignore listener errors */ }
  }
}
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/syncQueue.ts
git commit -m "feat(syncQueue): add persistOnFailure + failed state + observers

persistOnFailure keeps ops in the queue (failed=true) instead of silently
discarding after max retries. Enables user-driven retry UI. Adds observer
hook so UI components can live-update when queue state changes.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 7: Create `pendingMeals.ts` facade

**Files:**
- Create: `src/lib/pendingMeals.ts`

- [ ] **Step 1: Write the facade**

Create `src/lib/pendingMeals.ts`:

```ts
import { syncQueue, onSyncQueueChange, type SyncOp } from "./syncQueue";

export interface PendingMealSummary {
  id: string;          // syncQueue op id
  recordId: string;    // meal id
  action: "insert" | "delete";
  mealName: string;
  calories: number;
  mealType: string;
  failed: boolean;
  retries: number;
  lastAttemptAt?: number;
}

function toSummary(op: SyncOp): PendingMealSummary | null {
  if (op.table !== "nutrition_logs") return null;
  if (op.action !== "insert" && op.action !== "delete") return null;
  const p = op.payload as Record<string, unknown>;
  return {
    id: op.id,
    recordId: op.recordId,
    action: op.action,
    mealName: (p.meal_name as string) || (op.action === "delete" ? "Deleted meal" : "Logged meal"),
    calories: (p.calories as number) ?? 0,
    mealType: (p.meal_type as string) || "snack",
    failed: !!op.failed,
    retries: op.retries,
    lastAttemptAt: op.lastAttemptAt,
  };
}

export function listPendingMeals(userId: string): PendingMealSummary[] {
  return syncQueue.peek(userId)
    .map(toSummary)
    .filter((s): s is PendingMealSummary => s !== null);
}

export function hasFailedMeals(userId: string): boolean {
  return listPendingMeals(userId).some(m => m.failed);
}

export function retryMeal(userId: string, opId: string): Promise<number> {
  syncQueue.retry(userId, opId);
  return syncQueue.process(userId);
}

export function retryAllMeals(userId: string): Promise<number> {
  syncQueue.retryAll(userId);
  return syncQueue.process(userId);
}

export function dropMeal(userId: string, opId: string): void {
  syncQueue.dequeue(userId, opId);
}

export function subscribePendingMeals(listener: () => void): () => void {
  return onSyncQueueChange(() => listener());
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pendingMeals.ts
git commit -m "feat(nutrition): pendingMeals facade over syncQueue

Thin wrapper exposing nutrition-only pending ops with per-item retry/drop
and an observer hook so PendingSyncPill can live-update.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 8: Create `PendingSyncPill` UI component

**Files:**
- Create: `src/components/nutrition/PendingSyncPill.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/nutrition/PendingSyncPill.tsx`:

```tsx
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, X, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import {
  listPendingMeals,
  subscribePendingMeals,
  retryAllMeals,
  retryMeal,
  dropMeal,
  type PendingMealSummary,
} from "@/lib/pendingMeals";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function PendingSyncPill() {
  const { userId } = useUser();
  const [items, setItems] = useState<PendingMealSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    const refresh = () => setItems(listPendingMeals(userId));
    refresh();
    return subscribePendingMeals(refresh);
  }, [userId]);

  if (!userId || items.length === 0) return null;

  const failedCount = items.filter(i => i.failed).length;
  const label = failedCount > 0
    ? `${failedCount} failed · tap to retry`
    : `${items.length} syncing…`;

  const handleRetryAll = async () => {
    if (!userId || retrying) return;
    setRetrying(true);
    try { await retryAllMeals(userId); } finally { setRetrying(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-medium border ${
          failedCount > 0
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-muted/60 text-muted-foreground border-border/50"
        }`}
        role="status"
        aria-live="polite"
      >
        {failedCount > 0 ? <CloudOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Pending meals</SheetTitle>
          </SheetHeader>

          <div className="mt-3 space-y-1.5">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.mealName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {item.action === "delete" ? "Delete · " : ""}
                    {item.mealType} · {item.calories} kcal
                    {item.failed && <span className="text-destructive ml-1">· failed ({item.retries} tries)</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {item.failed && userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Retry this meal"
                      onClick={() => retryMeal(userId, item.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label="Drop this meal from the queue"
                      onClick={() => dropMeal(userId, item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {failedCount > 0 && (
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleRetryAll}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : `Retry all (${failedCount})`}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/nutrition/PendingSyncPill.tsx
git commit -m "feat(nutrition): PendingSyncPill surface failed/pending syncs

User-visible pill on the Nutrition page. Opens a sheet with per-item retry
and drop actions. Reads from pendingMeals facade and re-renders via observer.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 9: Wire `PendingSyncPill` into Nutrition page

**Files:**
- Modify: `src/pages/Nutrition.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/pages/Nutrition.tsx` (next to existing component imports), add:

```tsx
import { PendingSyncPill } from "@/components/nutrition/PendingSyncPill";
```

- [ ] **Step 2: Render the pill next to the date navigator**

In `src/pages/Nutrition.tsx`, locate the date navigator block (around line 570–592). Add the pill just after the closing `</div>` of that block (before the "No Meals Logged Today" conditional):

```tsx
        <div className="flex justify-center">
          <PendingSyncPill />
        </div>
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` and in the browser:
1. Open the Nutrition page.
2. Open DevTools → Application → Local Storage, locate `wcw_syncqueue_<userId>`, manually add a fake pending op with `table: "nutrition_logs"` and `failed: true`.
3. Refresh — a red "1 failed" pill should appear.

Expected: pill renders; opening the sheet shows the fake item.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Nutrition.tsx
git commit -m "feat(nutrition): render PendingSyncPill beneath date navigator

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 10: Add change-event emitter + realtime apply to `nutritionCache`

**Files:**
- Modify: `src/lib/nutritionCache.ts`

- [ ] **Step 1: Raise meals TTL to 30 min**

In `src/lib/nutritionCache.ts:18`, change:
```ts
private readonly MEALS_TTL = 5 * 60 * 1000; // 5 minutes
```
to:
```ts
private readonly MEALS_TTL = 30 * 60 * 1000; // 30 minutes — realtime keeps it fresh; TTL is just a backstop
```

- [ ] **Step 2: Add listener infrastructure + `applyRealtimeChange`**

At the end of the file (after `cacheHelpers`), add:

```ts
// ── Realtime integration ─────────────────────────────────────────────────
export type MealChangeEvent =
  | { type: "insert" | "update"; userId: string; date: string; row: any }
  | { type: "delete"; userId: string; date: string; rowId: string };

type MealListener = (evt: MealChangeEvent) => void;
const mealListeners = new Set<MealListener>();

export function onMealsChange(listener: MealListener): () => void {
  mealListeners.add(listener);
  return () => { mealListeners.delete(listener); };
}

function notifyMealsChange(evt: MealChangeEvent): void {
  for (const l of Array.from(mealListeners)) {
    try { l(evt); } catch { /* ignore */ }
  }
}

/**
 * Apply a realtime event from Supabase postgres_changes to the in-memory cache
 * and emit to subscribers. Returns the resolved date key affected.
 */
export function applyMealRealtimeChange(
  userId: string,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  newRow: any,
  oldRow: any
): string | null {
  const row = newRow ?? oldRow;
  if (!row || !row.date) return null;
  const date: string = row.date;

  const cached = nutritionCache.getMeals(userId, date) ?? [];
  let next = cached;

  if (eventType === "DELETE") {
    next = cached.filter((m: any) => m.id !== (oldRow?.id ?? row.id));
    nutritionCache.setMeals(userId, date, next);
    notifyMealsChange({ type: "delete", userId, date, rowId: oldRow?.id ?? row.id });
  } else if (eventType === "INSERT") {
    if (!cached.some((m: any) => m.id === row.id)) {
      next = [...cached, row];
    }
    nutritionCache.setMeals(userId, date, next);
    notifyMealsChange({ type: "insert", userId, date, row });
  } else if (eventType === "UPDATE") {
    next = cached.map((m: any) => (m.id === row.id ? row : m));
    if (!cached.some((m: any) => m.id === row.id)) next = [...cached, row];
    nutritionCache.setMeals(userId, date, next);
    notifyMealsChange({ type: "update", userId, date, row });
  }

  return date;
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/nutritionCache.ts
git commit -m "feat(cache): realtime change emitter + 30-min TTL backstop

nutritionCache now emits change events and applies INSERT/UPDATE/DELETE
from Supabase postgres_changes. TTL raised to 30 min — realtime is the
primary freshness mechanism.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 11: Create `useMealsRealtime` hook

**Files:**
- Create: `src/hooks/useMealsRealtime.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useMealsRealtime.ts`:

```ts
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyMealRealtimeChange } from "@/lib/nutritionCache";
import { logger } from "@/lib/logger";

/**
 * Mount once per authenticated session. Subscribes to nutrition_logs realtime
 * changes for the given user and patches nutritionCache on INSERT/UPDATE/DELETE.
 * Consumers subscribe to nutritionCache change events rather than Supabase
 * directly, so pages only re-render for their date.
 */
export function useMealsRealtime(userId: string | null): void {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    // Defer 1s to avoid piling onto the SIGNED_IN network burst
    const timer = setTimeout(() => {
      if (cancelled) return;

      const channel = supabase
        .channel(`meals:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "nutrition_logs",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              applyMealRealtimeChange(
                userId,
                payload.eventType as "INSERT" | "UPDATE" | "DELETE",
                payload.new,
                payload.old
              );
            } catch (err) {
              logger.warn("useMealsRealtime: apply failed", { err });
            }
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            logger.warn("useMealsRealtime: channel status", { status });
          }
        });

      channelRef.current = channel;
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMealsRealtime.ts
git commit -m "feat(nutrition): useMealsRealtime — global postgres_changes listener

Subscribes once per authenticated session to nutrition_logs changes for the
current user. Funnels events into nutritionCache.applyMealRealtimeChange
so all pages stay in sync without polling.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 12: Mount `useMealsRealtime` in `UserContext`

**Files:**
- Modify: `src/contexts/UserContext.tsx`

- [ ] **Step 1: Import the hook**

Near the other hook imports at the top of `src/contexts/UserContext.tsx`, add:

```ts
import { useMealsRealtime } from "@/hooks/useMealsRealtime";
```

- [ ] **Step 2: Call the hook inside the provider body**

Inside `AuthProvider` (just after `userIdRef` is read or near the top of the body — anywhere that can see `userId`), add:

```ts
  useMealsRealtime(userId);
```

Place it directly below whatever line currently reads `const userId` / `setUserId` state. It's a top-level hook call and must not be inside `useEffect`.

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/UserContext.tsx
git commit -m "feat(nutrition): mount useMealsRealtime globally

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 13: Subscribe `useNutritionData` to cache change events

**Files:**
- Modify: `src/hooks/nutrition/useNutritionData.ts`

- [ ] **Step 1: Import the subscriber**

In `src/hooks/nutrition/useNutritionData.ts`, at the existing imports, add:

```ts
import { onMealsChange } from "@/lib/nutritionCache";
```

- [ ] **Step 2: Replace the realtime block**

Replace the existing `profile-nutrition-updates` realtime subscription block `src/hooks/nutrition/useNutritionData.ts:348-387` (the `useEffect` that starts with `if (!userId) return;` and ends at the cleanup returning `supabase.removeChannel(channel)`) with an event-bus subscription:

```ts
  // Subscribe to in-process cache change events (fed by useMealsRealtime at app level).
  // On any insert/update/delete for the selected date, reflect into local state.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onMealsChange((evt) => {
      if (evt.userId !== userId) return;
      if (evt.date !== activeDateRef.current) return;
      const cached = nutritionCache.getMeals(userId, evt.date);
      if (cached) setMeals(cached as Meal[]);
    });
    return unsubscribe;
  }, [userId, setMeals]);
```

Important: the existing `profile-nutrition-updates` channel (that called `refreshProfile` on `profiles` changes) still matters. Keep a separate effect that preserves that behavior. Add this new effect **alongside** the existing profiles subscription:

```ts
  // Profile realtime — unchanged, kept for profile changes only
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = setTimeout(() => {
      channel = supabase
        .channel("profile-nutrition-updates")
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        }, () => { refreshProfile(); })
        .subscribe();
    }, 3000);

    return () => {
      clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, refreshProfile]);
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/nutrition/useNutritionData.ts
git commit -m "feat(nutrition): drive meal state from cache change events

Replaces the nutrition_logs-less realtime subscription with an in-process
event bus fed by useMealsRealtime. Each useNutritionData reacts only to
events matching its active date.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 14: Stop-flashing skeleton — pure SWR in `loadMeals`

**Files:**
- Modify: `src/hooks/nutrition/useNutritionData.ts`

- [ ] **Step 1: Remove the skeleton branch when any data is visible**

Replace `src/hooks/nutrition/useNutritionData.ts:185-190` with:

```ts
    // SWR: never show skeleton if we have anything to display
    const hasVisibleMeals = mealsRef.current.length > 0;
    const hasLocalCache = !!localCache.getForDate(userId, "nutrition_logs", fetchDate);
    if (!silent && !servedFromLocal && !hasVisibleMeals && !hasLocalCache) {
      safeAsync(setMealsLoading)(true);
    }
```

- [ ] **Step 2: Remove the preemptive setMealsLoading on date change**

In `src/hooks/nutrition/useNutritionData.ts:283-298`, replace the useEffect body with:

```ts
  useEffect(() => {
    activeDateRef.current = selectedDate;
    // SWR: do not flip mealsLoading here; loadMeals decides based on cache availability.
    loadMeals();
    if (userId) setTimeout(() => preloadAdjacentDates(userId, selectedDate), 2000);
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [selectedDate, userId]);
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/nutrition/useNutritionData.ts
git commit -m "fix(nutrition): pure SWR — skeleton only on cold start

Removes preemptive setMealsLoading(true) on date change. loadMeals now skips
the skeleton whenever any cache (memory or local) has data, so returning to
the page no longer flashes placeholders.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 15: Cache reconciliation — drop ghost items

**Files:**
- Modify: `src/hooks/nutrition/useNutritionData.ts`

- [ ] **Step 1: Reconcile localCache after every successful DB fetch**

In `src/hooks/nutrition/useNutritionData.ts`, just before the `nutritionCache.setMeals(userId, fetchDate, mergedMeals as Meal[]);` on line 278, add the reconciliation:

```ts
    // Reconciliation: drop any localCache rows that aren't in DB and aren't
    // in the pending queue. Prevents "ghost" meals from re-surfacing forever.
    const pendingRecordIds = new Set(
      pendingOps
        .filter(op => op.table === "nutrition_logs" && op.action === "insert")
        .map(op => op.recordId)
    );
    const keepIds = new Set<string>([
      ...typedMeals.map(m => m.id),
      ...pendingRecordIds,
    ]);
    const priorLocal = localCache.getForDate<Meal[]>(userId, "nutrition_logs", fetchDate) ?? [];
    const reconciledLocal = priorLocal.filter(m => keepIds.has(m.id));
    // Only write back if we actually dropped something (avoids pointless writes)
    if (reconciledLocal.length !== priorLocal.length) {
      localCache.setForDate(userId, "nutrition_logs", fetchDate, reconciledLocal);
    }
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/nutrition/useNutritionData.ts
git commit -m "fix(nutrition): reconcile localCache against DB + pending queue

After a successful DB fetch, drop any cached row whose id isn't in the DB
response and isn't in the pending queue. Kills ghost items that used to
reappear on next visit after a failed sync was silently discarded.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 16: Create `SyncingIndicator` + wire into Nutrition header

**Files:**
- Create: `src/components/SyncingIndicator.tsx`
- Modify: `src/pages/Nutrition.tsx`

- [ ] **Step 1: Create the indicator**

Create `src/components/SyncingIndicator.tsx`:

```tsx
interface Props {
  active: boolean;
}

export function SyncingIndicator({ active }: Props) {
  if (!active) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70"
      aria-live="polite"
      aria-label="Syncing"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" />
      Syncing…
    </span>
  );
}
```

- [ ] **Step 2: Use it in Nutrition.tsx**

At the top of `src/pages/Nutrition.tsx` (next to existing imports), add:

```tsx
import { SyncingIndicator } from "@/components/SyncingIndicator";
```

In the date navigator block (around line 570–592), replace the "Today / date" button with a wrapper that shows the indicator when `nutritionData.mealsLoading` is true **and** `meals.length > 0`:

Find:
```tsx
          <button
            onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); triggerHapticSelection(); }}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-muted/40 hover:bg-muted/70 active:scale-[0.97] transition-all"
          >
            <CalendarIcon className="h-3 w-3 text-primary" />
            {selectedDate === format(new Date(), "yyyy-MM-dd") ? "Today" : format(new Date(selectedDate), "EEE, MMM d")}
          </button>
```

Replace with:
```tsx
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); triggerHapticSelection(); }}
              className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-muted/40 hover:bg-muted/70 active:scale-[0.97] transition-all"
            >
              <CalendarIcon className="h-3 w-3 text-primary" />
              {selectedDate === format(new Date(), "yyyy-MM-dd") ? "Today" : format(new Date(selectedDate), "EEE, MMM d")}
            </button>
            <SyncingIndicator active={nutritionData.mealsLoading && meals.length > 0} />
          </div>
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/SyncingIndicator.tsx src/pages/Nutrition.tsx
git commit -m "feat(nutrition): subtle syncing indicator in date navigator

Pulses when a background fetch is in flight while cached meals are already
displayed — replaces the full-skeleton flash.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 17: Kick the sync queue on visibility return

**Files:**
- Modify: `src/hooks/nutrition/useNutritionData.ts`

- [ ] **Step 1: Also process the sync queue on visibility**

In `src/hooks/nutrition/useNutritionData.ts:320-329`, replace the visibility effect with:

```ts
  useEffect(() => {
    const handleVis = () => {
      if (document.visibilityState === 'visible' && userId) {
        if (Date.now() - lastFetchRef.current < 2000) return;
        loadMeals(true, 0, /* silent */ true);
        // Also try to drain any pending meal ops
        syncQueue.process(userId).catch(() => { });
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [userId, selectedDate]);
```

(`syncQueue` is already imported at the top of this file.)

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/nutrition/useNutritionData.ts
git commit -m "feat(nutrition): drain pending meals on visibility return

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 18: Manual QA pass + production smoke test

**Files:** none (manual).

- [ ] **Step 1: Run the app in dev**

```bash
npm run dev
```

- [ ] **Step 2: Instant-feel checks**

Complete the following in the browser:

1. Load the app. Navigate to Nutrition. **Skeleton should show once**.
2. Navigate away (Dashboard). Come back to Nutrition. **No skeleton**. Data renders immediately. Syncing dot briefly pulses.
3. Change the date to yesterday, then back to today. **No skeleton on either transition**.
4. Close the tab. Re-open. The *very first* mount may show skeleton; second navigation should not.

- [ ] **Step 3: Integrity checks**

1. Log a meal (manual, breakfast). It should appear in the Breakfast group with its name — never "Untitled", never in Snack.
2. In DevTools → Network, set Offline. Log another meal (lunch). It should appear optimistically; the "N syncing…" pill should show.
3. Set back to Online. The pill should disappear within a few seconds; the meal stays in Lunch.
4. Set Offline again; log 3 meals; force-reload. The pill should persist showing 3 pending items.
5. Manually fail one op by editing its payload to break a required column. Re-online. After retries, the pill goes red: "1 failed". Tap to retry or drop.

- [ ] **Step 4: Cross-device check (optional but recommended)**

Open the app on two browsers (or one browser + iOS simulator). Log a meal in A. B should see it appear in its list within ~500 ms without reloading.

- [ ] **Step 5: Sanity commit any fixes found**

If any bugs surface, stash, fix, and commit normally.

---

## Task 19: Deploy

**Files:** none.

- [ ] **Step 1: Merge to main**

```bash
git push origin <current-branch>
# Open PR, merge after review
```

- [ ] **Step 2: Verify migration applied in production**

Run in Supabase dashboard SQL editor:

```sql
SELECT COUNT(*) FILTER (WHERE meal_type IS NULL) AS null_type,
       COUNT(*) FILTER (WHERE meal_name IS NULL OR TRIM(meal_name) = '') AS null_name,
       EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND tablename = 'nutrition_logs'
       ) AS realtime_enabled
FROM public.nutrition_logs;
```
Expected: `null_type = 0`, `null_name = 0`, `realtime_enabled = true`.

- [ ] **Step 3: Monitor for 24 hours**

Watch Sentry / edge function logs for:
- `logFavorite: meal_type missing on template` — indicates a residual bug in template storage.
- `SyncQueue: op … marked failed after 5 retries` — indicates persistent sync failures worth investigating.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| DB hardening — backfill + NOT NULL + DEFAULT + publication | Task 1 |
| `buildMealPayload` helper | Task 2 |
| `useMealOperations` typed writes | Task 3 |
| `useQuickMealActions` warn-on-default | Task 4 |
| `useNutritionData` no null coercion | Task 5 |
| `syncQueue` `persistOnFailure` + failed state | Task 6 |
| `pendingMeals` facade | Task 7 |
| `PendingSyncPill` UI | Task 8, Task 9 |
| Realtime apply + cache change emitter | Task 10 |
| `useMealsRealtime` hook | Task 11 |
| Mount realtime in `UserContext` | Task 12 |
| `useNutritionData` subscribes to cache events | Task 13 |
| SWR skeleton policy | Task 14 |
| Ghost-item cache reconciliation | Task 15 |
| `SyncingIndicator` | Task 16 |
| Drain queue on visibility | Task 17 |
| QA | Task 18 |
| Rollout | Task 19 |

All spec requirements have tasks. No placeholders, no "TBD". Function signatures are consistent across tasks (`buildMealPayload`, `resolveMealType`, `applyMealRealtimeChange`, `onMealsChange`, `onSyncQueueChange`, `listPendingMeals`). File paths are exact.
