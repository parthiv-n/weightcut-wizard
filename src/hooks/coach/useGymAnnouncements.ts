import { useCallback, useEffect, useRef, useState } from "react";
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
    if (!userId || gymIds.length === 0) return;
    const cancelTimer = setTimeout(() => {
      gymIds.forEach((gid) => {
        const ch = supabase
          .channel(`announcements:${userId}:${gid}`)
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
          .subscribe();
        channelsRef.current.push(ch);
      });

      const tCh = supabase
        .channel(`announcement-targets:${userId}`)
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
        .subscribe();
      channelsRef.current.push(tCh);
    }, 1000);

    return () => {
      clearTimeout(cancelTimer);
      channelsRef.current.forEach((c) => supabase.removeChannel(c));
      channelsRef.current = [];
    };
  }, [userId, gymIds.join(","), hydrateAndUpsert]);

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
