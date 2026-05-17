/**
 * Gym social feed — Instagram/TikTok-style chronological surface of every
 * gym member's training-session media.
 *
 * Architecture (see data-model brainstorm in the audit report):
 *
 *   ┌──────────────────┐   uploadSessionMediaV2   ┌─────────────────────┐
 *   │ fighter taps     │ ───────────────────────▶ │ session_media row   │
 *   │ "Add photo"      │                          │ (gymId stamped at   │
 *   └──────────────────┘                          │  insert time)       │
 *                                                 └─────────────────────┘
 *                                                          │
 *                                                          ▼
 *   ┌──────────────────┐    listFeed(gymId)        ┌─────────────────────┐
 *   │ gym member opens │ ─────────────────────────▶│ by_gym_created      │
 *   │ feed page        │ ◀─────────────────────────│ index scan (DESC)    │
 *   └──────────────────┘    paginated cursor       │ → 20 docs + author/  │
 *                                                  │   session join       │
 *                                                  └─────────────────────┘
 *
 * Why no separate `gym_feed_posts` denormalised table:
 *   - 1k users / 100 gyms / 100 posts/day/gym = ~10k posts/day. A fan-out
 *     write to every member would explode writes; a single index row per
 *     post is enough because the feed is whole-gym public.
 *   - The `by_gym_created` index turns "newest 20 in gym X" into exactly
 *     20 doc reads + 40 join reads (author + session metadata) per page.
 *
 * Out of scope for v1 (deferred): likes, comments, reposts, per-post
 * privacy toggle, push notifications. Schema supports adding all of these
 * later without a migration.
 */
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireGymViewer } from "./lib/gymAccess";

/**
 * Paginated, newest-first feed of media posts from a single gym. The
 * `cursor` + `numItems` shape matches Convex's standard `paginate()` API
 * so the client can use `usePaginatedQuery` directly.
 *
 * Each returned post carries:
 *  - the resolved media URL (from Convex File Storage)
 *  - a lightweight author block (displayName + avatar URL — no email)
 *  - the parent session's headline metadata (sessionType / RPE / duration)
 *
 * "private" rows and rows whose `gymId` has been nulled by the 90-day
 * archive cron drop out automatically because they're missing from the
 * `by_gym_created` index.
 */
export const listFeed = query({
  args: {
    gymId: v.id("gyms"),
    // Convex's `usePaginatedQuery` injects its own bookkeeping fields
    // (notably `id`) into the paginationOpts payload — using the SDK's
    // canonical validator is the only safe option. Hand-rolling `v.object`
    // here rejects those extra fields with an ArgumentValidationError.
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { gymId, paginationOpts }) => {
    const { userId: viewerId } = await requireGymViewer(ctx, gymId);

    // Bound the page size — clients can request anything but we cap server
    // side so a runaway pagination call can't pull thousands of rows.
    const numItems = Math.min(Math.max(paginationOpts.numItems, 1), 50);

    const page = await ctx.db
      .query("session_media")
      .withIndex("by_gym_created", (q) => q.eq("gymId", gymId))
      .order("desc")
      .filter((q) => q.neq(q.field("visibility"), "private"))
      .paginate({ cursor: paginationOpts.cursor, numItems });

    const posts = await Promise.all(
      page.page.map(async (m) => {
        const [profile, session, viewerLike] = await Promise.all([
          ctx.db
            .query("profiles")
            .withIndex("by_user", (q) => q.eq("userId", m.userId))
            .unique(),
          ctx.db.get(m.sessionId),
          // O(1) point lookup — "did the calling user like this post?".
          // One extra index probe per post (~20 per page) is well inside
          // the per-query budget.
          ctx.db
            .query("feed_likes")
            .withIndex("by_post_user", (q) =>
              q.eq("postId", m._id).eq("userId", viewerId),
            )
            .unique(),
        ]);
        const [mediaUrl, avatarUrl] = await Promise.all([
          ctx.storage.getUrl(m.storageId),
          profile?.avatarStorageId
            ? ctx.storage.getUrl(profile.avatarStorageId)
            : Promise.resolve(null),
        ]);
        return {
          id: m._id,
          createdAt: m._creationTime,
          kind: m.kind,
          url: mediaUrl,
          caption: m.caption ?? null,
          author: {
            userId: m.userId,
            displayName: profile?.displayName ?? "Athlete",
            avatarUrl,
          },
          session: session
            ? {
                id: session._id,
                date: session.date,
                sessionType: session.sessionType,
                rpe: session.rpe,
                durationMinutes: session.durationMinutes,
              }
            : null,
          likeCount: m.likeCount ?? 0,
          commentCount: m.commentCount ?? 0,
          viewerLiked: !!viewerLike,
        };
      }),
    );

    return {
      page: posts,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Lightweight version of `listFeed` returning just the latest N posts as
 * thumbnails. Used by the coach dashboard widget to render a horizontal
 * preview row without paginating. Same access check.
 */
export const recentForCoachWidget = query({
  args: { gymId: v.id("gyms"), limit: v.optional(v.number()) },
  handler: async (ctx, { gymId, limit }) => {
    await requireGymViewer(ctx, gymId);
    const cap = Math.min(Math.max(limit ?? 6, 1), 12);
    const rows = await ctx.db
      .query("session_media")
      .withIndex("by_gym_created", (q) => q.eq("gymId", gymId))
      .order("desc")
      .filter((q) => q.neq(q.field("visibility"), "private"))
      .take(cap);
    return await Promise.all(
      rows.map(async (m) => ({
        id: m._id,
        kind: m.kind,
        url: await ctx.storage.getUrl(m.storageId),
        createdAt: m._creationTime,
        userId: m.userId,
      })),
    );
  },
});
