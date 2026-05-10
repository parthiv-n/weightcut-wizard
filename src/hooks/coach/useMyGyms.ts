/**
 * Lists the gyms the current user is an active member of, plus the coach
 * display name for each. Backed by Convex `coach`/`gyms` queries.
 *
 * Convex `useQuery` is reactive by default — any time a `gyms`,
 * `gym_members`, or `profiles` row changes, this hook re-renders. That
 * replaces the Supabase realtime channel + 30s freshness window pattern
 * from the previous Supabase implementation.
 *
 * The `userId` argument is kept for backwards compatibility with callers
 * (`MyGym.tsx`, `BottomNav.tsx`, `NewAnnouncementWidget.tsx`) — the actual
 * auth context comes from Convex Auth on the server side. Passing `null`
 * suppresses the query, mirroring the old "skeleton until userId resolves"
 * behaviour.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export interface MyGymRow {
  member_id: string;
  gym_id: string;
  gym_name: string;
  gym_location: string | null;
  gym_logo_url: string | null;
  coach_user_id: string;
  coach_name: string | null;
  share_data: boolean;
  joined_at: string;
}

export function useMyGyms(userId: string | null) {
  // Pass "skip" when there's no userId so Convex doesn't run the query
  // until the auth context resolves. The skeleton-while-loading branch
  // in consumers reads `loading === true` when data is undefined.
  const data = useQuery(api.gyms.listMine, userId ? {} : "skip");

  const gyms: MyGymRow[] = (data ?? []).map((r) => ({
    member_id: r.member_id,
    gym_id: r.gym_id,
    gym_name: r.gym_name,
    gym_location: r.gym_location,
    gym_logo_url: r.gym_logo_url,
    coach_user_id: r.coach_user_id,
    coach_name: r.coach_name,
    share_data: r.share_data,
    joined_at: r.joined_at,
  }));

  // `data === undefined` when the query hasn't returned yet OR when
  // `userId` is null (skipped). Treat the skipped state as "still loading"
  // so the skeleton renders until auth resolves.
  const loading = data === undefined;

  // `refresh` is now a no-op — Convex auto-refreshes on every relevant
  // mutation. Kept for API compatibility with the prior Supabase hook.
  const refresh = () => {};

  return { gyms, loading, refresh };
}
