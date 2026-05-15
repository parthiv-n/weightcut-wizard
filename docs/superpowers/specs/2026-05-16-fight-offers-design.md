# Fight Offers — Design Spec

**Status:** Approved approach (Variant B). Implementation plan to follow.
**Date:** 2026-05-16
**Owner:** Pratik

## Problem

Coaches at affiliated gyms get fight opportunities (event dates, weight classes, sometimes a named opponent) and need to find a fighter from their roster. Today this happens in DMs and group chats, with no record, no roster-aware filtering, and no clean handoff into FightCamp Wizard's existing fight-camp tooling. The fighter ends up manually creating a camp from scratch even though the coach already knows the date and weight.

We want the coach to post a fight offer, fighters to one-tap express interest, and the act of the coach picking a fighter to seamlessly create that fighter's fight camp with the right date and target weight pre-populated.

## Scope

In scope:
- New "fight offer" announcement kind, composed by coaches inside the existing announcement compose flow.
- One-tap ternary interest signal (Yes / Maybe / Pass) per fighter, with a per-fighter "truth signal" derived from their current weight vs the offer's weight class.
- Coach detail view ranking interests by signal then by weight-cut proximity.
- Coach selection auto-creates a fight camp pre-populated with date + target weight.
- Push notifications: new offer to targeted set, picked fighter on selection, re-confirm push on detail change.

Out of scope (deferred):
- Coach ↔ fighter messaging on an offer.
- Multi-coach / promoter handshake.
- Anonymous interest signalling.
- Free-form "I'm looking for a fight" posts initiated by fighters.
- Sanctioning body / contract metadata.

Adjacent work (separate, ships first as small parallel task):
- Extend announcement media uploads to support video alongside images. Independent of fight offers but unblocks attaching a poster/clip to offers later.

## Non-goals

- We are **not** building a matchmaking engine. The coach picks; the system supports the decision with structured data, no more.
- We are **not** building a contracts/purse module.
- We are **not** routing interest signals to anyone other than the gym's coach(es).

## Architecture

### Data model

Extend `gym_announcements.kind` to include `"fight_offer"`. Reuse `body` for the coach's free-text pitch and `mediaUrl`/`mediaKind` (see Video Uploads section) for an optional poster. Add two new tables:

**`fight_offers`** (1:1 with the parent announcement)
```ts
{
  announcementId: Id<"gym_announcements">,  // 1:1 owner
  gymId: Id<"gyms">,                        // denormalised for cheap roster queries
  fightDate: number,                        // epoch ms, required
  weightClassKg: number,                    // required, single value (e.g. 70.0)
  eventName: string | null,
  opponentName: string | null,
  location: string | null,
  purseText: string | null,                 // free text — "$1,500", "TBD", etc.
  status: "open" | "filled" | "withdrawn",
  selectedFighterUserId: Id<"users"> | null,
  fightCampId: Id<"fight_camps"> | null,    // populated on accept
  filledAt: number | null,
}
```
Indexes: `by_announcement (announcementId)`, `by_gym_status (gymId, status)`.

**`fight_offer_interests`** (one row per fighter per offer)
```ts
{
  offerId: Id<"fight_offers">,
  userId: Id<"users">,
  signal: "yes" | "maybe" | "pass",
  createdAt: number,
}
```
Indexes: `by_offer (offerId)`, `by_offer_user (offerId, userId)` (unique).

### Server API (Convex)

New module `convex/fight_offers.ts`. Mutations:

- `createOffer(announcementInput, offerFields)` — wraps `announcements.create` in a single transaction. Calls `ctx.db.insert("gym_announcements", { kind: "fight_offer", ... })`, then inserts a `fight_offers` row pointing at it. Returns the announcement+offer pair.
- `setInterest(offerId, signal)` — upserts on `(offerId, userId)`. Rejects if offer.status !== "open". Rejects if userId is not a member of the offer's gym.
- `selectFighter(offerId, fighterUserId)` — coach-only. Creates a `fight_camps` row pre-populated from the offer (target_date = offer.fightDate, fight_week_target_kg = offer.weightClassKg). Patches the offer with `selectedFighterUserId`, `fightCampId`, `status: "filled"`, `filledAt`. Skips fight-camp creation if the fighter already has an active camp overlapping the date and returns a warning the UI can surface; in that case the offer still flips to "filled" but `fightCampId` stays null.
- `withdrawOffer(offerId)` — coach-only. Flips status to "withdrawn". Does not delete interests (audit trail).
- `updateOffer(offerId, patch)` — coach-only. Patching `fightDate` or `weightClassKg` enqueues a re-confirm push to YES/MAYBE responders (see Push).

