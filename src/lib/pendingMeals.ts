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
      p.meal_name = "Logged meal";
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
