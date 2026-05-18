/**
 * Page-level header for the Corner tab.
 *
 * Anchored at the top of the Community page beneath the iOS safe-area
 * inset. Two visual blocks:
 *
 *   - Left: gym name (22pt semibold) + member-count subtitle (text-sm
 *     muted, e.g. "37 members · 12 training this week"). Subtitle uses
 *     a skeleton while the count query is in flight so we don't flash a
 *     placeholder.
 *
 *   - Right: "Bring a teammate" pill button. The pill is a `glass-card`
 *     so it inherits the same blur/border treatment as every other
 *     surface on the page — keeping the visual language consistent
 *     across the tab.
 *
 * When the gym has fewer than 5 members we ALSO render a larger
 * glass-card CTA below the header — at that headcount the tiny pill
 * doesn't read as a call-to-action, the page basically *is* the CTA.
 *
 * Member count + active-poster count come from the backend
 * `api.gyms.getMemberCount` query (added in a parallel PR). Until that
 * query lands the subtitle simply stays in skeleton state; never
 * crashes the page.
 */
import { Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";

/** Threshold for "small gym" treatment — under this we render the
 *  oversized CTA card. Matches `MEMBER_THRESHOLD` semantics from
 *  `Community.tsx`. */
const SMALL_GYM_THRESHOLD = 5;

interface GymHeaderProps {
  gymName: string;
  /**
   * Identifier for the active gym. Optional because `Community.tsx` may
   * not have resolved it yet on first paint — when absent we skip the
   * member-count query and degrade to the bare header.
   */
  gymId?: Id<"gyms"> | null;
  /**
   * Legacy prop — used to be the caller-computed teammate count. The
   * subtitle now reads `api.gyms.getMemberCount` directly, but we keep
   * the prop accepted-but-ignored so existing call sites compile during
   * the parallel-PR transition window.
   */
  memberCount?: number | null;
  onInviteClick: () => void;
}

interface MemberCountResult {
  memberCount: number;
  activePosters7d: number;
  /** Invite code is intentionally optional on the server side — coaches
   *  see it, randoms don't. We only render it when present. */
  inviteCode?: string | null;
}

/**
 * Resolve the `api.gyms.getMemberCount` reference at runtime. The
 * generated `api` typings may not yet include the function while the
 * backend PR is in flight; we read it through an `unknown`-typed proxy
 * so this file still compiles strictly.
 */
function getMemberCountRef(): Parameters<typeof useQuery>[0] | null {
  const gyms = api.gyms as unknown as Record<
    string,
    Parameters<typeof useQuery>[0] | undefined
  >;
  return gyms["getMemberCount"] ?? null;
}

export function GymHeader({
  gymName,
  gymId,
  // memberCount is intentionally destructured-and-ignored to preserve
  // the legacy call signature. Subtitle reads the live server count.
  memberCount: _memberCount,
  onInviteClick,
}: GymHeaderProps) {
  void _memberCount;
  const handleInvite = () => {
    triggerHaptic(ImpactStyle.Light);
    onInviteClick();
  };

  // Always call the hook (rules-of-hooks) — fall back to an already-deployed
  // query ref + a "skip" sentinel so the call is a no-op when either
  // the backend isn't ready or `gymId` is null.
  const queryRef = getMemberCountRef();
  const refForCall = (queryRef ??
    api.gyms.getById) as Parameters<typeof useQuery>[0];
  const args = queryRef && gymId ? { gymId } : "skip";
  const countRaw = useQuery(refForCall, args) as
    | MemberCountResult
    | null
    | undefined;
  // `undefined` from the query means "not loaded yet"; treat the
  // "no ref + skipped" combo as not-loaded so the skeleton shows once
  // and the consumer never sees garbage.
  const memberData = queryRef ? countRaw : undefined;

  // `null` is the server's "not a member of this gym" sentinel. Render
  // without the count subtitle but never crash the page.
  const isLoading = memberData === undefined;
  const hasCounts = memberData != null;
  const memberCount = memberData?.memberCount ?? 0;
  const activePosters = memberData?.activePosters7d ?? 0;
  const showLargeCta = hasCounts && memberCount < SMALL_GYM_THRESHOLD;
  const inviteCode = memberData?.inviteCode ?? null;

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1 pb-3">
        <div className="flex-1 min-w-0 mr-3">
          <h1 className="text-[22px] font-semibold leading-tight truncate">
            {gymName}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-1 h-3.5 w-40" />
          ) : hasCounts ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              {memberCount} {memberCount === 1 ? "member" : "members"} ·{" "}
              {activePosters} training this week
            </p>
          ) : null}
        </div>

        {/* Compact pill — always present so the affordance is consistent
            with the rest of the tab. At <5 members the large CTA below
            does the heavy lifting; this stays as a low-friction shortcut. */}
        <button
          type="button"
          onClick={handleInvite}
          aria-label="Bring a teammate"
          className="glass-card shrink-0 h-9 rounded-full px-3 flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          <span className="text-xs font-medium">Bring a teammate</span>
        </button>
      </header>

      {showLargeCta && (
        <button
          type="button"
          onClick={handleInvite}
          aria-label="Bring a teammate"
          className="glass-card mx-5 mb-4 flex w-[calc(100%-2.5rem)] items-center gap-4 rounded-2xl border border-border/50 p-4 text-left active:scale-[0.99] transition-transform"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] dark:bg-white/[0.08]">
            <Plus className="h-6 w-6" strokeWidth={2.4} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-sm font-semibold leading-tight">
              Bring a teammate
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {inviteCode
                ? "Share this code so they can join."
                : "Share your gym invite to unlock the feed."}
            </p>
            {inviteCode && (
              <span className="mt-2 inline-flex w-fit items-center rounded-md bg-foreground/[0.06] dark:bg-white/[0.1] px-2 py-1 font-mono text-sm font-semibold tracking-[0.18em]">
                {inviteCode}
              </span>
            )}
          </div>
        </button>
      )}
    </>
  );
}
