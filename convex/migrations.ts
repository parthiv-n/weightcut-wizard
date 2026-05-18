import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * One-time backfill that stamps `gymId` on existing `fight_camp_calendar`
 * rows by looking up each user's primary active gym_members row.
 *
 * Paginated and resumable via a `cursor` arg. Caller passes the previous
 * `continueCursor` back in until the mutation returns `done: true`.
 *
 * Run via:
 *   npx convex run migrations:backfillGymIdOnCalendar '{"cursor":null}'
 *   …repeat with the returned continueCursor until done.
 */
export const backfillGymIdOnCalendar = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("fight_camp_calendar")
      .paginate({ cursor, numItems: 200 });

    let stamped = 0;
    let skipped = 0;
    for (const row of page.page) {
      if (row.gymId) {
        skipped++;
        continue;
      }
      const membership = await ctx.db
        .query("gym_members")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      if (!membership) {
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, { gymId: membership.gymId });
      stamped++;
    }

    return {
      stamped,
      skipped,
      done: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Resumable backfill for `session_media.thumbStorageId` / `.thumbDataUrl`.
 *
 * Scope (v1, deliberately minimal):
 *   - Cursor-paginates `session_media` rows where `thumbStorageId` is
 *     missing.
 *   - Does NOT do server-side image processing — generating a 256px
 *     JPEG thumb requires Sharp/wasm + fetching the full asset out of
 *     Convex File Storage, which is heavy enough to be its own
 *     follow-up. v1 just marks rows as "thumb-pending" by leaving
 *     `thumbStorageId` undefined; the client falls back to the full
 *     image (the schema field is `v.optional`, and `gymFeed.listFeed`
 *     / `listProfilePosts` both already guard with `?? null`).
 *   - Future v2 will replace this body with a real action that calls
 *     out to a thumbnail service; the function signature + cursor
 *     contract stays identical so existing harness scripts keep
 *     working.
 *
 * Resumability mirrors `backfillGymIdOnCalendar`: caller passes the
 * previous `continueCursor` back until the mutation returns
 * `done: true`.
 *
 * Run via:
 *   npx convex run migrations:backfillSessionMediaThumbs '{"cursor":null}'
 *   …repeat with the returned continueCursor until done.
 */
export const backfillSessionMediaThumbs = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("session_media")
      .paginate({ cursor, numItems: 200 });

    // `touched` reserved for v2 — once a real thumb generator is wired
    // up, increment it on each successful patch so the runtime log
    // distinguishes "examined" from "actually-updated". v1 leaves it
    // at zero by design; the field is still returned so callers don't
    // need to special-case the v1 vs v2 response shape.
    const touched = 0;
    let skipped = 0;
    for (const row of page.page) {
      // Already has a thumb — nothing to do. Idempotent on re-runs.
      if (row.thumbStorageId || row.thumbDataUrl) {
        skipped++;
        continue;
      }
      // v1 no-op: we intentionally leave `thumbStorageId` /
      // `thumbDataUrl` unset so the client falls back to the full
      // image.
      skipped++;
    }

    return {
      touched,
      skipped,
      done: page.isDone,
      continueCursor: page.continueCursor,
      note: "v1 scaffold — no server-side thumbnail generation yet",
    };
  },
});
