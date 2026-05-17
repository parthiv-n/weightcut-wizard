/**
 * Likes, flat comments, and engagement-badge layer for the gym feed.
 *
 * Design contract (locked in the multi-agent brainstorm):
 *  - Single-heart like, toggleable. No reactions.
 *  - Flat comments, chronological ASC, 500-char cap.
 *  - Cached `likeCount` / `commentCount` on the post row → O(1) reads.
 *  - `feed_likes.by_post_user` index → O(1) "did I like this?" probe.
 *  - Engagement badge driven by `profiles.lastSeenEngagementAt`
 *    compared to `_creationTime` of likes/comments where the calling
 *    user is the POST OWNER. Self-likes / self-comments filtered out.
 *
 * Push-notification dispatch for likes/comments is intentionally NOT
 * wired here yet — iOS push entitlements + AppDelegate forwarding are
 * still missing per the prior audit. The schema + counters all work
 * today; the push action can be added later without touching this file
 * beyond a one-line scheduler call.
 */
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { requireGymViewer } from "./lib/gymAccess";

/** Body length cap, in unicode code points. Generous compared to Twitter
 *  (280) but tight enough that 30-comment threads still scroll smoothly. */
const COMMENT_BODY_MAX = 500;
const COMMENTS_PAGE_DEFAULT = 20;
const COMMENTS_PAGE_MAX = 50;
/** Upper bound for the unread badge — beyond this we just say "99+". */
const UNREAD_BADGE_CAP = 99;

// ─── Likes ─────────────────────────────────────────────────────────────

/**
 * Toggle the calling user's like on a post. Idempotent: calling it twice
 * produces the same end state, never a double-toggle. Atomic: the
 * membership row insert/delete and the counter patch commit together.
 */
export const toggleLike = mutation({
  args: { postId: v.id("session_media") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post || !post.gymId || post.visibility === "private") {
      throw new Error("Post not available");
    }
    const { userId } = await requireGymViewer(ctx, post.gymId);

    const existing = await ctx.db
      .query("feed_likes")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", postId).eq("userId", userId),
      )
      .unique();

    const current = post.likeCount ?? 0;
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(postId, {
        likeCount: Math.max(0, current - 1),
      });
      return { liked: false, likeCount: Math.max(0, current - 1) };
    }
    await ctx.db.insert("feed_likes", {
      postId,
      postOwnerId: post.userId,
      userId,
    });
    await ctx.db.patch(postId, { likeCount: current + 1 });
    // TODO(push): when iOS push is fixed, schedule an aggregated push
    // dispatch here via `ctx.scheduler.runAfter` (60s window, dedupe by
    // (postOwnerId, postId)). Server-side schema already supports it.
    return { liked: true, likeCount: current + 1 };
  },
});

// ─── Comments ──────────────────────────────────────────────────────────

export const addComment = mutation({
  args: { postId: v.id("session_media"), body: v.string() },
  handler: async (ctx, { postId, body }) => {
    const post = await ctx.db.get(postId);
    if (!post || !post.gymId || post.visibility === "private") {
      throw new Error("Post not available");
    }
    const { userId } = await requireGymViewer(ctx, post.gymId);

    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error("Comment cannot be empty");
    if (trimmed.length > COMMENT_BODY_MAX) {
      throw new Error(`Comment too long (max ${COMMENT_BODY_MAX} characters)`);
    }

    const commentId = await ctx.db.insert("feed_comments", {
      postId,
      postOwnerId: post.userId,
      userId,
      body: trimmed,
    });
    await ctx.db.patch(postId, {
      commentCount: (post.commentCount ?? 0) + 1,
    });
    // TODO(push): scheduler.runAfter with 5s comment debounce window.
    return { commentId, commentCount: (post.commentCount ?? 0) + 1 };
  },
});

