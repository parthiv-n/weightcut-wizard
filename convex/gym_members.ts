/**
 * Gym membership queries + mutations.
 *
 * Membership controls coach <-> athlete visibility. `shareData` is the
 * athlete-side privacy gate; flipping it false hides their weight/meal/etc
 * from the coach (enforced in coach.ts aggregation queries).
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { assertGymOwner, assertGymMember } from "./gyms";

function toClientMember(row: Doc<"gym_members">) {
  return {
    id: row._id,
    gym_id: row.gymId,
    user_id: row.userId,
    member_role: row.memberRole,
    status: row.status,
    share_data: row.shareData,
    joined_at: new Date(row.joinedAt).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────

/** Coach-only: list members of a gym (with display_name + avatar joined). */
export const listForGym = query({
  args: { gymId: v.id("gyms") },
  handler: async (ctx, { gymId }) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);

    const members = await ctx.db
      .query("gym_members")
      .withIndex("by_gym", (q) => q.eq("gymId", gymId))
      .collect();

    return Promise.all(
      members.map(async (m) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", m.userId))
          .unique();
        const avatarUrl = profile?.avatarStorageId
          ? await ctx.storage.getUrl(profile.avatarStorageId)
          : null;
        return {
          ...toClientMember(m),
          display_name: profile?.displayName ?? null,
          avatar_url: avatarUrl,
        };
      }),
    );
  },
});

/** Current user's membership row for a specific gym (or null). */
export const getMineForGym = query({
  args: { gymId: v.id("gyms") },
  handler: async (ctx, { gymId }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("gym_members")
      .withIndex("by_gym_user", (q) =>
        q.eq("gymId", gymId).eq("userId", userId),
      )
      .unique();
    return row ? toClientMember(row) : null;
  },
});

// ─────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Coach-only: directly add a member to a gym. Most flows use
 * `gyms.joinByInviteCode` instead, but this lets the coach onboard an
 * athlete by user-id (e.g. internal admin tooling).
 */
export const addMember = mutation({
  args: {
    gymId: v.id("gyms"),
    userId: v.id("users"),
    memberRole: v.union(v.literal("coach"), v.literal("athlete")),
  },
  handler: async (ctx, { gymId, userId: targetUserId, memberRole }) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);

    const existing = await ctx.db
      .query("gym_members")
      .withIndex("by_gym_user", (q) =>
        q.eq("gymId", gymId).eq("userId", targetUserId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        memberRole,
        status: "active",
        joinedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("gym_members", {
      gymId,
      userId: targetUserId,
      memberRole,
      status: "active",
      shareData: true,
      joinedAt: Date.now(),
    });
  },
});

/**
 * Remove a member from a gym (soft-delete: status = "removed").
 *
 * Permissions:
 *   - Coach (gym owner): can remove anyone except themselves.
 *   - Member: can "leave" by removing themselves.
 */
export const removeMember = mutation({
  args: { memberId: v.id("gym_members") },
  handler: async (ctx, { memberId }) => {
    const userId = await requireUserId(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");

    const gym = await ctx.db.get(member.gymId);
    if (!gym) throw new Error("Gym not found");

    const isOwner = gym.ownerUserId === userId;
    const isSelf = member.userId === userId;
    if (!isOwner && !isSelf) {
      throw new Error("Cannot remove this member");
    }
    if (isOwner && isSelf) {
      throw new Error("Gym owner cannot remove themselves");
    }

    await ctx.db.patch(memberId, { status: "removed" });
  },
});

/**
 * Convenience: remove a gym member by user id (used by AthleteDetail's
 * "remove athlete" button which has athleteUserId in scope, not memberId).
 */
export const removeAthleteByUserId = mutation({
  args: { gymId: v.id("gyms"), athleteUserId: v.id("users") },
  handler: async (ctx, { gymId, athleteUserId }) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);
    const member = await ctx.db
      .query("gym_members")
      .withIndex("by_gym_user", (q) =>
        q.eq("gymId", gymId).eq("userId", athleteUserId),
      )
      .unique();
    if (!member) throw new Error("Athlete is not in this gym");
    await ctx.db.patch(member._id, { status: "removed" });
  },
});

/**
 * Variant used by MyGym's AthleteDetail flow when the coach doesn't know
 * the specific gym — finds the active membership across all of this
 * coach's gyms and removes it. Resolves the ambiguity in
 * AthleteDetail.tsx's original `.update().eq("user_id", athleteId)` which
 * relied on RLS to scope the update.
 */
export const removeAthleteFromMyGyms = mutation({
  args: { athleteUserId: v.id("users") },
  handler: async (ctx, { athleteUserId }) => {
    const userId = await requireUserId(ctx);
    // All gyms this user owns
    const ownedGyms = await ctx.db
      .query("gyms")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    let removed = 0;
    for (const gym of ownedGyms) {
      const member = await ctx.db
        .query("gym_members")
        .withIndex("by_gym_user", (q) =>
          q.eq("gymId", gym._id).eq("userId", athleteUserId),
        )
        .unique();
      if (member && member.status === "active") {
        await ctx.db.patch(member._id, { status: "removed" });
        removed += 1;
      }
    }
    if (removed === 0) throw new Error("Athlete not found in any of your gyms");
    return removed;
  },
});

/** Coach-only: change a member's role. */
export const updateRole = mutation({
  args: {
    memberId: v.id("gym_members"),
    memberRole: v.union(v.literal("coach"), v.literal("athlete")),
  },
  handler: async (ctx, { memberId, memberRole }) => {
    const userId = await requireUserId(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await assertGymOwner(ctx, member.gymId, userId);
    await ctx.db.patch(memberId, { memberRole });
  },
});

/**
 * Athlete-only: toggle the data-sharing flag for one of their gyms. When
 * false the coach aggregation queries hide weight/meal/training data for
 * this athlete (the membership row still exists).
 */
export const setShareData = mutation({
  args: { memberId: v.id("gym_members"), shareData: v.boolean() },
  handler: async (ctx, { memberId, shareData }) => {
    const userId = await requireUserId(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    if (member.userId !== userId) {
      throw new Error("Only the member can change their share-data setting");
    }
    await ctx.db.patch(memberId, { shareData });
  },
});

// Re-export so other modules importing membership helpers stay tidy.
export { assertGymMember };
