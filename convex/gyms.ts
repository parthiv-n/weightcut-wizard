/**
 * Gym queries + mutations.
 *
 * Replaces Supabase `gyms` table CRUD and the `my_gyms_overview` RPC.
 * Invite codes are 6-character alphanumeric. Generated client-side with a
 * retry-on-collision loop — the schema's by_invite_code unique semantic is
 * enforced here in application code (Convex has no UNIQUE constraints).
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";

// Match CoachSetup.tsx alphabet (no ambiguous chars: 0/O, 1/I/L)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

function generateCodeString(): string {
  let out = "";
  // Math.random is fine here — collision probability is < 1 in 30^6, and
  // the loop in `generateUniqueInviteCode` retries on the rare collision.
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

async function generateUniqueInviteCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCodeString();
    const existing = await ctx.db
      .query("gyms")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique invite code after 10 attempts");
}

// ─────────────────────────────────────────────────────────────────────────
// Shape helpers — return snake_case to match the existing client code so
// no React component rewrites are required for shape.
// ─────────────────────────────────────────────────────────────────────────

function toClientGym(row: Doc<"gyms">, logoUrl: string | null = null) {
  return {
    id: row._id,
    name: row.name,
    owner_user_id: row.ownerUserId,
    invite_code: row.inviteCode,
    location: row.location ?? null,
    logo_url: logoUrl,
    updated_at: row.updatedAt,
    created_at: row._creationTime,
  };
}

/**
 * Resolve a gym's logo storage id to a long-lived URL via Convex File
 * Storage. Returns null if no logo is set (or if the storage object has
 * been deleted out-of-band).
 */
async function getGymLogoUrl(
  ctx: QueryCtx | MutationCtx,
  gym: Doc<"gyms">,
): Promise<string | null> {
  if (!gym.logoStorageId) return null;
  return await ctx.storage.getUrl(gym.logoStorageId);
}

// ─────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────

/**
 * All gyms the current user is part of (as owner OR active member). Returns
 * the gym row enriched with member metadata (memberId, joined_at, share_data)
 * and the coach's display name. Replicates the SQL `my_gyms_overview` RPC.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    // 1. Find every active membership for this user.
    const memberships = await ctx.db
      .query("gym_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // 2. Fan-out fetch each gym + its owner profile (for coach name).
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const gym = await ctx.db.get(m.gymId);
        if (!gym) return null;
        const [coachProfile, logoUrl] = await Promise.all([
          ctx.db
            .query("profiles")
            .withIndex("by_user", (q) => q.eq("userId", gym.ownerUserId))
            .unique(),
          getGymLogoUrl(ctx, gym),
        ]);
        return {
          member_id: m._id,
          gym_id: gym._id,
          gym_name: gym.name,
          gym_location: gym.location ?? null,
          gym_logo_url: logoUrl,
          coach_user_id: gym.ownerUserId,
          coach_name: coachProfile?.displayName ?? null,
          share_data: !!m.shareData,
          joined_at: new Date(m.joinedAt).toISOString(),
        };
      }),
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1));
  },
});

export const getById = query({
  args: { gymId: v.id("gyms") },
  handler: async (ctx, { gymId }) => {
    await requireUserId(ctx);
    const gym = await ctx.db.get(gymId);
    if (!gym) return null;
    return toClientGym(gym, await getGymLogoUrl(ctx, gym));
  },
});

/**
 * Look up a gym by invite code (for the JoinGym preview card). No auth gate
 * — invite codes are intentionally guessable-but-rate-limited; pre-auth
 * users hit this from the JoinGym landing.
 */
export const getByInviteCode = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== CODE_LEN) return null;
    const gym = await ctx.db
      .query("gyms")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();
    if (!gym) return null;
    return toClientGym(gym, await getGymLogoUrl(ctx, gym));
  },
});

/** Gyms owned by the current coach. Used by CoachDashboard. */
export const listOwned = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("gyms")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    const sorted = rows.sort((a, b) => a._creationTime - b._creationTime);
    return Promise.all(
      sorted.map(async (g) => toClientGym(g, await getGymLogoUrl(ctx, g))),
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a gym. Promotes the current user to `role: "coach"` (idempotent)
 * and inserts them into `gym_members` as a coach member of the new gym.
 * Replaces the multi-step CoachSetup flow in one atomic Convex mutation.
 */
export const create = mutation({
  args: {
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, { name, location }) => {
    const userId = await requireUserId(ctx);
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Gym name is required");

    // 1. Promote the calling user to `coach` role (idempotent).
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile && profile.role !== "coach") {
      await ctx.db.patch(profile._id, {
        role: "coach",
        updatedAt: Date.now(),
      });
    }

    // 2. Insert the gym with a unique invite code.
    const inviteCode = await generateUniqueInviteCode(ctx);
    const gymId = await ctx.db.insert("gyms", {
      name: trimmedName,
      ownerUserId: userId,
      inviteCode,
      location: location?.trim() || undefined,
      updatedAt: Date.now(),
    });

    // 3. Add the coach as a coach-role member of their own gym.
    await ctx.db.insert("gym_members", {
      gymId,
      userId,
      memberRole: "coach",
      status: "active",
      shareData: true,
      joinedAt: Date.now(),
    });

    const gym = await ctx.db.get(gymId);
    if (!gym) return null;
    return toClientGym(gym, await getGymLogoUrl(ctx, gym));
  },
});