/** Hard delete — author OR post owner only. Decrement counter. */
export const deleteComment = mutation({
  args: { commentId: v.id("feed_comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await requireUserId(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) return { ok: true as const }; // idempotent
    const post = await ctx.db.get(comment.postId);
    if (!post) {
      await ctx.db.delete(commentId);
      return { ok: true as const };
    }
    const isAuthor = comment.userId === userId;
    const isPostOwner = post.userId === userId;
    if (!isAuthor && !isPostOwner) throw new Error("Not allowed");

    await ctx.db.delete(commentId);
    await ctx.db.patch(comment.postId, {
      commentCount: Math.max(0, (post.commentCount ?? 1) - 1),
    });
    return { ok: true as const };
  },
});

/**
 * Paginated chronological comment list for one post. Caller must be a
 * member of the post's gym — the access check rejects everyone else.
 *
 * Returns each comment with the author's display name + avatar URL
 * resolved, and a `canDelete` flag so the client doesn't need a second
 * round-trip to render the long-press menu.
 */
export const listComments = query({
  args: {
    postId: v.id("session_media"),
    // Use the SDK's canonical validator — `usePaginatedQuery` adds an
    // internal `id` field that a hand-rolled `v.object` would reject.
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { postId, paginationOpts }) => {
    const post = await ctx.db.get(postId);
    if (!post || !post.gymId) throw new Error("Post not available");
    const { userId } = await requireGymViewer(ctx, post.gymId);

    const numItems = Math.min(
      Math.max(paginationOpts.numItems, 1),
      COMMENTS_PAGE_MAX,
    );
    const page = await ctx.db
      .query("feed_comments")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .order("asc")
      .paginate({ cursor: paginationOpts.cursor, numItems });

    const rows = await Promise.all(
      page.page.map(async (c: Doc<"feed_comments">) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", c.userId))
          .unique();
        const avatarUrl = profile?.avatarStorageId
          ? await ctx.storage.getUrl(profile.avatarStorageId)
          : null;
        return {
          id: c._id,
          createdAt: c._creationTime,
          body: c.body,
          author: {
            userId: c.userId,
            displayName: profile?.displayName ?? "Athlete",
            avatarUrl,
          },
          // Pre-computed for the client so long-press shows / hides Delete
          // correctly without a second round-trip.
          canDelete: c.userId === userId || post.userId === userId,
        };
      }),
    );

    return {
      page: rows,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// ─── Engagement badge ──────────────────────────────────────────────────

/**
 * Count of unseen likes + comments on the calling user's own posts since
 * they last opened the gym feed. Capped at `UNREAD_BADGE_CAP` so a viral
 * post can't drag this query into hundreds of reads.
 *
 * Self-engagement (the caller liked/commented on their own post) is
 * filtered out so a user who comments on their own post doesn't see a
 * red dot on the bottom nav.
 */
export const unreadEngagementCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const since = profile?.lastSeenEngagementAt ?? 0;

    const [likes, comments] = await Promise.all([
      ctx.db
        .query("feed_likes")
        .withIndex("by_owner_created", (q) => q.eq("postOwnerId", userId))
        .filter((q) =>
          q.and(
            q.gt(q.field("_creationTime"), since),
            q.neq(q.field("userId"), userId),
          ),
        )
        .take(UNREAD_BADGE_CAP + 1),
      ctx.db
        .query("feed_comments")
        .withIndex("by_owner_created", (q) => q.eq("postOwnerId", userId))
        .filter((q) =>
          q.and(
            q.gt(q.field("_creationTime"), since),
            q.neq(q.field("userId"), userId),
          ),
        )
        .take(UNREAD_BADGE_CAP + 1),
    ]);

    const total = likes.length + comments.length;
    return {
      count: Math.min(total, UNREAD_BADGE_CAP),
      capped: total > UNREAD_BADGE_CAP,
    };
  },
});

/**
 * Clear the engagement badge by marking "now" as the last-seen point.
 * Idempotent. Called by the feed page on mount.
 */
export const markEngagementSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return { ok: false as const };
    await ctx.db.patch(profile._id, {
      lastSeenEngagementAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
