/**
 * Coach dashboard data — list of gyms owned by this coach + one row per
 * athlete summarised. Backed by `coach.myGymsOverview` and
 * `coach.athletesOverview` Convex queries.
 *
 * Convex `useQuery` is reactive: any mutation in `weight_logs`, `meals`,
 * `meal_items`, `fight_camp_calendar`, `profiles`, or `gym_members` for
 * any athlete in any of this coach's gyms triggers a re-render. That
 * replaces the Postgres trigger fan-out + `coach_realtime_events`
 * subscription pattern.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

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

export function useCoachData(coachId: string | null) {
  const gymsData = useQuery(
    api.coach.myGymsOverview,
    coachId ? {} : "skip",
  );
  const athletesData = useQuery(
    api.coach.athletesOverview,
    coachId ? {} : "skip",
  );

  const gyms: GymRow[] = (gymsData ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    invite_code: g.invite_code,
    location: g.location,
    logo_url: g.logo_url,
  }));

  const athletes: AthleteOverviewRow[] = (athletesData ?? []).map((a) => ({
    user_id: a.user_id,
    gym_id: a.gym_id,
    gym_name: a.gym_name,
    gym_logo_url: a.gym_logo_url,
    display_name: a.display_name,
    avatar_url: a.avatar_url,
    goal_type: a.goal_type,
    current_weight_kg: a.current_weight_kg,
    goal_weight_kg: a.goal_weight_kg,
    fight_week_target_kg: a.fight_week_target_kg,
    target_date: a.target_date,
    last_weight_at: a.last_weight_at,
    todays_calories: a.todays_calories,
    daily_calorie_goal: a.daily_calorie_goal,
    last_meal_at: a.last_meal_at,
    share_data: a.share_data,
    joined_at: a.joined_at,
    strain_7d: a.strain_7d,
  }));

  const loading = gymsData === undefined || athletesData === undefined;

  // `refresh` and `error` are kept for API compatibility — Convex
  // auto-refreshes on writes and surfaces errors via thrown exceptions
  // intercepted by ErrorBoundary upstream.
  return {
    gyms,
    athletes,
    loading,
    error: null as string | null,
    refresh: () => {},
  };
}
