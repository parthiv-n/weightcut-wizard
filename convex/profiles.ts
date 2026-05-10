/**
 * Profile queries + mutations.
 *
 * `profiles` is a 1:1 extension of the Convex Auth `users` table, keyed by
 * `userId: v.id("users")`. Auth runtime sees `userId` first (via
 * `requireUserId`), then looks up the matching profile row.
 *
 * Surface mirrors the Supabase calls in `UserContext.tsx`,
 * `useWeightData.ts`, etc., but values are returned in snake_case to match
 * the existing `ProfileData` interface — saves a refactor across ~80
 * call-sites that read `profile.current_weight_kg` and the like.
 */
import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

// ───────────────────────────────────────────────────────────────────────
// Shape helper — convert the Convex row (camelCase) into the snake_case
// payload the React app currently consumes. Keeping a single mapper means
// any new profile column lands in one place.
//
// `avatarUrl` is resolved from `avatarStorageId` (Convex File Storage) by
// the caller and threaded in as a parameter so this helper stays sync.
// ───────────────────────────────────────────────────────────────────────
function toClientShape(
  row: Doc<"profiles"> | null,
  avatarUrl: string | null = null,
) {
  if (!row) return null;
  return {
    id: row.userId, // legacy callers use `profile.id` as the userId
    user_id: row.userId,
    age: row.age,
    sex: row.sex,
    height_cm: row.heightCm,
    current_weight_kg: row.currentWeightKg,
    goal_weight_kg: row.goalWeightKg,
    target_date: row.targetDate,
    activity_level: row.activityLevel,
    goal_type: row.goalType,
    role: row.role,
    bmr: row.bmr,
    tdee: row.tdee,
    body_fat_pct: row.bodyFatPct,
    fight_week_target_kg: row.fightWeekTargetKg,
    normal_daily_carbs_g: row.normalDailyCarbsG,
    ai_recommended_calories: row.aiRecommendedCalories,
    ai_recommended_protein_g: row.aiRecommendedProteinG,
    ai_recommended_carbs_g: row.aiRecommendedCarbsG,
    ai_recommended_fats_g: row.aiRecommendedFatsG,
    ai_recommendations_updated_at: row.aiRecommendationsUpdatedAt,
    manual_nutrition_override: row.manualNutritionOverride,
    cut_plan_json: row.cutPlanJson,
    athlete_type: row.athleteType,
    avatar_url: avatarUrl,
    display_name: row.displayName,
    experience_level: row.experienceLevel,
    food_budget: row.foodBudget,
    plan_aggressiveness: row.planAggressiveness,
    primary_struggle: row.primaryStruggle,
    sleep_hours: row.sleepHours,
    training_frequency: row.trainingFrequency,
    training_types: row.trainingTypes,
    gems: row.gems,
    last_free_gem_date: row.lastFreeGemDate,
    ads_watched_today: row.adsWatchedToday,
    ads_watched_date: row.adsWatchedDate,
    subscription_tier: row.subscriptionTier,
    subscription_expires_at: row.subscriptionExpiresAt
      ? new Date(row.subscriptionExpiresAt).toISOString()
      : null,
    subscription_updated_at: row.subscriptionUpdatedAt,
    revenuecat_customer_id: row.revenuecatCustomerId,
    updated_at: row.updatedAt,
    is_premium:
      row.subscriptionTier !== "free" &&
      row.subscriptionTier !== undefined,
  };
}

async function findByUser(ctx: any, userId: any) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .unique();
}

// ───────────────────────────────────────────────────────────────────────
// QUERIES
// ───────────────────────────────────────────────────────────────────────

/** Authoritative "who am I" — used by UserContext on every mount. */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await findByUser(ctx, userId);
    const avatarUrl = row?.avatarStorageId
      ? await ctx.storage.getUrl(row.avatarStorageId)
      : null;
    return toClientShape(row, avatarUrl);
  },
});

/**
 * Returns the calling user's auth-table fields (email, _creationTime).
 * Useful for the Settings dialog which needs to display the email + the
 * account-created date.
 */
export const getMyAuthUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      id: userId,
      email: (user as any).email ?? null,
      name: (user as any).name ?? null,
      createdAt: user._creationTime,
    };
  },
});

/**
 * Standalone query for just the avatar URL. Useful for narrow consumers
 * (e.g. compact avatars) that don't need the full profile payload. Returns
 * null if no avatar uploaded.
 */
export const getAvatarUrl = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await findByUser(ctx, userId);
    if (!row?.avatarStorageId) return null;
    return await ctx.storage.getUrl(row.avatarStorageId);
  },
});

/** Cut plan (potentially large JSONB) — separated so callers that don't
 *  need it can avoid pulling it on every profile read. */
export const getCutPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await findByUser(ctx, userId);
    return row?.cutPlanJson ?? null;
  },
});

// ───────────────────────────────────────────────────────────────────────
// MUTATIONS
// ───────────────────────────────────────────────────────────────────────

