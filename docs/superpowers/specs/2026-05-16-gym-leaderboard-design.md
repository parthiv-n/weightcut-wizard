# Gym Weekly Training Leaderboard — Design

**Date**: 2026-05-16
**Author**: Pratik (via brainstorming session)
**Status**: Draft — awaiting plan
**Scope**: One implementation cycle

## Problem & Goal

Gyms have no shared sense of momentum. Fighters log sessions privately; coaches see the existing per-athlete row in `CoachDashboard.tsx`, but there is no competitive surface that surfaces *who is training the most this week* and *in which discipline*.

**Goal**: ship a weekly training leaderboard, visible to both coaches (Coach Dashboard) and fighters (My Gym page), that updates instantly when sessions are logged, scales to gyms of 200+ active fighters, and presents the top 3 as a gold/silver/bronze podium in a way that feels celebratory without being noisy.

## Decisions (locked from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Rank metric | **Total minutes** (sum of `durationMinutes`) | Simple, intuitive, hard to game, matches what fighters already see |
| Discipline view | **Overall + filter tabs** | Default overall, tabs filter by discipline; per-fighter badge shows their top discipline |
| Time window | **Rolling 7 days** | Always fresh, no "dead Monday" |
| Visual | **Hero podium + ranked list** | Apple Fitness × Strava aesthetic; subtle gradient medal glows; counter-up animations (no confetti) |
| Privacy | **shareData=false → hidden entirely** | Respects existing privacy contract; consistent with `MyGym.tsx` |
| Scale strategy | **Live aggregate query** (no cron, no materialized table) | 200 fighters × 14 sessions/week = 2,800 rows scanned — single indexed range query <50ms |
| Anti-gaming | **Min 30 min/session** + **show ties** (rank 1, 1, 3) | Filters joke logs, honest > forced ordering |

## Architecture

Reactive query end-to-end. Convex queries are already reactive — when a fighter writes to `fight_camp_calendar`, every subscribed leaderboard view refreshes automatically with no manual subscription code.

```
fighter logs session  →  fight_camp_calendar insert (gymId stamped at write)
                              ↓ (Convex reactive watch)
                         api.gymLeaderboard.weekly re-runs
                              ↓
           CoachDashboard.tsx + MyGym.tsx auto-refresh
```

**Why not a materialized table + cron**: at expected scale (200 fighters × ~14 sessions/week = ~2,800 rows scanned weekly per gym) a single indexed range query handles the workload in <50ms. Adding a cron + write hook introduces drift risk, write amplification, and infra cost for zero user-visible benefit until gyms exceed thousands of active fighters. Revisit if a single gym ever crosses ~1,000 active fighters per week.

## Schema Changes

**File**: `convex/schema.ts`

Add a denormalised `gymId` field to `fight_camp_calendar` so we can index `(gymId, date)` directly:

```ts
fight_camp_calendar: defineTable({
  // ...existing fields...
  gymId: v.optional(v.id("gyms")),  // NEW: stamped at write time
})
  .index("by_user_date", ["userId", "date"])  // existing
  .index("by_gym_date", ["gymId", "date"]);    // NEW
```

`gymId` is optional to keep historical rows valid until backfill completes.

## Write Hook

**File**: `convex/fight_camp.ts → createCalendarEntry`

At insert time, look up the user's primary active gym membership and stamp `gymId` on the new row:

```ts
const membership = await ctx.db
  .query("gym_members")
  .withIndex("by_user_status", q => q.eq("userId", userId).eq("status", "active"))
  .first();
const gymId = membership?.gymId ?? undefined;
await ctx.db.insert("fight_camp_calendar", { ...input, gymId });
```

**Multi-gym tie-break**: first active membership wins. Multi-gym leaderboards are out of scope (see "Out of Scope" below).

## Backfill Migration

**File**: `convex/migrations/backfillGymIdOnCalendar.ts`

One-time paginated internal mutation that walks every `fight_camp_calendar` row, looks up the user's primary active gym at the time of run, and patches `gymId`. Uses `@convex-dev/migrations` for resumable batching. Idempotent (skip rows already stamped).

## Server Query

**File**: `convex/gymLeaderboard.ts`

