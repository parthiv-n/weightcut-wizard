/**
 * Push notification tokens. One row per (userId, token) — re-registering
 * with the same token just bumps `lastSeenAt`.
 */
import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("device_tokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web"),
    ),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("device_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        platform: args.platform,
        appVersion: args.appVersion,
        lastSeenAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("device_tokens", {
      userId,
      token: args.token,
      platform: args.platform,
      appVersion: args.appVersion,
      lastSeenAt: now,
    });
  },
});

export const removeToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("device_tokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(row._id);
  },
});

// ─────────────────────────────────────────────────────────────────────────
// INTERNAL — called from the push-fanout action.
// ─────────────────────────────────────────────────────────────────────────

/** Fetch every device_token row for a set of users — input to the push
 *  fan-out action. Returns flat rows so the action can route per platform. */
export const listForUsers = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const out: {
      userId: string;
      token: string;
      platform: "ios" | "android" | "web";
    }[] = [];
    for (const uid of userIds) {
      const rows = await ctx.db
        .query("device_tokens")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      for (const r of rows) {
        out.push({ userId: r.userId, token: r.token, platform: r.platform });
      }
    }
    return out;
  },
});

/** Internal token removal — called from the push fanout action when APNs
 *  returns 410 Gone (token expired/uninstalled). Skips the per-user auth
 *  check that the public `removeToken` mutation enforces. */
export const removeTokenInternal = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("device_tokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});
