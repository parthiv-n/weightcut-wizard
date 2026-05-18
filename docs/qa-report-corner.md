# QA Report — Corner (Community) Social Tab

**Author:** QA pass (allowed-files-only)
**Date:** 2026-05-18
**Scope:** Verify type-safety, lint cleanliness, shared-element transition
correctness, memoization shape, and async-safety in the Corner tab's
already-shipped files. Three other engineers are concurrently editing
adjacent files (`gymFeed.ts`, `Profile.tsx`, `PostComposer.tsx`,
`SessionInfoCard.tsx`, `GymHeader.tsx`, moderation surfaces) — those
are out of scope here.

---

## 1. Commands run

| Command | Exit | Notes |
|---|---|---|
| `npx tsc --noEmit` | `0` | Clean — 0 errors project-wide. |
| `npm run lint` (eslint) | `1` | 629 problems (464 errors, 165 warnings) project-wide — **none** in the allowed-files list below. |
| `npx eslint src/pages/Community.tsx` (post-fix) | `0` | Clean after my edit. |
| `npx tsc --noEmit` (post-fix) | `0` | Still clean. |

> The task brief mentions "~100 pre-existing errors in OTHER files (Dashboard.tsx, WeightTracker.tsx, etc.)" — that's true for **lint**, not **tsc**. Type-checker is fully green on this branch.

---

## 2. Allowed-files inventory

Re-checked against the brief's "YOU MAY MODIFY" list — all 14 files exist and were read:

```
src/components/community/PolaroidStack.tsx
src/components/community/PolaroidCard.tsx
src/components/community/EmptyStackState.tsx
src/components/community/StackSkeleton.tsx
src/components/community/PostGrid.tsx
src/components/community/MadeWeightShareSheet.tsx
src/pages/Community.tsx
src/hooks/community/useGymFeed.ts
src/hooks/community/usePolaroidStack.ts
src/hooks/community/useCreatePost.ts
src/hooks/community/useProfilePosts.ts
src/hooks/useMadeWeightShare.ts
src/lib/madeWeightCard.ts
src/lib/imageCompress.ts
```

No lint output references any of these paths. No tsc diagnostic references
any of these paths. Static-correctness issues were found by manual read,
not by tooling.

---

## 3. Issues fixed (in allowed files only)

### 3.1 `src/pages/Community.tsx:112-116` — `navigate()` called during render

**Before:**

```tsx
if (!gymsLoading && !primaryGym) {
  // Route, not redirect-component, so the back stack stays sane.
  navigate("/join", { replace: true });
  return null;
}
```

**Problem.** `useNavigate()` triggers a router state update; invoking it
synchronously during render causes React to emit *"Cannot update a
component (`BrowserRouter`) while rendering a different component
(`Community`)"*. On iOS WebView this surfaces as a red error overlay in
dev, and in production it's a swallowed warning with the side effect that
the redirect fires twice on first mount (once during render, once after
hydration).

**After:**

```tsx
const shouldRedirectToJoin = !gymsLoading && !primaryGym;
useEffect(() => {
  if (shouldRedirectToJoin) {
    navigate("/join", { replace: true });
  }
}, [shouldRedirectToJoin, navigate]);
if (shouldRedirectToJoin) {
  return null;
}
```

The render still returns `null` immediately so the user never sees a
flash of the polaroid-stack scaffolding; the actual navigation lands one
effect-tick later, which is exactly how React Router's own redirect
helpers do it.

**Verification:** `npx tsc --noEmit` → 0 errors. `npx eslint src/pages/Community.tsx` → 0 problems.

---

## 4. Static visual-correctness check (task 4)

### 4.1 `layoutId` parity for shared-element transition

- **`PolaroidStack` → `PolaroidCard.tsx:103`** emits `` `post-${post.id}-image` `` where `post.id` is `FeedPost.id: Id<"session_media">`.
- **`PostGrid.tsx:78`** emits `` `post-${String(post._id)}-image` `` where `post._id` is `ProfilePost._id: Id<"session_media">`.

Both id values come from the same Convex `session_media` doc — `useProfilePosts` (line 141) explicitly normalises whatever the server returns into `_id`, falling back to `r.id` if the server payload happens to expose it under that name. `Id<"session_media">` is a branded string at runtime so `String(post._id)` and `post.id` produce the same characters on the wire.

