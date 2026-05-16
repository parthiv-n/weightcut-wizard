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
// Validation helpers
// ───────────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function assertValidFightDate(fightDate: string) {
  if (!ISO_DATE.test(fightDate)) {
    throw new Error("fightDate must be ISO YYYY-MM-DD");
  }
  const ts = Date.parse(fightDate);
  if (Number.isNaN(ts)) {
    throw new Error("fightDate is not a valid date");
  }
  const now = Date.now();
  // Allow today (subtract one day's worth of ms to permit same-day creation).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (ts < todayStart.getTime()) {
    throw new Error("fightDate must be today or later");
  }
  if (ts > now + FIVE_YEARS_MS) {
    throw new Error("fightDate must be within 5 years");
  }
}

function assertValidStartingWeight(startingWeightKg: number | undefined) {
  if (startingWeightKg === undefined) return;
  if (!Number.isFinite(startingWeightKg)) {
    throw new Error("startingWeightKg must be a finite number");
  }
  if (startingWeightKg < 30 || startingWeightKg > 250) {
    throw new Error("startingWeightKg must be between 30 and 250 kg");
  }
}

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
    assertValidFightDate(args.fightDate);
    assertValidStartingWeight(args.startingWeightKg);
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

/**
 * Derive the user's currently active camp. "Active" = the latest non-completed
 * camp whose fightDate is in the future (or today). When nothing is upcoming
 * we fall back to the most-recent camp regardless of state so the dashboard
 * can offer a "wrap up + start next" prompt even after the fight date passes.
 *
 * Pure-read; no schema change. Keeps existing consumers (which still read
 * profiles.target_date) backwards-compatible.
 */
export const getActiveCamp = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Bounded scan: most users have <50 camps; the index returns insertion
    // order so we sort/filter in-memory from this slice.
    const rows = await ctx.db
      .query("fight_camps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    if (rows.length === 0) return null;

    const todayIso = new Date().toISOString().slice(0, 10);
    const upcoming = rows
      .filter((r) => !r.isCompleted && r.fightDate >= todayIso)
      .sort((a, b) => a.fightDate.localeCompare(b.fightDate)); // soonest first

    if (upcoming.length > 0) return upcoming[0];

    // No upcoming non-completed camp — return the most-recent camp by
    // fightDate so the UI can decide whether to offer a wrap-up prompt.
    const sorted = [...rows].sort((a, b) => b.fightDate.localeCompare(a.fightDate));
    return sorted[0];
  },
});

/**
 * Mark a camp complete and (optionally) write the retrospective fields the
 * schema already supports. Used by WrapUpCampDialog before the user starts
 * a new camp.
 */
export const completeCamp = mutation({
  args: {
    id: v.id("fight_camps"),
    endWeightKg: v.optional(v.number()),
    totalWeightCut: v.optional(v.number()),
    weightViaDehydration: v.optional(v.number()),
    weightViaCarbReduction: v.optional(v.number()),
    rehydrationNotes: v.optional(v.string()),
    performanceFeeling: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Camp not found");
    if (row.userId !== userId) throw new Error("Not authorized");
    const patch: Record<string, unknown> = {
      isCompleted: true,
      updatedAt: Date.now(),
    };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch as any);
  },
});

/**
 * Called from the initial onboarding flow and the NextCampWizard. Inserts a
 * fight_camps row only when there's no active row that already covers the
 * same fightDate; this keeps the call idempotent (re-running onboarding from
 * a stale draft won't produce duplicate camps).
 */
