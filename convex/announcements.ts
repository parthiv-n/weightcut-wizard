/**
 * Gym announcement queries + mutations.
 *
 * Replaces the Supabase `my_announcements` and `dismiss_announcement` RPCs.
 * Announcements are either:
 *   - broadcast (isBroadcast = true): visible to every active member of the
 *     gym, no targets rows.
 *   - targeted (isBroadcast = false): visible only to users referenced in
 *     `gym_announcement_targets`.
 *
 * Dismissals are per-user — once dismissed, the announcement does not
 * reappear in `listForUser` for that user.
 *
 * Reactivity replaces realtime channels: the React client subscribes to
 * `listForUser` via `useQuery`, and Convex automatically re-runs the query
 * (and re-renders the component) whenever any of the underlying tables
 * change. No manual fan-out.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { assertGymOwner, assertGymMember } from "./gyms";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────

/**
 * All announcements visible to the current user, newest first. Returns
 * the broadcast feed for every gym they're an active member of, PLUS
 * targeted announcements they were named in. Dismissed announcements are
 * filtered out. Replicates the SQL `my_announcements` RPC.
 *
 * For poll-kind announcements, the result also carries the poll options
 * with their current vote counts and whether the caller has voted.
 */
export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const cap = Math.min(limit ?? 50, 200);

    // 1. Memberships → list of gym ids for broadcast feed.
    const memberships = await ctx.db
      .query("gym_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const gymIds = memberships.map((m) => m.gymId);

    // 2. Broadcast announcements from every gym they're in.
    const broadcastResults = await Promise.all(
      gymIds.map((gid) =>
        ctx.db
          .query("gym_announcements")
          .withIndex("by_gym_created", (q) => q.eq("gymId", gid))
          .order("desc")
          .take(cap),
      ),
    );
    const broadcast = broadcastResults
      .flat()
      .filter((a) => a.isBroadcast);

    // 3. Targeted announcements aimed at this user.
    const targetRows = await ctx.db
      .query("gym_announcement_targets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const targeted = (
      await Promise.all(targetRows.map((t) => ctx.db.get(t.announcementId)))
    ).filter((a): a is Doc<"gym_announcements"> => a !== null);

    // 4. De-dup (a targeted announcement is never also broadcast, but be
    //    defensive) and sort by creation time desc.
    const seen = new Set<string>();
    const combined: Doc<"gym_announcements">[] = [];
    for (const a of [...broadcast, ...targeted]) {
      if (seen.has(a._id)) continue;
      seen.add(a._id);
      combined.push(a);
    }
    combined.sort((a, b) => b._creationTime - a._creationTime);

    // 5. Strip dismissed.
    const dismissals = await ctx.db
      .query("announcement_dismissals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const dismissedIds = new Set(dismissals.map((d) => d.announcementId));
    const visible = combined.filter((a) => !dismissedIds.has(a._id)).slice(0, cap);

    // 6. Drop expired (expiresAt < now) — soft-hidden.
    const now = Date.now();
    const live = visible.filter((a) => !a.expiresAt || a.expiresAt > now);

    // 7. Resolve sender + gym names; for poll kind, join options + vote stats.
    return Promise.all(
      live.map(async (a) => {
        const gym = await ctx.db.get(a.gymId);
        const senderProfile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", a.senderUserId))
          .unique();

        let pollOptions: {
          id: Id<"announcement_poll_options">;
          option_text: string;
          position: number;
          vote_count: number;
          voted_by_me: boolean;
        }[] = [];
        if (a.kind === "poll") {
          const options = await ctx.db
            .query("announcement_poll_options")
            .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
            .collect();
          const votes = await ctx.db
            .query("announcement_poll_votes")
            .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
            .collect();
          const counts = new Map<string, number>();
          for (const v of votes) {
            counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
          }
          const myVote = votes.find((v) => v.voterUserId === userId);
          pollOptions = options
            .sort((x, y) => x.position - y.position)
            .map((o) => ({
              id: o._id,
              option_text: o.optionText,
              position: o.position,
              vote_count: counts.get(o._id) ?? 0,
              voted_by_me: !!myVote && myVote.optionId === o._id,
            }));
        }

        return {
          id: a._id,
          gym_id: a.gymId,
          gym_name: gym?.name ?? "",
          sender_user_id: a.senderUserId,
          sender_name: senderProfile?.displayName ?? "Coach",
          body: a.body ?? "",
          is_broadcast: a.isBroadcast,
          kind: a.kind,
          image_url: a.imageUrl ?? null,
          expires_at: a.expiresAt ?? null,
          created_at: new Date(a._creationTime).toISOString(),
          poll_options: pollOptions,
        };
      }),
    );
  },
});