**Verdict: PASS, layoutIds match by content.** No fix needed.
(The cosmetic asymmetry — one site uses `String(...)` wrapper, the other doesn't — is harmless. I left it alone rather than churn a load-bearing animation key.)

### 4.2 `React.memo` on `PolaroidCard`

`src/components/community/PolaroidCard.tsx:167-181`:

```ts
function areEqual(prev, next) {
  return (
    prev.post.id === next.post.id &&
    prev.isTop === next.isTop &&
    prev.stackPosition === next.stackPosition &&
    prev.rotationDeg === next.rotationDeg &&
    prev.post.url === next.post.url &&
    prev.post.thumbDataUrl === next.post.thumbDataUrl
  );
}
export const PolaroidCard = memo(PolaroidCardBase, areEqual);
```

Compared against the props the component actually consumes (`PolaroidCardBase`'s body, lines 55-160): `post.id`, `post.url`, `post.thumbDataUrl`, `post.caption`, `post.author.{displayName,avatarUrl}`, `post.createdAt`, `isTop`, `stackPosition`, `rotationDeg`, `onAuthorLongPress`.

The comparator omits `post.caption`, `post.author.*`, `post.createdAt`, and `onAuthorLongPress`. The first three are essentially immutable for the lifetime of a `post.id` (captions are not edited, the author and `createdAt` are write-once on the server). `onAuthorLongPress` is a stable callback from the parent `PolaroidStack` — and the comment at line 166 explicitly explains the intentional drop. **PASS.**

### 4.3 `useCreatePost` no longer references `uploadSessionMediaV2`

`src/hooks/community/useCreatePost.ts:95-96`:

```ts
const generateUploadUrl = useMutation(api.gymFeed.generateUploadUrl);
const createPostMut    = useMutation(api.gymFeed.createPost);
```

…and the body (line 153) calls `createPostMut(...)`. The obsolete name
`uploadSessionMediaV2` appears only in the docstring (lines 28-44),
preserved as historical context for the backend handoff. **PASS.**

---

## 5. Async-safety pass (task 5)

All findings below are in allowed files; gray-area items are flagged at
the bottom rather than fixed.

| File:line | Pattern | Verdict | Action |
|---|---|---|---|
| `Community.tsx:88` | `markEngagementSeen({}).catch(...)` | OK — promise is consumed, error logged | none |
| `Community.tsx:112-116` | `navigate()` during render | **Broken** | **Fixed** (§3.1) |
| `Community.tsx:74-80` | `useEffect` calls `reset()`, has `eslint-disable` for missing `reset` dep | OK — `reset` is referentially stable per `usePolaroidStack`, comment explains | none |
| `Community.tsx:69-71` | Mirrors `topIndex` → `activeTopIndex` via effect | Slightly redundant, but harmless; lets `CommunityFeedSection` own the active index | none (gray area, not breaking) |
| `PolaroidStack.tsx:118-124` | `useEffect` preloads `visible` images, `new Image()` not awaited | OK by design — fire-and-forget warm-cache | none |
| `PolaroidStack.tsx:130-134` | Pagination trigger; deps `[topIndex, posts.length, status, loadMore]` | OK | none |
| `PolaroidStack.tsx:151-156` | `setTimeout` advances the stack post-flick; no cleanup if component unmounts mid-flick | Gray area — would call `setState` after unmount. React 18 silently ignores it (the warning was removed in 18.0), so not actively broken. Flagged for the lead. | flagged §7.3 |
| `MadeWeightShareSheet.tsx:92-127` | `useEffect` `build()` async fn invoked, cancelled flag guards state writes, object URL revoked in cleanup | Correctly written | none |
| `MadeWeightShareSheet.tsx:88` | `handleSave` async, attached to `onClick` (return value discarded) | Fine — React supports async event handlers, errors are caught inside | none |
| `useCreatePost.ts:103-174` | Three sequential try/catch around mutate → upload → mutate | Excellent — explicit error messages, toast + throw on each step | none |
| `useGymFeed.ts:97` | `(results ?? []) as unknown as FeedPost[]` double-cast | Documented at the call site (lines 93-96). Loses a thin layer of structural typing but is intentional. | none |
| `useProfilePosts.ts:108-110` | Falls back to `api.gymFeed.listFeed` with `"skip"` args when the real query ref is missing, then returns `EMPTY_HANDLE` | Subtle but safe — listFeed's args won't match, but `"skip"` short-circuits before validation. **Will throw if Convex tightens "skip" semantics**; flagged for the lead. | flagged §7.1 |
| `useProfilePosts.ts:138-150` | Server-row → ProfilePost normalisation tolerates `id` or `_id` | OK | none |
| `madeWeightCard.ts:104-118` | Image load with `crossOrigin: "anonymous"` — fails silently if the CDN doesn't return CORS headers | OK — caller draws a placeholder instead of throwing | none |
| `useMadeWeightShare.ts:107` | `navigator.share` AbortError treated as success | Intentional UX choice (cancel is not an error) — see line 111 comment | none |

---

## 6. Issues left in YOUR allowed files

**None.** All issues found in scope were fixed (one — §3.1) or were
deliberate patterns documented at the call site.

---

## 7. Errors detected in DISALLOWED files (flagged, **not fixed**)

These are concurrent-engineer responsibilities. Surfacing them so they
don't slip through to merge.

### 7.1 `convex/feedSocial.ts:29` (lint warning)

```
'COMMENTS_PAGE_DEFAULT' is assigned a value but never used.
```

A dead constant declared at the top of the file. Owner of `feedSocial.ts`
should either wire it up to the comments query or delete it.

### 7.2 `convex/gyms.ts` (lint errors)

```
245:55  Unexpected any  @typescript-eslint/no-explicit-any
334:40  Unexpected any  @typescript-eslint/no-explicit-any
```

Two `any` casts the gyms-owner should narrow to a typed shape.

### 7.3 `convex/profiles.ts` (lint errors, 83, 86, 120, 121, …)

```
83:32  Unexpected any
83:45  Unexpected any
86:31  Unexpected any
120:23 Unexpected any
121:22 Unexpected any
```

Multiple `any` parameters in the profile module's helper functions. The
Profile.tsx UI page builds on these, so the lead should ask the profile
owner to type-narrow before this lands on `main`.

### 7.4 `convex/exercise_prs.ts:108`, `convex/fightFormScore.ts:362`, `convex/fight_camp.ts:124+`, `convex/gym_members.ts:234`, `convex/gym_sessions.ts:219`, `convex/http.ts:53`, plus ~40 more files

Project-wide `no-explicit-any` failures — out of scope for the Corner
review, but lint will reject `main` until someone owns the cleanup. The
build still passes because `tsc` is clean (the `any`s typecheck), but
`npm run lint` exits 1 with 464 errors. Flagging so the lead is aware
the lint job is currently red and unrelated to this PR.

---

## 8. Top 3 risk items for tech-lead manual verification

### 8.1 `useProfilePosts` "stand-in query" fallback

**Risk.** Lines 108-110 pass `api.gymFeed.listFeed` as a fallback when
the not-yet-deployed `listProfilePosts` is missing, with `"skip"` as
args. If the parallel backend engineer ships `listProfilePosts` with a
**different** validator (e.g. takes `gymId` instead of `ownerUserId`),
the runtime check `queryRef ?? null` will still resolve to the new
function, then the next render will hit the fallback `args = "skip"`
branch — *but only if `userId` is null OR `queryRef` is null*. Once both
are non-null, the real query fires with `{ ownerUserId }`. If the
backend chose `{ userId }` or `{ profileId }`, every Profile page render
will throw. **Verify** the validator field name in `convex/gymFeed.ts`
matches `ownerUserId` exactly before merge.

### 8.2 Stack-advance `setTimeout` running after unmount

**Risk.** `PolaroidStack.tsx:151-156` schedules `advance()` and motion-value
resets via `window.setTimeout(..., 350)` with no cleanup. If the user
flicks a card and immediately navigates away (e.g. taps a deep link,
hits hardware back on Android), the timeout fires after unmount and
calls `setExitingPostId(null)` + `advance()` on a stale component. React
18 silently no-ops the `setState`, but `advance()` writes to
`sessionStorage` — meaning the persisted `topIndex` may advance even
though the user never saw the next card. **Verify** the expected
behaviour after a mid-flick navigation, and consider clearing the
timeout in a `useEffect` cleanup if it matters. Not fixing here — the
gesture timing is spec-locked and a wrong cleanup would break the visual
hand-off.

### 8.3 `Community.tsx` reads `posts.length` as a stand-in for member count

**Risk.** Line 136 sets `<GymHeader memberCount={null} />` deliberately,
but the comments at lines 132-137 + the InviteLanding's
`memberCount={0}` (line 157) reveal that the sub-threshold logic
(`MEMBER_THRESHOLD = 5`) is currently **wired against `posts.length === 0`,
not actual member count**. That means a gym with 100 members and 0 posts
hits the "Build your corner" invite landing instead of the empty-stack
state. With `EmptyStackState` already shipping a "Corner's empty. Post
the first round." CTA, the two surfaces overlap. **Verify** with the
SessionInfoCard owner what the intended "no posts but plenty of
members" experience is — there's a UX seam here that the threshold
logic doesn't quite cover. (Not fixing — it requires the member-count
API which is in the parallel engineer's scope.)

---

## Summary

- **Issues fixed:** 1 (Community.tsx `navigate()` during render)
- **Type-checker:** clean (0 errors, both before and after the fix)
- **Lint:** project-wide 464 errors / 165 warnings, **0 in allowed files**
- **Disallowed-file findings surfaced:** 4 (profiles.ts, gyms.ts, feedSocial.ts unused const, project-wide `any` debt)
- **Manual-verify risks for the lead:** 3 (validator-field-name drift, mid-flick unmount, `posts.length` as member-count stand-in)
