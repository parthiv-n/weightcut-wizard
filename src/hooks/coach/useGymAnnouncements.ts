/**
 * Announcements (broadcast + targeted) visible to the current user across
 * every gym they're in. Backed by `announcements.listForUser` and the
 * `announcements.dismiss` mutation.
 *
 * Convex `useQuery` is reactive — any insert into `gym_announcements`,
 * `gym_announcement_targets`, or `announcement_dismissals` re-runs the
 * query automatically. That replaces the per-gym realtime channel +
 * targets channel pattern from the prior Supabase implementation.
 *
 * The `gymIds` arg is now ignored (kept for API compatibility) — the
 * server-side query derives the user's gym set from `gym_members`.
 */
import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { triggerHapticWarning } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

export interface FightOfferPayload {
  id: string;
  fight_date: number;
  weight_class_kg: number;
  event_name: string | null;
  opponent_name: string | null;
  location: string | null;
  purse_text: string | null;
  status: "open" | "filled" | "withdrawn";
  selected_fighter_user_id: string | null;
  fight_camp_id: string | null;
  my_signal: "yes" | "maybe" | "pass" | null;
  counts: { yes: number; maybe: number; pass: number };
}

export interface GymAnnouncement {
  id: string;
  gym_id: string;
  gym_name: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  is_broadcast: boolean;
  kind: "text" | "image" | "poll" | "fight_offer";
  created_at: string;
  fight_offer: FightOfferPayload | null;
  /** Attached media URL (image or video) — null when no media. */
  media_url: string | null;
  media_kind: "image" | "video" | null;
}

export function useGymAnnouncements(
  userId: string | null,
  // Kept for API compatibility with callers that still pass it; ignored
  // because the server query derives the gym set from gym_members.
  _gymIds: string[],
) {
  const { toast } = useToast();
  const data = useQuery(
    api.announcements.listForUser,
    userId ? { limit: 50 } : "skip",
  );
  const dismissMutation = useMutation(api.announcements.dismiss);

  const announcements: GymAnnouncement[] = (data ?? []).map((a: any) => ({
    id: a.id,
    gym_id: a.gym_id,
    gym_name: a.gym_name,
    sender_user_id: a.sender_user_id,
    sender_name: a.sender_name,
    body: a.body,
    is_broadcast: a.is_broadcast,
    kind: a.kind,
    created_at: a.created_at,
    fight_offer: a.fight_offer ?? null,
    media_url: a.media_url ?? null,
    media_kind: a.media_kind ?? null,
  }));

  const loading = data === undefined;

  const dismiss = useCallback(
    async (a: GymAnnouncement) => {
      triggerHapticWarning();
      try {
        await dismissMutation({
          announcementId: a.id as Id<"gym_announcements">,
        });
        // No optimistic-update bookkeeping needed — Convex re-runs the
        // listForUser query immediately after the mutation commits, and
        // the dismissed item disappears from the rendered list.
      } catch (err) {
        logger.warn("useGymAnnouncements: dismiss failed", err);
        toast({ title: "Could not remove", variant: "destructive" });
      }
    },
    [dismissMutation, toast],
  );

  return { announcements, loading, refresh: () => {}, dismiss };
}