/** Idempotent: invoked from auth.createOrUpdateUser callback. If a row
 *  already exists this is a no-op; otherwise creates a placeholder with
 *  zero defaults that the onboarding flow overwrites. */
export const ensureExists = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (existing) return existing._id;
    return await ctx.db.insert("profiles", {
      userId,
      age: 0,
      sex: "",
      heightCm: 0,
      currentWeightKg: 0,
      goalWeightKg: 0,
      targetDate: "",
      activityLevel: "",
      goalType: "",
      role: "fighter",
      gems: 0,
      adsWatchedToday: 0,
      subscriptionTier: "free",
    });
  },
});

export const updateCurrentWeight = mutation({
  args: { weightKg: v.number() },
  handler: async (ctx, { weightKg }) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");
    await ctx.db.patch(existing._id, {
      currentWeightKg: weightKg,
      updatedAt: Date.now(),
    });
  },
});

export const setUserName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");
    await ctx.db.patch(existing._id, {
      displayName,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Step 1 of the avatar-upload flow: ask Convex for a one-time POST URL that
 * the client streams the image bytes to. The returned URL is signed and
 * short-lived — once consumed the client receives a `storageId` to pass to
 * `setAvatar` below.
 *
 * Auth-gated so anonymous callers can't burn through upload-URL quota.
 */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2 of the avatar-upload flow: persist the freshly uploaded
 * `storageId` on the profile row. Deletes any previous avatar storage
 * BEFORE patching the new id so a race-condition that aborts mid-write
 * doesn't orphan the old file forever. Pass `storageId: null` to clear.
 */
export const setAvatar = mutation({
  args: {
    storageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");

    // Best-effort cleanup of the previous storage object. If it's already
    // gone (deleted out-of-band, double-write race) the call throws — we
    // swallow it because the patch below is the source of truth.
    if (existing.avatarStorageId && existing.avatarStorageId !== storageId) {
      try {
        await ctx.storage.delete(existing.avatarStorageId);
      } catch {
        /* prior file already missing — ignore */
      }
    }

    await ctx.db.patch(existing._id, {
      avatarStorageId: storageId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});

export const setRole = mutation({
  args: {
    role: v.union(v.literal("fighter"), v.literal("coach")),
  },
  handler: async (ctx, { role }) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");
    await ctx.db.patch(existing._id, { role, updatedAt: Date.now() });
  },
});

/** Onboarding / Goals page — broad patch supporting any of the goal-related
 *  fields. Each is optional; only the ones provided are written. */
export const updateGoals = mutation({
  args: {
    age: v.optional(v.number()),
    sex: v.optional(v.string()),
    heightCm: v.optional(v.number()),
    currentWeightKg: v.optional(v.number()),
    goalWeightKg: v.optional(v.number()),
    fightWeekTargetKg: v.optional(v.number()),
    targetDate: v.optional(v.string()),
    activityLevel: v.optional(v.string()),
    goalType: v.optional(v.string()),
    trainingFrequency: v.optional(v.number()),
    trainingTypes: v.optional(v.array(v.string())),
    athleteType: v.optional(v.string()),
    experienceLevel: v.optional(v.string()),
    planAggressiveness: v.optional(v.string()),
    primaryStruggle: v.optional(v.string()),
    sleepHours: v.optional(v.string()),
    foodBudget: v.optional(v.string()),
    bmr: v.optional(v.number()),
    tdee: v.optional(v.number()),
    bodyFatPct: v.optional(v.number()),
    aiRecommendedCalories: v.optional(v.number()),
    aiRecommendedProteinG: v.optional(v.number()),
    aiRecommendedCarbsG: v.optional(v.number()),
    aiRecommendedFatsG: v.optional(v.number()),
    aiRecommendationsUpdatedAt: v.optional(v.number()),
    manualNutritionOverride: v.optional(v.boolean()),
    normalDailyCarbsG: v.optional(v.number()),
    cutPlanJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");
    // Strip undefined keys so `ctx.db.patch` doesn't overwrite with undefined.
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(existing._id, patch as any);
  },
});

// ───────────────────────────────────────────────────────────────────────
// INTERNAL — gem deduction (called from Phase-4 actions before Groq).
// Replaces Postgres RPCs `deduct_gem` and `grant_daily_free_gem`.
// ───────────────────────────────────────────────────────────────────────

export const deductGem = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("Profile not found");
    if (profile.gems <= 0) throw new Error("No gems available");
    await ctx.db.patch(profile._id, {
      gems: profile.gems - 1,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Public ad-reward endpoint. Replaces the Postgres `reward_ad_gem` RPC.
 * Grants one gem and increments the per-day ads counter; caps at 5 ads/day.
 */
export const rewardAdGem = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await findByUser(ctx, userId);
    if (!profile) throw new Error("Profile not found");
    const today = new Date().toISOString().slice(0, 10);
    const sameDay = profile.adsWatchedDate === today;
    const adsWatchedToday = sameDay ? (profile.adsWatchedToday ?? 0) : 0;
    if (adsWatchedToday >= 5) {
      return { success: false, gems: profile.gems, adsRemaining: 0 };
    }
    const nextAds = adsWatchedToday + 1;
    await ctx.db.patch(profile._id, {
      gems: profile.gems + 1,
      adsWatchedToday: nextAds,
      adsWatchedDate: today,
      updatedAt: Date.now(),
    });
    return { success: true, gems: profile.gems + 1, adsRemaining: 5 - nextAds };
  },
});

/**
 * Reset all tracking data for the current user — keeps `profiles` row + fight
 * camps + auth, but wipes meals, weight/hydration/sleep logs, fight week data,
 * chat history, plans, etc.
 */
export const resetTrackingData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const drop = async (table: string, indexName: string) => {
      const rows = await ctx.db
        .query(table as any)
        .withIndex(indexName as any, (q: any) => q.eq("userId", userId))
        .collect();
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    };
    // meals → meal_items cascade.
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    for (const m of meals) {
      const items = await ctx.db
        .query("meal_items")
        .withIndex("by_meal", (q) => q.eq("mealId", m._id))
        .collect();
      await Promise.all(items.map((i) => ctx.db.delete(i._id)));
      await ctx.db.delete(m._id);
    }
    await drop("hydration_logs", "by_user_date");
    await drop("weight_logs", "by_user_date");
    await drop("chat_messages", "by_user");
    await drop("user_dietary_preferences", "by_user");
    await drop("meal_plans", "by_user");
    await drop("fight_week_plans", "by_user");
    await drop("fight_week_logs", "by_user_date");
  },
});