```ts
export const weekly = query({
  args: { gymId: v.id("gyms"), discipline: v.optional(v.string()) },
  handler: async (ctx, { gymId, discipline }) => {
    // 1. Auth: caller must be an active gym_members row for this gymId
    //    (coach OR athlete role both allowed)
    // 2. Time window: now - 7 days .. now (ISO date strings)
    // 3. Pull rows: by_gym_date range scan [gymId, windowStart] → [gymId, windowEnd]
    // 4. Build shareData set: query gym_members where gymId=X AND status="active"
    //    AND shareData=true → Set<userId>
    // 5. Filter rows: userId in shareDataSet AND durationMinutes >= 30
    //    AND (discipline === undefined OR sessionType === discipline)
    // 6. Aggregate per userId:
    //    - totalMinutes = sum(durationMinutes)
    //    - sessionCount = count
    //    - topDiscipline = sessionType with max minutes for this user
    // 7. Sort by totalMinutes desc
    // 8. Assign ranks preserving ties (1, 1, 3 style)
    // 9. Hydrate top 50 only with { name, avatarUrl } from profiles table
    // 10. Compute myRank: locate caller's userId in the sorted list
    // 11. Return:
    //     {
    //       podium: [Rank1, Rank2, Rank3],   // <= 3 entries; fewer if gym has <3 ranked fighters
    //       ranks: [Rank4...Rank50],         // capped at 47 for top 50 total
    //       myRank: { rank, totalMinutes, topDiscipline } | null,
    //       asOf: number,                     // Date.now() for "Updated 3s ago" UI
    //       windowStart: string,              // ISO date
    //       windowEnd: string,                // ISO date
    //       totalRankedFighters: number,      // for "Showing 50 of 87" affordance
    //     }
  },
});
```

**Efficiency notes**:
- Single `gym_members` query to build shareData set
- Single ranged index scan on `fight_camp_calendar`
- Discipline filter is in-memory on the already-narrow week slice (no second index)
- Profile hydration only for top 50 — not for every active fighter

## UI Components

New directory `src/components/leaderboard/`:

```
LeaderboardSection.tsx       ← wrapper used by CoachDashboard.tsx + MyGym.tsx
├── DisciplineFilterTabs.tsx ← "All | BJJ | Boxing | Muay Thai | Wrestling | Strength | Sparring"
├── PodiumHero.tsx           ← top 3, single elevated glass-card
│   ├── PodiumPlace.tsx       ← single tier (gold/silver/bronze)
│   └── MedalIcon.tsx          ← SVG medal with tier color
├── RankedList.tsx           ← ranks 4+, virtualised if rows > 50
│   └── RankedRow.tsx          ← #rank · avatar · name · minutes · top discipline pill
└── MyRankFooter.tsx         ← sticky-ish footer (athlete view only)
```

### Visual Spec

**Aesthetic**: Apple Fitness × Strava, dark theme. Existing `.glass-card`, `rounded-2xl`, `tabular-nums` utility classes.

**New design tokens** (`src/index.css`):

```css
--medal-gold:   45 95% 58%;   /* warm gold ~#FFD24A */
--medal-silver: 220 13% 80%;  /* cool silver */
--medal-bronze: 25 65% 55%;   /* warm bronze */
```

**PodiumHero**:
- One `glass-card rounded-2xl` containing three stacked rows (1st on top)
- Tier 1: 64px avatar, bold name, big tabular-nums minutes, gold ring glow (`shadow-[0_0_24px_-4px] shadow-[hsl(var(--medal-gold)/0.6)]`)
- Tiers 2 & 3: 48px avatars, silver/bronze rings respectively
- Small medal SVG top-right of each place
- Top-discipline pill badge under each name
- Minutes count animates from previous value → new value via `framer-motion` `useSpring`

**RankedList**:
- Compact single-line rows: `#4  [avatar]  Name           BJJ · 280 min`
- Coach view: tap row → existing `athleteDetail` drawer
- Athlete view: read-only (no drill-in)
- Virtualisation kicks in when `ranks.length > 50` (using `@tanstack/react-virtual` if already in deps; otherwise plain windowing)

**MyRankFooter** (athlete view only):
- Pinned card below list: `You're #7 · 240 min · 60 min behind bronze`
- Hidden if caller is already in top 3 OR caller is a coach

**Empty states**:
- 0 ranked fighters in gym: "Be the first to train this week" + CTA opens existing `QuickLogDialog`
- Discipline filter with 0 matches: "No BJJ training logged this week"
- Gym has <3 ranked fighters: hide podium; show full list with subtle banner "Need 3+ active fighters to rank a podium"

**Loading**: skeleton matching real layout (3 podium rows + 5 list rows). No spinner.

## Integration Points

### Coach Dashboard
**File**: `src/pages/coach/CoachDashboard.tsx`

Insert `<LeaderboardSection gymId={gym.id} viewer="coach" />` per gym group, between the gym header and that gym's athlete row list.

### Fighter Gym Page
**File**: `src/pages/MyGym.tsx`

