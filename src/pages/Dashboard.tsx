import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ComposedChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Calendar, Lock, ChevronRight, Flame, Zap, CheckCircle2, Scale } from "lucide-react";
import { TrainingWeekWidget, preloadTrainingWeek } from "@/components/dashboard/TrainingWeekWidget";
import { WeightProgressRing } from "@/components/dashboard/WeightProgressRing";
import { StreakBadge } from "@/components/dashboard/StreakBadge";
import { ConsistencyRing } from "@/components/dashboard/ConsistencyRing";
import { MilestoneBadges } from "@/components/dashboard/MilestoneBadges";
import { useGamification } from "@/hooks/useGamification";
import { useUser } from "@/contexts/UserContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
import { withSupabaseTimeout, withRetry } from "@/lib/timeoutWrapper";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { Button } from "@/components/ui/button";
import { calculateCalorieTarget } from "@/lib/calorieCalculation";
import { AIPersistence } from "@/lib/aiPersistence";
import { localCache } from "@/lib/localCache";
import { nutritionCache } from "@/lib/nutritionCache";
import { preloadNutritionData } from "@/lib/backgroundSync";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WeightIncreaseQuestionnaire } from "@/components/dashboard/WeightIncreaseQuestionnaire";
import { AchievementSheet } from "@/components/achievements/AchievementSheet";
import { triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { trackInstallDate, maybeRequestReview } from "@/lib/appReview";
import { CutPlanDialog } from "@/components/dashboard/CutPlanDialog";
import { SleepLogger } from "@/components/dashboard/SleepLogger";
import { TrainingInsightsWidget } from "@/components/dashboard/TrainingInsightsWidget";
import { isFighter } from "@/lib/goalType";

interface DailyWisdom {
  summary: string;
  riskLevel: "green" | "orange";
  riskReason: string;
  daysToFight: number;
  weeklyPaceKg: number;
  requiredWeeklyKg: number;
  paceStatus: "on_track" | "ahead" | "behind" | "at_target";
  adviceParagraph: string;
  actionItems: string[];
  nutritionStatus: string;
}

export default function Dashboard() {
  const { userName, currentWeight, userId, profile } = useUser();
  const [weightLogs, setWeightLogs] = useState<any[]>(() => {
    if (!userId) return [];
    return localCache.get<any[]>(userId, 'dashboard_weight_logs') || [];
  });
  const [loading, setLoading] = useState(() => {
    if (!userId) return true;
    return localCache.get(userId, 'dashboard_weight_logs') === null;
  });
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>(() => {
    return (localStorage.getItem('wcw_weight_unit') as 'kg' | 'lb') || 'kg';
  });
  const [todayCalories, setTodayCalories] = useState(0);
  const [todayHydration, setTodayHydration] = useState(0);
  const [wisdom, setWisdom] = useState<DailyWisdom | null>(null);
  const [wisdomLoading, setWisdomLoading] = useState(false);
  const [wisdomSheetOpen, setWisdomSheetOpen] = useState(false);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [achievementSheetOpen, setAchievementSheetOpen] = useState(false);
  const [cutPlanOpen, setCutPlanOpen] = useState(false);
  const [hasCutPlan, setHasCutPlan] = useState<boolean>(() => !!localStorage.getItem("wcw_cut_plan"));
  const [expandedInfo, setExpandedInfo] = useState<'risk' | 'pace' | null>(null);
  const [frequentMeals, setFrequentMeals] = useState<Array<{ name: string; count: number; avgCalories: number }>>([]);
  const navigate = useNavigate();
  const { safeAsync, isMounted } = useSafeAsync();
  const { streak, streakIncludesToday, weeklyConsistency, badges, badgesLoading, allAchievements } = useGamification(userId, weightLogs, todayCalories, profile);

  const lastFetchRef = useRef(0);

  // Redirect to cut plan if it hasn't been seen yet
  useEffect(() => {
    const cutPlan = localStorage.getItem("wcw_cut_plan");
    const cutPlanSeen = localStorage.getItem("wcw_cut_plan_seen");
    if (cutPlan && !cutPlanSeen) {
      navigate("/cut-plan", { replace: true });
    }
  }, [navigate]);

  // Rehydrate cut plan from DB if localStorage is empty (iOS WebView can wipe it).
  // Once generated, the plan lives on profile.cut_plan_json permanently.
  useEffect(() => {
    if (localStorage.getItem("wcw_cut_plan")) {
      if (!hasCutPlan) setHasCutPlan(true);
      return;
    }
    const dbPlan = profile?.cut_plan_json;
    if (dbPlan && typeof dbPlan === "object" && dbPlan.weeklyPlan) {
      localStorage.setItem("wcw_cut_plan", JSON.stringify(dbPlan));
      setHasCutPlan(true);
    } else if (hasCutPlan) {
      setHasCutPlan(false);
    }
  }, [profile?.cut_plan_json, hasCutPlan]);

  useEffect(() => { trackInstallDate(); }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    if (userId) {
      loadDashboardData();
    }
  }, [userId]);

  // Refetch when user navigates back to this page (throttled to avoid duplicate requests)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) {
        if (Date.now() - lastFetchRef.current < 2000) return;
        loadDashboardData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [userId]);

  // Warmup the daily-wisdom edge function 2s after mount
  useEffect(() => {
    if (userId) {
      const t = setTimeout(() =>
        supabase.functions.invoke("daily-wisdom", { method: "GET" } as any).catch(() => { }), 500);
      return () => clearTimeout(t);
    }
  }, [userId]);

  // Load frequent meals (last 14 days) when the wisdom sheet opens.
  // Must be declared BEFORE any early return (e.g. the `loading` skeleton) or
  // React will throw "rendered more hooks than during the previous render".
  useEffect(() => {
    if (!userId || !wisdomSheetOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data } = await supabase
          .from('nutrition_logs')
          .select('meal_name, calories')
          .eq('user_id', userId)
          .gte('date', since);
        if (cancelled || !data) return;
        const counts = new Map<string, { count: number; totalCal: number }>();
        for (const m of data as Array<{ meal_name: string | null; calories: number | null }>) {
          const name = (m.meal_name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const entry = counts.get(key) || { count: 0, totalCal: 0 };
          entry.count++;
          entry.totalCal += m.calories || 0;
          counts.set(key, entry);
        }
        const top = Array.from(counts.entries())
          .filter(([, v]) => v.count >= 2)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 4)
          .map(([name, v]) => ({
            name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
            count: v.count,
            avgCalories: Math.round(v.totalCal / v.count),
          }));
        setFrequentMeals(top);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [userId, wisdomSheetOpen]);

  const generateWisdom = async (profileData: any, logs: any[], calories: number, hydration: number) => {
    if (!userId || !profileData) return;
    safeAsync(setWisdomLoading)(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `daily_wisdom_${today}`;
      const calorieGoal = calculateCalorieTarget(profileData);
      const last7 = logs.slice(-7).map((l: any) => ({ date: l.date, weight_kg: l.weight_kg }));

      const payload = {
        currentWeight: profileData.current_weight_kg,
        goalWeight: profileData.goal_weight_kg,
        fightWeekTarget: profileData.goal_type === 'losing' ? undefined : profileData.fight_week_target_kg,
        targetDate: profileData.target_date,
        tdee: profileData.tdee,
        bmr: profileData.bmr,
        activityLevel: profileData.activity_level,
        age: profileData.age,
        sex: profileData.sex,
        heightCm: profileData.height_cm,
        aiRecommendedCalories: profileData.ai_recommended_calories,
        todayCalories: calories,
        dailyCalorieGoal: calorieGoal,
        todayHydration: hydration,
        hydrationGoalMl: 3000,
        weightHistory: last7,
      };

      const { data, error } = await supabase.functions.invoke("daily-wisdom", { body: payload });
      if (!isMounted()) return;
      if (error || !data?.wisdom) {
        logger.error("daily-wisdom error", error);
        return;
      }
      AIPersistence.save(userId, cacheKey, data.wisdom, 25);
      setWisdom(data.wisdom);
    } catch (err) {
      logger.error("generateWisdom error", err);
    } finally {
      safeAsync(setWisdomLoading)(false);
    }
  };

  const checkAndGenerateWisdom = async (profileData: any, logs: any[], calories: number, hydration: number) => {
    if (!userId || !profileData) return;
    const today = new Date().toISOString().split('T')[0];
    const hasTodayLog = logs.some((l: any) => l.date === today);
    if (!hasTodayLog) {
      safeAsync(setWisdom)(null);
      safeAsync(setWisdomLoading)(false);
      return;
    }
    const cacheKey = `daily_wisdom_${today}`;
    const cached = AIPersistence.load(userId, cacheKey);
    if (cached) {
      safeAsync(setWisdom)(cached);
      return;
    }
    await generateWisdom(profileData, logs, calories, hydration);
  };

  const loadDashboardData = async () => {
    if (!userId) {
      safeAsync(setLoading)(false);
      return;
    }

    lastFetchRef.current = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // --- Cache-first: serve cached data instantly, then refresh in background ---
    const cachedWeightLogs = localCache.get<any[]>(userId, 'dashboard_weight_logs');
    const cachedNutrition = localCache.getForDate<any[]>(userId, 'nutrition_logs', today);
    const cachedHydration = localCache.getForDate<any[]>(userId, 'hydration_logs', today);

    const hasCachedData = cachedWeightLogs !== null || cachedNutrition !== null || cachedHydration !== null;

    if (hasCachedData) {
      const cachedCalories = cachedNutrition?.reduce((sum: number, log: any) => sum + (log?.calories || 0), 0) || 0;
      const cachedHydrationTotal = cachedHydration?.reduce((sum: number, log: any) => sum + (log?.amount_ml || 0), 0) || 0;

      if (cachedWeightLogs) safeAsync(setWeightLogs)(cachedWeightLogs);
      safeAsync(setTodayCalories)(cachedCalories);
      safeAsync(setTodayHydration)(cachedHydrationTotal);
      safeAsync(setLoading)(false);

      // Fire-and-forget wisdom with cached data
      if (cachedWeightLogs) checkAndGenerateWisdom(profile, cachedWeightLogs, cachedCalories, cachedHydrationTotal);
    }

    // --- Fetch fresh data from Supabase (3 core queries — gamification handled by useGamification) ---
    try {
      const results = await Promise.allSettled([
        withRetry(() => withSupabaseTimeout(
          supabase
            .from("weight_logs")
            .select("date, weight_kg")
            .eq("user_id", userId)
            .order("date", { ascending: true })
            .limit(30),
          undefined,
          "Weight logs query"
        )),

        withRetry(() => withSupabaseTimeout(
          supabase
            .from("nutrition_logs")
            .select("calories")
            .eq("user_id", userId)
            .eq("date", today),
          undefined,
          "Nutrition logs query"
        )),

        withRetry(() => withSupabaseTimeout(
          supabase
            .from("hydration_logs")
            .select("amount_ml")
            .eq("user_id", userId)
            .eq("date", today),
          undefined,
          "Hydration logs query"
        )),
      ]);

      if (!isMounted()) return;

      // Only update state and cache for queries that succeeded — don't overwrite cached data with empty arrays on failure
      const logsOk = results[0].status === 'fulfilled';
      const nutritionOk = results[1].status === 'fulfilled';
      const hydrationOk = results[2].status === 'fulfilled';

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Dashboard query ${index} failed`, result.reason);
        }
      });

      if (logsOk) {
        const logsData = (results[0] as PromiseFulfilledResult<any>).value.data || [];
        setWeightLogs(logsData);
        localCache.set(userId, 'dashboard_weight_logs', logsData);
      }

      if (nutritionOk) {
        const nutritionData = (results[1] as PromiseFulfilledResult<any>).value.data || [];
        const totalCalories = nutritionData.reduce((sum: number, log: any) => sum + (log?.calories || 0), 0) || 0;
        setTodayCalories(totalCalories);
        localCache.setForDate(userId, 'nutrition_logs', today, nutritionData);
      }

      if (hydrationOk) {
        const hydrationData = (results[2] as PromiseFulfilledResult<any>).value.data || [];
        const totalHydration = hydrationData.reduce((sum: number, log: any) => sum + (log?.amount_ml || 0), 0) || 0;
        setTodayHydration(totalHydration);
        localCache.setForDate(userId, 'hydration_logs', today, hydrationData);
      }

      // Fire-and-forget wisdom with best available data (use fresh values, fall back to current state)
      const wisdomLogs = logsOk ? (results[0] as PromiseFulfilledResult<any>).value.data ?? [] : weightLogs;
      const wisdomCals = nutritionOk
        ? ((results[1] as PromiseFulfilledResult<any>).value.data || []).reduce((s: number, l: any) => s + (l?.calories || 0), 0)
        : todayCalories;
      const wisdomHydration = hydrationOk
        ? ((results[2] as PromiseFulfilledResult<any>).value.data || []).reduce((s: number, l: any) => s + (l?.amount_ml || 0), 0)
        : todayHydration;
      checkAndGenerateWisdom(profile, wisdomLogs, wisdomCals, wisdomHydration);

      // Prefetch nutrition data for today so Nutrition page opens instantly
      setTimeout(() => {
        if (userId) preloadNutritionData(userId, [today]);
      }, 2000);

      // Warm training-week cache so widget paints instantly on mount / next visit
      if (userId) preloadTrainingWeek(userId);

      // Prefetch macro goals from profile so Nutrition page skips loading
      if (profile?.ai_recommended_calories) {
        const macroData = {
          macroGoals: {
            proteinGrams: (profile as any).ai_recommended_protein_g || 0,
            carbsGrams: (profile as any).ai_recommended_carbs_g || 0,
            fatsGrams: (profile as any).ai_recommended_fats_g || 0,
            recommendedCalories: profile.ai_recommended_calories,
          },
          dailyCalorieTarget: profile.ai_recommended_calories,
        };
        nutritionCache.setMacroGoals(userId, macroData);
        localCache.set(userId, 'macro_goals', macroData);
      }
    } catch (error) {
      logger.error("Error loading dashboard data", error);
      if (!hasCachedData) {
        safeAsync(setWeightLogs)([]);
        safeAsync(setTodayCalories)(0);
        safeAsync(setTodayHydration)(0);
      }
    } finally {
      safeAsync(setLoading)(false);
      maybeRequestReview();
    }
  };

  const daysUntilTarget = useMemo(() => profile?.target_date ? Math.ceil((new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0, [profile?.target_date]);
  const currentWeightValue = currentWeight ?? profile?.current_weight_kg ?? 0;
  const weightToLose = useMemo(() => profile ? (currentWeightValue - (profile.fight_week_target_kg || profile.goal_weight_kg || 0)).toFixed(1) : 0, [currentWeightValue, profile?.fight_week_target_kg, profile?.goal_weight_kg]);
  const dailyCalorieGoal = useMemo(() => profile ? calculateCalorieTarget(profile) : 0,
    [profile?.ai_recommended_calories, profile?.tdee, profile?.bmr,
     profile?.current_weight_kg, profile?.goal_weight_kg,
     profile?.manual_nutrition_override]);

  const convertWeight = useCallback((kg: number) => {
    return weightUnit === 'kg' ? kg : kg * 2.20462;
  }, [weightUnit]);

  const chartData = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().split('T')[0];
    return weightLogs
      .filter((log) => !isNaN(parseFloat(log.weight_kg)) && log.date >= cutoff)
      .map((log) => ({
        date: new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weight: convertWeight(parseFloat(log.weight_kg)),
      }));
  }, [weightLogs, convertWeight]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Fallback static wisdom (kept for when AI fails)
  const getWizardWisdom = () => {
    const caloriePercentage = dailyCalorieGoal > 0 ? (todayCalories / dailyCalorieGoal) * 100 : 0;

    if (caloriePercentage < 50) {
      return "You're starting slow today! Make sure to fuel up. Your body needs energy to perform at its best.";
    } else if (caloriePercentage > 110) {
      return "You've exceeded your calorie target today. Don't worry, consistency matters more than perfection! Get back on track tomorrow.";
    } else if (caloriePercentage < 80) {
      return "You're under your calorie target. Make sure you're eating enough to maintain your energy and support recovery.";
    } else if (caloriePercentage >= 90 && caloriePercentage <= 110) {
      return "Outstanding! You're hitting your targets perfectly. This is exactly the kind of consistency that leads to success!";
    } else {
      return "You're making excellent progress! Trust the process. Your body is adapting to this journey.";
    }
  };

  const hasTodayLog = weightLogs.some((l: any) => l.date === new Date().toISOString().split('T')[0]);

  const riskColors: Record<string, string> = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = weightLogs.find((l: any) => l.date === todayStr);
  const prevLogs = weightLogs.filter((l: any) => l.date < todayStr).sort((a: any, b: any) => b.date.localeCompare(a.date));
  const latestPrevLog = prevLogs.length > 0 ? prevLogs[0] : null;

  const trendIsUp = todayLog && latestPrevLog && parseFloat(todayLog.weight_kg) > parseFloat(latestPrevLog.weight_kg);

  const handleWisdomClick = () => {
    triggerHaptic(ImpactStyle.Light);
    const dismissedKey = `wcw_questionnaire_dismissed_${todayStr}`;
    if (trendIsUp && !sessionStorage.getItem(dismissedKey)) {
      setQuestionnaireOpen(true);
    } else {
      setWisdomSheetOpen(true);
    }
  };

  const getFoodSwap = (name: string): string => {
    const n = name.toLowerCase();
    const swaps: Array<[RegExp, string]> = [
      [/\brice\b(?! cake)/, 'Try cauliflower rice or cut portion by ¼'],
      [/pasta|spaghetti|noodle|linguine|penne|ramen/, 'Swap for zucchini noodles or shirataki'],
      [/bread|toast|bagel|bun|wrap/, 'Use thin-sliced bread or a lettuce wrap'],
      [/chicken thigh|fried chicken|wings/, 'Switch to grilled chicken breast'],
      [/beef|burger|steak|mince/, 'Use 95% lean mince or turkey'],
      [/cheese|brie|mozzarella|cheddar/, 'Try cottage cheese or reduced-fat versions'],
      [/fries|fried/, 'Bake or air-fry instead'],
      [/mayo|mayonnaise/, 'Swap for Greek yogurt or mustard'],
      [/butter|cream|ghee|oil/, 'Use spray oil or measure 1 tsp'],
      [/peanut butter|nutella|spread/, 'Use PB2 powdered or a thinner layer'],
      [/chips|crisps|pretzel/, 'Switch to popcorn or roasted chickpeas'],
      [/pizza/, 'Try cauliflower crust or thin base'],
      [/soda|cola|coke|sprite|fanta|pepsi/, 'Switch to sparkling water or diet'],
      [/juice|smoothie|shake/, 'Eat whole fruit or make it protein-first'],
      [/chocolate|candy|cake|cookie|dessert|ice cream/, 'Portion to one square or swap for fruit'],
      [/avocado/, 'Halve the portion'],
      [/sugar|syrup|honey|jam/, 'Swap for a zero-calorie sweetener'],
    ];
    for (const [re, advice] of swaps) if (re.test(n)) return advice;
    return 'Reduce portion by ¼ or add extra veg';
  };

  const paceLabels: Record<string, string> = {
    on_track: "On Track",
    ahead: "Ahead",
    behind: "Behind",
    at_target: "At Target",
  };

  const paceColors: Record<string, string> = {
    on_track: "text-green-400",
    ahead: "text-blue-400",
    behind: "text-yellow-400",
    at_target: "text-green-400",
  };

  return (
    <ErrorBoundary>
      <div className="dashboard-zoom animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          {daysUntilTarget > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-bold display-number text-foreground">{daysUntilTarget}</span> days left
            </span>
          )}
          {streak > 0 && <StreakBadge streak={streak} isActive={streakIncludesToday} />}
        </div>

        {weightLogs.length === 0 && (
          <button onClick={() => navigate('/weight')} className="w-full rounded-2xl bg-muted/20 p-2.5 flex items-center gap-2 active:bg-muted/30 transition-colors">
            <Scale className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <p className="text-[13px] font-semibold">Welcome{userName ? `, ${userName}` : ''}</p>
              <p className="text-[13px] text-muted-foreground">Log your first weigh-in to get started</p>
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* Weekly Consistency Ring */}
        <div>
          <ConsistencyRing {...weeklyConsistency} />
        </div>

        {/* Cut Plan + Sleep — side by side */}
        <div className="grid grid-cols-2 gap-2">
          {isFighter(profile?.goal_type) && hasCutPlan ? (
            <button
              onClick={() => { setCutPlanOpen(true); triggerHaptic(ImpactStyle.Light); }}
              className="card-surface rounded-2xl border border-border p-2.5 flex items-center justify-center active:scale-[0.98] transition-all text-center"
            >
              <p className="text-[12px] font-semibold leading-tight">Cut Plan</p>
            </button>
          ) : (
            <div />
          )}
          {userId && <SleepLogger userId={userId} compact />}
        </div>

        {/* Wizard's Daily Wisdom card — conditional states */}
        <div data-tutorial="daily-wisdom-card">
        {!hasTodayLog ? (
          <button onClick={() => navigate('/weight')} className="w-full card-surface rounded-2xl border border-border p-2.5 flex items-center gap-2 active:scale-[0.99] transition-all">
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-semibold">Daily Insight</p>
                <Lock className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Log today's weight to unlock your insight
              </p>
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        ) : wisdomLoading ? (
          <div className="card-surface rounded-2xl border border-border p-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0 space-y-1.5 py-0.5">
              <div className="h-2.5 rounded shimmer-skeleton w-1/3" />
              <div className="h-2.5 rounded shimmer-skeleton w-full" />
            </div>
          </div>
        ) : wisdom ? (
          <button className="w-full text-left card-surface rounded-2xl border border-border p-2.5 flex items-center gap-2 active:scale-[0.99] transition-all" onClick={handleWisdomClick}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[11px] font-semibold">Daily Insight</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${riskColors[wisdom.riskLevel]}`}>
                    {wisdom.riskLevel.charAt(0).toUpperCase() + wisdom.riskLevel.slice(1)}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                {wisdom.summary.replace(/[—–]/g, ',').replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ').split(/\s+/).slice(0, 12).join(' ').replace(/[.,;:]+$/, '')}
              </p>
            </div>
          </button>
        ) : (
          <div className="card-surface rounded-2xl border border-border p-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold">Daily Insight</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{getWizardWisdom()}</p>
            </div>
          </div>
        )}
        </div>

        {/* Training Coach (premium) */}
        {userId && <TrainingInsightsWidget userId={userId} />}

        {/* Weight Progress Bar — full width */}
        {profile && (
          <div data-tutorial="weight-progress-ring">
            <WeightProgressRing
              currentWeight={currentWeightValue}
              startingWeight={weightLogs.length > 0 ? parseFloat(weightLogs[0].weight_kg) : currentWeightValue}
              goalWeight={profile.goal_weight_kg ?? 0}
            />
          </div>
        )}

        {/* Weight History + Training — side by side */}
        <div className="grid grid-cols-2 gap-2">
          {/* Weight History Chart */}
          <div className="card-surface rounded-2xl border border-border p-2.5 aspect-square flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <span className="section-header text-foreground font-bold">Weight</span>
              <div className="flex gap-0.5 bg-muted rounded-full p-0.5">
                <Button
                  variant={weightUnit === 'kg' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => { setWeightUnit('kg'); localStorage.setItem('wcw_weight_unit', 'kg'); triggerHapticSelection(); }}
                  className="h-5 min-h-0 text-[13px] px-1.5 rounded-full"
                >
                  kg
                </Button>
                <Button
                  variant={weightUnit === 'lb' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => { setWeightUnit('lb'); localStorage.setItem('wcw_weight_unit', 'lb'); triggerHapticSelection(); }}
                  className="h-5 min-h-0 text-[13px] px-1.5 rounded-full"
                >
                  lb
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 11,
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)} ${weightUnit}`, 'Weight']}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 2.5, strokeWidth: 1.5, stroke: "hsl(var(--background))" }}
                      activeDot={{ r: 4, strokeWidth: 1.5 }}
                      animationDuration={0}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <TrendingDown className="h-5 w-5 text-muted-foreground/40 mb-1" />
                  <p className="text-[13px] text-muted-foreground">No data yet</p>
                  <Button variant="ghost" size="sm" className="h-6 text-[13px] px-2" onClick={() => navigate('/weight')}>
                    Log Weight
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Training Week Widget */}
          {userId && (
            <TrainingWeekWidget userId={userId} compact />
          )}
        </div>

        {/* Milestone Badges */}
        <div>
          <MilestoneBadges badges={badges} loading={badgesLoading} onTap={() => setAchievementSheetOpen(true)} />
        </div>
      </div>

      {/* Wisdom Detail Bottom Sheet */}
      {wisdom && (
        <Sheet open={wisdomSheetOpen} onOpenChange={setWisdomSheetOpen}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-xl border-0 bg-card/95 backdrop-blur-xl overflow-y-auto p-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}>
            <div className="px-4 pt-4 pb-2">
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <div>
                    <SheetTitle className="text-[13px] font-semibold">Daily Insight</SheetTitle>
                    <p className="text-[13px] text-muted-foreground">
                      {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </SheetHeader>
            </div>

            <div className="px-4 space-y-2.5">
              {/* 3-col status grid */}
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={() => setExpandedInfo(expandedInfo === 'risk' ? null : 'risk')} className={`rounded-lg py-2 text-center transition-colors ${expandedInfo === 'risk' ? 'bg-muted/40' : 'bg-muted/20 active:bg-muted/30'}`}>
                  <span className={`text-[13px] font-medium ${riskColors[wisdom.riskLevel]}`}>
                    {wisdom.riskLevel.charAt(0).toUpperCase() + wisdom.riskLevel.slice(1)}
                  </span>
                  <p className="text-[13px] text-muted-foreground mt-0.5">Risk</p>
                </button>
                <div className="rounded-lg bg-muted/20 py-2 text-center">
                  <p className="text-[17px] font-bold tabular-nums">{wisdom.daysToFight}</p>
                  <p className="text-[13px] text-muted-foreground">Days Left</p>
                </div>
                <button onClick={() => setExpandedInfo(expandedInfo === 'pace' ? null : 'pace')} className={`rounded-lg py-2 text-center transition-colors ${expandedInfo === 'pace' ? 'bg-muted/40' : 'bg-muted/20 active:bg-muted/30'}`}>
                  <p className={`text-[13px] font-semibold ${paceColors[wisdom.paceStatus] ?? 'text-foreground'}`}>
                    {paceLabels[wisdom.paceStatus] ?? wisdom.paceStatus}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">Pace</p>
                </button>
              </div>
              {expandedInfo === 'risk' && (
                <div className="rounded-md bg-muted/30 px-2.5 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[13px] font-semibold mb-1">Risk Level</p>
                  <p className="text-[13px] text-muted-foreground leading-snug mb-1">How aggressive your current cut rate is.</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-green-400 font-medium">Green</span> — Safe, sustainable pace</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-orange-400 font-medium">Orange</span> — High pace, may affect performance</p>
                </div>
              )}
              {expandedInfo === 'pace' && (
                <div className="rounded-md bg-muted/30 px-2.5 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[13px] font-semibold mb-1">Pace</p>
                  <p className="text-[13px] text-muted-foreground leading-snug mb-1">Is your weekly loss on track to hit your target?</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-green-400 font-medium">On Track</span> — On schedule</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-green-400 font-medium">At Target</span> — Already at goal</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-blue-400 font-medium">Ahead</span> — Faster than needed</p>
                  <p className="text-[13px] text-muted-foreground"><span className="text-yellow-400 font-medium">Behind</span> — May need to adjust</p>
                </div>
              )}

              {/* Weight Pace */}
              <div className="rounded-2xl bg-muted/20 p-3">
                <h4 className="text-[14px] font-semibold mb-2">Weight Pace</h4>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <p className="text-[13px] text-muted-foreground">Actual / week</p>
                    <p className="text-[17px] font-bold tabular-nums">{wisdom.weeklyPaceKg.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-muted-foreground">Needed / week</p>
                    <p className="text-[17px] font-bold tabular-nums">{wisdom.requiredWeeklyKg.toFixed(2)} kg</p>
                  </div>
                </div>
                <p className="text-[14px] text-muted-foreground leading-relaxed">{wisdom.riskReason}</p>
              </div>

              {/* Guidance — current/goal weight + calories + macros */}
              {(() => {
                const cur = profile?.current_weight_kg ?? 0;
                const goal = profile?.goal_weight_kg ?? 0;
                const calorieTarget = profile ? calculateCalorieTarget(profile) : 0;
                const proteinG = profile?.ai_recommended_protein_g ?? Math.round((calorieTarget * 0.30) / 4);
                const carbsG = profile?.ai_recommended_carbs_g ?? Math.round((calorieTarget * 0.40) / 4);
                const fatsG = profile?.ai_recommended_fats_g ?? Math.round((calorieTarget * 0.30) / 9);
                const proteinCal = proteinG * 4;
                const carbsCal = carbsG * 4;
                const fatsCal = fatsG * 9;
                const mTotal = proteinCal + carbsCal + fatsCal || 1;
                const raw = [proteinCal, carbsCal, fatsCal].map((c) => (c / mTotal) * 100);
                const floors = raw.map((v) => Math.floor(v));
                let rem = 100 - floors.reduce((s, v) => s + v, 0);
                const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
                const pcts = [...floors];
                for (let k = 0; k < order.length && rem > 0; k++, rem--) pcts[order[k].i] += 1;
                return (
                  <div className="rounded-2xl bg-muted/20 p-3 space-y-3">
                    <h4 className="text-[14px] font-semibold">Guidance</h4>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-background/40 p-2 text-center">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current</p>
                        <p className="text-[17px] font-bold tabular-nums">{cur.toFixed(1)}<span className="text-[11px] text-muted-foreground font-normal"> kg</span></p>
                      </div>
                      <div className="rounded-lg bg-background/40 p-2 text-center">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Goal</p>
                        <p className="text-[17px] font-bold tabular-nums">{goal.toFixed(1)}<span className="text-[11px] text-muted-foreground font-normal"> kg</span></p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-2 text-center">
                        <p className="text-[11px] uppercase tracking-wider text-primary/80">Daily</p>
                        <p className="text-[17px] font-bold tabular-nums text-primary">{calorieTarget}<span className="text-[11px] font-normal"> kcal</span></p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Protein', g: proteinG, pct: pcts[0], color: 'text-blue-500' },
                        { label: 'Carbs', g: carbsG, pct: pcts[1], color: 'text-orange-500' },
                        { label: 'Fats', g: fatsG, pct: pcts[2], color: 'text-purple-500' },
                      ].map((m) => (
                        <div key={m.label} className="rounded-lg bg-background/40 p-2 text-center">
                          <p className={`text-[15px] font-bold tabular-nums ${m.color}`}>{m.g}g</p>
                          <p className="text-[11px] text-muted-foreground">{m.label} · {m.pct}%</p>
                        </div>
                      ))}
                    </div>

                    <p className="text-[14px] text-muted-foreground leading-relaxed">{wisdom.adviceParagraph}</p>
                  </div>
                );
              })()}

              {/* Action Items — includes concrete numeric target */}
              {(() => {
                const calorieTarget = profile ? calculateCalorieTarget(profile) : 0;
                const proteinG = profile?.ai_recommended_protein_g ?? Math.round((calorieTarget * 0.30) / 4);
                const carbsG = profile?.ai_recommended_carbs_g ?? Math.round((calorieTarget * 0.40) / 4);
                const fatsG = profile?.ai_recommended_fats_g ?? Math.round((calorieTarget * 0.30) / 9);
                const numericAction = `Hit ${calorieTarget} kcal today · ${proteinG}P / ${carbsG}C / ${fatsG}F`;
                const items = [numericAction, ...wisdom.actionItems];
                return (
                  <div className="rounded-2xl bg-muted/20 p-3">
                    <h4 className="text-[14px] font-semibold mb-2">Action Items</h4>
                    <ol className="space-y-2">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[14px]">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[12px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed text-foreground/90">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}

              {/* Nutrition — foods you eat often + swap ideas */}
              <div className="rounded-2xl bg-muted/20 p-3 space-y-2.5">
                <h4 className="text-[14px] font-semibold">Nutrition</h4>
                <p className="text-[14px] text-muted-foreground leading-relaxed">{wisdom.nutritionStatus}</p>
                {frequentMeals.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Foods you eat often</p>
                    <ul className="divide-y divide-border/20 rounded-lg bg-background/40 overflow-hidden">
                      {frequentMeals.map((m) => (
                        <li key={m.name} className="flex items-start gap-3 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium truncate">{m.name}</p>
                            <p className="text-[12px] text-muted-foreground/80 mt-0.5 leading-snug">{getFoodSwap(m.name)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-semibold tabular-nums text-foreground/80">{m.avgCalories}<span className="text-[10px] text-muted-foreground font-normal"> kcal</span></p>
                            <p className="text-[10px] text-muted-foreground">×{m.count}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <WeightIncreaseQuestionnaire
        open={questionnaireOpen}
        onOpenChange={setQuestionnaireOpen}
        onComplete={() => { sessionStorage.setItem(`wcw_questionnaire_dismissed_${todayStr}`, '1'); setWisdomSheetOpen(true); }}
      />

      <AchievementSheet
        open={achievementSheetOpen}
        onOpenChange={setAchievementSheetOpen}
        categories={allAchievements}
      />

      <CutPlanDialog open={cutPlanOpen} onOpenChange={setCutPlanOpen} />
    </ErrorBoundary>
  );
}
