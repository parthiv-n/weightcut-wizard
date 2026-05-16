/**
 * Public `weekly` query for the per-gym training-volume leaderboard.
 *
 * Live aggregate: no cron, no materialised table. Range-scans
 * `fight_camp_calendar` via the `by_gym_date` index for the rolling 7-day
 * window, then defers minute-sum + tie-preserving ranking to the pure
 * helpers in `./lib/leaderboardAggregation`. Convex reactivity propagates
 * updates to subscribers automatically whenever any matching row changes.
 *
 * Privacy + auth (server-side, mirrors what RLS would have done):
 *   1. Caller must be an active `gym_members` row for the requested gym.
 *   2. If the caller has opted out (`shareData=false`) we return `null` so
 *      the host page can render the "enable sharing" disclaimer.
 *   3. We aggregate only over active members whose `shareData=true`.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import {
  aggregateLeaderboard,
  assignRanks,
  type LeaderboardSourceRow,
} from "./lib/leaderboardAggregation";

const WINDOW_DAYS = 7;
const MAX_RANKED_ROWS = 50;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const weekly = query({
  args: {
    gymId: v.id("gyms"),
    discipline: v.optional(v.string()),
  },
  handler: async (ctx, { gymId, discipline }) => {
    const userId = await requireUserId(ctx);

    // 1. Auth: caller must have an active membership in this gym.
    const callerMembership = await ctx.db
      .query("gym_members")
      .withIndex("by_gym_user", (q) =>
        q.eq("gymId", gymId).eq("userId", userId),
      )
      .first();
    if (!callerMembership || callerMembership.status !== "active") {
      throw new Error("Not a member of this gym");
    }

    // 2. Caller opt-out → return null so host page can render the disclaimer.
    if (!callerMembership.shareData) {
      return null;
    }

    // 3. Build shareData set for the gym (active + shareData=true only).
    const members = await ctx.db
      .query("gym_members")
      .withIndex("by_gym", (q) => q.eq("gymId", gymId))
      .collect();
    const shareDataUserIds = new Set<string>(
      members
        .filter((m) => m.status === "active" && m.shareData)
        .map((m) => m.userId as string),
    );

    // 4. Range-scan calendar rows in last 7 days for this gym.
    const windowStart = isoDaysAgo(WINDOW_DAYS - 1);
    const windowEnd = todayIso();
    const rows = await ctx.db
      .query("fight_camp_calendar")
      .withIndex("by_gym_date", (q) =>
        q.eq("gymId", gymId).gte("date", windowStart).lte("date", windowEnd),
      )
      .collect();

    // 5. Aggregate + rank.
    const sourceRows: LeaderboardSourceRow[] = rows.map((r) => ({
      userId: r.userId as string,
      durationMinutes: r.durationMinutes,
      sessionType: r.sessionType,
    }));
    const aggregated = aggregateLeaderboard({
      rows: sourceRows,
      shareDataUserIds,
      discipline,
    });
    const ranked = assignRanks(aggregated);

    // 6. Hydrate top MAX_RANKED_ROWS with profile data. The `profiles` table
    //    stores `displayName` and `avatarStorageId` (a Convex Storage id),
    //    NOT a precomputed URL — mirrors the pattern used in `coach.ts`.
    const top = ranked.slice(0, MAX_RANKED_ROWS);
    const hydrated = await Promise.all(
      top.map(async (entry) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) =>
            q.eq("userId", entry.userId as Id<"users">),
          )
          .first();
        const avatarUrl = profile?.avatarStorageId
          ? await ctx.storage.getUrl(profile.avatarStorageId)
          : null;
        return {
          ...entry,
          name: profile?.displayName ?? "Athlete",
          avatarUrl,
        };
      }),
    );

    // 7. Split into podium + ranks-4+.
    const podium = hydrated.filter((e) => e.rank <= 3);
    const ranks = hydrated.filter((e) => e.rank > 3);

    // 8. Compute caller's own rank entry (may be outside top 50).
    //    Zero-state: if the caller is entitled to see the board (active +
    //    shareData=true) but logged no qualifying sessions this week, return
    //    `{ rank: null, totalMinutes: 0, topDiscipline: null }` so the UI can
    //    distinguish "haven't trained yet" from "can't see leaderboard"
    //    (the latter is signalled by a top-level `null` return earlier).
    const callerRanked = ranked.find((e) => e.userId === userId);
    const myRank: {
      rank: number | null;
      totalMinutes: number;
      topDiscipline: string | null;
    } = callerRanked
      ? {
          rank: callerRanked.rank,
          totalMinutes: callerRanked.totalMinutes,
          topDiscipline: callerRanked.topDiscipline,
        }
      : { rank: null, totalMinutes: 0, topDiscipline: null };

    return {
      podium,
      ranks,
      myRank,
      asOf: Date.now(),
      windowStart,
      windowEnd,
      // Privacy: counts only fighters who are active + shareData=true AND
      // have >=1 qualifying session in the window. Opt-out + inactive members
      // are excluded. UI must NOT pair this with a published gym roster size
      // (subtraction would leak opt-out status as a side channel).
      totalRankedFighters: ranked.length,
    };
  },
});
