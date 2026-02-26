import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Droplets, TrendingDown, Calendar, Lock, ChevronRight, Flame, Zap, CheckCircle2 } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.png";
import { WeightProgressRing } from "@/components/dashboard/WeightProgressRing";
import { CalorieProgressRing } from "@/components/dashboard/CalorieProgressRing";
import { useUser } from "@/contexts/UserContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { Button } from "@/components/ui/button";
import { calculateCalorieTarget } from "@/lib/calorieCalculation";
import { AIPersistence } from "@/lib/aiPersistence";
import { localCache } from "@/lib/localCache";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WeightIncreaseQuestionnaire } from "@/components/dashboard/WeightIncreaseQuestionnaire";

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
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [todayCalories, setTodayCalories] = useState(0);
  const [todayHydration, setTodayHydration] = useState(0);
  const [wisdom, setWisdom] = useState<DailyWisdom | null>(null);
  const [wisdomLoading, setWisdomLoading] = useState(false);
  const [wisdomSheetOpen, setWisdomSheetOpen] = useState(false);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const { userName, currentWeight, userId, profile } = useUser();
  const navigate = useNavigate();
  const { safeAsync, isMounted } = useSafeAsync();

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

  // Refetch when user navigates back to this page
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) {
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
        supabase.functions.invoke("daily-wisdom", { method: "GET" } as any).catch(() => { }), 2000);
      return () => clearTimeout(t);
    }
  }, [userId]);

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
        fightWeekTarget: profileData.fight_week_target_kg,
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
        console.error("daily-wisdom error:", error);
        return;
      }
      AIPersistence.save(userId, cacheKey, data.wisdom, 25);
      setWisdom(data.wisdom);
    } catch (err) {
      console.error("generateWisdom error:", err);
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

    const today = new Date().toISOString().split('T')[0];

    // --- Cache-first: serve cached data instantly, then refresh in background ---
    const cachedWeightLogs = localCache.get<any[]>(userId, 'dashboard_weight_logs');
    const cachedNutrition = localCache.getForDate<any[]>(userId, 'nutrition_logs', today);
    const cachedHydration = localCache.getForDate<any[]>(userId, 'hydration_logs', today);

    const hasCachedData = cachedWeightLogs !== null;

    if (hasCachedData) {
      const cachedCalories = cachedNutrition?.reduce((sum: number, log: any) => sum + (log?.calories || 0), 0) || 0;
      const cachedHydrationTotal = cachedHydration?.reduce((sum: number, log: any) => sum + (log?.amount_ml || 0), 0) || 0;

      safeAsync(setWeightLogs)(cachedWeightLogs);
      safeAsync(setTodayCalories)(cachedCalories);
      safeAsync(setTodayHydration)(cachedHydrationTotal);
      safeAsync(setLoading)(false);

      // Fire-and-forget wisdom with cached data
      checkAndGenerateWisdom(profile, cachedWeightLogs, cachedCalories, cachedHydrationTotal);
    }

    // --- Fetch fresh data from Supabase (3 queries — profile comes from context) ---
    try {
      const results = await Promise.allSettled([
        withSupabaseTimeout(
          supabase
            .from("weight_logs")
            .select("date, weight_kg")
            .eq("user_id", userId)
            .order("date", { ascending: true })
            .limit(30),
          undefined,
          "Weight logs query"
        ),

        withSupabaseTimeout(
          supabase
            .from("nutrition_logs")
            .select("calories")
            .eq("user_id", userId)
            .eq("date", today),
          undefined,
          "Nutrition logs query"
        ),

        withSupabaseTimeout(
          supabase
            .from("hydration_logs")
            .select("amount_ml")
            .eq("user_id", userId)
            .eq("date", today),
          undefined,
          "Hydration logs query"
        )
      ]);

      if (!isMounted()) return;

      // Only update state and cache for queries that succeeded — don't overwrite cached data with empty arrays on failure
      const logsOk = results[0].status === 'fulfilled';
      const nutritionOk = results[1].status === 'fulfilled';
      const hydrationOk = results[2].status === 'fulfilled';

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Dashboard query ${index} failed:`, result.reason);
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
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      if (!hasCachedData) {
        safeAsync(setWeightLogs)([]);
        safeAsync(setTodayCalories)(0);
        safeAsync(setTodayHydration)(0);
      }
    } finally {
      safeAsync(setLoading)(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const daysUntilTarget = profile ? Math.ceil((new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const currentWeightValue = currentWeight ?? profile?.current_weight_kg ?? 0;
  const weightToLose = profile ? (currentWeightValue - (profile.fight_week_target_kg || profile.goal_weight_kg)).toFixed(1) : 0;
  const dailyCalorieGoal = profile ? calculateCalorieTarget(profile) : 0;

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

  const convertWeight = (kg: number) => {
    return weightUnit === 'kg' ? kg : kg * 2.20462;
  };

  const chartData = weightLogs.map((log) => ({
    date: new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: convertWeight(parseFloat(log.weight_kg)),
  }));

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
    if (trendIsUp) {
      setQuestionnaireOpen(true);
    } else {
      setWisdomSheetOpen(true);
    }
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
      <div className="space-y-5 sm:space-y-6 p-4 sm:p-5 md:p-6 w-full max-w-7xl mx-auto">
        {/* Countdown + Greeting header */}
        <div className="dashboard-card-enter dashboard-stagger-1">
          {daysUntilTarget > 0 && (
            <div className="flex items-center gap-2 mb-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span className="text-sm text-foreground font-bold display-number">{daysUntilTarget}</span> days until target
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold">{getGreeting()}, {userName || "Fighter"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your weight cut journey dashboard</p>
        </div>

        {/* Wizard's Daily Wisdom card — conditional states */}
        {!hasTodayLog ? (
          /* State 1: Locked — no today weight log */
          <div className="rounded-lg glass-card p-3 sm:p-4 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="rounded-full bg-primary/20 p-2 sm:p-3 flex-shrink-0 opacity-40 mix-blend-screen">
                <img src={wizardLogo} alt="Wizard" className="w-12 h-12 sm:w-16 sm:h-16" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm sm:text-base text-foreground">Wizard's Daily Wisdom</h3>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs sm:text-sm text-foreground/80 mt-1">
                  Log your weight to unlock today's wisdom.
                </p>
                <Button
                  variant="link"
                  className="h-auto p-0 mt-1 text-xs text-primary font-bold"
                  onClick={() => navigate('/weight')}
                >
                  Go to Weight Tracker →
                </Button>
              </div>
            </div>
          </div>
        ) : wisdomLoading ? (
          /* State 2: Loading */
          <div className="rounded-lg glass-card p-3 sm:p-4 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="rounded-full bg-primary/20 p-2 sm:p-3 flex-shrink-0 animate-pulse mix-blend-screen">
                <img src={wizardLogo} alt="Wizard" className="w-12 h-12 sm:w-16 sm:h-16 opacity-60" />
              </div>
              <div className="flex-1 min-w-0 space-y-2 pt-1">
                <div className="h-3 rounded bg-muted/50 animate-pulse w-1/3" />
                <div className="h-3 rounded bg-muted/50 animate-pulse w-full" />
                <div className="h-3 rounded bg-muted/50 animate-pulse w-4/5" />
              </div>
            </div>
          </div>
        ) : wisdom ? (
          /* State 3: Active — AI wisdom loaded */
          <button
            className="w-full text-left rounded-lg glass-card p-3 sm:p-4 border-primary/20 hover:border-primary/50 transition-colors bg-gradient-to-r from-primary/5 to-secondary/5"
            onClick={handleWisdomClick}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="rounded-full bg-primary/20 p-2 sm:p-3 flex-shrink-0 mix-blend-screen">
                <img src={wizardLogo} alt="Wizard" className="w-12 h-12 sm:w-16 sm:h-16" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm sm:text-base text-foreground">Wizard's Daily Wisdom</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColors[wisdom.riskLevel]}`}>
                      {wisdom.riskLevel.charAt(0).toUpperCase() + wisdom.riskLevel.slice(1)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-foreground/70" />
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-foreground/80 mt-1 font-medium leading-snug">
                  {wisdom.summary}
                </p>
              </div>
            </div>
          </button>
        ) : (
          /* State 4: Fallback — weight logged but AI failed */
          <div className="rounded-lg glass-card p-3 sm:p-4 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="rounded-full bg-primary/20 p-2 sm:p-3 flex-shrink-0 mix-blend-screen">
                <img src={wizardLogo} alt="Wizard" className="w-12 h-12 sm:w-16 sm:h-16" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm sm:text-base text-foreground">Wizard's Daily Wisdom</h3>
                <p className="text-xs sm:text-sm text-foreground/80 mt-1 font-medium leading-snug">
                  {getWizardWisdom()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
          {/* Weight Progress Ring - Takes 1 column on desktop, order 1 on mobile */}
          {profile && (
            <div className="order-1 lg:order-none">
              <WeightProgressRing
                currentWeight={currentWeightValue}
                startingWeight={weightLogs.length > 0 ? parseFloat(weightLogs[0].weight_kg) : currentWeightValue}
                goalWeight={profile.goal_weight_kg}
              />
            </div>
          )}

          {/* Weight History Chart - Order 2 on mobile */}
          <div className="order-2 lg:order-none">
            <Card className="glass-card h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Weight History</CardTitle>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={weightUnit === 'kg' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setWeightUnit('kg')}
                      className="h-9 min-h-[36px] text-xs sm:h-8 sm:min-h-[32px] touch-target"
                    >
                      kg
                    </Button>
                    <Button
                      variant={weightUnit === 'lb' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setWeightUnit('lb')}
                      className="h-9 min-h-[36px] text-xs sm:h-8 sm:min-h-[32px] touch-target"
                    >
                      lb
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                    <ComposedChart data={chartData}>
                      <defs>
                        <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        label={{ value: weightUnit, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)} ${weightUnit}`, 'Weight']}
                      />
                      <Area
                        type="monotone"
                        dataKey="weight"
                        stroke="none"
                        fill="url(#weightGradient)"
                        animationDuration={1000}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--secondary))"
                        strokeWidth={3}
                        dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                        animationDuration={1000}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No weight data yet. Start logging your weight to see your progress!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <CalorieProgressRing
          consumed={todayCalories}
          target={dailyCalorieGoal}
        />
      </div>

      {/* Wisdom Detail Bottom Sheet */}
      {wisdom && (
        <Sheet open={wisdomSheetOpen} onOpenChange={setWisdomSheetOpen}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl overflow-y-auto pb-8">
            <SheetHeader className="mb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/20 p-2 flex-shrink-0">
                  <img src={wizardLogo} alt="Wizard" className="w-10 h-10" />
                </div>
                <div>
                  <SheetTitle className="text-base">Wizard's Daily Wisdom</SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
            </SheetHeader>

            {/* 3-col status grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColors[wisdom.riskLevel]}`}>
                  {wisdom.riskLevel.charAt(0).toUpperCase() + wisdom.riskLevel.slice(1)}
                </span>
                <p className="text-xs text-muted-foreground mt-1">Risk Level</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold display-number">{wisdom.daysToFight}</p>
                <p className="text-xs text-muted-foreground">Days to Fight</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className={`text-sm font-semibold ${paceColors[wisdom.paceStatus] ?? 'text-foreground'}`}>
                  {paceLabels[wisdom.paceStatus] ?? wisdom.paceStatus}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Pace</p>
              </div>
            </div>

            {/* Weight Pace card */}
            <div className="rounded-xl border border-border/50 p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Weight Pace</h4>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">Actual / week</p>
                  <p className="text-lg font-bold display-number">{wisdom.weeklyPaceKg.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Needed / week</p>
                  <p className="text-lg font-bold display-number">{wisdom.requiredWeeklyKg.toFixed(2)} kg</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{wisdom.riskReason}</p>
            </div>

            {/* Today's Guidance card */}
            <div className="rounded-xl border border-border/50 p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Today's Guidance</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{wisdom.adviceParagraph}</p>
            </div>

            {/* Action Items card */}
            <div className="rounded-xl border border-border/50 p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Action Items</h4>
              </div>
              <ol className="space-y-2">
                {wisdom.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            {/* Nutrition status */}
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  <p className="text-xs font-semibold">Nutrition</p>
                </div>
                <p className="text-xs text-muted-foreground">{wisdom.nutritionStatus}</p>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <WeightIncreaseQuestionnaire
        open={questionnaireOpen}
        onOpenChange={setQuestionnaireOpen}
        onComplete={() => setWisdomSheetOpen(true)}
      />
    </ErrorBoundary>
  );
}
