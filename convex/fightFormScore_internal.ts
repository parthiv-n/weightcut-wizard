import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const fetchScoringInputs = internalQuery({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Active camp = most recent non-completed camp by creation time.
    const camps = await ctx.db
      .query("fight_camps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const active = camps
      .filter((c) => !c.isCompleted)
      .sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;

    const end = new Date(date + "T00:00:00Z");
    const lookbackStart = new Date(end);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 28);
    const lookbackStartIso = lookbackStart.toISOString().slice(0, 10);

    const weights = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sleep = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sessions = await ctx.db
      .query("gym_sessions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const wellness = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();

    // Aggregate meals by day (cal + protein from meal_items)
    const mealsByDay = new Map<string, { date: string; calories: number; proteinG: number }>();
    for (const m of meals) {
      const items = await ctx.db
        .query("meal_items")
        .withIndex("by_meal", (q) => q.eq("mealId", m._id))
        .collect();
      const cal = items.reduce((a, x) => a + (x.calories ?? 0), 0);
      const pro = items.reduce((a, x) => a + (x.proteinG ?? 0), 0);
      const cur = mealsByDay.get(m.date) ?? { date: m.date, calories: 0, proteinG: 0 };
      cur.calories += cal;
      cur.proteinG += pro;
      mealsByDay.set(m.date, cur);
    }

    // Prior raw scores for EMA (last 3 days before target)
    const priorEnd = new Date(end); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 2);
    const priorRaw = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId)
         .gte("date", priorStart.toISOString().slice(0, 10))
         .lte("date", priorEnd.toISOString().slice(0, 10)),
      )
      .collect();

    return {
      date,
      profile,
      camp: active,
      weights: weights.map((w) => ({ date: w.date, weightKg: w.weightKg })),
      sleepHours: sleep.map((s) => ({ date: s.date, hours: s.hours })),
      // gym_sessions has no session-level `rpe`; use `perceivedFatigue` as proxy.
      sessions: sessions
        .filter((s) => s.durationMinutes != null && s.perceivedFatigue != null)
        .map((s) => ({ date: s.date, rpe: s.perceivedFatigue!, durationMinutes: s.durationMinutes! })),
      hooperByDate: wellness
        .filter((w) => w.hooperIndex != null)
        .map((w) => ({ date: w.date, hooper: w.hooperIndex! })),
      meals: Array.from(mealsByDay.values()),
      priorRawScores: priorRaw.map((p) => ({ date: p.date, rawScore: p.rawScore })),
    };
  },
});

export const upsertScore = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    campId: v.optional(v.id("fight_camps")),
    score: v.any(),
  },
  handler: async (ctx, { userId, date, campId, score }) => {
    const existing = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date_version", (q) =>
        q.eq("userId", userId).eq("date", date).eq("algorithmVersion", score.algorithmVersion),
      )
      .first();
    const row = {
      userId,
      date,
      campId,
      rawScore: score.rawScore,
      displayedScore: score.score,
      label: score.label,
      state: score.state,
      phase: score.phase ?? undefined,
      subScores: score.subScores,
      appliedCeiling: score.appliedCeiling ?? undefined,
      campAge: score.campAge ?? undefined,
      topDriver: score.topDriver,
      topLimiter: score.topLimiter,
      algorithmVersion: score.algorithmVersion,
      computedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("fight_form_scores", row);
  },
});
