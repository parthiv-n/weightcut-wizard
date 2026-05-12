/**
 * Convex cron jobs.
 *
 * Hourly reconcile-ai-outcomes: scans pending ai_decisions rows, compares
 * predicted vs actual user data, then writes the outcome + error_pct back
 * to each row. Replaces the pg_cron / Supabase scheduled function that
 * previously invoked `reconcile-ai-outcomes` over HTTP.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "reconcile-ai-outcomes",
  { minuteUTC: 0 },
  internal.actions.reconcileAiOutcomes.run,
);

crons.hourly(
  "fight-form-score-daily",
  { minuteUTC: 5 },
  internal.fightFormScore.scheduleDailyRecomputeAcrossUsers,
);

export default crons;