Insert `<LeaderboardSection gymId={gym.id} viewer="athlete" />` below `<AnnouncementsSection />`.

If the caller's `shareData=false` for that gym, the server query returns `null` and `LeaderboardSection.tsx` renders a small disclaimer in place of the leaderboard: "Enable data sharing to see the leaderboard" with a deep link to the existing toggle. (Their personal stats elsewhere are unaffected.)

## Privacy Enforcement

All privacy filtering happens **server-side** in `gymLeaderboard.weekly`:

- Aggregation excludes any userId whose `gym_members` row for this gym has `shareData=false`
- Their minutes do not count toward totals visible to anyone, including themselves on the leaderboard view
- This is deliberately stricter than just "hide their name" — anonymous aggregation could leak rank information via process of elimination

Coach view follows the same rule. Opting out means opting out of the leaderboard entirely, for everyone.

## Anti-Gaming

| Rule | Enforced where |
|---|---|
| Minimum 30 min per session to count | Server query filter |
| Tie preservation (rank 1, 1, 3) | Server ranking logic |

Explicitly **not** included (decided against in brainstorming): 4-hour daily cap, minimum-sessions-per-week threshold. These were considered but rejected as over-engineering for current scale.

## iOS Capacitor

- No native modules required
- Tab change in `DisciplineFilterTabs.tsx` calls `triggerHaptic('light')` from `src/lib/haptics.ts`
- Existing `registerPullRefresh` on host pages already refreshes Convex queries

## Testing Strategy

### Convex query tests
**File**: `convex/gymLeaderboard.test.ts` (TDD London — mock ctx)

Cases:
- Empty gym → empty podium and ranks, myRank=null
- Single ranked fighter → 1 podium entry, no ranks
- Three-way tie at top → all three ranked #1
- Opt-out fighter has 500 minutes → excluded from totals and rank
- Discipline filter "BJJ" → boxing/wrestling sessions excluded
- Session of 25 min → excluded
- Session at exactly 30 min → included
- Caller is opt-out for this gym → query returns `null` (host page renders the "Enable data sharing" disclaimer instead)
- Cross-week boundary (session 8 days ago) → excluded

### Component tests (React Testing Library)
- `PodiumHero` renders 0, 1, 2, 3 placements correctly
- `RankedRow` shows correct discipline pill
- `MyRankFooter` hidden when caller in top 3

### E2E (Playwright, if existing setup)
- Coach logs in → sees leaderboard
- Fighter logs new session → coach view updates within 1s (reactivity smoke test)
- Discipline tab change re-ranks without flicker

## Implementation Swarm

After this spec is approved and the implementation plan is written, spawn the following agents in parallel (hierarchical topology, single message):

1. **backend-dev** — schema migration + write hook + `gymLeaderboard.ts` query + backfill mutation
2. **coder** — `src/components/leaderboard/*` UI components
3. **coder #2** — integration into `CoachDashboard.tsx` and `MyGym.tsx`
4. **performance-engineer** — index validation, query timing on a seeded 200-fighter gym, virtualisation tuning
5. **tester** — Convex query unit tests + component tests
6. **reviewer** — privacy/auth audit on `gymLeaderboard.weekly` ensuring shareData gate cannot be bypassed

## Out of Scope (deferred)

- Push notifications when overtaken
- Historical leaderboard archive (past weeks)
- Multi-gym aggregated views for fighters who belong to several gyms
- Coach-configurable scoring weights or custom time windows
- Calendar-week mode (Mon–Sun reset)
- Animated 3D podium with confetti
- "Last week vs this week" comparison

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Index `by_gym_date` adds write overhead | One additional index on an existing write path; negligible at current scale |
| Backfill mutation timing out on large gyms | Use paginated migration with resumable cursor (`@convex-dev/migrations`) |
| Discipline strings inconsistent across UI (e.g. "BJJ" vs "bjj") | Normalize to title-case on read; defer schema-level enum to a follow-up |
| Coach sees opt-out fighter through `athletesOverview` but not leaderboard | Intentional — coach dashboard already filters; the two views consistently respect `shareData` |
| Tie-breaking creates visual ambiguity at podium edge (e.g. 4-way tie for 3rd) | Show all tied athletes in the bronze tier; expand the podium row vertically |

## Success Criteria

- Leaderboard renders for both coach and fighter views on the existing host pages
- New session log appears in the leaderboard within 1 second without manual refresh
- Query p95 latency under 100ms for a gym with 200 active fighters
- shareData=false fighters cannot be inferred from the leaderboard data
- No regressions in existing `CoachDashboard.tsx` or `MyGym.tsx` rendering or refresh behavior
