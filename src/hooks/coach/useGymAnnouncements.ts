import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";
import { triggerHapticSelection, triggerHapticWarning } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

export interface GymAnnouncement {
  id: string;
  gym_id: string;
  gym_name: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  is_broadcast: boolean;
  created_at: string;
}

const FRESH_MS = 30_000;

/**
 * Fetches text announcements visible to this user via my_announcements RPC.
 * Subscribes to realtime so new broadcast / targeted messages appear
 * instantly. Uses localCache for instant repaint on remount.
 */
export function useGymAnnouncements(
  userId: string | null,
  gymIds: string[],
) {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<GymAnnouncement[]>(() => {
    if (!userId) return [];
    return localCache.get<GymAnnouncement[]>(userId, "announcements") || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!userId) return false;
    return localCache.get(userId, "announcements") === null;
  });
  const seenIdsRef = useRef<Set<string>>(new Set());
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const lastFetchRef = useRef(0);

  // Stable identity for gymIds so callers don't need to memoize.
  const gymIdsKey = useMemo(() => [...gymIds].sort().join("|"), [gymIds]);

  const upsertOne = useCallback((row: GymAnnouncement) => {
    if (seenIdsRef.current.has(row.id)) return;
    seenIdsRef.current.add(row.id);
    setAnnouncements((prev) => {
      const next = [row, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (userId) localCache.set(userId, "announcements", next);
      return next;
    });
    triggerHapticSelection();
  }, [userId]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    if (Date.now() - lastFetchRef.current < 1500) return;
    lastFetchRef.current = Date.now();
    try {
      const { data, error } = await supabase.rpc("my_announcements", {
        p_user_id: userId,
        p_limit: 50,
      });
      if (error) throw error;
      const rows = (data ?? []) as GymAnnouncement[];
      seenIdsRef.current = new Set(rows.map((r) => r.id));
      setAnnouncements(rows);
      localCache.set(userId, "announcements", rows);
    } catch (err) {
      logger.warn("useGymAnnouncements: fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void fetchAll();
  }, [userId, fetchAll]);

  // Hydrate a single new announcement via the RPC (handles RLS + joins)
  const hydrateAndUpsert = useCallback(async (announcementId: string) => {
    if (!userId) return;
    try {
      const { data } = await supabase.rpc("my_announcements", {
        p_user_id: userId,
        p_limit: 50,
      });
      const found = (data || []).find((r: GymAnnouncement) => r.id === announcementId);
      if (found) upsertOne(found);
    } catch (err) {
      logger.warn("useGymAnnouncements: hydrate failed", err);
    }
  }, [userId, upsertOne]);

  // Realtime subscriptions: per-gym broadcast channel + per-user targets channel
  useEffect(() => {
    if (!userId) return;
    const ids = gymIdsKey ? gymIdsKey.split("|") : [];
    if (ids.length === 0) return;

    let cancelled = false;
    const reconnectAttempts = new Map<string, number>();
    const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const subscribeOne = (channelKey: string, build: () => ReturnType<typeof supabase.channel>) => {
      if (cancelled) return;
      const ch = build().subscribe((status) => {
        if (status === "SUBSCRIBED") {
          reconnectAttempts.set(channelKey, 0);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logger.warn("useGymAnnouncements: channel status", { channelKey, status });
          // Auto-reconnect with exponential backoff so background/network drops recover.
          if (cancelled) return;
          const attempt = reconnectAttempts.get(channelKey) ?? 0;
          const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
          reconnectAttempts.set(channelKey, attempt + 1);
          const existing = reconnectTimers.get(channelKey);
          if (existing) clearTimeout(existing);
          reconnectTimers.set(channelKey, setTimeout(() => {
            if (cancelled) return;
            const stale = channelsRef.current.find((c) => c === ch);
            if (stale) {
              supabase.removeChannel(stale);
              channelsRef.current = channelsRef.current.filter((c) => c !== stale);
            }
            subscribeOne(channelKey, build);
          }, delay));
        }
      });
      channelsRef.current.push(ch);
    };

    const cancelTimer = setTimeout(() => {
      ids.forEach((gid) => {
        const key = `announcements:${userId}:${gid}`;
        subscribeOne(key, () =>
          supabase
            .channel(key)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "gym_announcements",
                filter: `gym_id=eq.${gid}`,
              },
              (payload) => {
                const row = payload.new as { id: string; is_broadcast: boolean };
                if (!row?.is_broadcast) return;
                void hydrateAndUpsert(row.id);
              }
            )
        );
      });

      const targetsKey = `announcement-targets:${userId}`;
      subscribeOne(targetsKey, () =>
        supabase
          .channel(targetsKey)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "gym_announcement_targets",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload.new as { announcement_id: string };
              if (row?.announcement_id) void hydrateAndUpsert(row.announcement_id);
            }
          )
      );
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(cancelTimer);
      reconnectTimers.forEach((t) => clearTimeout(t));
      reconnectTimers.clear();
      channelsRef.current.forEach((c) => supabase.removeChannel(c));
      channelsRef.current = [];
    };
  }, [userId, gymIdsKey, hydrateAndUpsert]);

  // Optimistic dismiss with rollback on RPC failure.
  const dismiss = useCallback(async (a: GymAnnouncement) => {
    if (!userId) return;
    const snapshot = announcements;
    setAnnouncements((prev) => prev.filter((x) => x.id !== a.id));
    seenIdsRef.current.delete(a.id);
    triggerHapticWarning();
    try {
      const { error } = await supabase.rpc("dismiss_announcement", { p_announcement_id: a.id });
      if (error) throw error;
      localCache.set(userId, "announcements", snapshot.filter((x) => x.id !== a.id));
    } catch (err) {
      logger.warn("useGymAnnouncements: dismiss failed", err);
      setAnnouncements(snapshot);
      seenIdsRef.current.add(a.id);
      toast({ title: "Could not remove", variant: "destructive" });
    }
  }, [announcements, userId, toast]);

  return { announcements, loading, refresh: fetchAll, dismiss };
}
