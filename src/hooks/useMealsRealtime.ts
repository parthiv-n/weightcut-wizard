import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyMealRealtimeDelete,
  invalidateMealsForDate,
  nutritionCache,
} from "@/lib/nutritionCache";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

/**
 * Subscribe once per authenticated session to BOTH `meals` and `meal_items`.
 *
 * - `meals` events: invalidate the `{userId, date}` nutrition cache directly
 *   via `applyMealRealtimeChange` so list queries re-fetch on next request
 *   and in-process listeners (useNutritionData) can sync their local state.
 *
 * - `meal_items` events: items don't carry a `date` field, so we keep a local
 *   `meal_id -> {userId, date}` cache populated by `meals` INSERT/UPDATE
 *   events. When an item event arrives, we look up the parent meal's date
 *   and invalidate that cache slot. If the parent isn't cached yet (e.g. a
 *   meal created in another tab), we conservatively invalidate the caller's
 *   most-recently-known dates for the user.
 */
export function useMealsRealtime(userId: string | null): void {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // meal_id → { userId, date }
  const mealParentRef = useRef<Map<string, { userId: string; date: string }>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const parentCache = mealParentRef.current;

    const invalidateDate = (uid: string, date: string) => {
      nutritionCache.remove(uid, "meals", date);
      try { localCache.removeForDate?.(uid, "nutrition_logs", date); } catch { /* ignore */ }
      invalidateMealsForDate(uid, date);
    };

    const createChannel = () => {
      if (cancelled) return;

      const channel = supabase
        .channel(`meals-v2:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "meals",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              const row = (payload.new ?? payload.old) as { id?: string; user_id?: string; date?: string } | null;
              if (row?.id && row.user_id && row.date) {
                if (payload.eventType === "DELETE") {
                  parentCache.delete(row.id);
                } else {
                  parentCache.set(row.id, { userId: row.user_id, date: row.date });
                }
              }
              // For INSERT/UPDATE we DO NOT push payload.new into the cache —
              // realtime payloads only contain the raw `meals` table row, which
              // lacks the `total_*` aggregations and (for partial UPDATEs) may
              // be missing `meal_name`/`meal_type`. Storing those rows directly
              // produced empty "Logged meal" cards and duplicate-key warnings.
              // Instead, invalidate the affected date so useNutritionData
              // refetches via the `meals_with_totals` view, which always
              // returns the canonical mapped shape.
              if (payload.eventType === "DELETE") {
                const oldRow = payload.old as { id?: string; date?: string } | null;
                if (oldRow?.id && oldRow?.date) {
                  applyMealRealtimeDelete(userId, oldRow.date, oldRow.id);
                }
              } else {
                const newRow = payload.new as { date?: string } | null;
                if (newRow?.date) {
                  // Drop any localStorage shadow for this date so a remount
                  // doesn't paint pre-mutation data; then notify listeners to
                  // refetch from the view.
                  try { localCache.removeForDate?.(userId, "nutrition_logs", newRow.date); } catch { /* ignore */ }
                  invalidateMealsForDate(userId, newRow.date);
                }
              }
            } catch (err) {
              logger.warn("useMealsRealtime: meals apply failed", { err });
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "meal_items",
          },
          (payload) => {
            try {
              const row = (payload.new ?? payload.old) as { meal_id?: string } | null;
              const mealId = row?.meal_id;
              if (!mealId) return;
              const parent = parentCache.get(mealId);
              if (parent && parent.userId === userId) {
                invalidateDate(parent.userId, parent.date);
                return;
              }
              // Unknown parent — fall back to invalidating today's cache for
              // this user. That's cheap; list query will re-fetch on next
              // visibility change.
              const today = new Date().toISOString().slice(0, 10);
              invalidateDate(userId, today);
            } catch (err) {
              logger.warn("useMealsRealtime: meal_items apply failed", { err });
            }
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttemptRef.current = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logger.warn("useMealsRealtime: channel status", { status });
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

    // Defer 1s to avoid piling onto the SIGNED_IN network burst
    const timer = setTimeout(createChannel, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      mealParentRef.current.clear();
    };
  }, [userId]);
}
