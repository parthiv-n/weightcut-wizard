// Central write/read helper for the ai_decisions table.
//
// Design contract:
// - logAIDecision is **fire-and-forget**. It must never block the response of
//   the calling edge function. Errors are caught + logged; we always resolve.
// - getRecentDecisions / decisionsToPromptBlock are read-side helpers used by
//   other features to inject "last time you said X" context into prompts.
//
// IMPORTANT: This file is intentionally self-contained — no new dependencies.
// It uses the same `supabase-js` import URL that the rest of the edge
// functions already pull from esm.sh, so callers can pass either a
// user-scoped or service-role client and it will Just Work.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface LogAIDecisionInput {
  userId: string;
  feature: string;
  inputSnapshot: unknown;
  outputJson: unknown;
  predictionFacts?: Record<string, number>;
  model?: string;
}

export interface AIDecisionRow {
  id: string;
  user_id: string;
  feature: string;
  input_snapshot: unknown;
  output_json: unknown;
  prediction_facts: Record<string, number> | null;
  model: string | null;
  created_at: string;
  outcome_logged_at: string | null;
  actual_outcome: Record<string, unknown> | null;
  error_pct: number | null;
  user_accepted: boolean | null;
  user_rating: number | null;
}

/**
 * Insert a new ai_decisions row. **Fire-and-forget**: never throws, never
 * blocks the caller's response. Returns the inserted row id on success or
 * `null` on failure (with the error logged to stderr).
 *
 * Usage in an edge function:
 *
 *   // After we have a parsed AI response, but before returning to client:
 *   const decisionPromise = logAIDecision(supabase, {
 *     userId: user.id,
 *     feature: 'generate-cut-plan',
 *     inputSnapshot: athleteSnapshot,
 *     outputJson: parsed,
 *     predictionFacts: {
 *       predicted_kcal: targetCalories,
 *       predicted_loss_per_week_kg: weeklyLossRate,
 *     },
 *     model: 'openai/gpt-oss-120b',
 *   });
 *   // Don't await — let the response go out first.
 *   void decisionPromise;
 */
export async function logAIDecision(
  supabase: SupabaseClient,
  input: LogAIDecisionInput,
): Promise<{ id: string } | null> {
  try {
    if (!input.userId || !input.feature) {
      console.error('[aiDecisionLog] missing userId or feature; skipping insert');
      return null;
    }

    const row = {
      user_id: input.userId,
      feature: input.feature,
      input_snapshot: input.inputSnapshot ?? {},
      output_json: input.outputJson ?? {},
      prediction_facts: input.predictionFacts ?? null,
      model: input.model ?? null,
    };

    const { data, error } = await supabase
      .from('ai_decisions')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('[aiDecisionLog] insert error:', error.message, {
        feature: input.feature,
        userId: input.userId,
      });
      return null;
    }

    return data ? { id: data.id as string } : null;
  } catch (e) {
    console.error('[aiDecisionLog] unexpected error:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Read the N most recent decisions for a (user, feature) pair, newest first.
 * Used by features that want to inject "you said X last time, the actual
 * outcome was Y" into a new prompt.
 *
 * Returns `[]` on any error so callers can `decisionsToPromptBlock(...)`
 * unconditionally.
 */
export async function getRecentDecisions(
  supabase: SupabaseClient,
  userId: string,
  feature: string,
  limit = 3,
): Promise<AIDecisionRow[]> {
  try {
    const { data, error } = await supabase
      .from('ai_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('feature', feature)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[aiDecisionLog] getRecentDecisions error:', error.message);
      return [];
    }
    return (data ?? []) as AIDecisionRow[];
  } catch (e) {
    console.error('[aiDecisionLog] getRecentDecisions threw:', e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Format prior decisions into a compact prompt block. Designed to be cheap
 * (token-wise) — we only emit one line per decision, with the predicted vs
 * actual delta if it has been reconciled.
 *
 * Example output:
 *
 *   PRIOR DECISIONS
 *   [2026-04-15] generate-cut-plan: 1800 kcal/day, predicted -0.5kg/wk; actual -0.3kg/wk (40% under)
 *   [2026-03-30] generate-cut-plan: 2000 kcal/day, predicted -0.4kg/wk; pending outcome
 */
export function decisionsToPromptBlock(decisions: AIDecisionRow[]): string {
  if (!decisions || decisions.length === 0) return '';

  const lines = decisions.map((d) => {
    const date = (d.created_at ?? '').slice(0, 10);
    const facts = d.prediction_facts ?? {};
    const factPairs = Object.entries(facts)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${formatFactKey(k)}=${formatFactValue(v)}`)
      .join(', ');

    let outcomeBit: string;
    if (d.outcome_logged_at && d.actual_outcome) {
      const actualPairs = Object.entries(d.actual_outcome)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => `${formatFactKey(k)}=${formatFactValue(v as number | string)}`)
        .join(', ');
      const errorBit =
        typeof d.error_pct === 'number'
          ? ` (${Math.round(d.error_pct * 100)}% off)`
          : '';
      outcomeBit = `; actual ${actualPairs}${errorBit}`;
    } else {
      outcomeBit = '; pending outcome';
    }

    return `[${date}] ${d.feature}: ${factPairs}${outcomeBit}`;
  });

  return ['PRIOR DECISIONS', ...lines].join('\n');
}

// ---------- internal helpers ----------

function formatFactKey(k: string): string {
  // Strip noisy prefixes for readability in the prompt.
  return k.replace(/^predicted_/, '').replace(/^actual_/, '');
}

function formatFactValue(v: unknown): string {
  if (typeof v === 'number') {
    // Compact numeric formatting — 2 decimals for fractions, integer otherwise.
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}
