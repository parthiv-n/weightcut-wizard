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