export const createCampFromOnboarding = mutation({
  args: {
    name: v.string(),
    fightDate: v.string(),
    eventName: v.optional(v.string()),
    weighInTiming: v.optional(v.string()),
    startingWeightKg: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertValidFightDate(args.fightDate);
    assertValidStartingWeight(args.startingWeightKg);
    const existing = await ctx.db
      .query("fight_camps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const dupe = existing.find(
      (r) => !r.isCompleted && r.fightDate === args.fightDate,
    );
    if (dupe) return dupe._id;
    return await ctx.db.insert("fight_camps", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
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
    // Resolve mediaUrl ONLY for rows that have a mediaStorageId.
    // Perf model: bounded by media-having-rows, not total rows. A typical
    // 28-day calendar has ~3-5 sessions with media → 3-5 storage.getUrl
    // calls per tick instead of 28. Agent B previously stripped this
    // resolution entirely to fix the O(N) hot path; this restores
    // thumbnails for Recovery + TrainingCalendar while keeping the win.
    const mediaRowIndexes: number[] = [];
    rows.forEach((r, i) => {
      if (r.mediaStorageId) mediaRowIndexes.push(i);
    });
    const resolvedUrls = await Promise.all(
      mediaRowIndexes.map((i) => ctx.storage.getUrl(rows[i].mediaStorageId!)),
    );
    const urlByIndex = new Map<number, string | null>();
    mediaRowIndexes.forEach((i, k) => urlByIndex.set(i, resolvedUrls[k]));
    return rows.map((r, i) => ({
      ...r,
      mediaUrl: urlByIndex.get(i) ?? null,
    }));
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
    // Auth: surface a stable, client-distinguishable message. Anything else
    // thrown by this mutation should be a true bug — every transient/missing
    // dependency is swallowed below so the user-visible delete is idempotent.
    const userId = await requireUserId(ctx);

    // Idempotent: deleting an already-deleted row is a no-op, not an error.
    // The client may retry (network blip, double-tap) and must not see a
    // "Couldn't delete" toast just because the row already went.
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) {
      // Distinct from auth — caller is signed in but doesn't own this row.
      throw new Error("Not authorized to delete this session");
    }

    // Legacy single-media attachment. Storage object may already be gone if
    // the row was edited via updateCalendarEntry(mediaStorageId: null) and
    // the file was reaped — swallow that specific error and continue.
    if (row.mediaStorageId) {
      try {
        await ctx.storage.delete(row.mediaStorageId);
      } catch {
        /* already gone — fine */
      }
    }

    // Cascade-delete every multi-attachment media row for this session,
    // freeing the storage objects too. Without this, deleting a session
    // leaks the photo/video bytes forever.
    //
    // EVERY step here is wrapped: a concurrent `removeSessionMedia` from
    // another tab can race us between `.collect()` and `.delete(a._id)`,
    // and an unwrapped throw there used to abort the whole transactional
    // mutation — surfacing as the "Couldn't delete session — Check your
    // connection" toast even though nothing was wrong with the network.
    const attachments = await ctx.db
      .query("session_media")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect();
    for (const a of attachments) {
      try {
        await ctx.storage.delete(a.storageId);
      } catch {
        /* storage object already gone — fine */
      }
      try {
        await ctx.db.delete(a._id);
      } catch {
        /* row already deleted by a concurrent mutation — fine */
      }
    }

    // Final delete of the session row itself. Wrapped for the same race —
    // if a parallel call already removed it, treat as success.
    try {
      await ctx.db.delete(id);
    } catch {
      /* already gone — fine */
    }
  },
});

// ───────────────────────────────────────────────────────────────────────
// session_media — multi-attachment photo/video on a logged session
// ───────────────────────────────────────────────────────────────────────

/**
 * Persist a freshly uploaded media file against a session. Caller already
 * minted a one-time URL via `generateMediaUploadUrl` and POSTed the bytes
 * — they pass the resulting storageId here together with the session id
 * and the kind (photo|video, derived from the file's MIME type).
 */
export const addSessionMedia = mutation({
  args: {
    sessionId: v.id("fight_camp_calendar"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("photo"), v.literal("video")),
    capturedAt: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, storageId, kind, capturedAt, caption }) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.userId !== userId) throw new Error("Not authorized");
    return await ctx.db.insert("session_media", {
      sessionId,
      userId,
      storageId,
      kind,
      capturedAt: capturedAt ?? session.date,
      caption: caption?.trim() || undefined,
    });
  },
});

/**
 * Remove one media attachment. Deletes the underlying storage object
 * before the row so an aborted call can't leave a row pointing at a
 * dead storage id.
 */
