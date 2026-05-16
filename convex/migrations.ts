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