/** Coach-only: list announcements they sent in a gym (history view). */
export const listForGym = query({
  args: { gymId: v.id("gyms"), limit: v.optional(v.number()) },
  handler: async (ctx, { gymId, limit }) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);
    const rows = await ctx.db
      .query("gym_announcements")
      .withIndex("by_gym_created", (q) => q.eq("gymId", gymId))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
    return rows.map((a) => ({
      id: a._id,
      gym_id: a.gymId,
      sender_user_id: a.senderUserId,
      body: a.body ?? "",
      is_broadcast: a.isBroadcast,
      kind: a.kind,
      image_url: a.imageUrl ?? null,
      expires_at: a.expiresAt ?? null,
      created_at: new Date(a._creationTime).toISOString(),
    }));
  },
});

// ─────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Coach-only: create an announcement. If `targetUserIds` is null/empty,
 * the announcement is broadcast to the whole gym. Otherwise, individual
 * rows are inserted into `gym_announcement_targets` for the named users.
 *
 * Replaces the `create_announcement` Postgres RPC.
 */
export const create = mutation({
  args: {
    gymId: v.id("gyms"),
    body: v.optional(v.string()),
    kind: v.optional(
      v.union(v.literal("text"), v.literal("image"), v.literal("poll")),
    ),
    imageUrl: v.optional(v.string()),
    targetUserIds: v.optional(v.array(v.id("users"))),
    pollOptions: v.optional(v.array(v.string())),
    expiresAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { gymId, body, kind, imageUrl, targetUserIds, pollOptions, expiresAt },
  ) => {
    const userId = await requireUserId(ctx);
    await assertGymOwner(ctx, gymId, userId);

    const resolvedKind = kind ?? "text";
    const trimmedBody = body?.trim() || undefined;

    if (resolvedKind === "text" && !trimmedBody) {
      throw new Error("Text announcement requires a body");
    }
    if (resolvedKind === "image" && !imageUrl) {
      throw new Error("Image announcement requires an image url");
    }
    if (resolvedKind === "poll") {
      if (!trimmedBody) throw new Error("Poll requires a question/body");
      if (!pollOptions || pollOptions.length < 2) {
        throw new Error("Poll requires at least 2 options");
      }
    }

    const isBroadcast = !targetUserIds || targetUserIds.length === 0;

    const announcementId = await ctx.db.insert("gym_announcements", {
      gymId,
      senderUserId: userId,
      body: trimmedBody,
      isBroadcast,
      kind: resolvedKind,
      imageUrl,
      expiresAt,
    });

    // Insert per-user target rows for targeted sends.
    if (!isBroadcast && targetUserIds) {
      for (const targetId of targetUserIds) {
        await ctx.db.insert("gym_announcement_targets", {
          announcementId,
          userId: targetId,
        });
      }
    }

    // Insert poll options.
    if (resolvedKind === "poll" && pollOptions) {
      for (let i = 0; i < pollOptions.length; i++) {
        const text = pollOptions[i].trim();
        if (!text) continue;
        await ctx.db.insert("announcement_poll_options", {
          announcementId,
          optionText: text,
          position: i,
        });
      }
    }

    // Fire-and-forget push fan-out. Scheduled (not awaited) so the mutation
    // returns immediately and the action's external HTTP calls don't bloat
    // the write-path latency.
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendAnnouncementPush.run,
      { announcementId },
    );

    return announcementId;
  },
});

