/**
 * Hourly cron — reconciles pending ai_decisions rows by comparing prediction
 * facts against the user's actual logged data over the prediction window.
 */
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const MIN_WINDOW_DAYS: Record<string, number> = {
  "generate-cut-plan": 7,
  "generate-weight-plan": 7,
  "meal-planner": 3,
};

function safeRatio(predicted: number, actual: number): number | null {
  if (!Number.isFinite(predicted) || predicted === 0) return null;
  if (!Number.isFinite(actual)) return null;
  return Math.abs(predicted - actual) / Math.abs(predicted);
}

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface PendingRow {
  id: Id<"ai_decisions">;
  userId: Id<"users">;
  feature: string;
  predictionFacts: Record<string, unknown> | null;
  createdAt: number;
}

interface UserData {
  weightLogs: Array<{ date: string; weight_kg: number }>;
  meals: Array<{ date: string; total_calories: number; total_protein_g: number }>;
}

function reconcilePlan(row: PendingRow, data: UserData) {
  const facts = row.predictionFacts ?? {};
  const predictedLossPerWeek = numeric(facts.predicted_loss_per_week_kg);
  const predictedKcal = numeric(facts.predicted_kcal);
  const days = Math.floor((Date.now() - row.createdAt) / 86400000);
  const minDays = MIN_WINDOW_DAYS[row.feature] ?? 7;
  if (days < minDays) return null;
  const windowStart = new Date(row.createdAt).toISOString().slice(0, 10);
  const windowEnd = new Date().toISOString().slice(0, 10);
  const weights = data.weightLogs
    .filter((w) => w.date >= windowStart && w.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  let actualLossPerWeek: number | null = null;
  if (weights.length >= 2) {
    const first = Number(weights[0].weight_kg);
    const last = Number(weights[weights.length - 1].weight_kg);
    const spanDays = Math.max(
      1,
      (new Date(weights[weights.length - 1].date).getTime() -
        new Date(weights[0].date).getTime()) /
        86400000,
    );
    actualLossPerWeek = ((first - last) / spanDays) * 7;
  }
  const meals = data.meals.filter((m) => m.date >= windowStart && m.date <= windowEnd);
  let actualKcalAvg: number | null = null;
  if (meals.length > 0) {
    const byDate = new Map<string, number>();
    for (const m of meals) {
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + Number(m.total_calories ?? 0));
    }
    const totals = Array.from(byDate.values());
    if (totals.length > 0)
      actualKcalAvg = totals.reduce((a, b) => a + b, 0) / totals.length;
  }
  let errorPct: number | null = null;
  if (predictedLossPerWeek !== null && actualLossPerWeek !== null)
    errorPct = safeRatio(predictedLossPerWeek, actualLossPerWeek);
  else if (predictedKcal !== null && actualKcalAvg !== null)
    errorPct = safeRatio(predictedKcal, actualKcalAvg);
  return {
    actual: {
      actual_loss_per_week_kg: actualLossPerWeek,
      actual_kcal_avg: actualKcalAvg,
      window_start: windowStart,
      window_end: windowEnd,
      weight_logs_count: weights.length,
      meal_days_count: new Set(meals.map((m) => m.date)).size,
    },
    errorPct,
  };
}

export const run = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ scanned: number; reconciled: number; skipped: number; swept: number }> => {
    const pending = (await ctx.runQuery(
      internal.actions_internal.listPendingDecisions,
    )) as PendingRow[];
    const byUser = new Map<string, PendingRow[]>();
    for (const row of pending) {
      if (!MIN_WINDOW_DAYS[row.feature]) continue;
      const list = byUser.get(row.userId);
      if (list) list.push(row);
      else byUser.set(row.userId, [row]);
    }
    let reconciled = 0;
    let skipped = 0;
    for (const [userIdStr, rows] of byUser) {
      const oldestMs = rows.reduce((min, r) => Math.min(min, r.createdAt), rows[0].createdAt);
      const fromDate = new Date(oldestMs).toISOString().slice(0, 10);
      const data = (await ctx.runQuery(
        internal.actions_internal.fetchUserReconcileData,
        { userId: userIdStr as Id<"users">, fromDate },
      )) as UserData;
      for (const row of rows) {
        const r = reconcilePlan(row, data);
        if (!r) {
          skipped++;
          continue;
        }
        const ok = await ctx.runMutation(
          internal.actions_internal.writeReconcileOutcome,
          { id: row.id, actualOutcome: r.actual, errorPct: r.errorPct ?? undefined },
        );
        if (ok) reconciled++;
      }
    }
    const swept = (await ctx.runMutation(
      internal.actions_internal.sweepOldDecisions,
    )) as number;
    return { scanned: pending.length, reconciled, skipped, swept };
  },
});
