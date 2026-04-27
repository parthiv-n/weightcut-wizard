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

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!cancelled) refreshRef.current();
      }, 400);
    };

    // Defer the subscribe to mirror useMealsRealtime — avoids piling on
    // the SIGNED_IN burst when a hot reload restores session state.
    const subscribeTimer = setTimeout(() => {
      if (cancelled) return;
      const channel = supabase
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
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            logger.warn("useCoachRealtimeSync subscription issue", { status });
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(subscribeTimer);
      if (debounce) clearTimeout(debounce);
    };
  }, [coachId]);
}
