// Outcome reconciler — runs daily (cron-triggered).
//
// For each ai_decisions row where:
//   outcome_logged_at IS NULL
//   AND created_at > now() - interval '30 days'
//   AND prediction_facts IS NOT NULL
// we look up the user's actual data over the prediction window and write
// `actual_outcome` + `error_pct`. Idempotent: rows that already have
// outcome_logged_at are skipped on subsequent runs.
//
// Runs with the service-role key so it can read across tables and write to
// ai_decisions regardless of RLS owner. Cron schedule should be set up
// separately (Supabase scheduled functions or pg_cron calling this URL).
//
// Performance: pending decisions are grouped by user_id, and each user's
// weight_logs + meals_with_totals are fetched ONCE over the union window of
// that user's pending decisions. User groups are processed in Promise.all
// chunks of 20 to avoid connection storms. After the loop, a retention sweep
// drops ai_decisions rows older than 90 days to keep the table bounded.
//
// To extend: add a new entry to RECONCILERS keyed by feature name. Each
// reconciler returns either { actual: {...}, errorPct: number } or null
// (meaning "not enough time has passed yet — try again tomorrow").

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface AIDecisionRow {
  id: string;
  user_id: string;
  feature: string;
  input_snapshot: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  prediction_facts: Record<string, number> | null;
  created_at: string;
}

interface ReconcileResult {
  actual: Record<string, number | string | null>;
  errorPct: number | null;
}

// Pre-fetched per-user data shared across all of that user's pending decisions
// over the union window [oldestDecisionDate, today]. Each reconciler filters
// the slice it needs from these arrays in memory — no per-decision queries.
interface PrefetchedUserData {
  weightLogs: Array<{ date: string; weight_kg: number | string | null }>;
  meals: Array<{
    date: string;
    total_calories: number | string | null;
    total_protein_g: number | string | null;
  }>;
}

type Reconciler = (
  decision: AIDecisionRow,
  data: PrefetchedUserData,
) => ReconcileResult | null;

// Minimum days of post-decision history required before reconciling each feature.
const MIN_WINDOW_DAYS: Record<string, number> = {
  'generate-cut-plan': 7,
  'generate-weight-plan': 7,
  'meal-planner': 3,
};

// Number of user-groups to process concurrently. Bigger = faster wall clock,
// but more open Supabase connections — 20 is a safe middle ground.
const USER_BATCH_SIZE = 20;

// Retention horizon — drop ai_decisions rows older than this in a final sweep.
const RETENTION_DAYS = 90;

// ----- helpers -----

function daysSince(iso: string): number {
  const created = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
}

function safeRatio(predicted: number, actual: number): number | null {
  if (!Number.isFinite(predicted) || predicted === 0) return null;
  if (!Number.isFinite(actual)) return null;
  return Math.abs(predicted - actual) / Math.abs(predicted);
}

function isoOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ----- per-feature reconcilers (pure: no DB queries; consume prefetched data) -----

/**
 * Cut plan: compare predicted weekly loss to actual weight delta over the
 * window, and predicted kcal target to the user's average kcal intake.
 */
