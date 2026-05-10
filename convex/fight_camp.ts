/**
 * Fight-camp domain: combines five tables into one file because they all
 * share the same access pattern (auth scope by userId + simple list/CRUD).
 *
 * Tables covered: fight_camps, fight_camp_calendar, fight_week_logs,
 *                 fight_week_plans, training_summaries.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";

// ───────────────────────────────────────────────────────────────────────
// fight_camps
// ───────────────────────────────────────────────────────────────────────

export const listCamps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("fight_camps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows;
  },
});

export const getCamp = query({
  args: { id: v.id("fight_camps") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return null;
    if (row.userId !== userId) throw new Error("Not authorized");
    return row;
  },
});

export const createCamp = mutation({
  args: {
    name: v.string(),
    fightDate: v.string(),
    eventName: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    weighInTiming: v.optional(v.string()),
    startingWeightKg: v.optional(v.number()),
    endWeightKg: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("fight_camps", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

export const updateCamp = mutation({
  args: {
    id: v.id("fight_camps"),
    name: v.optional(v.string()),
    fightDate: v.optional(v.string()),
    eventName: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    weighInTiming: v.optional(v.string()),
    startingWeightKg: v.optional(v.number()),
    endWeightKg: v.optional(v.number()),
    totalWeightCut: v.optional(v.number()),
    weightViaDehydration: v.optional(v.number()),
    weightViaCarbReduction: v.optional(v.number()),
    rehydrationNotes: v.optional(v.string()),
    performanceFeeling: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Camp not found");
    if (row.userId !== userId) throw new Error("Not authorized");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch as any);
  },
});

export const deleteCamp = mutation({
  args: { id: v.id("fight_camps") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});

// ───────────────────────────────────────────────────────────────────────
// fight_camp_calendar
// ───────────────────────────────────────────────────────────────────────

export const listCalendar = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("fight_camp_calendar")
      .withIndex("by_user_date", (q) => {
        const base = q.eq("userId", userId);
        if (from && to) return base.gte("date", from).lte("date", to);
        if (from) return base.gte("date", from);
        if (to) return base.lte("date", to);
        return base;
      })
      .collect();
    // Resolve any media storage ids to long-lived URLs so the client can
    // render <img src> directly without an extra round-trip.
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        mediaUrl: r.mediaStorageId
          ? await ctx.storage.getUrl(r.mediaStorageId)
          : null,
      })),
    );
  },
});

/**
 * Step 1 of the training-media upload flow: returns a one-time POST URL.
 * The client posts the image/video to it, receives a `storageId`, then
 * passes it to `createCalendarEntry` / `updateCalendarEntry` below.
 */
export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Resolve a freshly uploaded media `storageId` to a long-lived public URL.
 * Auth-gated so anonymous callers can't enumerate storage. Used by the
 * upload helper to surface a URL the legacy supabase `media_url` column
 * can still hold during the transition window.
 */
export const getMediaUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireUserId(ctx);
    return await ctx.storage.getUrl(storageId);
  },
});

export const createCalendarEntry = mutation({
  args: {
    date: v.string(),
    sessionType: v.string(),
    intensity: v.string(),
    intensityLevel: v.optional(v.number()),
    durationMinutes: v.number(),
    rpe: v.number(),
    bodyweight: v.optional(v.number()),
    fatigueLevel: v.optional(v.number()),
    sorenessLevel: v.optional(v.number()),
    sleepHours: v.optional(v.number()),
    sleepQuality: v.optional(v.string()),
    mobilityDone: v.optional(v.boolean()),
    mediaStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("fight_camp_calendar", {
      userId,
      ...args,
    });
  },
});

