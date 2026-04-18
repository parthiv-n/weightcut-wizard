import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyMealRealtimeChange } from "@/lib/nutritionCache";
import { logger } from "@/lib/logger";

/**
 * Mount once per authenticated session. Subscribes to nutrition_logs realtime
 * changes for the given user and patches nutritionCache on INSERT/UPDATE/DELETE.
 * Consumers subscribe to nutritionCache change events rather than Supabase
 * directly, so pages only re-render for their date.
 */
export function useMealsRealtime(userId: string | null): void {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    // Defer 1s to avoid piling onto the SIGNED_IN network burst
    const timer = setTimeout(() => {
      if (cancelled) return;

      const channel = supabase
        .channel(`meals:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "nutrition_logs",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              applyMealRealtimeChange(
                userId,
                payload.eventType as "INSERT" | "UPDATE" | "DELETE",
                payload.new,
                payload.old
              );
            } catch (err) {
              logger.warn("useMealsRealtime: apply failed", { err });
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
    };
  }, [userId]);
}