/** Coach-only: update gym fields (name / location only — logo goes through
 *  the dedicated `setLogo` storage mutation below). */
export const update = mutation({
  args: {
    gymId: v.id("gyms"),
    name: v.optional(v.string()),
    location: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { gymId, name, location }) => {
    const userId = await requireUserId(ctx);
    const gym = await ctx.db.get(gymId);
    if (!gym) throw new Error("Gym not found");
    if (gym.ownerUserId !== userId) {
      throw new Error("Only the gym owner can update this gym");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const t = name.trim();
      if (!t) throw new Error("Gym name cannot be empty");
      patch.name = t;
    }
    if (location !== undefined) {
      patch.location = location === null ? undefined : location.trim() || undefined;
    }
    await ctx.db.patch(gymId, patch as any);
  },
});

/**
 * Step 1 of the gym-logo upload flow: returns a one-time POST URL. Gated
 * to the gym owner so randoms can't burn through quota.
 */
export const generateLogoUploadUrl = mutation({
  args: { gymId: v.id("gyms") },
  handler: async (ctx, { gymId }) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2 of the gym-logo upload flow: persist the `storageId`. Deletes the
 * previous logo storage BEFORE patching the new id so a race-condition
 * never orphans the old file. Pass `storageId: null` to clear the logo.
 */
export const setLogo = mutation({
  args: {
    gymId: v.id("gyms"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, { gymId, storageId }) => {
    const userId = await requireUserId(ctx);
    const gym = await assertGymOwner(ctx, gymId, userId);

    if (gym.logoStorageId && gym.logoStorageId !== storageId) {
      try {
        await ctx.storage.delete(gym.logoStorageId);
      } catch {
        /* prior file already missing — ignore */
      }
    }

    await ctx.db.patch(gymId, {
      logoStorageId: storageId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Join (or re-join) a gym via invite code. Idempotent — re-joining flips
 * status back to "active" if the user was previously "removed". Replaces
 * the JoinGym.tsx upsert into gym_members.
 */
export const joinByInviteCode = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const userId = await requireUserId(ctx);
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== CODE_LEN) throw new Error("Invalid invite code");

    const gym = await ctx.db
      .query("gyms")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();
    if (!gym) throw new Error("Invite code not recognised");

    const existing = await ctx.db
      .query("gym_members")
      .withIndex("by_gym_user", (q) =>
        q.eq("gymId", gym._id).eq("userId", userId),
      )
      .unique();

    if (existing) {
      // Re-activate a previously-removed membership; preserve role.
      await ctx.db.patch(existing._id, {
        status: "active",
        shareData: true,
        joinedAt: Date.now(),
      });
      return { gymId: gym._id, memberId: existing._id };
    }

    const memberId = await ctx.db.insert("gym_members", {
      gymId: gym._id,
      userId,
      memberRole: "athlete",
      status: "active",
      shareData: true,
      joinedAt: Date.now(),
    });
    return { gymId: gym._id, memberId };
  },
});

/**
 * Re-roll a gym's invite code (coach-only). Useful if the existing code
 * has been leaked. Returns the new code.
 */
export const regenerateInviteCode = mutation({
  args: { gymId: v.id("gyms") },
  handler: async (ctx, { gymId }) => {
    const userId = await requireUserId(ctx);
    const gym = await ctx.db.get(gymId);
    if (!gym) throw new Error("Gym not found");
    if (gym.ownerUserId !== userId) {
      throw new Error("Only the gym owner can regenerate the invite code");
    }
    const newCode = await generateUniqueInviteCode(ctx);
    await ctx.db.patch(gymId, { inviteCode: newCode, updatedAt: Date.now() });
    return newCode;
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Helper exports for cross-module use (announcements, coach.ts).
// Not exported as Convex functions.
// ─────────────────────────────────────────────────────────────────────────

export async function assertGymOwner(
  ctx: QueryCtx | MutationCtx,
  gymId: Id<"gyms">,
  userId: Id<"users">,
): Promise<Doc<"gyms">> {
  const gym = await ctx.db.get(gymId);
  if (!gym) throw new Error("Gym not found");
  if (gym.ownerUserId !== userId) {
    throw new Error("Only the gym owner can perform this action");
  }
  return gym;
}

export async function assertGymMember(
  ctx: QueryCtx | MutationCtx,
  gymId: Id<"gyms">,
  userId: Id<"users">,
): Promise<Doc<"gym_members">> {
  const member = await ctx.db
    .query("gym_members")
    .withIndex("by_gym_user", (q) => q.eq("gymId", gymId).eq("userId", userId))
    .unique();
  if (!member || member.status !== "active") {
    throw new Error("Not a member of this gym");
  }
  return member;
}
