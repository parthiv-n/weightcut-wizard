import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

export interface AthleteOverviewRow {
  user_id: string;
  gym_id: string;
  gym_name: string;
  gym_logo_url: string | null;
  display_name: string;
  avatar_url: string | null;
  goal_type: string | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  fight_week_target_kg: number | null;
  target_date: string | null;
  last_weight_at: string | null;
  todays_calories: number;
  daily_calorie_goal: number | null;
  last_meal_at: string | null;
  share_data: boolean;
  joined_at: string;
  /** 7-day strain (RPE-hours per day), oldest → newest. Always length 7. */
  strain_7d: number[] | null;
}

export interface GymRow {
  id: string;
  name: string;
  invite_code: string;
  location: string | null;
  logo_url: string | null;
}

const COACH_FRESH_WINDOW_MS = 30_000;
const inflight = new Map<string, Promise<unknown>>();
const lastFetchedAt = new Map<string, number>();

/**
 * Single round-trip per coach load:
 *  1. SELECT * FROM gyms WHERE owner_user_id = coach
 *  2. RPC coach_athletes_overview(coach) — server-side join + aggregate
 *
 * Cached in localCache for instant repaint on remount; refreshes in
 * background if stale (>30s).
 */
// Bound the cache age so stale display_names / weights don't bleed across
// sessions. 60s is well within the 30s in-memory freshness window's "instant
// repaint, refetch in background" pattern, but expires fast enough that a
// week-old "MMA" placeholder doesn't reappear after the athlete renames.
const COACH_CACHE_TTL_MS = 60_000;

export function useCoachData(coachId: string | null) {
  const [gyms, setGyms] = useState<GymRow[]>(() => {
    if (!coachId) return [];
    return localCache.get<GymRow[]>(coachId, "coach_gyms", COACH_CACHE_TTL_MS) || [];
  });
  const [athletes, setAthletes] = useState<AthleteOverviewRow[]>(() => {
    if (!coachId) return [];
    return localCache.get<AthleteOverviewRow[]>(coachId, "coach_athletes", COACH_CACHE_TTL_MS) || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!coachId) return false;
    return localCache.get(coachId, "coach_athletes", COACH_CACHE_TTL_MS) === null;
  });
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);

  const load = useCallback(async (force = false) => {
    if (!coachId) return;
    const cached = lastFetchedAt.get(coachId);
    if (!force && cached && Date.now() - cached < COACH_FRESH_WINDOW_MS) return;
    if (Date.now() - lastFetchRef.current < 1500 && !force) return;
    lastFetchRef.current = Date.now();

    const inflightKey = coachId;
    if (inflight.has(inflightKey)) return inflight.get(inflightKey);

    const promise = (async () => {
      try {
        // Run both queries in parallel
        const [gymsRes, athletesRes] = await Promise.all([
          withSupabaseTimeout(
            supabase
              .from("gyms")
              .select("id, name, invite_code, location, logo_url")
              .eq("owner_user_id", coachId)
              .order("created_at", { ascending: true }),
            6000,
            "Coach gyms fetch"
          ),
          withSupabaseTimeout(
            supabase.rpc("coach_athletes_overview", { p_coach_id: coachId }),
            6000,
            "Coach athletes overview"
          ),
        ]);

        if (gymsRes.error) throw gymsRes.error;
        if (athletesRes.error) throw athletesRes.error;

        const gymsData = (gymsRes.data || []) as GymRow[];
        const athletesData = (athletesRes.data || []) as AthleteOverviewRow[];

        setGyms(gymsData);
        setAthletes(athletesData);
        localCache.set(coachId, "coach_gyms", gymsData);
        localCache.set(coachId, "coach_athletes", athletesData);
        lastFetchedAt.set(coachId, Date.now());
        setError(null);
      } catch (err: any) {
        logger.error("Coach data fetch failed", err);
        setError(err?.message || "Failed to load coach data");
      } finally {
        inflight.delete(inflightKey);
        setLoading(false);
      }
    })();

    inflight.set(inflightKey, promise);
    return promise;
  }, [coachId]);

  useEffect(() => { if (coachId) load(); }, [coachId, load]);

  // Refetch on visibility change (respect freshness window)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && coachId) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [coachId, load]);

  return { gyms, athletes, loading, error, refresh: () => load(true) };
}
