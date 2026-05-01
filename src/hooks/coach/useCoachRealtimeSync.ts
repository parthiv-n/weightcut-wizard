import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type CoachEventType = "weight" | "meal" | "training" | "sleep";

export interface CoachRealtimeEvent {
  id: number;
  coach_user_id: string;
  athlete_user_id: string;
  event_type: CoachEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Subscribes a coach to athlete-activity events fanned out via the
 * coach_realtime_events table. Debounces clustered events into one
 * refresh() call, so a fighter logging 3 meals in 5s = 1 dashboard
 * refetch instead of 3.
 *
 * Channel name is per-coach so the same coach mounting two pages
 * (CoachDashboard + AthleteDetail) shares the underlying socket.
 */
export function useCoachRealtimeSync(
  coachId: string | null,
  refresh: () => void,
  onEvent?: (e: CoachRealtimeEvent) => void
) {
  const refreshRef = useRef(refresh);
  const onEventRef = useRef(onEvent);
  refreshRef.current = refresh;
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!coachId) return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let subscribeTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!cancelled) refreshRef.current();
      }, 400);
    };

    const subscribe = () => {
      if (cancelled || channel) return;
      channel = supabase
        .channel(`coach-realtime:${coachId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "coach_realtime_events",
            filter: `coach_user_id=eq.${coachId}`,
          },
          (payload) => {
            try {
              const ev = payload.new as CoachRealtimeEvent;
              onEventRef.current?.(ev);
            } catch (err) {
              logger.warn("useCoachRealtimeSync onEvent threw", { err });
            }
            scheduleRefresh();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logger.warn("useCoachRealtimeSync subscription issue", { status });
            // Auto-reconnect with exponential backoff so background/network drops recover.
            if (cancelled) return;
            const attempt = reconnectAttempt;
            const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
            reconnectAttempt = attempt + 1;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (cancelled) return;
              unsubscribe();
              subscribe();
            }, delay);
          }
        });
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    // Defer the initial subscribe to mirror useMealsRealtime — avoids piling
    // on the SIGNED_IN network burst when a hot reload restores session state.
    subscribeTimer = setTimeout(subscribe, 800);

    // Visibility-aware: drop the channel when the tab is hidden so we don't
    // hold an idle socket open per coach. On resume, reopen and force a
    // refresh so the dashboard catches up on any events missed while away.
    // This is the standard pattern for apps with many concurrent connections.
    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        unsubscribe();
      } else {
        subscribe();
        scheduleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (subscribeTimer) clearTimeout(subscribeTimer);
      if (debounce) clearTimeout(debounce);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      unsubscribe();
    };
  }, [coachId]);
}
