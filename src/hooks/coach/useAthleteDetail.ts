import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

export interface AthleteDetailData {
  profile: {
    id: string;
    display_name: string;
    athlete_type: string | null;
    avatar_url: string | null;
    goal_type: string | null;
    current_weight_kg: number | null;
    goal_weight_kg: number | null;
    fight_week_target_kg: number | null;
    target_date: string | null;
    ai_recommended_calories: number | null;
    ai_recommended_protein_g: number | null;
    ai_recommended_carbs_g: number | null;
    ai_recommended_fats_g: number | null;
  } | null;
  weight_7d: { date: string; weight_kg: number }[] | null;
  /** 7-day RPE-hours per day, oldest → newest. */
  strain_7d: number[] | null;
  today_macros: { calories: number; protein_g: number; carbs_g: number; fats_g: number } | null;
  recent_sessions: { date: string; session_type: string; rpe: number; soreness_level: number | null; duration_minutes: number }[] | null;
  membership: { share_data: boolean; status: string; joined_at: string; gym_name: string } | null;
}

const FRESH_WINDOW_MS = 30_000;
const inflight = new Map<string, Promise<unknown>>();
const lastFetchedAt = new Map<string, number>();

export function useAthleteDetail(coachId: string | null, athleteId: string | null) {
  const cacheKey = coachId && athleteId ? `coach_athlete_${athleteId}` : null;
  const [data, setData] = useState<AthleteDetailData | null>(() => {
    if (!coachId || !cacheKey) return null;
    return localCache.get<AthleteDetailData>(coachId, cacheKey);
  });
  const [loading, setLoading] = useState(() => !data);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);

  const load = useCallback(async (force = false) => {
    if (!coachId || !athleteId || !cacheKey) return;
    const k = `${coachId}:${athleteId}`;
    const cached = lastFetchedAt.get(k);
    if (!force && cached && Date.now() - cached < FRESH_WINDOW_MS) return;
    if (Date.now() - lastFetchRef.current < 1500 && !force) return;
    lastFetchRef.current = Date.now();

    if (inflight.has(k)) return inflight.get(k);

    const promise = (async () => {
      try {
        const { data: rpcData, error: rpcErr } = await withSupabaseTimeout(
          supabase.rpc("coach_athlete_detail", { p_coach_id: coachId, p_athlete_id: athleteId }),
          6000,
          "Coach athlete detail"
        );
        if (rpcErr) throw rpcErr;
        if (!rpcData) {
          setData(null);
          setError("Athlete is not in your gym or has paused sharing.");
          return;
        }
        const detail = rpcData as AthleteDetailData;
        setData(detail);
        localCache.set(coachId, cacheKey, detail);
        lastFetchedAt.set(k, Date.now());
        setError(null);
      } catch (err: any) {
        logger.error("useAthleteDetail: fetch failed", err);
        setError(err?.message || "Failed to load athlete");
      } finally {
        inflight.delete(k);
        setLoading(false);
      }
    })();

    inflight.set(k, promise);
    return promise;
  }, [coachId, athleteId, cacheKey]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: () => load(true) };
}
