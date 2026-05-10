/**
 * Announcement poll queries + mutations.
 *
 * Polls are scoped to a single announcement (`kind: "poll"`). Voting is
 * one-vote-per-user; re-voting transparently moves the vote to the new
 * option. The poll creator (gym owner) can append additional options to
 * an existing poll.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { assertGymOwner, assertGymMember } from "./gyms";

// ─────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────

/**
 * Poll options + per-option vote counts + the caller's vote (if any).
 * This is the read-side equivalent of the SQL view that joined options
 * with COUNT(*) over votes.
 */
export const getResults = query({
  args: { announcementId: v.id("gym_announcements") },
  handler: async (ctx, { announcementId }) => {
    const userId = await requireUserId(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) throw new Error("Poll not found");
    if (announcement.kind !== "poll") throw new Error("Not a poll");

    // Visibility check — same gate as listForUser.
    if (announcement.isBroadcast) {
      await assertGymMember(ctx, announcement.gymId, userId);
    } else {
      const target = await ctx.db
        .query("gym_announcement_targets")
        .withIndex("by_announcement_user", (q) =>
          q.eq("announcementId", announcementId).eq("userId", userId),
        )
        .unique();
      // Coach (owner) can always see poll results.
      const gym = await ctx.db.get(announcement.gymId);
      const isOwner = gym?.ownerUserId === userId;
      if (!target && !isOwner) throw new Error("Cannot view this poll");
    }

    const options = await ctx.db
      .query("announcement_poll_options")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    const votes = await ctx.db
      .query("announcement_poll_votes")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();

    const counts = new Map<string, number>();
    for (const v of votes) {
      counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
    }
    const myVote = votes.find((v) => v.voterUserId === userId);

    return {
      announcement_id: announcementId,
      total_votes: votes.length,
      my_option_id: myVote?.optionId ?? null,
      options: options
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          id: o._id,
          option_text: o.optionText,
          position: o.position,
          vote_count: counts.get(o._id) ?? 0,
        })),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cast (or change) a vote on a poll. One vote per user per poll; re-voting
 * is allowed and transparently moves the user's vote to the new option.
 */
export const vote = mutation({
  args: {
    announcementId: v.id("gym_announcements"),
    optionId: v.id("announcement_poll_options"),
  },
  handler: async (ctx, { announcementId, optionId }) => {
    const userId = await requireUserId(ctx);

    const announcement = await ctx.db.get(announcementId);
    if (!announcement) throw new Error("Poll not found");
    if (announcement.kind !== "poll") throw new Error("Not a poll");
    if (announcement.expiresAt && announcement.expiresAt < Date.now()) {
      throw new Error("Poll has expired");
    }

    // Visibility gate — same as listForUser/getResults.
    if (announcement.isBroadcast) {
      await assertGymMember(ctx, announcement.gymId, userId);
    } else {
      const target = await ctx.db
        .query("gym_announcement_targets")
        .withIndex("by_announcement_user", (q) =>
          q.eq("announcementId", announcementId).eq("userId", userId),
        )
        .unique();
      if (!target) throw new Error("Cannot vote on this poll");
    }

    // Validate the option belongs to this poll.
    const option = await ctx.db.get(optionId);
    if (!option || option.announcementId !== announcementId) {
      throw new Error("Invalid poll option");
    }

    const existing = await ctx.db
      .query("announcement_poll_votes")
      .withIndex("by_announcement_voter", (q) =>
        q.eq("announcementId", announcementId).eq("voterUserId", userId),
      )
      .unique();

    if (existing) {
      if (existing.optionId === optionId) return existing._id;
      await ctx.db.patch(existing._id, { optionId });
      return existing._id;
    }
    return await ctx.db.insert("announcement_poll_votes", {
      announcementId,
      optionId,
      voterUserId: userId,
    });
  },
});

/**
 * Coach-only: append a new option to an existing poll. Position is set to
 * `max(existing positions) + 1`.
 */
export const addOption = mutation({
  args: {
    announcementId: v.id("gym_announcements"),
    optionText: v.string(),
  },
  handler: async (ctx, { announcementId, optionText }) => {
    const userId = await requireUserId(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) throw new Error("Poll not found");
    if (announcement.kind !== "poll") throw new Error("Not a poll");
    await assertGymOwner(ctx, announcement.gymId, userId);

    const text = optionText.trim();
    if (!text) throw new Error("Option text required");

    const existing = await ctx.db
      .query("announcement_poll_options")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    const nextPosition =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((o) => o.position)) + 1;
    return await ctx.db.insert("announcement_poll_options", {
      announcementId,
      optionText: text,
      position: nextPosition,
    });
  },
});