const reconcileCutPlan: Reconciler = (decision, data) => {
  const facts = decision.prediction_facts ?? {};
  const predictedLossPerWeekKg = numeric(facts.predicted_loss_per_week_kg);
  const predictedKcal = numeric(facts.predicted_kcal);

  const days = daysSince(decision.created_at);
  if (days < (MIN_WINDOW_DAYS['generate-cut-plan'] ?? 7)) return null;

  const windowStart = decision.created_at.slice(0, 10);
  const windowEnd = isoOnly(new Date());

  // Weight delta over window — slice prefetched array.
  const weights = data.weightLogs
    .filter((w) => w.date >= windowStart && w.date <= windowEnd)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let actualLossPerWeekKg: number | null = null;
  if (weights.length >= 2) {
    const first = Number(weights[0].weight_kg);
    const last = Number(weights[weights.length - 1].weight_kg);
    const spanDays = Math.max(
      1,
      (new Date(weights[weights.length - 1].date).getTime() -
        new Date(weights[0].date).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    actualLossPerWeekKg = ((first - last) / spanDays) * 7;
  }

  // Average daily kcal over window — slice prefetched meals.
  const meals = data.meals.filter((m) => m.date >= windowStart && m.date <= windowEnd);

  let actualKcalAvg: number | null = null;
  if (meals.length > 0) {
    const byDate = new Map<string, number>();
    for (const m of meals) {
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + Number(m.total_calories ?? 0));
    }
    const totals = Array.from(byDate.values());
    if (totals.length > 0) {
      actualKcalAvg = totals.reduce((a, b) => a + b, 0) / totals.length;
    }
  }

  // Pick the dominant predicted-vs-actual pair for error_pct (loss preferred).
  let errorPct: number | null = null;
  if (predictedLossPerWeekKg !== null && actualLossPerWeekKg !== null) {
    errorPct = safeRatio(predictedLossPerWeekKg, actualLossPerWeekKg);
  } else if (predictedKcal !== null && actualKcalAvg !== null) {
    errorPct = safeRatio(predictedKcal, actualKcalAvg);
  }

  return {
    actual: {
      actual_loss_per_week_kg: actualLossPerWeekKg,
      actual_kcal_avg: actualKcalAvg,
      window_start: windowStart,
      window_end: windowEnd,
      weight_logs_count: weights.length,
      meal_days_count: new Set(meals.map((m) => m.date)).size,
    },
    errorPct,
  };
};

/**
 * Generic weight-plan reconciler: same shape as cut-plan today; kept as a
 * separate hook so the two can diverge (different prediction shapes).
 */
const reconcileWeightPlan: Reconciler = (decision, data) => {
  return reconcileCutPlan(decision, data);
};

/**
 * Meal planner: compare predicted kcal/macros to actual logged kcal/macros
 * over the window. We only need a few days of data for this one.
 */
const reconcileMealPlanner: Reconciler = (decision, data) => {
  const facts = decision.prediction_facts ?? {};
  const predictedKcal = numeric(facts.predicted_kcal);
  const predictedProtein = numeric(facts.predicted_protein_g);

  const days = daysSince(decision.created_at);
  if (days < (MIN_WINDOW_DAYS['meal-planner'] ?? 3)) return null;

  const windowStart = decision.created_at.slice(0, 10);
  const windowEnd = isoOnly(new Date());

  const meals = data.meals.filter((m) => m.date >= windowStart && m.date <= windowEnd);

  let actualKcalAvg: number | null = null;
  let actualProteinAvg: number | null = null;
  if (meals.length > 0) {
    const byDateKcal = new Map<string, number>();
    const byDateProt = new Map<string, number>();
    for (const m of meals) {
      byDateKcal.set(m.date, (byDateKcal.get(m.date) ?? 0) + Number(m.total_calories ?? 0));
      byDateProt.set(m.date, (byDateProt.get(m.date) ?? 0) + Number(m.total_protein_g ?? 0));
    }
    const kcalTotals = Array.from(byDateKcal.values());
    const protTotals = Array.from(byDateProt.values());
    if (kcalTotals.length > 0) {
      actualKcalAvg = kcalTotals.reduce((a, b) => a + b, 0) / kcalTotals.length;
    }
    if (protTotals.length > 0) {
      actualProteinAvg = protTotals.reduce((a, b) => a + b, 0) / protTotals.length;
    }
  }

  let errorPct: number | null = null;
  if (predictedKcal !== null && actualKcalAvg !== null) {
    errorPct = safeRatio(predictedKcal, actualKcalAvg);
  } else if (predictedProtein !== null && actualProteinAvg !== null) {
    errorPct = safeRatio(predictedProtein, actualProteinAvg);
  }

  return {
    actual: {
      actual_kcal_avg: actualKcalAvg,
      actual_protein_avg: actualProteinAvg,
      window_start: windowStart,
      window_end: windowEnd,
      meal_days_count: new Set(meals.map((m) => m.date)).size,
    },
    errorPct,
  };
};

const RECONCILERS: Record<string, Reconciler> = {
  'generate-cut-plan': reconcileCutPlan,
  'generate-weight-plan': reconcileWeightPlan,
  'meal-planner': reconcileMealPlanner,
};

// ----- per-user prefetch -----

/**
 * Fetch weight_logs + meals_with_totals for one user over the union window
 * [oldestDecisionDate, today]. Returned arrays are pre-filtered to that user
 * so reconcilers can do in-memory date-range slicing without further queries.
 */
async function prefetchUserData(
  supabase: SupabaseClient,
  userId: string,
  oldestDecisionIso: string,
): Promise<PrefetchedUserData> {
  const windowStart = oldestDecisionIso.slice(0, 10);
  const windowEnd = isoOnly(new Date());

  const [{ data: weights, error: wErr }, { data: meals, error: mErr }] = await Promise.all([
    supabase
      .from('weight_logs')
      .select('date, weight_kg')
      .eq('user_id', userId)
      .gte('date', windowStart)
      .lte('date', windowEnd)
      .order('date', { ascending: true }),
    supabase
      .from('meals_with_totals')
      .select('date, total_calories, total_protein_g')
      .eq('user_id', userId)
      .gte('date', windowStart)
      .lte('date', windowEnd),
  ]);

  if (wErr) console.error('[reconcile] prefetch weight_logs error:', wErr.message, { userId });
  if (mErr) console.error('[reconcile] prefetch meals error:', mErr.message, { userId });

  return {
    weightLogs: (weights ?? []) as PrefetchedUserData['weightLogs'],
    meals: (meals ?? []) as PrefetchedUserData['meals'],
  };
}

// ----- per-user-group processing -----

interface GroupSummary {
  reconciled: number;
  skipped_too_early: number;
  errors: number;
}

/**
 * Process all pending decisions for a single user. Issues one prefetch query
 * pair, runs all reconcilers in memory, then dispatches updates in parallel.
 */
async function processUserGroup(
  supabase: SupabaseClient,
  userId: string,
  decisions: AIDecisionRow[],
  dry: boolean,
): Promise<GroupSummary> {
  const summary: GroupSummary = { reconciled: 0, skipped_too_early: 0, errors: 0 };

  // Find the oldest decision so the prefetch window covers all of them.
  const oldestIso = decisions.reduce(
    (oldest, d) => (d.created_at < oldest ? d.created_at : oldest),
    decisions[0].created_at,
  );

  let userData: PrefetchedUserData;
  try {
    userData = await prefetchUserData(supabase, userId, oldestIso);
  } catch (e) {
    console.error('[reconcile] prefetch threw:', e instanceof Error ? e.message : e, { userId });
    summary.errors += decisions.length;
    return summary;
  }

  // Compute reconciliations in memory — no awaits inside this loop.
  const updates: Array<{ decision: AIDecisionRow; result: ReconcileResult }> = [];
  for (const decision of decisions) {
    const reconciler = RECONCILERS[decision.feature];
    if (!reconciler) continue; // counted at outer scope as skipped_unsupported

    try {
      const result = reconciler(decision, userData);
      if (!result) {
        summary.skipped_too_early++;
        continue;
      }
      updates.push({ decision, result });
    } catch (e) {
      console.error('[reconcile] reconciler threw:', e instanceof Error ? e.message : e, {
        id: decision.id,
        feature: decision.feature,
      });
      summary.errors++;
    }
  }

  if (dry) {
    summary.reconciled += updates.length;
    return summary;
  }

  // Dispatch all UPDATEs for this user in parallel — they're independent rows.
  const updateResults = await Promise.all(
    updates.map(({ decision, result }) =>
      supabase
        .from('ai_decisions')
        .update({
          actual_outcome: result.actual,
          error_pct: result.errorPct,
          outcome_logged_at: new Date().toISOString(),
        })
        .eq('id', decision.id)
        .is('outcome_logged_at', null) // idempotency guard
        .then(({ error }) => ({ id: decision.id, error })),
    ),
  );

  for (const { id, error } of updateResults) {
    if (error) {
      console.error('[reconcile] update error:', error.message, { id });
      summary.errors++;
    } else {
      summary.reconciled++;
    }
  }

  return summary;
}

// ----- handler -----

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Optional auth: cron job sends a service-role bearer; manual invocations
  // can pass ?dry=1 to preview which rows would be touched without writing.
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceIso = since.toISOString();

  const { data: pending, error: selErr } = await supabase
    .from('ai_decisions')
    .select('id, user_id, feature, input_snapshot, output_json, prediction_facts, created_at')
    .is('outcome_logged_at', null)
    .not('prediction_facts', 'is', null)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(500);

  if (selErr) {
    console.error('[reconcile] select error:', selErr.message);
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const summary = {
    scanned: pending?.length ?? 0,
    skipped_unsupported: 0,
    skipped_too_early: 0,
    reconciled: 0,
    errors: 0,
    user_groups: 0,
    retention_deleted: 0 as number | null,
    dry,
  };

  // Group pending decisions by user_id. Decisions for unsupported features are
  // counted here and excluded from per-user processing.
  const byUser = new Map<string, AIDecisionRow[]>();
  for (const row of pending ?? []) {
    const decision = row as AIDecisionRow;
    if (!RECONCILERS[decision.feature]) {
      summary.skipped_unsupported++;
      continue;
    }
    const list = byUser.get(decision.user_id);
    if (list) {
      list.push(decision);
    } else {
      byUser.set(decision.user_id, [decision]);
    }
  }
  summary.user_groups = byUser.size;

  // Process user-groups in chunks of USER_BATCH_SIZE so we cap concurrent
  // open queries against Supabase. Sequential at the chunk level, parallel
  // within a chunk.
  const userEntries = Array.from(byUser.entries());
  for (let i = 0; i < userEntries.length; i += USER_BATCH_SIZE) {
    const chunk = userEntries.slice(i, i + USER_BATCH_SIZE);
    const chunkSummaries = await Promise.all(
      chunk.map(([userId, decisions]) => processUserGroup(supabase, userId, decisions, dry)),
    );
    for (const s of chunkSummaries) {
      summary.reconciled += s.reconciled;
      summary.skipped_too_early += s.skipped_too_early;
      summary.errors += s.errors;
    }
  }

  // Retention sweep: drop ai_decisions rows older than RETENTION_DAYS so the
  // table stays bounded. Wrapped in try/catch so a cleanup failure never
  // fails the whole cron.
  try {
    if (!dry) {
      const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
      const { error: delErr, count } = await supabase
        .from('ai_decisions')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffIso);
      if (delErr) {
        console.error('[reconcile] retention sweep error:', delErr.message);
        summary.retention_deleted = null;
      } else {
        summary.retention_deleted = count ?? 0;
      }
    } else {
      summary.retention_deleted = null;
    }
  } catch (e) {
    console.error('[reconcile] retention sweep threw:', e instanceof Error ? e.message : e);
    summary.retention_deleted = null;
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
});
