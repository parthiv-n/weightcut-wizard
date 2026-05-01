import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

// Coalesce realtime burst into a single refetch; matches the 400ms cadence
// used by useCoachRealtimeSync so concurrent gym row updates collapse.
const REALTIME_REFRESH_DEBOUNCE_MS = 400;
// Defer subscribe to mirror useMealsRealtime — avoids piling on the
// SIGNED_IN reconnect burst when auth restores.
const REALTIME_SUBSCRIBE_DELAY_MS = 1000;

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

  // Realtime: when a coach updates a gym we belong to (e.g. uploads a new
  // logo, renames the gym, removes the logo), refetch so the new
  // `gym_logo_url` reaches <GymLogoAvatar> within seconds. The avatar
  // already keys off `logoUrl`, so an updated cache-busted URL forces the
  // <img> to remount and refetch.
  //
  // Filtered server-side per gym id we're a member of so we don't receive
  // unrelated rows. If the user is in 0 gyms we skip the subscription
  // entirely. Channel name includes `userId` so two open tabs share the
  // same socket per user.
  const gymIdsKey = gyms.map((g) => g.gym_id).sort().join(",");
  useEffect(() => {
    if (!userId) return;
    const gymIds = gymIdsKey ? gymIdsKey.split(",") : [];
    if (gymIds.length === 0) return;

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channelRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };
    const reconnectAttemptRef: { current: number } = { current: 0 };
    const reconnectTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (cancelled) return;
        // Drop the local cache so any remount paints fresh data, then
        // force a refetch (bypasses the 30s freshness window).
        try { localCache.remove(userId, "my_gyms"); } catch { /* ignore */ }
        void load(true);
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const createChannel = () => {
      if (cancelled) return;
      // Postgres-changes filter syntax requires a single value; for multi-row
      // membership we filter to `id=in.(uuid1,uuid2,...)`.
      const filter = `id=in.(${gymIds.join(",")})`;
      const channel = supabase
        .channel(`my-gyms:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "gyms",
            filter,
          },
          () => scheduleRefresh()
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttemptRef.current = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logger.warn("useMyGyms: realtime channel issue", { status });
            // Auto-reconnect with exponential backoff so background/network drops recover.
            if (cancelled) return;
            const attempt = reconnectAttemptRef.current;
            const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
            reconnectAttemptRef.current = attempt + 1;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (cancelled) return;
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              createChannel();
            }, delay);
          }
        });

      channelRef.current = channel;
    };

    const subscribeTimer = setTimeout(createChannel, REALTIME_SUBSCRIBE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(subscribeTimer);
      if (debounce) clearTimeout(debounce);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, gymIdsKey, load]);

  return { gyms, loading, refresh: () => load(true) };
}