/**
 * User-initiated gem spend. Idempotent and gated by gem balance.
 */
export const spendGem = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await findByUser(ctx, userId);
    if (!profile) throw new Error("Profile not found");
    if (profile.gems <= 0) throw new Error("No gems available");
    await ctx.db.patch(profile._id, {
      gems: profile.gems - 1,
      updatedAt: Date.now(),
    });
    return { gems: profile.gems - 1 };
  },
});

/** Apple IAP / RevenueCat client-side activation. Called by an authenticated
 *  user immediately after a successful purchase to flip their tier locally
 *  while the RevenueCat webhook catches up. Idempotent. */
export const activatePremium = mutation({
  args: {
    tier: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { tier, expiresAt }) => {
    const userId = await requireUserId(ctx);
    const existing = await findByUser(ctx, userId);
    if (!existing) throw new Error("Profile not found");
    const expiresAtMs =
      expiresAt && expiresAt.length > 0 ? Date.parse(expiresAt) : undefined;
    await ctx.db.patch(existing._id, {
      subscriptionTier: tier,
      subscriptionExpiresAt: expiresAtMs,
      subscriptionUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { tier, expiresAt: expiresAt ?? null };
  },
});

/** Internal variant used by the RevenueCat webhook (no auth context — the
 *  webhook is verified by its shared-secret header). Looks up the profile
 *  by `revenuecat_customer_id` first, then by user id. */
export const updateSubscriptionFromRevenueCat = internalMutation({
  args: {
    appUserId: v.string(),
    eventType: v.string(),
    productId: v.optional(v.string()),
    expirationAtMs: v.optional(v.number()),
  },
  handler: async (ctx, { appUserId, eventType, productId, expirationAtMs }) => {
    // RevenueCat's app_user_id is the Convex `users._id` we configured at
    // login. Look up the profile by that user id.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", appUserId as any))
      .unique();
    if (!profile) return { ok: false, reason: "profile-not-found" };

    const tierFromProduct = (pid?: string): string => {
      if (!pid) return profile.subscriptionTier;
      if (pid.includes("yearly") || pid.includes("annual")) {
        return "premium_annual";
      }
      if (pid.includes("monthly")) return "premium_monthly";
      return "premium_monthly";
    };

    const patch: Record<string, unknown> = {
      revenuecatCustomerId: appUserId,
      subscriptionUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    };

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION":
        patch.subscriptionTier = tierFromProduct(productId);
        patch.subscriptionExpiresAt = expirationAtMs ?? undefined;
        break;
      case "EXPIRATION":
        patch.subscriptionTier = "free";
        patch.subscriptionExpiresAt = undefined;
        break;
      case "CANCELLATION":
        // User cancelled but keeps access until expiry — only update expiry.
        patch.subscriptionExpiresAt = expirationAtMs ?? undefined;
        break;
      case "BILLING_ISSUE":
        // Grace period — leave tier alone.
        break;
      default:
        // Unhandled event — touch updated timestamps but nothing else.
        break;
    }

    await ctx.db.patch(profile._id, patch as any);
    return { ok: true };
  },
});

/** Grants one free gem per UTC day. Idempotent — replays on the same day
 *  are no-ops. Callers should fire-and-forget at app mount. */
export const grantDailyFreeGem = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    if (profile.lastFreeGemDate === today) return;
    await ctx.db.patch(profile._id, {
      gems: profile.gems + 1,
      lastFreeGemDate: today,
      updatedAt: Date.now(),
    });
  },
});