export const removeSessionMedia = mutation({
  args: { mediaId: v.id("session_media") },
  handler: async (ctx, { mediaId }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(mediaId);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    try {
      await ctx.storage.delete(row.storageId);
    } catch {
      /* already gone */
    }
    await ctx.db.delete(mediaId);
  },
});

/**
 * All media rows for one session, oldest → newest. Each row resolves its
 * storage id to a long-lived URL so the client renders <img>/<video>
 * directly without an extra round-trip.
 */
export const listSessionMedia = query({
  args: { sessionId: v.id("fight_camp_calendar") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return [];
    const rows = await ctx.db
      .query("session_media")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        sessionId: r.sessionId,
        kind: r.kind,
        capturedAt: r.capturedAt,
        caption: r.caption ?? null,
        url: await ctx.storage.getUrl(r.storageId),
        createdAt: r._creationTime,
      })),
    );
  },
});

/**
 * Library view: every media attachment the user owns, newest first, with
 * the parent session's discipline + date joined in. Optional
 * `disciplineFilter` scopes to one session_type ("BJJ", "Boxing", ...).
 *
 * Pagination is intentionally simple (offset-style via `limit`) — we
 * expect typical libraries < 1000 items in the first year and the
 * library page renders the full list with virtualisation handled by
 * `content-visibility: auto`. Switch to a cursor pattern if libraries
 * grow large enough that this becomes a hot path.
 */
export const listMyMediaLibrary = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    disciplineFilter: v.optional(v.string()),
  },
  handler: async (ctx, { limit, cursor, disciplineFilter }) => {
    const userId = await requireUserId(ctx);
    const cap = Math.min(Math.max(limit ?? 60, 10), 100);
    const page = await ctx.db
      .query("session_media")
      .withIndex("by_user_captured", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({ numItems: cap, cursor: cursor ?? null });
    const rows = page.page;

    // Batch-load all unique sessions in one parallel pass instead of N awaits.
    const uniqueSessionIds = Array.from(
      new Set(rows.map((r) => r.sessionId as unknown as string)),
    );
    const sessionDocs = await Promise.all(
      uniqueSessionIds.map((sid) => ctx.db.get(sid as any)),
    );
    const sessions = new Map<string, any>();
    uniqueSessionIds.forEach((sid, i) => {
      const doc = sessionDocs[i];
      if (doc) sessions.set(sid, doc);
    });

    const results = await Promise.all(
      rows.map(async (r) => {
        const s = sessions.get(r.sessionId as unknown as string);
        return {
          id: r._id,
          sessionId: r.sessionId,
          kind: r.kind,
          capturedAt: r.capturedAt,
          caption: r.caption ?? null,
          url: await ctx.storage.getUrl(r.storageId),
          sessionType: (s?.sessionType as string) ?? null,
          sessionDate: (s?.date as string) ?? r.capturedAt,
          sessionNotes: (s?.notes as string | undefined) ?? null,
        };
      }),
    );
    const filtered =
      disciplineFilter && disciplineFilter !== "all"
        ? results.filter((r) => r.sessionType === disciplineFilter)
        : results;
    return {
      page: filtered,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Distinct discipline labels (session_type) the user has at least one
 * media attachment for. Powers the filter chip row on the library page
 * — only shows chips that actually have media behind them.
 */
export const listMediaDisciplines = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("session_media")
      .withIndex("by_user_captured", (q) => q.eq("userId", userId))
      .take(500);
    const sessionIds = new Set(rows.map((r) => r.sessionId as unknown as string));
    const disciplines = new Set<string>();
    for (const sid of sessionIds) {
      const s = await ctx.db.get(sid as any);
      if (s && (s as any).sessionType) {
        disciplines.add((s as any).sessionType as string);
      }
    }
    return Array.from(disciplines).sort();
  },
});

// ───────────────────────────────────────────────────────────────────────
// fight_week_logs
// ───────────────────────────────────────────────────────────────────────

export const listWeekLogs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Bounded — fight-week is at most ~10 days; 60 is generous.
    const rows = await ctx.db
      .query("fight_week_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
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
    const cap = Math.min(Math.max(limit ?? 20, 1), 100);
    const rows = await ctx.db
      .query("training_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId))
      .order("desc")
      .take(cap);
    return rows;
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