/** Coach-only: edit announcement body/expiry. (Image + kind locked.) */
export const update = mutation({
  args: {
    announcementId: v.id("gym_announcements"),
    body: v.optional(v.string()),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { announcementId, body, expiresAt }) => {
    const userId = await requireUserId(ctx);
    const a = await ctx.db.get(announcementId);
    if (!a) throw new Error("Announcement not found");
    await assertGymOwner(ctx, a.gymId, userId);

    const patch: Record<string, unknown> = {};
    if (body !== undefined) patch.body = body.trim() || undefined;
    if (expiresAt !== undefined) {
      patch.expiresAt = expiresAt === null ? undefined : expiresAt;
    }
    await ctx.db.patch(announcementId, patch as any);
  },
});

/**
 * Coach-only: delete an announcement + cascade target/dismissal/poll rows.
 * Convex has no ON DELETE CASCADE — we hand-cascade in this mutation.
 */
export const deleteAnnouncement = mutation({
  args: { announcementId: v.id("gym_announcements") },
  handler: async (ctx, { announcementId }) => {
    const userId = await requireUserId(ctx);
    const a = await ctx.db.get(announcementId);
    if (!a) throw new Error("Announcement not found");
    await assertGymOwner(ctx, a.gymId, userId);

    const targets = await ctx.db
      .query("gym_announcement_targets")
      .withIndex("by_announcement", (q) =>
        q.eq("announcementId", announcementId),
      )
      .collect();
    for (const t of targets) await ctx.db.delete(t._id);

    const dismissals = await ctx.db
      .query("announcement_dismissals")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId),
      )
      .collect();
    for (const d of dismissals) await ctx.db.delete(d._id);

    const options = await ctx.db
      .query("announcement_poll_options")
      .withIndex("by_announcement", (q) =>
        q.eq("announcementId", announcementId),
      )
      .collect();
    for (const o of options) await ctx.db.delete(o._id);

    const votes = await ctx.db
      .query("announcement_poll_votes")
      .withIndex("by_announcement", (q) =>
        q.eq("announcementId", announcementId),
      )
      .collect();
    for (const v of votes) await ctx.db.delete(v._id);

    await ctx.db.delete(announcementId);
  },
});

/**
 * Per-user dismissal — the announcement remains in the DB but stops
 * appearing in this user's `listForUser`. Replaces the
 * `dismiss_announcement` RPC.
 *
 * Idempotent: dismissing twice is a no-op (returns the existing dismissal).
 * Verifies the user is allowed to see the announcement first — otherwise
 * a malicious client could fabricate dismissal rows.
 */
export const dismiss = mutation({
  args: { announcementId: v.id("gym_announcements") },
  handler: async (ctx, { announcementId }) => {
    const userId = await requireUserId(ctx);
    const a = await ctx.db.get(announcementId);
    if (!a) throw new Error("Announcement not found");

    // Verify visibility: either broadcast in a gym they're in, or named
    // as a target.
    if (a.isBroadcast) {
      await assertGymMember(ctx, a.gymId, userId);
    } else {
      const target = await ctx.db
        .query("gym_announcement_targets")
        .withIndex("by_announcement_user", (q) =>
          q.eq("announcementId", announcementId).eq("userId", userId),
        )
        .unique();
      if (!target) throw new Error("Cannot dismiss this announcement");
    }

    const existing = await ctx.db
      .query("announcement_dismissals")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId).eq("userId", userId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("announcement_dismissals", {
      announcementId,
      userId,
      dismissedAt: Date.now(),
    });
  },
});