Queries:

- `getOffer(offerId)` — returns the offer with its interest rows joined to lightweight athlete data (display_name, avatar_url, current_weight_kg, goal_weight_kg).
- `listMyOffers(gymId)` — coach-facing list of all offers in the gym, newest first.
- The fighter's feed continues to use `announcements.listForUser`; we extend that query to join the `fight_offers` row when `kind === "fight_offer"` so the card has everything it needs in one round-trip.

### Push notifications

Reuse `pushFanout.ts`:
- **New offer** → push to the announcement's target set (broadcast = all gym members, specific = chosen ids) immediately on `createOffer`.
- **Detail change** (date or weight class) → push only to fighters who responded YES or MAYBE; copy: "Offer details changed — re-confirm".
- **Coach picks a fighter** → push only to the picked fighter ("You're up — fight camp opened"). Other responders see the "Filled" state next time they open the feed; no fanout push to keep noise low.

### Targeting helper

In the compose sheet, the existing broadcast vs specific selector stays. When `kind === "fight_offer"` is active and `weightClassKg` is filled, the "specific" pane gets a one-tap "Suggest by weight" button that pre-selects roster fighters whose `goal_weight_kg` is within ±3 kg of the offer's weight class. The coach can edit the selection afterwards.

## UX

### Coach: compose

The existing `AnnouncementComposeSheet` grows a kind selector (segmented control: Text · Image · Poll · Fight Offer). Selecting Fight Offer reveals a structured form:

- Fight date (required, native date picker)
- Weight class kg (required, numeric, step 0.5)
- Event name (optional)
- Opponent name (optional)
- Location (optional)
- Purse (optional, free text)
- Pitch / extra detail (body, optional)
- Media (optional, image or video)
- Targeting (broadcast / specific, with the "Suggest by weight" helper)

Send CTA: "Post offer". Confirmation toast on success.

### Fighter: feed card

In the announcement feed, fight-offer cards render distinctly from text/image/poll:

```
┌────────────────────────────────────────────┐
│ FIGHT OFFER · Iron Wolf MMA · Coach Alex   │
│                                            │
│  NOV 22 · 70.0 kg                          │  ← big date + weight class
│  Cage Warriors 162 · London                │  ← event / location if present
│  Opponent: TBA                             │
│                                            │
│  "Quick turnaround — let me know early."   │  ← coach pitch (body)
│                                            │
│  ┌─────────┐ ┌───────┐ ┌──────┐            │
│  │ ✓ I'm in │ │ Maybe │ │ Pass │           │  ← one-tap, primary on yes
│  └─────────┘ └───────┘ └──────┘            │
│                                            │
│  You're 4.2 kg over · 8 weeks out          │  ← truth signal (see below)
└────────────────────────────────────────────┘
```

After tap, the three buttons collapse into a single "You said: Yes ↻ change" pill. No confirmations — the change is reversible right there.

**Truth signal** is a one-line derivation from the fighter's profile + weight log:
- If `current_weight_kg - weightClassKg <= 0`: "Inside class · safe cut"
- Else: `"You're {delta} kg over · {weeksToFight}w out"`
- Computed client-side from the profile already in `useUser()` and `fightDate`. No new query.

If the offer is `filled` and the viewing fighter is the picked one: card flips to "You're up · fight camp opened" with a CTA to the camp. For everyone else: "Filled — congrats {Name}". For `withdrawn`: card greys out with "Withdrawn" label.

### Coach: offer detail

Tap a fight offer in the coach feed → bottom sheet showing the offer header and a list of interest rows, sorted YES → MAYBE → PASS, then by `|current_weight - weightClassKg|` ascending within each group.

```
┌────────────────────────────────────────────┐
│  NOV 22 · 70.0 kg · Cage Warriors 162      │
│  3 yes · 2 maybe · 1 pass                  │
│                                            │
│  YES                                       │
│  ─────────────────────────────────────     │
│  Alex Park        72.4 kg  +2.4  ★ best    │
│  Sam Kim          74.0 kg  +4.0            │
│  ...                                       │
│  MAYBE                                     │
│  ...                                       │
└────────────────────────────────────────────┘
```

Each row tap → confirm sheet: "Offer fight to Alex? Creates a fight camp for Nov 22 at 70 kg." Single CTA "Confirm". On confirm, the offer flips to filled and the camp is created.

