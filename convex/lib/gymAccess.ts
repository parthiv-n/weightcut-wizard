/**
 * Shared gym-membership access guard.
 *
 * Any Convex function that reads or writes gym-scoped data (the social
 * feed, leaderboards, announcements, likes, comments, engagement counts)
 * must call this first. It enforces the "active member of THIS gym"
 * invariant via a single indexed point read.
 *
 * Lives here (not inside `gymFeed.ts`) so cross-module consumers like
 * `feedSocial.ts` can import the same check without circular deps.
 */
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireUserId } from "./auth";

export async function requireGymViewer(
  ctx: QueryCtx | MutationCtx,
  gymId: Id<"gyms">,
) {
  const userId = await requireUserId(ctx);
  const membership = await ctx.db
    .query("gym_members")
    .withIndex("by_gym_user", (q) => q.eq("gymId", gymId).eq("userId", userId))
    .unique();
  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this gym");
  }
  return { userId, membership };
}
