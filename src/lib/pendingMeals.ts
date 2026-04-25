import { syncQueue, onSyncQueueChange, type SyncOp } from "./syncQueue";
import { coerceMealName, defaultNameFor } from "./mealName";
import { logger } from "./logger";

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

const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

function toSummary(op: SyncOp): PendingMealSummary | null {
  // Accept legacy "nutrition_logs" entries as well as new "meals"/"meal_items" queue rows.
  if (op.table !== "nutrition_logs" && op.table !== "meals" && op.table !== "meal_items") return null;
  if (op.action !== "insert" && op.action !== "delete") return null;
  const p = op.payload as Record<string, unknown>;

  // Meals-table INSERTs store the RPC args shape (p_meal_type, p_meal_name,
  // p_items[{calories}]). Legacy nutrition_logs + meal_items use flat fields
  // (meal_type, meal_name, calories). Delete ops carry no meal details.
  const isRpc = op.table === "meals" && op.action === "insert";
  const rawType = (isRpc ? p.p_meal_type : p.meal_type) as string | undefined;
  const rawName = (isRpc ? p.p_meal_name : p.meal_name) as string | undefined;
  const rpcItems = isRpc && Array.isArray(p.p_items)
    ? (p.p_items as Array<{ calories?: number }>)
    : [];
  const calories = isRpc
    ? rpcItems.reduce((sum, it) => sum + (Number(it.calories) || 0), 0)
    : (Number(p.calories) || 0);

  const hasValidType = typeof rawType === "string" &&
    (VALID_MEAL_TYPES as readonly string[]).includes(rawType);
  const hasRealContent = calories > 0 ||
    rpcItems.some(it => Number(it.calories) > 0);

  // Drop pure ghosts from the pill: insert ops with neither a valid meal_type
  // nor any non-zero calories are stale or malformed. Delete ops are always
  // surfaced because recordId (not payload) identifies the target row.
  if (op.action === "insert" && !hasValidType && !hasRealContent) {
    return null;
  }

  const mealType = hasValidType ? (rawType as string) : "snack";
  const mealName = op.action === "delete"
    ? (rawName || "Deleted meal")
    : coerceMealName(rawName, mealType);
  return {
    id: op.id,
    recordId: op.recordId,
    action: op.action,
    mealName,
    calories: Math.round(calories),
    mealType,
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

/**
 * Heal queued nutrition_logs INSERTs whose payloads were written by
 * pre-migration code (null meal_type / empty meal_name / null calories).
 * These would otherwise fail forever against the NOT NULL + CHECK constraints.
 *
 * For each broken op:
 *   - meal_type falsy or not in enum → "snack"
 *   - meal_name empty/null → "Logged meal"
 *   - calories missing/NaN → 0
 * Reset retries=0 and failed=false so the next process() attempt lands.
 * Returns the number of ops patched.
 */
export function healBrokenPendingMeals(userId: string): number {
  const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
  let healed = 0;

  for (const op of syncQueue.peek(userId)) {
    if (op.table !== "nutrition_logs") continue;
    if (op.action !== "insert") continue;

    const p = { ...(op.payload as Record<string, unknown>) };
    let patched = false;

    const currentType = typeof p.meal_type === "string" ? p.meal_type : "";
    if (!MEAL_TYPES.has(currentType)) {
      p.meal_type = "snack";
      patched = true;
    }

    const currentName = typeof p.meal_name === "string" ? p.meal_name.trim() : "";
    if (currentName.length === 0) {
      // Heal path — intentional fallback, skip the coerceMealName warning.
      p.meal_name = defaultNameFor(p.meal_type as string | undefined);
      patched = true;
    }

    const currentCalories = Number(p.calories);
    if (!Number.isFinite(currentCalories)) {
      p.calories = 0;
      patched = true;
    }

    if (patched || op.failed) {
      syncQueue.updateOp(userId, op.id, {
        payload: p,
        failed: false,
        retries: 0,
      });
      healed++;
    }
  }

  return healed;
}

/**
 * Automatic boot-time purge: dequeue any `meals` / `meal_items` / `nutrition_logs`
 * INSERT op whose payload has neither a valid meal_type nor any non-zero
 * calories. These are pure ghosts (usually pre-migration rows or empty
 * fallback-item payloads) that would otherwise render as "syncing snack · 0 kcal"
 * forever. Run once per session in UserContext after the legacy-drop step.
 */
export function purgeGhostMealQueueEntries(userId: string): number {
  const VALID = new Set<string>(["breakfast", "lunch", "dinner", "snack"]);
  const ops = syncQueue.peek(userId);
  let purged = 0;

  for (const op of ops) {
    if (op.action !== "insert") continue;
    if (op.table !== "meals" && op.table !== "meal_items" && op.table !== "nutrition_logs") continue;

    const p = op.payload as Record<string, unknown>;
    const isRpc = op.table === "meals";
    const rawType = (isRpc ? p.p_meal_type : p.meal_type) as string | undefined;
    const rpcItems = isRpc && Array.isArray(p.p_items)
      ? (p.p_items as Array<{ calories?: number }>)
      : [];
    const itemsCal = rpcItems.reduce((sum, it) => sum + (Number(it.calories) || 0), 0);
    const flatCal = !isRpc ? (Number(p.calories) || 0) : 0;

    const hasValidType = typeof rawType === "string" && VALID.has(rawType);
    const hasRealContent = itemsCal > 0 || flatCal > 0;

    if (!hasValidType && !hasRealContent) {
      syncQueue.dequeue(userId, op.id);
      purged++;
    }
  }

  if (purged > 0) {
    logger.warn("Purged ghost meal queue entries", { userId, count: purged });
  }
  return purged;
}

/**
 * Manual purge of ghost/pending meal rows stuck in the sync queue.
 * Exposed on `window.__purgeGhostMeals(userId)` below so you can clear them
 * from DevTools console if the UI shows a blank "Logged meal" row.
 */
export function purgeAllPendingMealsForUser(userId: string): number {
  const ops = syncQueue.peek(userId);
  const meal = ops.filter(
    op => op.table === "nutrition_logs" || op.table === "meals" || op.table === "meal_items"
  );
  for (const op of meal) {
    syncQueue.dequeue(userId, op.id);
  }
  if (meal.length > 0) {
    logger.warn("Purged pending meal ops (manual)", { userId, count: meal.length });
  }
  return meal.length;
}

if (typeof window !== "undefined") {
  (window as unknown as { __purgeGhostMeals?: typeof purgeAllPendingMealsForUser }).__purgeGhostMeals =
    purgeAllPendingMealsForUser;
}

/**
 * Phase 4.4 boot migration: archived `nutrition_logs` table no longer accepts
 * writes, so any queued ops targeting it would fail forever. Drop them.
 * Returns the number of ops dropped. Intended to run once at app boot.
 */
export function dropLegacyNutritionLogsQueueEntries(userId: string): number {
  const ops = syncQueue.peek(userId);
  const legacy = ops.filter(op => op.table === "nutrition_logs");
  if (legacy.length === 0) return 0;

  for (const op of legacy) {
    syncQueue.dequeue(userId, op.id);
  }
  logger.warn("Dropped legacy nutrition_logs syncQueue entries", {
    userId,
    count: legacy.length,
  });
  return legacy.length;
}

/**
 * One-shot wipe of pre-migration localStorage `nutrition_logs` cache. Legacy
 * rows may carry `meal_name: undefined` which causes coerceMealName to fire
 * its fallback-detector warning on every render. After wipe, useNutritionData
 * refetches from `meals_with_totals` and repopulates the cache cleanly.
 * Keyed by a sentinel so it runs at most once per device.
 */
export function wipeLegacyNutritionLocalCache(userId: string): number {
  const SENTINEL = `nutrition_v2_cache_wiped_${userId}`;
  try {
    if (localStorage.getItem(SENTINEL) === "1") return 0;
  } catch {
    return 0;
  }

  let wiped = 0;
  try {
    const prefix = `wcw_${userId}_nutrition_logs_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      wiped++;
    }
    localStorage.setItem(SENTINEL, "1");
  } catch (err) {
    logger.warn("wipeLegacyNutritionLocalCache failed", { err: String(err) });
    return 0;
  }

  if (wiped > 0) {
    logger.warn("Wiped legacy nutrition_logs localCache entries", { userId, count: wiped });
  }
  return wiped;
}
