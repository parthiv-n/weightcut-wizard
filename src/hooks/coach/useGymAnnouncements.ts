import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";
import { triggerHapticSelection, triggerHapticWarning } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

export type AnnouncementKind = "text" | "image" | "poll";

export interface PollOption {
  id: string;
  text: string;
  vote_count: number;
}

export interface PollData {
  options: PollOption[];
  total_votes: number;
  my_vote_id: string | null;
}

export interface GymAnnouncement {
  id: string;
  gym_id: string;
  gym_name: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  is_broadcast: boolean;
  created_at: string;
  kind: AnnouncementKind;
  image_url?: string | null;
  expires_at?: string | null;
  poll?: PollData | null;
}

function applyVoteToAnnouncement(a: GymAnnouncement, optionId: string): GymAnnouncement {
  if (!a.poll) return a;
  const previouslyVoted = !!a.poll.my_vote_id;
  return {
    ...a,
    poll: {
      ...a.poll,
      total_votes: previouslyVoted ? a.poll.total_votes : a.poll.total_votes + 1,
      my_vote_id: optionId,
      options: a.poll.options.map((o) => {
        // If user changed their vote, decrement old option, increment new
        if (previouslyVoted && o.id === a.poll!.my_vote_id) {
          return { ...o, vote_count: Math.max(0, o.vote_count - 1) };
        }
        if (o.id === optionId) {
          return { ...o, vote_count: o.vote_count + 1 };
        }
        return o;
      }),
    },
  };
}

const FRESH_MS = 30_000;

/**
 * Fetches announcements visible to this user via my_announcements RPC.
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
  const [error, setError] = useState<string | null>(null);
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
      const { data, error: rpcError } = await supabase.rpc("my_announcements", {
        p_user_id: userId,
        p_limit: 50,
      });
      if (rpcError) throw rpcError;
      const rows = (data ?? []) as GymAnnouncement[];
      // Normalise the poll JSONB shape — the RPC returns options with
      // `votes` (count from SQL); the client type uses `vote_count`.
      const normalised = rows.map((r): GymAnnouncement => {
        if (r.kind === "poll" && (r as any).poll) {
          const raw = (r as any).poll as { options?: any[]; total_votes?: number; my_vote_id?: string | null };
          return {
            ...r,
            poll: {
              options: (raw.options ?? []).map((o: any) => ({
                id: o.id,
                text: o.text,
                vote_count: typeof o.vote_count === "number" ? o.vote_count : (o.votes ?? 0),
              })),
              total_votes: raw.total_votes ?? 0,
              my_vote_id: raw.my_vote_id ?? null,
            },
          };
        }
        return r;
      });
      seenIdsRef.current = new Set(normalised.map((r) => r.id));
      setAnnouncements(normalised);
      localCache.set(userId, "announcements", normalised);
      setError(null);
    } catch (err: any) {
      const message = err?.message || String(err);
      logger.warn("useGymAnnouncements: fetch failed", { error: message });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void fetchAll();
  }, [userId, fetchAll]);

  // Hydrate a single new announcement via the RPC. Re-tries once after 500ms
  // if the row isn't visible yet (Supabase realtime can fire before the row
  // is replicated to the read path).
  const hydrateAndUpsert = useCallback(async (announcementId: string) => {
    if (!userId) return;
    const tryFetch = async () => {
      const { data } = await supabase.rpc("my_announcements", {
        p_user_id: userId,
        p_limit: 50,
      });
      return (data || []).find((r: GymAnnouncement) => r.id === announcementId) as GymAnnouncement | undefined;
    };
    try {
      let found = await tryFetch();
      if (!found) {
        await new Promise((r) => setTimeout(r, 500));
        found = await tryFetch();
      }
      if (found) {
        // Bypass the rate-limit; this is a real-time-driven refresh.
        lastFetchRef.current = 0;
        await fetchAll();
      }
    } catch (err) {
      logger.warn("useGymAnnouncements: hydrate failed", err);
    }
  }, [userId, fetchAll]);

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

  // Optimistic dismiss with rollback
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

  // Optimistic vote with rollback
  const vote = useCallback(async (a: GymAnnouncement, optionId: string) => {
    if (!a.poll) return;
    if (a.expires_at && new Date(a.expires_at) < new Date()) return;
    const original = a;
    setAnnouncements((prev) => prev.map((x) => (x.id === a.id ? applyVoteToAnnouncement(x, optionId) : x)));
    triggerHapticSelection();
    try {
      const { error } = await supabase.rpc("vote_in_poll", {
        p_announcement_id: a.id,
        p_option_id: optionId,
      });
      if (error) throw error;
    } catch (err) {
      logger.warn("useGymAnnouncements: vote failed", err);
      setAnnouncements((prev) => prev.map((x) => (x.id === a.id ? original : x)));
      toast({ title: "Could not vote", variant: "destructive" });
    }
  }, [toast]);

  return { announcements, loading, error, refresh: fetchAll, dismiss, vote };
}
