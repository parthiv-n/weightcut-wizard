import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

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

const FRESH_WINDOW_MS = 30_000;
const inflight = new Map<string, Promise<unknown>>();
const lastFetchedAt = new Map<string, number>();

/**
 * One-shot list of gyms the user is a member of, with coach name resolved.
 * Single round-trip via embedded select; coach name read via the
 * profiles_member_read_coach RLS policy.
 */
export function useMyGyms(userId: string | null) {
  // Stale-while-revalidate: render any cached data immediately on mount.
  // The 30s freshness window below decides whether to refetch in the
  // background. Cache invalidation on join/leave (`localCache.remove`)
  // forces a real skeleton when the cache is genuinely empty.
  const [gyms, setGyms] = useState<MyGymRow[]>(() => {
    if (!userId) return [];
    return localCache.get<MyGymRow[]>(userId, "my_gyms") || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    // userId pending → keep skeleton; prevents the empty-state flicker before
    // auth resolves.
    if (!userId) return true;
    return localCache.get(userId, "my_gyms") === null;
  });
  const lastFetchRef = useRef(0);

  const load = useCallback(async (force = false) => {
    if (!userId) return;
    const cached = lastFetchedAt.get(userId);
    if (!force && cached && Date.now() - cached < FRESH_WINDOW_MS) return;
    if (Date.now() - lastFetchRef.current < 1500 && !force) return;
    lastFetchRef.current = Date.now();

    if (inflight.has(userId)) return inflight.get(userId);

    const promise = (async () => {
      try {
        // Single RPC: server-side join across gym_members → gyms → profiles.
        // Replaces the old two-query waterfall (membership → coach profiles).
        const { data, error } = await withSupabaseTimeout(
          supabase.rpc("my_gyms_overview", { p_user_id: userId }),
          5000,
          "MyGyms fetch"
        );
        if (error) throw error;

        const out: MyGymRow[] = (data || []).map((r: any) => ({
          member_id: r.member_id,
          gym_id: r.gym_id,
          gym_name: r.gym_name ?? "—",
          gym_location: r.gym_location ?? null,
          gym_logo_url: r.gym_logo_url ?? null,
          coach_user_id: r.coach_user_id,
          coach_name: r.coach_name ?? null,
          share_data: !!r.share_data,
          joined_at: r.joined_at,
        }));

        setGyms(out);
        localCache.set(userId, "my_gyms", out);
        lastFetchedAt.set(userId, Date.now());
      } catch (err) {
        logger.error("useMyGyms: fetch failed", err);
      } finally {
        inflight.delete(userId);
        setLoading(false);
      }
    })();

    inflight.set(userId, promise);
    return promise;
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return { gyms, loading, refresh: () => load(true) };
}
