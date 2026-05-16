# Gym Weekly Training Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a weekly (rolling 7-day) training-volume leaderboard visible to coaches on the Coach Dashboard and to fighters on the My Gym page, with a gold/silver/bronze podium, discipline filter tabs, and real-time updates via Convex reactivity.

**Architecture:** Live aggregate Convex query (no cron, no materialized table). Stamp a denormalised `gymId` on `fight_camp_calendar` rows at write time, add a `by_gym_date` index, and aggregate minutes server-side over the last 7 days. UI components live under `src/components/leaderboard/` and are embedded in the two existing host pages.

**Tech Stack:** Convex (backend + reactivity), React + TypeScript + Vite, Tailwind + shadcn/ui, `motion/react` for the counter-up animation, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-05-16-gym-leaderboard-design.md`

---

## File Structure

**Create:**
- `convex/gymLeaderboard.ts` — public `weekly` query
- `convex/lib/leaderboardAggregation.ts` — pure aggregation/ranking functions (testable without Convex ctx)
- `convex/migrations.ts` — internal mutation `backfillGymIdOnCalendar` (new file; project doesn't have one)
- `src/components/leaderboard/LeaderboardSection.tsx` — host wrapper
- `src/components/leaderboard/DisciplineFilterTabs.tsx` — discipline tab selector
- `src/components/leaderboard/PodiumHero.tsx` — top 3 podium card
- `src/components/leaderboard/PodiumPlace.tsx` — single podium tier row
- `src/components/leaderboard/MedalIcon.tsx` — gold/silver/bronze SVG
- `src/components/leaderboard/RankedList.tsx` — ranks 4+ list
- `src/components/leaderboard/RankedRow.tsx` — single rank row
- `src/components/leaderboard/MyRankFooter.tsx` — athlete's own rank
- `src/components/leaderboard/types.ts` — shared TS types mirroring the query payload
- `tests/leaderboard/aggregation.spec.ts` — unit tests for pure aggregation
- `tests/leaderboard/ranking.spec.ts` — unit tests for tie-preserving ranking

**Modify:**
- `convex/schema.ts:327-345` — add `gymId` field + `by_gym_date` index to `fight_camp_calendar`
- `convex/fight_camp.ts:310-334` — stamp `gymId` on insert inside `createCalendarEntry`
- `src/index.css` — add medal color tokens
- `src/pages/coach/CoachDashboard.tsx` — embed `<LeaderboardSection viewer="coach" />` per gym
- `src/pages/MyGym.tsx` — embed `<LeaderboardSection viewer="athlete" />` below announcements

---

## Task 1: Schema — add `gymId` and `by_gym_date` index to `fight_camp_calendar`

**Files:**
- Modify: `convex/schema.ts:327-345`

- [ ] **Step 1: Update the table definition**

Edit `convex/schema.ts` lines 327–345. Add `gymId` as an optional field and the new index.

```ts
  fight_camp_calendar: defineTable({
    userId: v.id("users"),
    date: v.string(),
    sessionType: v.string(),
    intensity: v.string(),
    intensityLevel: v.optional(v.number()),
    durationMinutes: v.number(),
    rpe: v.number(),
    bodyweight: v.optional(v.number()),
    fatigueLevel: v.optional(v.number()),
    sorenessLevel: v.optional(v.number()),
    sleepHours: v.optional(v.number()),
    sleepQuality: v.optional(v.string()),
    mobilityDone: v.optional(v.boolean()),
    mediaStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
    // Denormalised primary-gym id stamped at insert time so the gym
    // leaderboard query can range-scan by_gym_date directly. Optional
    // because historical rows are backfilled lazily (see migrations.ts).
    gymId: v.optional(v.id("gyms")),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_gym_date", ["gymId", "date"]),
```

- [ ] **Step 2: Verify Convex codegen succeeds**

Run: `npx convex dev --once`
Expected: "Wrote `convex/_generated/api.d.ts`" and no schema errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(leaderboard): add gymId + by_gym_date index to fight_camp_calendar"
```

---

## Task 2: Stamp `gymId` at write time in `createCalendarEntry`

**Files:**
- Modify: `convex/fight_camp.ts:310-334`

- [ ] **Step 1: Update the mutation handler**

Replace the existing handler in `convex/fight_camp.ts` lines 327–333 with:

```ts
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Find the user's primary active gym membership. First active row wins;
    // multi-gym leaderboards are out of scope.
    const membership = await ctx.db
      .query("gym_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    return await ctx.db.insert("fight_camp_calendar", {
      userId,
      gymId: membership?.gymId,
      ...args,
    });
  },
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p convex/tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add convex/fight_camp.ts
git commit -m "feat(leaderboard): stamp primary gymId on new calendar entries"
```

---

## Task 3: Backfill migration for historical rows

**Files:**
- Create: `convex/migrations.ts`

- [ ] **Step 1: Write the internal mutation**

Create `convex/migrations.ts`:

```ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * One-time backfill that stamps `gymId` on existing `fight_camp_calendar`
 * rows by looking up each user's primary active gym_members row.
 *
 * Paginated and resumable via a `cursor` arg. Caller passes the previous
 * `continueCursor` back in until the mutation returns `done: true`.
 *
 * Run via:
 *   npx convex run migrations:backfillGymIdOnCalendar '{"cursor":null}'
 *   …repeat with the returned continueCursor until done.
 */
export const backfillGymIdOnCalendar = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("fight_camp_calendar")
      .paginate({ cursor, numItems: 200 });

    let stamped = 0;
    let skipped = 0;
    for (const row of page.page) {
      if (row.gymId) {
        skipped++;
        continue;
      }
      const membership = await ctx.db
        .query("gym_members")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      if (!membership) {
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, { gymId: membership.gymId });
      stamped++;
    }

    return {
      stamped,
      skipped,
      done: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
```

- [ ] **Step 2: Verify codegen**

Run: `npx convex dev --once`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add convex/migrations.ts convex/_generated/
git commit -m "feat(leaderboard): backfill migration for historical gymId"
```

---

## Task 4: Pure aggregation function (write failing test first)

**Files:**
- Create: `convex/lib/leaderboardAggregation.ts`
- Test: `tests/leaderboard/aggregation.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/leaderboard/aggregation.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateLeaderboard } from "../../convex/lib/leaderboardAggregation";

type Row = {
  userId: string;
  durationMinutes: number;
  sessionType: string;
};

describe("aggregateLeaderboard", () => {
  it("returns empty result when no rows", () => {
    const result = aggregateLeaderboard({
      rows: [],
      shareDataUserIds: new Set<string>(),
    });
    expect(result).toEqual([]);
  });

  it("excludes sessions under 30 minutes", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 25, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 30, sessionType: "BJJ" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toEqual([
      { userId: "u1", totalMinutes: 30, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
  });

  it("excludes users not in shareDataUserIds", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u2", durationMinutes: 90, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
  });

  it("sums minutes and picks top discipline per user", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 90, sessionType: "Boxing" },
      { userId: "u1", durationMinutes: 45, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toEqual([
      {
        userId: "u1",
        totalMinutes: 195,
        sessionCount: 3,
        topDiscipline: "Boxing",
      },
    ]);
  });

  it("filters by discipline when provided", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 90, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
      discipline: "BJJ",
    });
    expect(result).toEqual([
      { userId: "u1", totalMinutes: 60, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard/aggregation.spec.ts`
Expected: FAIL — cannot resolve module `../../convex/lib/leaderboardAggregation`.

- [ ] **Step 3: Write the minimal implementation**

Create `convex/lib/leaderboardAggregation.ts`:

```ts
export type LeaderboardSourceRow = {
  userId: string;
  durationMinutes: number;
  sessionType: string;
};

export type AggregatedLeaderboardEntry = {
  userId: string;
  totalMinutes: number;
  sessionCount: number;
  topDiscipline: string;
};

const MIN_SESSION_MINUTES = 30;

export function aggregateLeaderboard(input: {
  rows: LeaderboardSourceRow[];
  shareDataUserIds: Set<string>;
  discipline?: string;
}): AggregatedLeaderboardEntry[] {
  const { rows, shareDataUserIds, discipline } = input;

  // Per-user totals plus per-discipline minutes for picking topDiscipline.
  const perUser = new Map<
    string,
    {
      totalMinutes: number;
      sessionCount: number;
      perDiscipline: Map<string, number>;
    }
  >();

  for (const row of rows) {
    if (row.durationMinutes < MIN_SESSION_MINUTES) continue;
    if (!shareDataUserIds.has(row.userId)) continue;
    if (discipline && row.sessionType !== discipline) continue;

    const existing = perUser.get(row.userId) ?? {
      totalMinutes: 0,
      sessionCount: 0,
      perDiscipline: new Map<string, number>(),
    };
    existing.totalMinutes += row.durationMinutes;
    existing.sessionCount += 1;
    existing.perDiscipline.set(
      row.sessionType,
      (existing.perDiscipline.get(row.sessionType) ?? 0) + row.durationMinutes,
    );
    perUser.set(row.userId, existing);
  }

  const result: AggregatedLeaderboardEntry[] = [];
  for (const [userId, v] of perUser) {
    let topDiscipline = "";
    let topMinutes = -1;
    for (const [d, m] of v.perDiscipline) {
      if (m > topMinutes) {
        topMinutes = m;
        topDiscipline = d;
      }
    }
    result.push({
      userId,
      totalMinutes: v.totalMinutes,
      sessionCount: v.sessionCount,
      topDiscipline,
    });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leaderboard/aggregation.spec.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/leaderboardAggregation.ts tests/leaderboard/aggregation.spec.ts
git commit -m "feat(leaderboard): pure aggregation function with unit tests"
```

---

## Task 5: Tie-preserving ranking function (write failing test first)

**Files:**
- Modify: `convex/lib/leaderboardAggregation.ts`
- Test: `tests/leaderboard/ranking.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/leaderboard/ranking.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignRanks } from "../../convex/lib/leaderboardAggregation";

describe("assignRanks", () => {
  it("returns empty for empty input", () => {
    expect(assignRanks([])).toEqual([]);
  });

  it("ranks by descending totalMinutes", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 100, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 200, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("preserves ties with 1, 1, 3 style ranking", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 200, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("preserves three-way tie at top", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "d", totalMinutes: 100, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard/ranking.spec.ts`
Expected: FAIL — `assignRanks` is not exported.

- [ ] **Step 3: Add `assignRanks` to `convex/lib/leaderboardAggregation.ts`**

Append to `convex/lib/leaderboardAggregation.ts`:

```ts
export type RankedLeaderboardEntry = AggregatedLeaderboardEntry & {
  rank: number;
};

/**
 * Sort by totalMinutes desc and assign ranks preserving ties: identical
 * totals share a rank, and the next distinct total skips ahead by the
 * size of the tie group (e.g. 1, 1, 3).
 */
export function assignRanks(
  entries: AggregatedLeaderboardEntry[],
): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const ranked: RankedLeaderboardEntry[] = [];
  let previousMinutes = Number.POSITIVE_INFINITY;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    const rank =
      entry.totalMinutes === previousMinutes ? previousRank : index + 1;
    ranked.push({ ...entry, rank });
    previousMinutes = entry.totalMinutes;
    previousRank = rank;
  });
  return ranked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leaderboard/ranking.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/leaderboardAggregation.ts tests/leaderboard/ranking.spec.ts
git commit -m "feat(leaderboard): tie-preserving ranking function"
```

---

## Task 6: Convex `gymLeaderboard.weekly` query

**Files:**
- Create: `convex/gymLeaderboard.ts`

- [ ] **Step 1: Write the query**

Create `convex/gymLeaderboard.ts`:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
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
    const shareDataUserIds = new Set(
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

    // 6. Hydrate top MAX_RANKED_ROWS with profile data.
    const top = ranked.slice(0, MAX_RANKED_ROWS);
    const hydrated = await Promise.all(
      top.map(async (entry) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", entry.userId as any))
          .first();
        return {
          ...entry,
          name: profile?.displayName ?? profile?.firstName ?? "Athlete",
          avatarUrl: profile?.avatarUrl ?? null,
        };
      }),
    );

    // 7. Split into podium + ranks-4+.
    const podium = hydrated.filter((e) => e.rank <= 3);
    const ranks = hydrated.filter((e) => e.rank > 3);

    // 8. Compute caller's own rank entry (may be outside top 50).
    const callerRanked = ranked.find((e) => e.userId === userId);
    const myRank = callerRanked
      ? {
          rank: callerRanked.rank,
          totalMinutes: callerRanked.totalMinutes,
          topDiscipline: callerRanked.topDiscipline,
        }
      : null;

    return {
      podium,
      ranks,
      myRank,
      asOf: Date.now(),
      windowStart,
      windowEnd,
      totalRankedFighters: ranked.length,
    };
  },
});
```

- [ ] **Step 2: Verify codegen and typecheck**

Run: `npx convex dev --once && npx tsc --noEmit -p convex/tsconfig.json`
Expected: success.

> Note: if `profiles` doesn't have a `by_user` index or the field names differ, adjust the hydrate block to use the correct index/column. Check `convex/schema.ts` for the profiles table definition before assuming.

- [ ] **Step 3: Commit**

```bash
git add convex/gymLeaderboard.ts convex/_generated/
git commit -m "feat(leaderboard): weekly leaderboard query with privacy + auth"
```

---

## Task 7: Medal color tokens

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add the tokens**

Open `src/index.css` and add the following three lines inside the existing `:root { ... }` block (immediately after the existing color tokens, before the closing brace):

```css
    --medal-gold: 45 95% 58%;
    --medal-silver: 220 13% 80%;
    --medal-bronze: 25 65% 55%;
```

And mirror them inside the `.dark { ... }` block with the same values (medal colors stay constant across themes).

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(leaderboard): medal color design tokens"
```

---

## Task 8: Shared types + `MedalIcon` component

**Files:**
- Create: `src/components/leaderboard/types.ts`
- Create: `src/components/leaderboard/MedalIcon.tsx`

- [ ] **Step 1: Write `types.ts`**

Create `src/components/leaderboard/types.ts`:

```ts
export type MedalTier = "gold" | "silver" | "bronze";

export type LeaderboardEntry = {
  userId: string;
  rank: number;
  totalMinutes: number;
  sessionCount: number;
  topDiscipline: string;
  name: string;
  avatarUrl: string | null;
};

export type MyRankInfo = {
  rank: number;
  totalMinutes: number;
  topDiscipline: string;
};

export type LeaderboardData = {
  podium: LeaderboardEntry[];
  ranks: LeaderboardEntry[];
  myRank: MyRankInfo | null;
  asOf: number;
  windowStart: string;
  windowEnd: string;
  totalRankedFighters: number;
};

export function rankToTier(rank: number): MedalTier | null {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}
```

- [ ] **Step 2: Write `MedalIcon.tsx`**

Create `src/components/leaderboard/MedalIcon.tsx`:

```tsx
import type { MedalTier } from "./types";

const TIER_HSL: Record<MedalTier, string> = {
  gold: "hsl(var(--medal-gold))",
  silver: "hsl(var(--medal-silver))",
  bronze: "hsl(var(--medal-bronze))",
};

export function MedalIcon({
  tier,
  size = 20,
}: {
  tier: MedalTier;
  size?: number;
}) {
  const color = TIER_HSL[tier];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="14" r="6" fill={color} opacity="0.9" />
      <circle
        cx="12"
        cy="14"
        r="6"
        stroke={color}
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <path
        d="M8 2 L10 8 L14 8 L16 2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/leaderboard/types.ts src/components/leaderboard/MedalIcon.tsx
git commit -m "feat(leaderboard): shared types + medal icon"
```

---

## Task 9: `PodiumPlace` + `PodiumHero`

**Files:**
- Create: `src/components/leaderboard/PodiumPlace.tsx`
- Create: `src/components/leaderboard/PodiumHero.tsx`

- [ ] **Step 1: Write `PodiumPlace.tsx`**

Create `src/components/leaderboard/PodiumPlace.tsx`:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MedalIcon } from "./MedalIcon";
import type { LeaderboardEntry, MedalTier } from "./types";

const TIER_RING: Record<MedalTier, string> = {
  gold: "shadow-[0_0_24px_-4px] shadow-[hsl(var(--medal-gold)/0.6)] ring-2 ring-[hsl(var(--medal-gold))]",
  silver:
    "shadow-[0_0_18px_-6px] shadow-[hsl(var(--medal-silver)/0.5)] ring-2 ring-[hsl(var(--medal-silver))]",
  bronze:
    "shadow-[0_0_18px_-6px] shadow-[hsl(var(--medal-bronze)/0.5)] ring-2 ring-[hsl(var(--medal-bronze))]",
};

const TIER_SIZE: Record<MedalTier, string> = {
  gold: "h-16 w-16",
  silver: "h-12 w-12",
  bronze: "h-12 w-12",
};

export function PodiumPlace({
  entry,
  tier,
}: {
  entry: LeaderboardEntry;
  tier: MedalTier;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-3 py-2"
    >
      <div className="relative">
        <Avatar className={`${TIER_SIZE[tier]} ${TIER_RING[tier]}`}>
          <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
          <AvatarFallback>{entry.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="absolute -right-1 -top-1">
          <MedalIcon tier={tier} size={tier === "gold" ? 22 : 18} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{entry.name}</div>
        <Badge variant="secondary" className="mt-1 text-[10px]">
          {entry.topDiscipline}
        </Badge>
      </div>
      <div className="text-right tabular-nums">
        <div className="text-lg font-bold">{entry.totalMinutes}</div>
        <div className="text-[10px] text-muted-foreground">min</div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Write `PodiumHero.tsx`**

Create `src/components/leaderboard/PodiumHero.tsx`:

```tsx
import { PodiumPlace } from "./PodiumPlace";
import type { LeaderboardEntry, MedalTier } from "./types";

const TIER_ORDER: MedalTier[] = ["gold", "silver", "bronze"];

export function PodiumHero({ podium }: { podium: LeaderboardEntry[] }) {
  if (podium.length === 0) return null;
  // Group entries by rank so ties share a tier.
  const byRank = new Map<number, LeaderboardEntry[]>();
  for (const entry of podium) {
    const list = byRank.get(entry.rank) ?? [];
    list.push(entry);
    byRank.set(entry.rank, list);
  }
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  return (
    <div className="glass-card rounded-2xl border border-border/50 p-4">
      {sortedRanks.map((rank, tierIdx) => {
        const tier = TIER_ORDER[tierIdx] ?? "bronze";
        const entries = byRank.get(rank)!;
        return (
          <div key={rank} className="divide-y divide-border/20">
            {entries.map((entry) => (
              <PodiumPlace key={entry.userId} entry={entry} tier={tier} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

> Note: if `@/components/ui/avatar` or `@/components/ui/badge` import paths don't resolve, check `src/components/ui/` for the actual shadcn export names and adjust.

- [ ] **Step 4: Commit**

```bash
git add src/components/leaderboard/PodiumPlace.tsx src/components/leaderboard/PodiumHero.tsx
git commit -m "feat(leaderboard): podium hero with gold/silver/bronze tiers"
```

---

## Task 10: `RankedRow` + `RankedList`

**Files:**
- Create: `src/components/leaderboard/RankedRow.tsx`
- Create: `src/components/leaderboard/RankedList.tsx`

- [ ] **Step 1: Write `RankedRow.tsx`**

Create `src/components/leaderboard/RankedRow.tsx`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LeaderboardEntry } from "./types";

export function RankedRow({
  entry,
  onClick,
}: {
  entry: LeaderboardEntry;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
        interactive ? "hover:bg-card/50" : "cursor-default"
      }`}
    >
      <div className="w-6 text-sm text-muted-foreground tabular-nums">
        #{entry.rank}
      </div>
      <Avatar className="h-8 w-8">
        <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
        <AvatarFallback>{entry.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 truncate text-sm">{entry.name}</div>
      <div className="text-xs text-muted-foreground">{entry.topDiscipline}</div>
      <div className="w-16 text-right text-sm font-medium tabular-nums">
        {entry.totalMinutes} min
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Write `RankedList.tsx`**

Create `src/components/leaderboard/RankedList.tsx`:

```tsx
import { RankedRow } from "./RankedRow";
import type { LeaderboardEntry } from "./types";

export function RankedList({
  ranks,
  onRowClick,
}: {
  ranks: LeaderboardEntry[];
  onRowClick?: (userId: string) => void;
}) {
  if (ranks.length === 0) return null;
  return (
    <div className="glass-card rounded-2xl border border-border/50 divide-y divide-border/20">
      {ranks.map((entry) => (
        <RankedRow
          key={entry.userId}
          entry={entry}
          onClick={onRowClick ? () => onRowClick(entry.userId) : undefined}
        />
      ))}
    </div>
  );
}
```

> Virtualisation deferred: query caps at 50 rows, so a flat render is fine. If the cap ever rises above ~200, swap to `@tanstack/react-virtual` (not currently a dep).

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/leaderboard/RankedRow.tsx src/components/leaderboard/RankedList.tsx
git commit -m "feat(leaderboard): ranked list rows for ranks 4+"
```

---

## Task 11: `DisciplineFilterTabs`

**Files:**
- Create: `src/components/leaderboard/DisciplineFilterTabs.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/leaderboard/DisciplineFilterTabs.tsx`:

```tsx
import { triggerHaptic } from "@/lib/haptics";

export const DISCIPLINES = [
  "All",
  "BJJ",
  "Boxing",
  "Muay Thai",
  "Wrestling",
  "Sparring",
  "Strength",
] as const;
export type DisciplineFilter = (typeof DISCIPLINES)[number];

export function DisciplineFilterTabs({
  value,
  onChange,
}: {
  value: DisciplineFilter;
  onChange: (next: DisciplineFilter) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {DISCIPLINES.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              if (d !== value) {
                triggerHaptic("light");
                onChange(d);
              }
            }}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
              active
                ? "bg-primary text-primary-foreground"
                : "bg-card/40 text-muted-foreground hover:bg-card/70"
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}
```

> Note: if `triggerHaptic` exposes a different API in `src/lib/haptics.ts`, adjust the call. Check the actual export before assuming the `"light"` arg.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard/DisciplineFilterTabs.tsx
git commit -m "feat(leaderboard): discipline filter tabs"
```

---

## Task 12: `MyRankFooter`

**Files:**
- Create: `src/components/leaderboard/MyRankFooter.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/leaderboard/MyRankFooter.tsx`:

```tsx
import type { LeaderboardEntry, MyRankInfo } from "./types";

export function MyRankFooter({
  myRank,
  podium,
}: {
  myRank: MyRankInfo;
  podium: LeaderboardEntry[];
}) {
  if (myRank.rank <= 3) return null;
  const bronze = podium.find((p) => p.rank === 3);
  const deficit = bronze
    ? Math.max(0, bronze.totalMinutes - myRank.totalMinutes)
    : null;
  return (
    <div className="glass-card sticky bottom-2 z-10 rounded-2xl border border-border/50 px-4 py-2 text-sm">
      <span className="font-semibold">You're #{myRank.rank}</span>
      <span className="text-muted-foreground"> · </span>
      <span className="tabular-nums">{myRank.totalMinutes} min</span>
      {deficit !== null && deficit > 0 ? (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{deficit} min behind bronze</span>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard/MyRankFooter.tsx
git commit -m "feat(leaderboard): my rank footer for athletes outside top 3"
```

---

## Task 13: `LeaderboardSection` wrapper

**Files:**
- Create: `src/components/leaderboard/LeaderboardSection.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/leaderboard/LeaderboardSection.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  DisciplineFilterTabs,
  type DisciplineFilter,
} from "./DisciplineFilterTabs";
import { PodiumHero } from "./PodiumHero";
import { RankedList } from "./RankedList";
import { MyRankFooter } from "./MyRankFooter";
import type { LeaderboardData } from "./types";

const FILTER_TO_DISCIPLINE: Record<DisciplineFilter, string | undefined> = {
  All: undefined,
  BJJ: "BJJ",
  Boxing: "Boxing",
  "Muay Thai": "Muay Thai",
  Wrestling: "Wrestling",
  Sparring: "Sparring",
  Strength: "Strength",
};

function SkeletonRow() {
  return <div className="h-12 animate-pulse rounded-xl bg-card/40" />;
}

export function LeaderboardSection({
  gymId,
  viewer,
  onRowClick,
}: {
  gymId: Id<"gyms">;
  viewer: "coach" | "athlete";
  onRowClick?: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<DisciplineFilter>("All");
  const data = useQuery(api.gymLeaderboard.weekly, {
    gymId,
    discipline: FILTER_TO_DISCIPLINE[filter],
  }) as LeaderboardData | null | undefined;

  // Loading state
  if (data === undefined) {
    return (
      <section className="space-y-3">
        <DisciplineFilterTabs value={filter} onChange={setFilter} />
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </section>
    );
  }

  // Caller opted out
  if (data === null) {
    return (
      <section className="glass-card rounded-2xl border border-border/50 p-4 text-sm text-muted-foreground">
        Enable data sharing in this gym's settings to see the leaderboard.
      </section>
    );
  }

  const { podium, ranks, myRank, totalRankedFighters } = data;

  // Empty
  if (totalRankedFighters === 0) {
    return (
      <section className="space-y-3">
        <DisciplineFilterTabs value={filter} onChange={setFilter} />
        <div className="glass-card rounded-2xl border border-border/50 p-4 text-center text-sm text-muted-foreground">
          {filter === "All"
            ? "Be the first to train this week."
            : `No ${filter} training logged this week.`}
        </div>
      </section>
    );
  }

  const showPodium = totalRankedFighters >= 3;

  return (
    <section className="space-y-3">
      <DisciplineFilterTabs value={filter} onChange={setFilter} />
      {showPodium ? (
        <PodiumHero podium={podium} />
      ) : (
        <div className="glass-card rounded-2xl border border-border/50 p-3 text-center text-xs text-muted-foreground">
          Need 3+ active fighters to rank a podium.
        </div>
      )}
      <RankedList ranks={ranks} onRowClick={onRowClick} />
      {viewer === "athlete" && myRank ? (
        <MyRankFooter myRank={myRank} podium={podium} />
      ) : null}
    </section>
  );
}
```

> Note: if `convex/react` is imported elsewhere as `@convex/react` or via a different path, mirror that pattern. Same for `api` and `Id` imports — check an existing page like `src/pages/coach/CoachDashboard.tsx` for the local convention.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard/LeaderboardSection.tsx
git commit -m "feat(leaderboard): section wrapper integrating query + UI"
```

---

## Task 14: Embed in Coach Dashboard

**Files:**
- Modify: `src/pages/coach/CoachDashboard.tsx`

- [ ] **Step 1: Read the file**

Read `src/pages/coach/CoachDashboard.tsx` to find the per-gym render block (around the existing gym header + athlete list grouping). Note the exact location.

- [ ] **Step 2: Add the import and embed the section**

At the top of the file, add:

```tsx
import { LeaderboardSection } from "@/components/leaderboard/LeaderboardSection";
```

In the per-gym render block — between the gym header and the athlete row list — insert:

```tsx
<LeaderboardSection
  gymId={gym.id}
  viewer="coach"
  onRowClick={(userId) => openAthleteDetail(userId)}
/>
```

If `openAthleteDetail` doesn't exist, omit `onRowClick` entirely (rows will be non-interactive).

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors. Lint warnings unrelated to this change can be ignored.

- [ ] **Step 4: Manually verify in dev**

Run: `npm run dev`
- Log in as a coach
- Confirm the leaderboard renders inside each gym group
- Confirm switching discipline tabs re-ranks without flicker
- Confirm a new session logged by an athlete (via another browser/account) appears in the leaderboard within ~1s without manual refresh

Stop the dev server after verification.

- [ ] **Step 5: Commit**

```bash
git add src/pages/coach/CoachDashboard.tsx
git commit -m "feat(leaderboard): embed leaderboard in Coach Dashboard"
```

---

## Task 15: Embed in My Gym page

**Files:**
- Modify: `src/pages/MyGym.tsx`

- [ ] **Step 1: Read the file**

Read `src/pages/MyGym.tsx` to find the per-gym render block, specifically the `<AnnouncementsSection />` placement.

- [ ] **Step 2: Add the import and embed below announcements**

At the top of the file, add:

```tsx
import { LeaderboardSection } from "@/components/leaderboard/LeaderboardSection";
```

Immediately below the existing `<AnnouncementsSection ... />` for each gym, insert:

```tsx
<LeaderboardSection gymId={gym.id} viewer="athlete" />
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manually verify in dev**

Run: `npm run dev`
- Log in as a fighter with `shareData=true` for at least one gym → leaderboard renders
- Toggle `shareData=false` for that gym → see the "Enable data sharing" disclaimer (page refresh may be required since the toggle is a separate mutation; verify auto-refresh works after reactivity kicks in)
- Confirm `MyRankFooter` appears when fighter is outside top 3
- Confirm discipline tabs trigger haptic on iOS Capacitor build (skip if web-only)

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MyGym.tsx
git commit -m "feat(leaderboard): embed leaderboard in MyGym page"
```

---

## Task 16: Run full test suite + final verification

**Files:** none

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: all leaderboard tests pass (9 total: 5 aggregation + 4 ranking). No regressions in other tests.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: successful production build with zero TS errors.

- [ ] **Step 3: Run backfill in deployed dev environment**

Once the deployed Convex dev instance has the new schema, run:

```bash
npx convex run migrations:backfillGymIdOnCalendar '{"cursor":null}'
```

Repeat with the returned `continueCursor` until `done: true`. Log each batch's `stamped` / `skipped` count.

- [ ] **Step 4: Final commit (if any cleanup)**

If lint or formatting requires fixes:

```bash
npm run lint -- --fix
git add -A
git commit -m "chore(leaderboard): final cleanup"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** all 7 locked decisions covered. Privacy enforcement is server-side in Task 6. Anti-gaming (30-min minimum, ties preserved) in Tasks 4 + 5. Real-time via Convex reactivity is automatic — no explicit subscription code needed.
- **Type consistency:** `LeaderboardEntry`, `LeaderboardData`, `MyRankInfo`, `MedalTier` defined once in `types.ts`, used across all components. Server payload field names match TS types.
- **Placeholders:** none. Every step has runnable code or commands. The two "Note: …" comments flag known points of codebase-convention variance (profile index name, ui import paths, haptic API) that the implementer should confirm against the local source before relying on the example as-written.
- **Out-of-scope items** explicitly deferred in the spec (notifications, multi-gym, calendar-week mode, archived weeks) are not in any task.

---

## Multi-Agent Execution (post-plan)

After this plan is approved, the original brief requested parallel swarm execution. With subagent-driven mode, tasks 1–6 (backend) can be executed by one subagent stream while tasks 7–13 (UI components) run in parallel by another, since they touch disjoint files. Tasks 14–16 (integration + verification) must run last because they depend on both streams.
