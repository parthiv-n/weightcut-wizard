/**
 * Push-fanout helper queries — lives outside `actions/` so it can run on the
 * default V8 runtime alongside the rest of the queries. The Node-runtime
 * action in `actions/sendAnnouncementPush.ts` calls these via
 * `ctx.runQuery(internal.pushFanout.*)`.
 */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const resolveTargets = internalQuery({
  args: { announcementId: v.id("gym_announcements") },
  handler: async (ctx, { announcementId }) => {
    const ann = await ctx.db.get(announcementId);
    if (!ann) return null;

    const gym = await ctx.db.get(ann.gymId);
    const senderProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", ann.senderUserId))
      .unique();

    // Recipients: explicit target rows, OR every active gym member when the
    // announcement is broadcast.
    let recipientUserIds: string[] = [];
    if (ann.isBroadcast) {
      const members = await ctx.db
        .query("gym_members")
        .withIndex("by_gym", (q) => q.eq("gymId", ann.gymId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
      recipientUserIds = members.map((m) => m.userId);
    } else {
      const targets = await ctx.db
        .query("gym_announcement_targets")
        .withIndex("by_announcement", (q) =>
          q.eq("announcementId", announcementId),
        )
        .collect();
      recipientUserIds = targets.map((t) => t.userId);
    }

    // Don't push to the sender themself.
    recipientUserIds = recipientUserIds.filter(
      (id) => id !== ann.senderUserId,
    );

    // Pull device tokens for every recipient — parallel fan-out so we don't
    // serialize N round trips when an announcement targets hundreds of users.
    const tokenRowsPerUser = (await Promise.all(
      recipientUserIds.map((uid) =>
        ctx.db
          .query("device_tokens")
          .withIndex("by_user", (q) => q.eq("userId", uid as any))
          .collect(),
      ),
    )) as Doc<"device_tokens">[][];
    const tokens: {
      userId: string;
      token: string;
      platform: "ios" | "android" | "web";
    }[] = [];
    for (const rows of tokenRowsPerUser) {
      for (const r of rows) {
        tokens.push({ userId: r.userId, token: r.token, platform: r.platform });
      }
    }

    return {
      gymName: gym?.name ?? "",
      senderName: senderProfile?.displayName ?? "Coach",
      body: ann.body ?? "",
      targets: tokens,
    };
  },
});
