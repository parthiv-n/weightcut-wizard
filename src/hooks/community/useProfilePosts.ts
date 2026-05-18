/**
 * useProfilePosts — paginated grid of a single user's posts (newest first)
 * for the Corner tab's Profile page.
 *
 * ─── Expected backend contract ────────────────────────────────────────
 *
 * The backend agent owns `convex/gymFeed.ts`. This hook is written against:
 *
 *   export const listProfilePosts = query({
 *     args: {
 *       ownerUserId: v.id("users"),
 *       paginationOpts: paginationOptsValidator,
 *     },
 *     handler: async (ctx, { ownerUserId, paginationOpts }) => {
 *       // Access check: viewer must be in any shared gym with ownerUserId
 *       // OR ownerUserId must be the viewer (self-profile).
 *       //
 *       // Drives the `by_user_created` index for descending paginate of
 *       // one user's posts. Private posts are filtered out unless
 *       // viewer === owner. Soft-deleted rows (deletedAt) are filtered.
 *       //
 *       // Returns per-post:
 *       //  - id, createdAt, kind ("photo"|"video"), url (full),
 *       //    thumbUrl (256px), thumbDataUrl (LQIP), visibility, caption
 *     },
 *   });
 *
 * Until the query is deployed, the hook returns an empty grid (status
 * "Exhausted", no results) so the Profile page renders cleanly. The
 * try/catch is around the *hook call site* (not the api lookup) because
 * Convex throws a synchronous error when `api.<module>.<fn>` is undefined.
 */
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Post shape consumed by `<PostGrid>`. */
export interface ProfilePost {
  /** Convex doc id from `session_media`. */
  _id: Id<"session_media">;
  createdAt: number;
  kind: "photo" | "video";
  /** Full-resolution media URL, or null if storage purged. */
  url: string | null;
  /** 256px JPEG used by the grid tile. Falls back to `url` when missing. */
  thumbUrl: string | null;
  /** ~2 KB base64 LQIP for blur-up. May be null on pre-backfill posts. */
  thumbDataUrl: string | null;
  caption: string | null;
  visibility: "gym" | "private";
}

interface UseProfilePostsResult {
  results: ProfilePost[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
}

const GRID_PAGE_SIZE = 18; // 6 rows × 3 cols on the first paint

/** Stable empty handle for the "API not yet deployed" branch. */
const EMPTY_HANDLE: UseProfilePostsResult = {
  results: [],
  status: "Exhausted",
  loadMore: () => {},
};

/**
 * Resolve `api.gymFeed.listProfilePosts` at module load. When the backend
 * hasn't yet shipped the query the property is `undefined` — we detect
 * that synchronously below so React-rules-of-hooks aren't violated by a
 * conditional `usePaginatedQuery` call.
 *
 * NOTE: `api.gymFeed` is a typed namespace in `_generated/api.d.ts`. If
 * `listProfilePosts` is missing the property is `undefined` at runtime
 * but the *type* might claim it exists. We treat the runtime value as
 * authoritative.
 */
function getListProfilePostsRef():
  | Parameters<typeof usePaginatedQuery>[0]
  | null {
  const gymFeed = api.gymFeed as unknown as Record<
    string,
    Parameters<typeof usePaginatedQuery>[0] | undefined
  >;
  const ref = gymFeed["listProfilePosts"];
  return ref ?? null;
}

/**
 * Paginates the given user's posts. Pass `null` while the viewer's userId
 * is still resolving — the hook returns the empty handle without calling
 * Convex (mirrors the "skip" semantics of other hooks in this codebase).
 */
export function useProfilePosts(
  userId: Id<"users"> | null,
): UseProfilePostsResult {
  const queryRef = getListProfilePostsRef();

  // Rules-of-hooks: `usePaginatedQuery` must be called unconditionally in
  // the same order on every render. We handle the "backend not yet shipped"
  // case by always passing a syntactically valid ref — falling back to the
  // already-deployed `api.gymFeed.listFeed` — and passing the `"skip"`
  // sentinel as args so the query never actually executes.
  //
  // The result is then ignored downstream when `queryRef` was null, and
  // the empty handle returned instead.
  const refForCall = (queryRef ??
    api.gymFeed.listFeed) as Parameters<typeof usePaginatedQuery>[0];
  const args = userId && queryRef ? { ownerUserId: userId } : "skip";

  const paginated = usePaginatedQuery(refForCall, args, {
    initialNumItems: GRID_PAGE_SIZE,
  });

  if (!queryRef) {
    // Backend query not yet deployed — render an empty grid instead of
    // crashing the route on a missing api reference.
    return EMPTY_HANDLE;
  }

  // Normalize the server payload into the `ProfilePost` shape `<PostGrid>`
  // consumes. The expected server fields are commented in the contract at
  // the top of this file.
  type ServerRow = {
    id?: Id<"session_media">;
    _id?: Id<"session_media">;
    createdAt?: number;
    _creationTime?: number;
    kind: "photo" | "video";
    url: string | null;
    thumbUrl?: string | null;
    thumbDataUrl?: string | null;
    caption?: string | null;
    visibility?: "gym" | "private";
  };

  const results: ProfilePost[] = (paginated.results ?? []).map((raw) => {
    const r = raw as ServerRow;
    return {
      _id: (r._id ?? r.id) as Id<"session_media">,
      createdAt: r.createdAt ?? r._creationTime ?? 0,
      kind: r.kind,
      url: r.url ?? null,
      thumbUrl: r.thumbUrl ?? r.url ?? null,
      thumbDataUrl: r.thumbDataUrl ?? null,
      caption: r.caption ?? null,
      visibility: r.visibility ?? "gym",
    };
  });

  return {
    results,
    status: paginated.status,
    loadMore: paginated.loadMore,
  };
}