export const updateCalendarEntry = mutation({
  args: {
    id: v.id("fight_camp_calendar"),
    sessionType: v.optional(v.string()),
    intensity: v.optional(v.string()),
    intensityLevel: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    rpe: v.optional(v.number()),
    bodyweight: v.optional(v.number()),
    fatigueLevel: v.optional(v.number()),
    sorenessLevel: v.optional(v.number()),
    sleepHours: v.optional(v.number()),
    sleepQuality: v.optional(v.string()),
    mobilityDone: v.optional(v.boolean()),
    // Pass `null` to remove the existing media (deletes the storage object).
    mediaStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, mediaStorageId, ...rest }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Entry not found");
    if (row.userId !== userId) throw new Error("Not authorized");

    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }

    // Handle media replacement / removal: delete the previous storage object
    // BEFORE patching the new id so we never orphan an old file.
    if (mediaStorageId !== undefined) {
      if (row.mediaStorageId && row.mediaStorageId !== mediaStorageId) {
        try {
          await ctx.storage.delete(row.mediaStorageId);
        } catch {
          /* prior media already missing — ignore */
        }
      }
      patch.mediaStorageId = mediaStorageId ?? undefined;
    }

    await ctx.db.patch(id, patch as any);
  },
});

export const deleteCalendarEntry = mutation({
  args: { id: v.id("fight_camp_calendar") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    if (row.mediaStorageId) {
      try {
        await ctx.storage.delete(row.mediaStorageId);
      } catch {
        /* already gone */
      }
    }
    await ctx.db.delete(id);
  },
});

// ───────────────────────────────────────────────────────────────────────
// fight_week_logs
// ───────────────────────────────────────────────────────────────────────

export const listWeekLogs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("fight_week_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();
    return rows;
  },
});

export const upsertWeekLog = mutation({
  args: {
    logDate: v.string(),
    weightKg: v.optional(v.number()),
    fluidIntakeMl: v.optional(v.number()),
    carbsG: v.optional(v.number()),
    sweatSessionMin: v.optional(v.number()),
    supplements: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("fight_week_logs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("logDate", args.logDate),
      )
      .first();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      for (const [k, val] of Object.entries(args)) {
        if (val !== undefined && k !== "logDate") patch[k] = val;
      }
      await ctx.db.patch(existing._id, patch as any);
      return existing._id;
    }
    return await ctx.db.insert("fight_week_logs", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

// ───────────────────────────────────────────────────────────────────────
// fight_week_plans
// ───────────────────────────────────────────────────────────────────────

export const getActivePlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("fight_week_plans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Pick the plan closest to today (or future).
    if (rows.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const future = rows.filter((r) => r.fightDate >= today);
    return (
      future.sort((a, b) => a.fightDate.localeCompare(b.fightDate))[0] ??
      rows.sort((a, b) => b.fightDate.localeCompare(a.fightDate))[0]
    );
  },
});

export const upsertPlan = mutation({
  args: {
    fightCampId: v.optional(v.id("fight_camps")),
    fightDate: v.string(),
    startingWeightKg: v.number(),
    targetWeightKg: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("fight_week_plans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("fightDate"), args.fightDate))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        fightCampId: args.fightCampId ?? existing.fightCampId,
        startingWeightKg: args.startingWeightKg,
        targetWeightKg: args.targetWeightKg,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("fight_week_plans", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

// ───────────────────────────────────────────────────────────────────────
// training_summaries
// ───────────────────────────────────────────────────────────────────────

export const getSummaryForWeek = query({
  args: { weekStart: v.string() },
  handler: async (ctx, { weekStart }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("training_summaries")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", weekStart),
      )
      .first();
  },
});

export const upsertSummary = mutation({
  args: {
    weekStart: v.string(),
    sessionIds: v.array(v.string()),
    notesFingerprint: v.string(),
    summaryData: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("training_summaries")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", args.weekStart),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionIds: args.sessionIds,
        notesFingerprint: args.notesFingerprint,
        summaryData: args.summaryData,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("training_summaries", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

/** All training summaries for the current user, newest first. */
export const listAllSummaries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("training_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return rows.slice(0, limit ?? 20);
  },
});

export const deleteSummary = mutation({
  args: { id: v.id("training_summaries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});
