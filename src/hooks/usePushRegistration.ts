import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * Registers the device for native push notifications (iOS APNs / Android FCM).
 * - Requests permission on first mount where we have a userId
 * - Stores the resulting token in `device_tokens` (idempotent upsert)
 * - On token refresh, updates the row
 *
 * Web platform: no-op. Permissions denied: logged, no retry until next session.
 */
export function usePushRegistration(userId: string | null) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;
    if (registeredRef.current) return;
    registeredRef.current = true;

    let cleanups: Array<() => void> = [];

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === "granted";
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          const req = await PushNotifications.requestPermissions();
          granted = req.receive === "granted";
        }
        if (!granted) {
          logger.info("Push permissions not granted");
          return;
        }

        const tokenHandle = await PushNotifications.addListener("registration", async (token) => {
          try {
            const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
            const { error } = await supabase
              .from("device_tokens")
              .upsert(
                {
                  user_id: userId,
                  token: token.value,
                  platform,
                  last_seen_at: new Date().toISOString(),
                },
                { onConflict: "user_id,token" }
              );
            if (error) logger.warn("device_tokens upsert failed", { error });
          } catch (err) {
            logger.warn("device_tokens upsert exception", err);
          }
        });
        cleanups.push(() => tokenHandle.remove());

        const errHandle = await PushNotifications.addListener("registrationError", (err) => {
          logger.warn("Push registration error", { err });
        });
        cleanups.push(() => errHandle.remove());

        await PushNotifications.register();
      } catch (err) {
        logger.warn("usePushRegistration: init failed", err);
      }
    })();

    return () => {
      cleanups.forEach((c) => { try { c(); } catch {} });
      cleanups = [];
    };
  }, [userId]);
}
