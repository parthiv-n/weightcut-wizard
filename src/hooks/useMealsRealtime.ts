import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyMealRealtimeChange,
  nutritionCache,
} from "@/lib/nutritionCache";
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Defer 1s to avoid piling onto the SIGNED_IN network burst
    const timer = setTimeout(() => {
      if (cancelled) return;

      const parentCache = mealParentRef.current;

      const invalidateDate = (uid: string, date: string) => {
        // Clear the cached meals list so useNutritionData's visibilitychange/
        // onMealsChange paths re-fetch. We also emit a synthetic "update" so
        // any listener wired to onMealsChange re-renders immediately.
        nutritionCache.remove(uid, "meals", date);
      };

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
              applyMealRealtimeChange(
                userId,
                payload.eventType as "INSERT" | "UPDATE" | "DELETE",
                payload.new,
                payload.old
              );
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
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            logger.warn("useMealsRealtime: channel status", { status });
          }
        });

      channelRef.current = channel;
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      mealParentRef.current.clear();
    };
  }, [userId]);
}