If the selected fighter has an existing active camp overlapping the date, the confirm sheet warns inline: "Alex already has an active camp ending Mar 14 — fight camp will not be auto-created. Resolve in their profile." Coach still gets to confirm (the offer flips to filled, just without the auto-camp).

## Data flow

1. Coach submits compose form → client calls `createOffer` → Convex inserts announcement + offer in one transaction → `pushFanout` schedules push to target set.
2. Targeted fighters open the app → `announcements.listForUser` returns the announcement with the joined offer row + their own interest if any.
3. Fighter taps a signal → `setInterest` upserts → query auto-invalidates → the card re-renders with the "You said:" pill.
4. Coach opens offer detail → `getOffer` returns the offer + all interests with joined athlete data → renders ranked list.
5. Coach taps "Offer fight to Alex" → `selectFighter` creates the fight camp (or skips with warning), patches the offer to `filled`, schedules a single push to Alex.
6. All open fighters' feed cards reactively update to the "Filled" state next time they're queried; we do not push to non-picked responders.

## Error handling

- `setInterest` on a non-open offer: server rejects with "Offer no longer open." Card refetches and renders the new status; the buttons are gone.
- `selectFighter` race (two coaches at once): Convex transactional patch on `status: "open"` precondition. Loser sees "This offer was just filled."
- Detail-change push for a fighter whose target hasn't moved (e.g. coach saved with no diff): suppress in `updateOffer` by comparing before/after.
- Fight camp creation failure (validation, missing profile fields): swallow on the server, return a warning the client surfaces as a banner on the coach's confirm screen. Offer still flips to filled — coach can fix the camp setup manually from the fighter's profile.

## Video uploads (parallel feature, ships first)

This is independent of fight offers but should ship before the offer card lands so coaches can attach video to *any* announcement and the offer card just inherits it.

- Schema: rename `gym_announcements.imageUrl` mentally to `mediaUrl` but **keep the column name** (`imageUrl`) for migration safety, and add `mediaKind: "image" | "video" | null`. Existing rows backfill to `mediaKind: "image"` where `imageUrl` is non-null.
- Upload path: extend the existing image-upload mutation to accept video MIME types (`video/mp4`, `video/quicktime`). Cap at 25 MB; no server-side transcoding. Reject anything larger client-side before upload.
- UI: compose sheet's "Add image" button becomes "Add media" with file-picker filter `image/*,video/*`. Selected media previews inline before send (`<img>` for image, `<video controls>` for video).
- Feed render: image rows are unchanged. Video rows render `<video controls playsInline preload="metadata">` with `poster` left empty (browser shows first frame). No autoplay.
- Share cards: video can't be embedded in a static share card; if a fight offer's media is a video, the share card falls back to the offer header only.

Effort: ~half a day. Ships before the fight-offer feature lands.

## Testing strategy

Unit-level (Convex test runner):
- `createOffer` writes both rows transactionally; rollback if either insert fails.
- `setInterest` uniqueness on `(offerId, userId)`; only members of the offer's gym can write.
- `selectFighter` flips status with optimistic-concurrency precondition; creates camp; skips camp creation when fighter has an overlapping active camp.
- `updateOffer` push-suppression when patch is a no-op.

Component-level:
- Feed card renders correct state for open / filled-as-self / filled-as-other / withdrawn.
- Truth-signal copy across the three weight-delta cases (under / at / over class).
- Coach detail list sort order: YES first then MAYBE then PASS, weight-proximity tie-break within each group.

End-to-end smoke (one happy path on each side):
- Coach creates offer → targeted fighter sees push → taps Yes → coach sees the YES row → coach picks them → fight camp appears in fighter's app.

## Open questions to resolve during implementation

None blocking. Two minor calls to make in the plan:

1. Where does the coach detail sheet live — inside the existing offer card with an expandable footer, or as a new bottom-sheet route? Recommend bottom sheet to match other coach surfaces.
2. Should the "Suggest by weight" helper auto-include fighters who have *no* `goal_weight_kg` set? Recommend no; surface a footer "+3 fighters without a goal weight" they can opt into.

## Effort estimate

- Video uploads (parallel pre-work): ~0.5 day
- Schema migration + Convex mutations/queries for offers + interests: ~1 day
- Compose-sheet fight-offer pane: ~0.5 day
- Feed card variant + truth-signal: ~0.5 day
- Coach detail sheet + select-fighter flow + auto-camp creation: ~1 day
- Push wiring + tests: ~0.5 day

Total: ~4 working days excluding review.
