# Corner — Gym-Scoped Social Tab Plan

> Generated 2026-05-18. Synthesis of product/growth, iOS UI, Convex schema, and frontend implementation briefs. Pair with the existing `convex/gymFeed.ts` / `convex/feedSocial.ts` codebase — much of this is reskin + promote, not greenfield build.

---

## The big realization

The Convex backend (`convex/gymFeed.ts`, `convex/feedSocial.ts`) already implements gym-scoped posts, likes, comments, privacy filter, and unread-engagement badging. There's even an existing `/gym-feed` route with a TikTok-style swiper. **You aren't building a social network — you're transforming a hidden, vertical-swipe feed into a promoted polaroid-stack interaction with a profile page added.** ~2-week project, not a quarter.

## Naming + positioning

| | Value |
|---|---|
| Tab name | **Corner** (boxer's corner = your people) |
| Icon | `Swords` (Lucide) |
| Tagline | "Your gym's training feed" |
| Empty state | *"Corner's empty. Post the first round."* |

## Why gym-scoped wins (strategy summary)

- Combat athletes already train in tribes — your gym IS your brand identity
- Weight cuts are vulnerable, not viral — private-to-gym unlocks honest posts (full-body weigh-ins, IV recovery)
- Coach hierarchy already exists IRL → instant moderation primitive (coach role = gym admin)
- Niche audience math: a BJJ blue belt's open-mat clip dies in 4 views globally but gets 22 reactions from their 80-person gym

## The single viral hook

**Auto-generated "Made Weight" polaroid share-card.** When a user logs a weigh-in that hits their target, generate a polaroid image with gym branding + WeightCut watermark + cut delta ("170.4 → 155.0 in 12 days. Tiger Muay Thai."). Fighters post these to their personal IG/Stories — every fight weekend, dozens of perfectly-targeted ads hit the algorithm. Off-platform reach, zero spend. **Build this first after the core stack ships.**

---

## Interaction model (the polaroid stack)

### Physics + dimensions
- **Card**: 312×312 image, 16px white border on top/L/R, **44px bottom strip** (real polaroid feel) showing date + time
- **Stack depth**: top 3 visible (don't render the rest in DOM)
- **Stack offsets**: top {scale 1, opacity 1, rot -2°}, second {scale 0.96, opacity 0.7, rot +1°, y+10}, third {scale 0.92, opacity 0.4, rot -1°, y+20}
- **Spring**: damping 18, stiffness 220, mass 0.9

### Gestures
- **Tap**: random-direction flick (`flickX = ±(200–800)px`, `flickRot = ±(40–70)°`), 420ms exit, opacity to 0
- **Drag**: live `rotate = x / 12` clamped ±25°; threshold `|offset.x| > 120 || |velocity.x| > 600` triggers flick; otherwise snap-back (`damping 28, stiffness 320`)
- **Empty stack**: illustration + "Post the first round" CTA
- **Pull-to-refresh**: existing global `<PullToRefresh />` already mounted; trigger feed refetch + reset topIndex with deck-shuffle animation

### The session info card (binds to the *top* polaroid)
- Training-type chip with icon (Striking → `Zap`, Grappling → `Hand`, Cardio → `Activity`, Cut → `TrendingDown`, Weigh-in → `Scale`, Sparring → `Swords`)
- Metadata row: duration · RPE · optional weight (`display-number` style)
- 2-line notes preview
- Author row: avatar · name · relative time · lock icon if private
- Like + Comment buttons (reuse existing `useFeedEngagement.ts` — no new logic)

### The unexpected delight: **Glove-tap**
Double-tap the top polaroid — a red boxing-glove SVG icon explodes from tap point at 1.4× scale, spins 12°, fades over 480ms. Heart count increments. **Card stays on the stack** (unlike Instagram's heart-double-tap dismiss). You're co-signing the work, not dismissing it. Differentiated from IG, authentic to combat-sports vernacular. (Use an inline SVG or Lucide-style glyph — no emoji characters.)

---

## Bottom-nav promotion

Existing nav: `[Dashboard] [Nutrition] [More] [Weight] [+]`. Updated per direction — keep all originals, insert Corner in the middle:

```
[Dashboard] [Nutrition] [Corner] [More] [Weight] [+]
```

- All original slots preserved; Corner is a new middle slot (Swords icon)
- Move the existing red-dot unread-engagement indicator from More → Corner tab icon
- Keep `/gym-feed` route as a redirect to `/community` for one release, then delete

## Onboarding: gym-join via **invite code from coach**

Recommended over location-based lists (gym-name squatting risk) and email whitelist (admin overhead). 6-char code, coach pins it to their WhatsApp group, users enter it on first launch or in `/settings`. Existing `gym_invites` table supports this.

Cold-start behavior:
- **< 5 active gym members**: hide the feed, show "Your Gym" landing with prominent invite code, progress ("3/5 teammates needed to unlock feed"), and joined-member list. Scarcity > emptiness.
- **No gym yet**: route to "Solo Mode" — private journal-only. Pre-load a "Pending: 1 of 2 needed" state. When a second user joins same gym, push both: `Your gym just unlocked. Mike joined.`

---

## Schema deltas (additive, zero downtime)

Already exists: `gyms`, `gym_members`, `session_media` (= posts), `feed_likes`, `feed_comments`, `gym_invites`, rate-limits. Add:

```ts
session_media: defineTable({
  // ...existing
  thumbStorageId: v.optional(v.id("_storage")),  // 256px JPEG for grid
  thumbDataUrl: v.optional(v.string()),          // ~2KB base64 LQIP for inline blur-up
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  deletedAt: v.optional(v.number()),             // soft-delete
})
  .index("by_user_created", ["userId"]);         // NEW — profile grid hot path

gym_members: defineTable({
  // ...existing
  role: v.union(v.literal("admin"), v.literal("coach"), v.literal("athlete")),
})
  .index("by_user_status", ["userId", "status"]); // NEW — "what's MY active gym?"

post_reports: defineTable({                       // NEW
  postId: v.id("session_media"),
  gymId: v.id("gyms"),
  reporterUserId: v.id("users"),
  reason: v.union(v.literal("spam"), v.literal("inappropriate"), v.literal("harassment"), v.literal("other")),
  status: v.union(v.literal("open"), v.literal("resolved"), v.literal("dismissed")),
})
  .index("by_gym_status", ["gymId", "status"])
  .index("by_post", ["postId"]);
```

**Hot query (gym feed)** is already paginated, gym-scoped, privacy-filtered. Two improvements:
- Batch-dedupe author lookups (currently N+1 on the profile reads — collapses 12 reads to ~6 in a typical feed page)
- Hydrate `thumbDataUrl` for blur-up so the first paint is instant

**Image storage**: stay on Convex Storage (you already use it everywhere). Pipeline: client compresses HEIC → JPEG at 1024w q=0.82 (≤400KB), uploads via `generateUploadUrl`, scheduled action generates the 256px thumb + 24×24 base64 LQIP. **Do not move to R2** — extra IAM surface, one more thing to break.

**Cost at scale** (1000-gym, 50k-user, 5% DAU):
- ~30–35 doc reads per polaroid stack page
- ~65 reads per user-session
- ~3.25M reads/day platform-wide — well within Convex Pro limits
- `by_gym_created` index ranges on gymId first → no global hot partition

---

## File / component structure (frontend)

```
src/pages/
  Community.tsx                          ← new tab page
  Profile.tsx                            ← /profile/:userId

src/components/community/
  PolaroidStack.tsx                      ← gesture state + flick
  PolaroidCard.tsx                       ← single card, React.memo
  SessionInfoCard.tsx                    ← binds to top card
  PostComposer.tsx                       ← camera/library + caption + privacy
  GymHeader.tsx                          ← gym name, member count, invite
  PostGrid.tsx                           ← 3-col profile grid
  EmptyStackState.tsx                    ← "Post the first round"
  StackSkeleton.tsx                      ← cold-launch shimmer

src/hooks/community/
  usePolaroidStack.ts                    ← gesture math, topIndex orchestration
  useGymFeed.ts                          ← usePaginatedQuery + preload + cache
  useToggleLike.ts                       ← adapter over existing useFeedEngagement
  useProfilePosts.ts                     ← profile grid
  useCreatePost.ts                       ← Capacitor camera → compress → upload
  useFeedCache.ts                        ← AIPersistence-pattern cache (5min TTL)

src/lib/
  imageCompress.ts                       ← OffscreenCanvas → JPEG 1024w q=0.82
  feedHaptics.ts                         ← centralised haptic patterns
```

Reuse as-is:
- `src/hooks/useFeedEngagement.ts` (already has the optimistic-like reducer)
- `src/components/gym-feed/CommentsSheet.tsx` (re-export)
- `convex/gymFeed.ts:listFeed` (add author-dedupe + thumb hydration)
- `convex/feedSocial.ts` (likes, comments, unread)

---

## Build plan (phased, prioritized)

### Phase 1 — Backend additive deploy (1 day)
- [ ] Schema deltas above (all optional fields = no breakage)
- [ ] Backfill thumb generation via internal action (resumable, batches of 50)
- [ ] Backfill `gym_members.role` from existing `memberRole`
- [ ] Add `by_user_created` and `by_user_status` indexes
- [ ] Update `listFeed` with author-dedupe + thumb fields

### Phase 2 — Core polaroid UX (3–4 days)
- [ ] `Community.tsx` + `PolaroidStack` + `PolaroidCard` + `SessionInfoCard`
- [ ] Hook up to existing `listFeed` via `useGymFeed`
- [ ] Wire `useFeedEngagement` into the session card
- [ ] Glove-tap delight
- [ ] Haptics + safe-area + dynamic type

### Phase 3 — Promotion to bottom nav (1 day)
- [ ] Insert Corner as a new middle slot in `mainNavItems` (keep all original slots)
- [ ] Move red-dot indicator to Corner
- [ ] Add `/gym-feed → /community` redirect
- [ ] Add to `App.tsx` idle preload

### Phase 4 — Composer + Profile (3 days)
- [ ] `PostComposer.tsx` with Capacitor camera + compression
- [ ] `Profile.tsx` + `PostGrid.tsx` with shared-element `layoutId` from polaroid
- [ ] Profile route + back gesture preserving stack index

### Phase 5 — Onboarding + invite (2 days)
- [ ] Empty-gym landing screen (invite code + progress)
- [ ] Solo Mode for users with no gym yet
- [ ] Pending-gym-unlock push notification

### Phase 6 — The viral hook (2 days)
- [ ] Auto-generated "Made Weight" polaroid (Convex action + Canvas render)
- [ ] Share-sheet integration via Capacitor Share API
- [ ] Gym branding pulled from `gyms` table

### Phase 7 — Moderation + abuse (1 day)
- [ ] `post_reports` table + report UI
- [ ] Gym-admin moderation panel (basic — hide/delete/ban)
- [ ] Rate-limit additions (20 posts/day, 60 likes/min, 10 comments/min)

**Total: ~14 working days for a polished v1.**

---

## Notifications (push events ranked)

| # | Event | Copy |
|---|---|---|
| 1 | Coach reacted to your post | `Coach Eddie just reacted to your cut update.` |
| 2 | Teammate fight in ≤72h | `Marco fights Saturday. Drop a message.` |
| 3 | Teammate hit target weight | `Sara just made 125. The gym's hyped.` |
| 4 | Shared training streak | `You and Jordan trained 4x this week. Post the photo.` |
| 5 | Gym milestone | `Renzo Gracie just cut 200lbs combined this camp.` |

Wire via existing Convex action pattern; let the user toggle each category in settings.

---

## Open questions (decided defaults if you don't push back)

1. **Profile page stats** — default to: sessions logged, kg/lb cut total, camps completed. Skip charts in v1.
2. **Multi-gym** — single gym per user in v1. Plumbing in place for multi-gym later (`gym_members` already supports it).
3. **Follow-button on profiles** — punt to v2; gym = follow graph in v1.
4. **Comment notifications** — author gets push on first comment per post per day (de-bounced to avoid spam).
5. **Made Weight card design** — needs a separate design pass (the viral hook deserves its own brief).

---

## Reference — agent briefs (compressed)

### Product/growth (strategy)
- Gym-scoped wins for combat sports because gyms are pre-existing tribes with a coach hierarchy
- Coach onboarding is the highest-K growth loop; printed gym-lobby QR + fight-week shareable cards are secondary
- Critical mass = 8 active posters/week (~13% of a 60-person gym)
- Solo Mode for gyms with no critical mass yet

### iOS UI/UX
- Tab: "Corner" / Swords icon
- 312×312 polaroids, 3-card stack, deterministic per-card rotation via post-id hash
- Drag-to-flick with explicit thresholds; tap-to-flick with randomized direction
- Glove-tap double-tap delight (red boxing-glove SVG icon, card stays — no emoji characters)
- Long-press author row → profile (not the polaroid itself — flick stays sacred)

### Backend (Convex)
- ~80% of schema already exists in `convex/gymFeed.ts` + `convex/feedSocial.ts`
- Additive deltas only — no migrations breaking change
- Stay on Convex Storage (don't add R2)
- Denormalized like/comment counts on `session_media` — fine at this scale; shard later if a single post crosses ~10 likes/sec

### Frontend
- Insert Corner into `mainNavItems` as a new middle slot — keep all existing slots
- Reuse existing `useFeedEngagement.ts` for the optimistic-like state
- `usePaginatedQuery` on `listFeed`, initialNumItems 12, loadMore 8 when topIndex within 5 of end
- Render only top 3 polaroids in DOM; explicit `animate` props, never `layout`
- Shared-element transitions via framer-motion `layoutId` between polaroid and profile-grid item
