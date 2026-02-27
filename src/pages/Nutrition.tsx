import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Calendar as CalendarIcon, TrendingUp, Loader2, AlertCircle, Settings, Edit2, X, Lock, Activity, Utensils, Database, PieChart as PieChartIcon, Search, CheckCircle, ChevronDown, ChevronUp, ChevronRight, ScanLine, Mic, Dumbbell, Sunrise, Salad, UtensilsCrossed, Apple } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.png";
import { MealCard } from "@/components/nutrition/MealCard";
import { CalorieBudgetIndicator } from "@/components/nutrition/CalorieBudgetIndicator";
import { MacroPieChart } from "@/components/nutrition/MacroPieChart";
import { FoodSearchDialog } from "@/components/nutrition/FoodSearchDialog";
import { VoiceInput } from "@/components/nutrition/VoiceInput";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import { format, subDays, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { nutritionLogSchema } from "@/lib/validation";
import { calculateCalorieTarget as calculateCalorieTargetUtil } from "@/lib/calorieCalculation";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import ErrorBoundary from "@/components/ErrorBoundary";
import { optimisticUpdateManager, createNutritionTargetUpdate } from "@/lib/optimisticUpdates";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { nutritionCache, cacheHelpers } from "@/lib/nutritionCache";
import { localCache } from "@/lib/localCache";
import { syncQueue } from "@/lib/syncQueue";
import { preloadAdjacentDates } from "@/lib/backgroundSync";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";
import { triggerHapticSuccess, celebrateSuccess } from "@/lib/haptics";
import { DietAnalysisCard } from "@/components/nutrition/DietAnalysisCard";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import type { DietAnalysisResult } from "@/types/dietAnalysis";

interface Ingredient {
  name: string;
  grams: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fats_per_100g?: number;
  source?: string; // e.g., "USDA", "Nutrition Database", "AI Analysis"
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  quantity?: string;
}

interface AiLineItem {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface Meal {
  id: string;
  meal_name: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  meal_type?: string;
  portion_size?: string;
  recipe_notes?: string;
  is_ai_generated?: boolean;
  ingredients?: Ingredient[];
  date: string;
}

export default function Nutrition() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealPlanIdeas, setMealPlanIdeas] = useState<Meal[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [savingAllMeals, setSavingAllMeals] = useState(false);
  const loading = generatingPlan || loggingMeal !== null || savingAllMeals;
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [expandedMealIdeas, setExpandedMealIdeas] = useState<Set<string>>(new Set());
  const [isQuickAddSheetOpen, setIsQuickAddSheetOpen] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<"ai" | "manual">("ai");
  const [aiLineItems, setAiLineItems] = useState<AiLineItem[]>([]);
  const [aiAnalysisComplete, setAiAnalysisComplete] = useState(false);
  const [isManualMacrosDialogOpen, setIsManualMacrosDialogOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [safetyStatus, setSafetyStatus] = useState<"green" | "yellow" | "red">("green");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);

  // Enhanced authentication state management
  const { isSessionValid, checkSessionValidity, refreshSession, userId, profile: contextProfile, refreshProfile } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const [aiMacroGoals, setAiMacroGoals] = useState<{
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
    recommendedCalories: number;
  } | null>(null);
  const [fetchingMacroGoals, setFetchingMacroGoals] = useState(false);
  const [isEditTargetsDialogOpen, setIsEditTargetsDialogOpen] = useState(false);
  const [editingTargets, setEditingTargets] = useState({
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
  });
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // AI meal plan rate limiting
  const DAILY_LIMIT = 5;
  const DEV_PASSWORD = "ben10boy";
  const [mealPlanUsageCount, setMealPlanUsageCount] = useState(() => {
    const key = `meal_plan_usage_${format(new Date(), "yyyy-MM-dd")}`;
    return parseInt(localStorage.getItem(key) || "0", 10);
  });
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [showDevInput, setShowDevInput] = useState(false);
  const [devPasswordInput, setDevPasswordInput] = useState("");

  // Manual meal form
  const [manualMeal, setManualMeal] = useState({
    meal_name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fats_g: "",
    meal_type: "breakfast",
    portion_size: "",
    recipe_notes: "",
    ingredients: [] as Ingredient[],
  });
  const [aiMealDescription, setAiMealDescription] = useState("");
  const [barcodeBaseMacros, setBarcodeBaseMacros] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
    serving_weight_g: number;
  } | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiIngredientDescription, setAiIngredientDescription] = useState("");
  const [aiAnalyzingIngredient, setAiAnalyzingIngredient] = useState(false);

  // Food search state
  const [isFoodSearchOpen, setIsFoodSearchOpen] = useState(false);
  const [foodSearchMealType, setFoodSearchMealType] = useState<string>("snack");

  // Training food wisdom state
  interface TrainingFoodTip {
    preMeals: { name: string; description: string; timing: string; macros: string }[];
    postMeals: { name: string; description: string; timing: string; macros: string }[];
    tip: string;
  }
  const [trainingWisdom, setTrainingWisdom] = useState<TrainingFoodTip | null>(null);
  const [trainingWisdomLoading, setTrainingWisdomLoading] = useState(false);
  const [trainingWisdomSheetOpen, setTrainingWisdomSheetOpen] = useState(false);
  const [trainingPreference, setTrainingPreference] = useState("");

  // Diet analysis state
  const [dietAnalysis, setDietAnalysis] = useState<DietAnalysisResult | null>(null);
  const [dietAnalysisLoading, setDietAnalysisLoading] = useState(false);

  // Dynamic macro-aware wisdom text (fallback)
  const getNutritionWisdom = () => {
    const proteinGoal = aiMacroGoals?.proteinGrams || 0;
    const carbsGoal = aiMacroGoals?.carbsGrams || 0;
    const fatsGoal = aiMacroGoals?.fatsGrams || 0;
    const calGoal = dailyCalorieTarget || 0;

    const proteinLeft = Math.max(0, proteinGoal - totalProtein);
    const carbsLeft = Math.max(0, carbsGoal - totalCarbs);
    const fatsLeft = Math.max(0, fatsGoal - totalFats);
    const calLeft = Math.max(0, calGoal - totalCalories);

    const proteinPct = proteinGoal > 0 ? (totalProtein / proteinGoal) * 100 : 100;
    const carbsPct = carbsGoal > 0 ? (totalCarbs / carbsGoal) * 100 : 100;
    const fatsPct = fatsGoal > 0 ? (totalFats / fatsGoal) * 100 : 100;
    const calPct = calGoal > 0 ? (totalCalories / calGoal) * 100 : 100;

    if (totalCalories === 0) {
      return "Start your day right \u2014 tap here for pre & post training meal ideas tailored to your goals.";
    }
    if (calPct > 110) {
      return `You're ${Math.round(totalCalories - calGoal)} kcal over target today. Focus on staying hydrated and keeping your next meals light.`;
    }
    const macroDeficits = [
      { name: "protein", left: proteinLeft, pct: proteinPct },
      { name: "carbs", left: carbsLeft, pct: carbsPct },
      { name: "fats", left: fatsLeft, pct: fatsPct },
    ].filter(m => m.pct < 80);
    if (macroDeficits.length > 0) {
      macroDeficits.sort((a, b) => a.pct - b.pct);
      const worst = macroDeficits[0];
      if (worst.name === "protein") return `You're ${Math.round(proteinLeft)}g short on protein (${Math.round(proteinPct)}%). Add lean meat, eggs, or a shake.`;
      if (worst.name === "carbs") return `Carbs are low \u2014 ${Math.round(carbsLeft)}g left (${Math.round(carbsPct)}%). Rice, oats, or fruit will help.`;
      return `Fats running low \u2014 ${Math.round(fatsLeft)}g left (${Math.round(fatsPct)}%). Try avocado, nuts, or olive oil.`;
    }
    if (calPct >= 80 && calPct <= 110) return `Great balance! ${Math.round(calLeft)} kcal left and macros on track \ud83d\udd25`;
    if (calPct < 60) return `Only ${Math.round(calPct)}% of calories logged. Fuel up to support training!`;
    return `${Math.round(calLeft)} kcal remaining. Tap for training meal ideas.`;
  };

  // AI-generated wisdom advice
  const [aiWisdomAdvice, setAiWisdomAdvice] = useState<string | null>(null);
  const [aiWisdomLoading, setAiWisdomLoading] = useState(false);
  const wisdomGenRef = useState({ lastHash: "" })[0];

  const generateWisdomAdvice = async () => {
    if (!userId || totalCalories === 0) {
      safeAsync(setAiWisdomAdvice)(null);
      return;
    }

    // Create a hash based on calorie bucket (per 50 kcal) so we don't re-call for tiny changes
    const calBucket = Math.round(totalCalories / 50) * 50;
    const hash = `${calBucket}_${Math.round(totalProtein)}_${Math.round(totalCarbs)}_${Math.round(totalFats)}`;
    if (hash === wisdomGenRef.lastHash) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const cacheKey = `nutrition_wisdom_${today}_${hash}`;
    const cached = AIPersistence.load(userId, cacheKey);
    if (cached) {
      safeAsync(setAiWisdomAdvice)(cached);
      wisdomGenRef.lastHash = hash;
      return;
    }

    safeAsync(setAiWisdomLoading)(true);
    try {
      const calGoal = dailyCalorieTarget;
      const pGoal = aiMacroGoals?.proteinGrams || 0;
      const cGoal = aiMacroGoals?.carbsGrams || 0;
      const fGoal = aiMacroGoals?.fatsGrams || 0;

      const { data, error } = await supabase.functions.invoke("meal-planner", {
        body: {
          prompt: `You are a combat sports nutritionist. Give ONE short sentence (max 25 words) of personalised advice for a fighter based on their intake today.

Current intake: ${Math.round(totalCalories)} kcal (goal: ${calGoal}), ${Math.round(totalProtein)}g protein (goal: ${pGoal}g), ${Math.round(totalCarbs)}g carbs (goal: ${cGoal}g), ${Math.round(totalFats)}g fat (goal: ${fGoal}g).

Return ONLY the advice sentence, no JSON, no quotes, no explanation. Be specific (mention actual foods) and motivating. Use fight/training context.`,
          action: "generate",
          userData: { dailyCalorieTarget: calGoal },
        },
      });

      if (!isMounted()) return;
      if (error) throw error;

      // Extract the text - the API might return it in different formats
      let advice: string | null = null;
      if (data?.mealPlan) {
        if (typeof data.mealPlan === 'string') {
          advice = data.mealPlan.trim();
        } else if (Array.isArray(data.mealPlan) && data.mealPlan[0]?.meal_name) {
          // Couldn't get plain text, skip
        }
      }
      if (data?.rawResponse && typeof data.rawResponse === 'string') {
        advice = data.rawResponse.trim();
      }

      if (advice && advice.length > 10 && advice.length < 200) {
        // Clean any surrounding quotes
        advice = advice.replace(/^["']|["']$/g, '').trim();
        setAiWisdomAdvice(advice);
        AIPersistence.save(userId, cacheKey, advice, 6);
        wisdomGenRef.lastHash = hash;
      }
    } catch (err) {
      console.error("Wisdom advice error:", err);
      // Keep fallback text, no toast needed
    } finally {
      safeAsync(setAiWisdomLoading)(false);
    }
  };

  const generateTrainingFoodIdeas = async (forceRefresh = false) => {
    if (trainingWisdomLoading) return;

    // Check cache first (skip if refreshing)
    const today = format(new Date(), "yyyy-MM-dd");
    const prefKey = trainingPreference.trim();
    const cacheKey = `training_food_ideas_${today}${prefKey ? `_${prefKey.slice(0, 20)}` : ''}`;
    if (!forceRefresh && userId) {
      const cached = AIPersistence.load(userId, cacheKey);
      if (cached) {
        safeAsync(setTrainingWisdom)(cached);
        safeAsync(setTrainingWisdomSheetOpen)(true);
        return;
      }
    }

    safeAsync(setTrainingWisdomLoading)(true);
    safeAsync(setTrainingWisdomSheetOpen)(true);
    try {
      const calorieTarget = dailyCalorieTarget;
      const proteinGoal = aiMacroGoals?.proteinGrams || Math.round(calorieTarget * 0.4 / 4);

      let prefClause = "";
      if (prefKey) {
        prefClause = `\nUser preference: "${prefKey}". Tailor the suggestions accordingly (e.g. if they want easily digestible food, suggest lighter options; if they mention a food preference, incorporate it).`;
      }

      const { data, error } = await supabase.functions.invoke("meal-planner", {
        body: {
          prompt: `Generate optimal pre-training and post-training food recommendations for a combat athlete. 
            Their daily calorie target is ${calorieTarget} kcal with ${proteinGoal}g protein goal.${prefClause}
            
            Return ONLY valid JSON (no markdown, no code fences) in this exact format:
            {
              "preMeals": [
                {"name": "Meal Name", "description": "Brief description", "timing": "60-90 min before", "macros": "350 cal, 40g carbs, 25g protein, 8g fat"}
              ],
              "postMeals": [
                {"name": "Meal Name", "description": "Brief description", "timing": "Within 30 min", "macros": "400 cal, 35g carbs, 40g protein, 10g fat"}
              ],
              "tip": "A brief nutrition timing tip for fight athletes"
            }
            
            Give 3 pre-training and 3 post-training options. Focus on fight camp nutrition.`,
          action: "generate",
          userData: {
            dailyCalorieTarget: calorieTarget,
            proteinGoal,
          },
        },
      });

      if (!isMounted()) return;
      if (error) throw error;

      // Try to parse training-specific response from the mealPlan data
      let trainingData: TrainingFoodTip | null = null;

      // The meal-planner returns mealPlan as an array — try to extract structured data
      if (data?.mealPlan) {
        // Try parsing the raw response for our structured format
        try {
          if (typeof data.mealPlan === 'string') {
            trainingData = JSON.parse(data.mealPlan);
          } else if (data.mealPlan.preMeals) {
            trainingData = data.mealPlan;
          }
        } catch {
          // Fallback: convert mealPlan array to training format
        }

        if (!trainingData && Array.isArray(data.mealPlan)) {
          const meals = data.mealPlan;
          const half = Math.ceil(meals.length / 2);
          trainingData = {
            preMeals: meals.slice(0, half).map((m: any) => ({
              name: m.meal_name,
              description: m.recipe_notes || m.portion_size || "Optimized for pre-training energy",
              timing: "60-90 min before training",
              macros: `${m.calories} cal, ${m.carbs_g || 0}g C, ${m.protein_g || 0}g P, ${m.fats_g || 0}g F`,
            })),
            postMeals: meals.slice(half).map((m: any) => ({
              name: m.meal_name,
              description: m.recipe_notes || m.portion_size || "Optimized for post-training recovery",
              timing: "Within 30-60 min after training",
              macros: `${m.calories} cal, ${m.carbs_g || 0}g C, ${m.protein_g || 0}g P, ${m.fats_g || 0}g F`,
            })),
            tip: "Time your carbs around training for optimal performance and recovery.",
          };
        }
      }

      if (trainingData) {
        safeAsync(setTrainingWisdom)(trainingData);
        if (userId) {
          AIPersistence.save(userId, cacheKey, trainingData, 24);
        }
      }
    } catch (err) {
      console.error("Training food ideas error:", err);
      toast({ title: "Could not generate ideas", description: "Please try again later", variant: "destructive" });
    } finally {
      safeAsync(setTrainingWisdomLoading)(false);
    }
  };
  const [expandedMealActions, setExpandedMealActions] = useState<string | null>(null);

  const [newIngredient, setNewIngredient] = useState({ name: "", grams: "" });
  const [lookingUpIngredient, setLookingUpIngredient] = useState(false);
  const [ingredientLookupError, setIngredientLookupError] = useState<string | null>(null);
  const [manualNutritionDialog, setManualNutritionDialog] = useState({
    open: false,
    ingredientName: "",
    grams: 0,
    calories_per_100g: "",
    protein_per_100g: "",
    carbs_per_100g: "",
    fats_per_100g: "",
  });

  useEffect(() => {
    loadMeals();
    if (userId) preloadAdjacentDates(userId, selectedDate);
  }, [selectedDate, userId]);

  // Sync profile from context (always keep in sync)
  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
      calculateCalorieTarget(contextProfile);
    }
  }, [contextProfile]);

  // Load persisted meal plans once on mount
  useEffect(() => {
    if (!userId) return;
    const persistedData = AIPersistence.load(userId, 'meal_plans');
    if (persistedData && mealPlanIdeas.length === 0) {
      setMealPlanIdeas(persistedData.meals || []);
      if (persistedData.dailyCalorieTarget) setDailyCalorieTarget(persistedData.dailyCalorieTarget);
      if (persistedData.safetyStatus) setSafetyStatus(persistedData.safetyStatus);
      if (persistedData.safetyMessage) setSafetyMessage(persistedData.safetyMessage);
    }
  }, [userId]);

  // Visibility-based revalidation
  useEffect(() => {
    const handleVis = () => {
      if (document.visibilityState === 'visible' && userId) loadMeals(true);
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [userId, selectedDate]);

  // Warmup analyze-meal edge function when quick add sheet opens on AI tab
  useEffect(() => {
    if (isQuickAddSheetOpen && quickAddTab === "ai" && userId) {
      supabase.functions.invoke("analyze-meal", { method: "GET" } as any).catch(() => { });
    }
  }, [isQuickAddSheetOpen, quickAddTab]);

  // Warmup analyse-diet edge function on mount
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      supabase.functions.invoke("analyse-diet", { method: "GET" } as any).catch(() => { });
    }, 3000);
    return () => clearTimeout(timer);
  }, [userId]);

  // Load cached diet analysis on date change
  useEffect(() => {
    if (!userId) return;
    const cached = AIPersistence.load(userId, `diet_analysis_${selectedDate}`);
    setDietAnalysis(cached || null);
  }, [selectedDate, userId]);

  useEffect(() => {
    if (profile) {
      fetchMacroGoals();
    }
  }, [profile]);

  // Auto-open add meal dialog if URL param is present
  useEffect(() => {
    if (searchParams.get("openAddMeal") === "true") {
      setQuickAddTab("ai");
      setIsQuickAddSheetOpen(true);
      searchParams.delete("openAddMeal");
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get("openManualMeal") === "true") {
      setQuickAddTab("manual");
      setIsQuickAddSheetOpen(true);
      searchParams.delete("openManualMeal");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Real-time subscription to profiles table for automatic updates when Weight Tracker saves new recommendations
  useEffect(() => {
    if (!userId) return;

    let channel = supabase
      .channel('profile-nutrition-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`
      }, () => {
        refreshProfile();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Attempt to reconnect after a short delay
          setTimeout(() => {
            supabase.removeChannel(channel);
            channel = supabase
              .channel('profile-nutrition-updates-retry')
              .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`
              }, () => {
                refreshProfile();
              })
              .subscribe();
          }, 2000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadProfile = () => {
    if (contextProfile) {
      setProfile(contextProfile);
      calculateCalorieTarget(contextProfile);
    }
  };

  const calculateCalorieTarget = (profileData: any) => {
    // Use shared utility function for calorie calculation
    const target = calculateCalorieTargetUtil(profileData);
    setDailyCalorieTarget(target);

    // Calculate safety status and message (Nutrition page specific)
    const currentWeight = profileData?.current_weight_kg || 70;
    const goalWeight = profileData?.goal_weight_kg || 65;
    const daysToGoal = Math.ceil(
      (new Date(profileData?.target_date || new Date()).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysToGoal <= 0) {
      setSafetyStatus("green");
      setSafetyMessage("✓ Safe and sustainable weight loss pace");
      return;
    }

    const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
    const weeklyLossPercent = (weeklyWeightLoss / currentWeight) * 100;

    // Safety checks removed as per user request
    setSafetyStatus("green");
    setSafetyMessage("");
  };

  const getCurrentWeight = async (profileData: any) => {
    if (!userId) return profileData?.current_weight_kg || 0;

    const { data: weightLogs } = await supabase
      .from("weight_logs")
      .select("weight_kg")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1);

    if (weightLogs && weightLogs.length > 0) {
      return weightLogs[0].weight_kg;
    }
    return profileData?.current_weight_kg || 0;
  };

  const fetchMacroGoals = async () => {
    if (!profile) return;

    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      safeAsync(setAiMacroGoals)(null);
      return;
    }

    safeAsync(setFetchingMacroGoals)(true);
    try {
      if (!userId) {
        safeAsync(setAiMacroGoals)(null);
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      // Check cache first
      const cachedMacroGoals = nutritionCache.getMacroGoals(userId);
      if (cachedMacroGoals) {
        safeAsync(setAiMacroGoals)(cachedMacroGoals.macroGoals);
        if (cachedMacroGoals.dailyCalorieTarget) {
          safeAsync(setDailyCalorieTarget)(cachedMacroGoals.dailyCalorieTarget);
        }
        if (cachedMacroGoals.profileUpdate && profile && profile.manual_nutrition_override !== cachedMacroGoals.profileUpdate.manual_nutrition_override) {
          safeAsync(setProfile)({ ...profile, manual_nutrition_override: cachedMacroGoals.profileUpdate.manual_nutrition_override });
        }
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      // Fetch recommendations/overrides from profiles table
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("ai_recommended_calories, ai_recommended_protein_g, ai_recommended_carbs_g, ai_recommended_fats_g, manual_nutrition_override")
        .eq("id", userId)
        .single();

      if (!isMounted()) return;

      if (error) {
        setAiMacroGoals(null);
      } else if (profileData?.ai_recommended_calories) {
        const macroGoals = {
          proteinGrams: profileData.ai_recommended_protein_g || 0,
          carbsGrams: profileData.ai_recommended_carbs_g || 0,
          fatsGrams: profileData.ai_recommended_fats_g || 0,
          recommendedCalories: profileData.ai_recommended_calories || 0,
        };

        setAiMacroGoals(macroGoals);
        setDailyCalorieTarget(profileData.ai_recommended_calories);
        if (profile && profile.manual_nutrition_override !== profileData.manual_nutrition_override) {
          setProfile({ ...profile, manual_nutrition_override: profileData.manual_nutrition_override });
        }

        nutritionCache.setMacroGoals(userId, {
          macroGoals,
          dailyCalorieTarget: profileData.ai_recommended_calories,
          profileUpdate: { manual_nutrition_override: profileData.manual_nutrition_override }
        });
      } else {
        setAiMacroGoals(null);
      }
    } catch (error) {
      safeAsync(setAiMacroGoals)(null);
    } finally {
      safeAsync(setFetchingMacroGoals)(false);
    }
  };

  const loadMeals = async (skipCache = false) => {
    if (!userId) return;

    // Invalidate diet analysis when meals change (mutation triggered reload)
    if (skipCache) {
      setDietAnalysis(null);
      AIPersistence.remove(userId, `diet_analysis_${selectedDate}`);
    }

    let servedFromCache = false;

    // 1. Check in-memory nutritionCache first (hot cache, fastest)
    if (!skipCache) {
      const cachedMeals = nutritionCache.getMeals(userId, selectedDate);
      if (cachedMeals) {
        setMeals(cachedMeals);
        return; // Hot cache hit — skip network entirely
      }
    }

    // 2. Check localStorage localCache (survives app kills)
    const localMeals = localCache.getForDate<Meal[]>(userId, "nutrition_logs", selectedDate);
    if (localMeals && localMeals.length > 0) {
      setMeals(localMeals);
      servedFromCache = true;
    }

    // 3. Fetch fresh from Supabase (background revalidation)
    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("date", selectedDate)
      .order("created_at", { ascending: true });

    if (!isMounted()) return;

    if (error) {
      console.error("Error loading meals:", error);
      // If we already served cached data, keep showing it (no empty flash)
      if (!servedFromCache) {
        toast({
          title: "Couldn't load meals",
          description: "Check your connection and try again.",
          variant: "destructive",
        });
      }
      return;
    }

    // Cast ingredients from Json to Ingredient[]
    const typedMeals = (data || []).map(meal => ({
      ...meal,
      ingredients: (meal.ingredients as unknown) as Ingredient[] | undefined,
    }));

    // Merge pending syncQueue ops so in-flight inserts/deletes aren't lost
    const pendingOps = syncQueue.peek(userId);
    const dbIds = new Set(typedMeals.map(m => m.id));

    // Remove meals that have a pending delete
    const pendingDeleteIds = new Set(
      pendingOps
        .filter(op => op.table === "nutrition_logs" && op.action === "delete")
        .map(op => op.recordId)
    );
    let mergedMeals = typedMeals.filter(m => !pendingDeleteIds.has(m.id));

    // Add pending inserts not yet in DB result
    const pendingInserts = pendingOps.filter(
      op =>
        op.table === "nutrition_logs" &&
        op.action === "insert" &&
        (op.payload as any).date === selectedDate &&
        !dbIds.has(op.recordId)
    );
    for (const op of pendingInserts) {
      const p = op.payload as any;
      mergedMeals.push({
        id: op.recordId,
        meal_name: p.meal_name,
        calories: p.calories,
        protein_g: p.protein_g ?? undefined,
        carbs_g: p.carbs_g ?? undefined,
        fats_g: p.fats_g ?? undefined,
        meal_type: p.meal_type,
        portion_size: p.portion_size ?? undefined,
        recipe_notes: p.recipe_notes ?? undefined,
        ingredients: p.ingredients ?? undefined,
        is_ai_generated: p.is_ai_generated,
        date: p.date,
      } as Meal);
    }

    setMeals(mergedMeals as Meal[]);
    // Write to both caches
    nutritionCache.setMeals(userId, selectedDate, mergedMeals as Meal[]);
    localCache.setForDate(userId, "nutrition_logs", selectedDate, mergedMeals);
  };

  const handleGenerateMealPlan = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: "Please enter a prompt",
        description: "Describe what kind of meals you'd like",
        variant: "destructive",
      });
      return;
    }

    // Rate limit check
    if (mealPlanUsageCount >= DAILY_LIMIT && !devUnlocked) {
      toast({
        title: "Daily limit reached",
        description: "You've used all 5 meal plan generations for today. Try again after 11:59 PM.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPlan(true);
    setIsAiDialogOpen(false); // Close dialog immediately so overlay is visible without input box
    try {
      // Simple authentication check
      if (!isSessionValid) {
        const sessionValid = await checkSessionValidity();
        if (!sessionValid) {
          toast({
            title: "Authentication Required",
            description: "Your session has expired. Please refresh the page and log in again.",
            variant: "destructive",
          });
          setGeneratingPlan(false);
          return;
        }
      }

      if (!userId) {
        throw new Error("Authentication required. Please log in again.");
      }

      const userData = profile ? {
        currentWeight: profile.current_weight_kg,
        goalWeight: profile.goal_weight_kg,
        tdee: profile.tdee,
        daysToWeighIn: Math.ceil(
          (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ),
      } : null;

      const response = await supabase.functions.invoke("meal-planner", {
        body: {
          prompt: aiPrompt,
          userData,
          action: "generate"
        },
      });

      if (response.error) {
        throw response.error;
      }

      const { mealPlan, dailyCalorieTarget: target, safetyStatus: status, safetyMessage: message } = response.data;

      // Store as meal plan ideas instead of logging them
      const ideasToStore: Meal[] = [];

      console.log("Meal plan response structure:", { mealPlan, target, status, message });

      // Handle the actual response structure: mealPlan contains meals array
      if (mealPlan && mealPlan.meals && Array.isArray(mealPlan.meals)) {
        console.log("Processing meals array:", mealPlan.meals.length, "meals found");

        mealPlan.meals.forEach((meal: any, idx: number) => {
          const mealType = meal.type || "meal";
          const timestamp = Date.now() + idx; // Ensure unique IDs
          const mealProtein = meal.protein || 0;
          const mealCarbs = meal.carbs || 0;
          const mealFats = meal.fats || 0;

          ideasToStore.push({
            id: `idea-${mealType}-${timestamp}`,
            meal_name: meal.name || `${mealType} meal`,
            calories: mealProtein * 4 + mealCarbs * 4 + mealFats * 9,
            protein_g: mealProtein,
            carbs_g: mealCarbs,
            fats_g: mealFats,
            meal_type: mealType as "breakfast" | "lunch" | "dinner" | "snack",
            portion_size: meal.portion || "1 serving",
            recipe_notes: meal.recipe || "",
            ingredients: meal.ingredients || undefined,
            is_ai_generated: true,
            date: selectedDate,
          });
        });
      } else if (mealPlan && typeof mealPlan === 'object') {
        // Fallback: check if it's the old structure with individual meal objects
        console.log("Checking for fallback structure...");

        const mealTypes = ['breakfast', 'lunch', 'dinner'];
        mealTypes.forEach(mealType => {
          if (mealPlan[mealType]) {
            const meal = mealPlan[mealType];
            const mp = meal.protein || 0;
            const mc = meal.carbs || 0;
            const mf = meal.fats || 0;
            ideasToStore.push({
              id: `idea-${mealType}-${Date.now()}`,
              meal_name: meal.name || `${mealType} meal`,
              calories: mp * 4 + mc * 4 + mf * 9,
              protein_g: mp,
              carbs_g: mc,
              fats_g: mf,
              meal_type: mealType as "breakfast" | "lunch" | "dinner",
              portion_size: meal.portion || "1 serving",
              recipe_notes: meal.recipe || "",
              ingredients: meal.ingredients || undefined,
              is_ai_generated: true,
              date: selectedDate,
            });
          }
        });

        // Handle snacks array if present
        if (mealPlan.snacks && Array.isArray(mealPlan.snacks)) {
          mealPlan.snacks.forEach((snack: any, idx: number) => {
            const sp = snack.protein || 0;
            const sc = snack.carbs || 0;
            const sf = snack.fats || 0;
            ideasToStore.push({
              id: `idea-snack-${idx}-${Date.now()}`,
              meal_name: snack.name || "Snack",
              calories: sp * 4 + sc * 4 + sf * 9,
              protein_g: sp,
              carbs_g: sc,
              fats_g: sf,
              meal_type: "snack",
              portion_size: snack.portion || "1 serving",
              recipe_notes: snack.recipe || "",
              ingredients: snack.ingredients || undefined,
              is_ai_generated: true,
              date: selectedDate,
            });
          });
        }
      }

      console.log("Final meal ideas to store:", ideasToStore.length);

      if (ideasToStore.length === 0) {
        console.warn("No meals were parsed from the response");
        toast({
          title: "⚠️ No meals found",
          description: "The AI response didn't contain parseable meal data. Please try a different prompt.",
          variant: "destructive",
        });
        return;
      }

      setMealPlanIdeas(prev => [...prev, ...ideasToStore]);
      setDailyCalorieTarget(target || dailyCalorieTarget);
      setSafetyStatus(status || safetyStatus);
      setSafetyMessage(message || safetyMessage);

      // Increment rate limit counter
      const newCount = mealPlanUsageCount + 1;
      setMealPlanUsageCount(newCount);
      const usageKey = `meal_plan_usage_${format(new Date(), "yyyy-MM-dd")}`;
      localStorage.setItem(usageKey, newCount.toString());

      // Save accumulated ideas to localStorage for persistence
      const accumulatedIdeas = [...mealPlanIdeas, ...ideasToStore];
      if (userId) {
        AIPersistence.save(userId, 'meal_plans', {
          meals: accumulatedIdeas,
          dailyCalorieTarget: target || dailyCalorieTarget,
          safetyStatus: status || safetyStatus,
          safetyMessage: message || safetyMessage,
          prompt: aiPrompt
        }, 24); // 24 hours expiration
      }

      toast({
        title: "Meal plan generated!",
        description: `${ideasToStore.length} new ideas added (${accumulatedIdeas.length} total)`,
      });

      setIsAiDialogOpen(false);
      setAiPrompt("");
    } catch (error: any) {
      console.error("Error generating meal plan:", error);

      let errorMsg = "Failed to generate meal plan";
      let shouldRetry = false;

      // Handle specific error types with user-friendly messages
      if (error?.message?.includes("authorization") || error?.code === 401) {
        try {
          const refreshSuccess = await refreshSession();
          if (refreshSuccess) {
            errorMsg = "Session refreshed. Please try again.";
            shouldRetry = true;
          } else {
            errorMsg = "Session expired. Please refresh the page and log in again.";
          }
        } catch {
          errorMsg = "Authentication failed. Please refresh the page and log in again.";
        }
      } else if (error?.message) {
        if (error.message.includes('timeout') || error.message.includes('408')) {
          errorMsg = "The AI service is taking longer than usual. Please try again in a moment.";
          shouldRetry = true;
        } else if (error.message.includes('429') || error.message.includes('quota')) {
          errorMsg = "AI service is temporarily busy. Please try again in a few minutes.";
          shouldRetry = true;
        } else if (error.message.includes('404')) {
          errorMsg = "AI service temporarily unavailable. Please try again later.";
          shouldRetry = true;
        } else {
          errorMsg = error.message;
        }
      }

      toast({
        title: "Error generating meal plan",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleLogMealIdea = async (mealIdea: Meal, mealTypeOverride?: string) => {
    setLoggingMeal(mealIdea.id);
    try {
      if (!userId) throw new Error("Not authenticated");

      const mealId = crypto.randomUUID();

      // Recalculate calories from macros to ensure consistency
      const consistentCalories = (mealIdea.protein_g || 0) * 4 + (mealIdea.carbs_g || 0) * 4 + (mealIdea.fats_g || 0) * 9;

      const optimisticMeal: Meal = {
        id: mealId,
        meal_name: mealIdea.meal_name,
        calories: consistentCalories || mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealTypeOverride || mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
        date: selectedDate,
      };

      // 1. Optimistic UI update
      const updatedMeals = [...meals, optimisticMeal];
      setMeals(updatedMeals);

      // 2. Persist to localCache (survives app kill)
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);

      // 3. Enqueue to syncQueue (survives app kill)
      const dbPayload = {
        id: mealId,
        user_id: userId,
        date: selectedDate,
        meal_name: mealIdea.meal_name,
        calories: consistentCalories || mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealTypeOverride || mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
      };
      syncQueue.enqueue(userId, {
        table: "nutrition_logs",
        action: "insert",
        payload: dbPayload,
        recordId: mealId,
        timestamp: Date.now(),
      });

      // 4. Attempt inline Supabase insert
      try {
        const { error } = await supabase.from("nutrition_logs").insert({
          ...dbPayload,
        } as any);

        if (error) throw error;

        syncQueue.dequeueByRecordId(userId, mealId);
        celebrateSuccess();
        toast({
          title: "Meal logged!",
          description: `${mealIdea.meal_name} added to your day`,
        });
        await loadMeals(true);
      } catch (error) {
        console.error("Error logging meal (queued for sync):", error);
        celebrateSuccess();
        toast({ title: "Saved offline", description: "Will sync when connected." });
      }
    } catch (error) {
      console.error("Error logging meal:", error);
      toast({
        title: "Error",
        description: "Failed to log meal",
        variant: "destructive",
      });
    } finally {
      setLoggingMeal(null);
    }
  };

  const saveMealIdeasToDatabase = async (mealIdeas: Meal[]) => {
    if (mealIdeas.length === 0) return;

    setSavingAllMeals(true);
    try {
      if (!userId) throw new Error("Not authenticated");

      // Generate stable IDs and build optimistic meals + DB payloads
      const mealIds: string[] = [];
      const optimisticMeals: Meal[] = [];
      const dbPayloads: Record<string, unknown>[] = [];

      for (const meal of mealIdeas) {
        const mealId = crypto.randomUUID();
        mealIds.push(mealId);

        const recalcCal = (meal.protein_g || 0) * 4 + (meal.carbs_g || 0) * 4 + (meal.fats_g || 0) * 9;

        optimisticMeals.push({
          id: mealId,
          meal_name: meal.meal_name,
          calories: recalcCal || meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fats_g: meal.fats_g,
          meal_type: meal.meal_type,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
          ingredients: meal.ingredients,
          is_ai_generated: true,
          date: selectedDate,
        });

        const dbPayload = {
          id: mealId,
          user_id: userId,
          date: selectedDate,
          meal_name: meal.meal_name,
          calories: recalcCal || meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fats_g: meal.fats_g,
          meal_type: meal.meal_type,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
          ingredients: meal.ingredients as any,
          is_ai_generated: true,
        };
        dbPayloads.push(dbPayload);

        // Enqueue each individually so each retries independently
        syncQueue.enqueue(userId, {
          table: "nutrition_logs",
          action: "insert",
          payload: dbPayload,
          recordId: mealId,
          timestamp: Date.now(),
        });
      }

      // 1. Optimistic UI update
      const updatedMeals = [...meals, ...optimisticMeals];
      setMeals(updatedMeals);

      // 2. Persist to localCache
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);

      // 3. Clear meal ideas immediately (user intent captured)
      setMealPlanIdeas([]);
      AIPersistence.remove(userId, 'meal_plans');

      // 4. Attempt bulk Supabase insert
      try {
        const { error } = await supabase.from("nutrition_logs").insert(dbPayloads as any);

        if (error) throw error;

        // Success — dequeue all
        for (const mealId of mealIds) {
          syncQueue.dequeueByRecordId(userId, mealId);
        }
        celebrateSuccess();
        toast({
          title: "All meals saved!",
          description: `${mealIdeas.length} meals added to your day`,
        });
        await loadMeals(true);
      } catch (error) {
        console.error("Error saving meals (queued for sync):", error);
        celebrateSuccess();
        toast({ title: "Saved offline", description: "Will sync when connected." });
      }
    } catch (error: any) {
      console.error("Error saving meal ideas:", error);
      toast({
        title: "Error saving meals",
        description: error.message || "Failed to save meals",
        variant: "destructive",
      });
    } finally {
      setSavingAllMeals(false);
    }
  };

  const clearMealIdeas = async () => {
    setMealPlanIdeas([]);
    try {
      if (userId) AIPersistence.remove(userId, 'meal_plans');
    } catch (e) {
      console.warn("Failed to clear persisted meal plans:", e);
    }
  };

  // Function to automatically calculate macros based on calories
  const calculateMacrosFromCalories = (calories: number) => {
    // Fighter macro distribution: 40% protein, 30% carbs, 30% fats
    const proteinGrams = Math.round(calories * 0.40 / 4);
    const carbsGrams = Math.round(calories * 0.30 / 4);
    // Fats absorb rounding error so macros always sum to calorie target
    const fatsGrams = Math.round((calories - proteinGrams * 4 - carbsGrams * 4) / 9);

    return {
      protein_g: proteinGrams.toString(),
      carbs_g: carbsGrams.toString(),
      fats_g: fatsGrams.toString()
    };
  };

  // Auto-adjust other macros when one is manually changed, to maintain calorie match
  const adjustMacrosToMatchCalories = (
    changedMacro: 'protein' | 'carbs' | 'fats',
    newValue: number,
    currentMacros: { protein: number; carbs: number; fats: number },
    calorieGoal: number
  ) => {
    const MACRO_FLOOR = 10; // minimum grams per macro
    const calPerGram = { protein: 4, carbs: 4, fats: 9 };

    const changedCalories = newValue * calPerGram[changedMacro];
    const remainingCalories = calorieGoal - changedCalories;

    // Determine the other two macros
    const others = (['protein', 'carbs', 'fats'] as const).filter(m => m !== changedMacro);
    const [a, b] = others;

    const currentA = currentMacros[a];
    const currentB = currentMacros[b];
    const currentOtherTotal = currentA + currentB;

    let newA: number, newB: number;

    if (currentOtherTotal > 0) {
      // Distribute proportionally based on current ratio
      const ratioA = currentA / currentOtherTotal;
      newA = Math.round((remainingCalories * ratioA) / calPerGram[a]);
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    } else {
      // Equal split if both are zero
      newA = Math.round((remainingCalories / 2) / calPerGram[a]);
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    }

    // Enforce minimum floor
    if (newA < MACRO_FLOOR) {
      newA = MACRO_FLOOR;
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    }
    if (newB < MACRO_FLOOR) {
      newB = MACRO_FLOOR;
      newA = Math.round((remainingCalories - newB * calPerGram[b]) / calPerGram[a]);
    }
    // Final clamp
    newA = Math.max(newA, MACRO_FLOOR);
    newB = Math.max(newB, MACRO_FLOOR);

    return {
      [changedMacro]: newValue,
      [a]: newA,
      [b]: newB,
    } as { protein: number; carbs: number; fats: number };
  };

  // Debounced macro calculation to prevent excessive recalculations during typing
  const debouncedMacroCalculation = useDebouncedCallback((calories: string, updateFunction: (meal: any) => void) => {
    const calorieValue = parseInt(calories) || 0;
    const macros = calculateMacrosFromCalories(calorieValue);

    updateFunction((prev: any) => ({
      ...prev,
      ...macros
    }));
  }, 300); // 300ms debounce delay

  const handleCalorieChange = (calories: string, updateFunction: (meal: any) => void) => {
    // Update calories immediately for responsive UI
    updateFunction((prev: any) => ({
      ...prev,
      calories,
    }));

    // Debounce the macro calculation
    debouncedMacroCalculation(calories, updateFunction);
  };

  const saveMealToDb = async (mealData: {
    meal_name: string;
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fats_g: number | null;
    meal_type: string;
    portion_size: string | null;
    recipe_notes: string | null;
    ingredients: Ingredient[] | null;
    is_ai_generated: boolean;
  }) => {
    if (!userId) throw new Error("Not authenticated");

    const mealId = crypto.randomUUID();

    const optimisticMeal: Meal = {
      id: mealId,
      meal_name: mealData.meal_name,
      calories: mealData.calories,
      protein_g: mealData.protein_g ?? undefined,
      carbs_g: mealData.carbs_g ?? undefined,
      fats_g: mealData.fats_g ?? undefined,
      meal_type: mealData.meal_type,
      portion_size: mealData.portion_size ?? undefined,
      recipe_notes: mealData.recipe_notes ?? undefined,
      ingredients: mealData.ingredients ?? undefined,
      is_ai_generated: mealData.is_ai_generated,
      date: selectedDate,
    };

    // 1. Optimistic UI update
    const updatedMeals = [...meals, optimisticMeal];
    setMeals(updatedMeals);

    // 2. Persist to localCache (survives app kill)
    localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);

    // 3. Enqueue to syncQueue (survives app kill)
    const dbPayload = {
      id: mealId,
      user_id: userId,
      date: selectedDate,
      ...mealData,
    };
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: mealId,
      timestamp: Date.now(),
    });

    // 4. Attempt inline Supabase insert
    try {
      const { error } = await supabase.from("nutrition_logs").insert(dbPayload as any);

      if (error) throw error;

      // Success — dequeue (syncQueue won't duplicate thanks to 23505 handling)
      syncQueue.dequeueByRecordId(userId, mealId);
      celebrateSuccess();
      toast({ title: "Meal added successfully" });
      await loadMeals(true);
    } catch (error) {
      console.error("Error adding meal (queued for sync):", error);
      // Meal stays in state + localCache + syncQueue — will retry on resume
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  };

  const handleAddManualMeal = async () => {
    const validationResult = nutritionLogSchema.safeParse({
      meal_name: manualMeal.meal_name,
      calories: parseInt(manualMeal.calories),
      protein_g: manualMeal.protein_g ? parseFloat(manualMeal.protein_g) : null,
      carbs_g: manualMeal.carbs_g ? parseFloat(manualMeal.carbs_g) : null,
      fats_g: manualMeal.fats_g ? parseFloat(manualMeal.fats_g) : null,
      meal_type: manualMeal.meal_type,
      portion_size: manualMeal.portion_size || null,
      recipe_notes: manualMeal.recipe_notes || null,
    });

    if (!validationResult.success) {
      toast({
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    try {
      await saveMealToDb({
        meal_name: manualMeal.meal_name,
        calories: parseInt(manualMeal.calories),
        protein_g: manualMeal.protein_g ? parseFloat(manualMeal.protein_g) : null,
        carbs_g: manualMeal.carbs_g ? parseFloat(manualMeal.carbs_g) : null,
        fats_g: manualMeal.fats_g ? parseFloat(manualMeal.fats_g) : null,
        meal_type: manualMeal.meal_type,
        portion_size: manualMeal.portion_size || null,
        recipe_notes: manualMeal.recipe_notes || null,
        ingredients: manualMeal.ingredients.length > 0 ? manualMeal.ingredients : null,
        is_ai_generated: false,
      });

      setIsQuickAddSheetOpen(false);
      setManualMeal({
        meal_name: "",
        calories: "",
        protein_g: "",
        carbs_g: "",
        fats_g: "",
        meal_type: "breakfast",
        portion_size: "",
        recipe_notes: "",
        ingredients: [],
      });
      setAiMealDescription("");
      setNewIngredient({ name: "", grams: "" });
      setBarcodeBaseMacros(null);
      setServingMultiplier(1);
    } catch (error) {
      console.error("Error in optimistic meal update setup:", error);
      toast({
        title: "Error",
        description: "Failed to add meal",
        variant: "destructive",
      });
    }
  };

  const handleAiAnalyzeMeal = async () => {
    if (!aiMealDescription.trim()) {
      toast({
        title: "Missing description",
        description: "Please describe your meal",
        variant: "destructive",
      });
      return;
    }

    setAiAnalyzing(true);
    setAiAnalysisComplete(false);
    try {
      const mealCacheKey = `meal_${aiMealDescription.toLowerCase().trim().replace(/\s+/g, '_').slice(0, 60)}`;
      let nutritionData = userId ? AIPersistence.load(userId, mealCacheKey) : null;

      if (!nutritionData) {
        const { data, error } = await supabase.functions.invoke("analyze-meal", {
          body: { mealDescription: aiMealDescription },
        });

        if (error) throw error;
        nutritionData = data.nutritionData;
        if (userId && nutritionData) {
          AIPersistence.save(userId, mealCacheKey, nutritionData, 24 * 7);
        }
      }

      // Map response items to aiLineItems; fallback for old cached data without items
      if (nutritionData.items && Array.isArray(nutritionData.items) && nutritionData.items.length > 0) {
        setAiLineItems(nutritionData.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity || "",
          calories: item.calories || 0,
          protein_g: item.protein_g || 0,
          carbs_g: item.carbs_g || 0,
          fats_g: item.fats_g || 0,
        })));
      } else {
        // Fallback: create a single line item from top-level totals
        setAiLineItems([{
          name: nutritionData.meal_name,
          quantity: nutritionData.portion_size || "1 serving",
          calories: nutritionData.calories || 0,
          protein_g: nutritionData.protein_g || 0,
          carbs_g: nutritionData.carbs_g || 0,
          fats_g: nutritionData.fats_g || 0,
        }]);
      }

      // Also set the meal name for saving
      setManualMeal(prev => ({
        ...prev,
        meal_name: nutritionData.meal_name,
      }));

      setAiAnalysisComplete(true);

      toast({
        title: "Analysis complete!",
        description: "Review the items below and tap Add Meal",
      });
    } catch (error: any) {
      console.error("Error analyzing meal:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze meal",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSaveAiMeal = async () => {
    if (aiLineItems.length === 0) return;

    const totalCalories = aiLineItems.reduce((s, i) => s + i.calories, 0);
    const totalProtein = aiLineItems.reduce((s, i) => s + i.protein_g, 0);
    const totalCarbs = aiLineItems.reduce((s, i) => s + i.carbs_g, 0);
    const totalFats = aiLineItems.reduce((s, i) => s + i.fats_g, 0);

    // Store item breakdown in recipe_notes as text fallback
    const itemBreakdown = aiLineItems
      .map(i => `${i.quantity} ${i.name} (${i.calories} cal)`)
      .join(", ");

    // Build ingredients with per-item macros
    const ingredients: Ingredient[] = aiLineItems.map(item => ({
      name: item.name,
      grams: 0,
      calories: Math.round(item.calories),
      protein_g: Math.round(item.protein_g * 10) / 10,
      carbs_g: Math.round(item.carbs_g * 10) / 10,
      fats_g: Math.round(item.fats_g * 10) / 10,
      quantity: item.quantity,
    }));

    try {
      await saveMealToDb({
        meal_name: manualMeal.meal_name || aiMealDescription,
        calories: Math.round(totalCalories),
        protein_g: Math.round(totalProtein * 10) / 10,
        carbs_g: Math.round(totalCarbs * 10) / 10,
        fats_g: Math.round(totalFats * 10) / 10,
        meal_type: manualMeal.meal_type,
        portion_size: null,
        recipe_notes: itemBreakdown,
        ingredients: ingredients,
        is_ai_generated: true,
      });

      setIsQuickAddSheetOpen(false);
      setAiLineItems([]);
      setAiAnalysisComplete(false);
      setAiMealDescription("");
      setManualMeal(prev => ({ ...prev, meal_name: "" }));
    } catch (error) {
      console.error("Error saving AI meal:", error);
      toast({
        title: "Error",
        description: "Failed to add meal",
        variant: "destructive",
      });
    }
  };

  // Helper function to extract ingredient name from user input
  const extractIngredientName = (userInput: string): string => {
    let cleaned = userInput.trim();

    // Remove weight/quantity patterns (e.g., "250g", "1 cup", "2 tbsp")
    cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*(g|kg|oz|lb|cup|cups|tbsp|tsp|tablespoon|teaspoon|ml|l|gram|grams|kilogram|kilograms|ounce|ounces|pound|pounds)/gi, "");

    // Remove quantity words at the start
    cleaned = cleaned.replace(/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+|a|an)\s+/i, "");

    // Remove common prefixes
    cleaned = cleaned.replace(/^(about|approximately|around|roughly)\s+/i, "");

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Capitalize first letter of each word for better presentation
    cleaned = cleaned.split(" ").map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ");

    return cleaned || userInput; // Fallback to original if cleaning removes everything
  };

  const handleAiAnalyzeIngredient = async () => {
    if (!aiIngredientDescription.trim()) {
      toast({
        title: "Input Required",
        description: "Please describe the ingredient",
        variant: "destructive",
      });
      return;
    }

    setAiAnalyzingIngredient(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: aiIngredientDescription },
      });

      if (error) throw error;

      const { nutritionData } = data;

      // Extract ingredient information
      let ingredientName = "";
      let ingredientGrams = 0;
      let ingredientSource = "";
      let caloriesPer100g = 0;
      let proteinPer100g = 0;
      let carbsPer100g = 0;
      let fatsPer100g = 0;

      // Try to get ingredient from ingredients array
      if (nutritionData.ingredients && nutritionData.ingredients.length > 0) {
        const ingredient = nutritionData.ingredients[0];
        // Use extracted name from user input for better matching
        ingredientName = extractIngredientName(aiIngredientDescription);
        // If extracted name is too generic, use AI's name
        if (ingredientName.length < 3 || ingredientName.toLowerCase() === aiIngredientDescription.toLowerCase().trim()) {
          ingredientName = ingredient.name || nutritionData.meal_name;
        }
        ingredientGrams = ingredient.grams || 0;
        ingredientSource = ingredient.source || nutritionData.data_source || "AI Analysis";
      } else {
        // Fallback: parse from meal name and portion size
        ingredientName = extractIngredientName(aiIngredientDescription);
        // If extracted name is too generic, use AI's meal name
        if (ingredientName.length < 3) {
          ingredientName = nutritionData.meal_name;
        }
        ingredientSource = nutritionData.data_source || "AI Analysis";

        // Try to extract grams from portion_size (e.g., "250g", "1 cup (200g)")
        const portionSize = nutritionData.portion_size || "";
        const gramsMatch = portionSize.match(/(\d+(?:\.\d+)?)\s*g/i);
        if (gramsMatch) {
          ingredientGrams = parseFloat(gramsMatch[1]);
        } else {
          // If no grams found, try to estimate from common measurements
          // This is a fallback - ideally the AI should provide grams
          toast({
            title: "Weight Required",
            description: "Could not determine ingredient weight. Please specify weight (e.g., '250g chicken breast')",
            variant: "destructive",
          });
          return;
        }
      }

      if (ingredientGrams <= 0) {
        toast({
          title: "Invalid Weight",
          description: "Could not determine ingredient weight. Please specify weight (e.g., '250g chicken breast')",
          variant: "destructive",
        });
        return;
      }

      // Calculate nutrition per 100g from meal totals
      const mealCalories = nutritionData.calories || 0;
      const mealProtein = nutritionData.protein_g || 0;
      const mealCarbs = nutritionData.carbs_g || 0;
      const mealFats = nutritionData.fats_g || 0;

      caloriesPer100g = (mealCalories / ingredientGrams) * 100;
      proteinPer100g = (mealProtein / ingredientGrams) * 100;
      carbsPer100g = (mealCarbs / ingredientGrams) * 100;
      fatsPer100g = (mealFats / ingredientGrams) * 100;

      // Add ingredient to the list
      const newIngredients = [
        ...manualMeal.ingredients,
        {
          name: ingredientName,
          grams: ingredientGrams,
          calories_per_100g: Math.round(caloriesPer100g),
          protein_per_100g: Math.round(proteinPer100g * 10) / 10,
          carbs_per_100g: Math.round(carbsPer100g * 10) / 10,
          fats_per_100g: Math.round(fatsPer100g * 10) / 10,
          source: ingredientSource,
        }
      ];

      // Calculate new meal totals
      const totalCalories = newIngredients.reduce((sum, ing) =>
        sum + (ing.calories_per_100g || 0) * ing.grams / 100, 0
      );
      const totalProtein = newIngredients.reduce((sum, ing) =>
        sum + (ing.protein_per_100g || 0) * ing.grams / 100, 0
      );
      const totalCarbs = newIngredients.reduce((sum, ing) =>
        sum + (ing.carbs_per_100g || 0) * ing.grams / 100, 0
      );
      const totalFats = newIngredients.reduce((sum, ing) =>
        sum + (ing.fats_per_100g || 0) * ing.grams / 100, 0
      );

      // Update meal with new ingredient and calculated totals
      setManualMeal({
        ...manualMeal,
        ingredients: newIngredients,
        calories: Math.round(totalCalories).toString(),
        protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
        carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
        fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
      });

      // Clear input
      setAiIngredientDescription("");

      toast({
        title: "Ingredient Added",
        description: `${ingredientName} (${ingredientGrams}g) added. Meal totals updated.`,
      });
    } catch (error: any) {
      console.error("Error analyzing ingredient:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze ingredient. Please try again or add manually.",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzingIngredient(false);
    }
  };

  const handleVoiceInput = async (transcribedText: string) => {
    // Open the bottom sheet on AI tab with transcribed text
    setAiMealDescription(transcribedText);
    setQuickAddTab("ai");
    setIsQuickAddSheetOpen(true);
    setExpandedMealActions(null);

    // Auto-trigger analysis so user can review line items before saving
    setAiAnalyzing(true);
    setAiAnalysisComplete(false);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: transcribedText },
      });

      if (error) throw error;
      const { nutritionData } = data;

      if (nutritionData.items && Array.isArray(nutritionData.items) && nutritionData.items.length > 0) {
        setAiLineItems(nutritionData.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity || "",
          calories: item.calories || 0,
          protein_g: item.protein_g || 0,
          carbs_g: item.carbs_g || 0,
          fats_g: item.fats_g || 0,
        })));
      } else {
        setAiLineItems([{
          name: nutritionData.meal_name,
          quantity: nutritionData.portion_size || "1 serving",
          calories: nutritionData.calories || 0,
          protein_g: nutritionData.protein_g || 0,
          carbs_g: nutritionData.carbs_g || 0,
          fats_g: nutritionData.fats_g || 0,
        }]);
      }

      setManualMeal(prev => ({ ...prev, meal_name: nutritionData.meal_name }));
      setAiAnalysisComplete(true);
      toast({ title: "Analysis complete!", description: "Review the items below and tap Add Meal" });
    } catch (error: any) {
      console.error("Error processing voice input:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to process voice input",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const parseServingGrams = (servingSize: string): number => {
    const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g\b/i);
    if (match) return parseFloat(match[1]);
    return 100;
  };

  const handleBarcodeScanned = async (foodData: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
  }) => {
    const servingWt = parseServingGrams(foodData.serving_size || "100g");
    setBarcodeBaseMacros({
      calories: foodData.calories,
      protein_g: foodData.protein_g,
      carbs_g: foodData.carbs_g,
      fats_g: foodData.fats_g,
      serving_size: foodData.serving_size || "1 serving",
      serving_weight_g: servingWt,
    });
    setServingMultiplier(1);
    setManualMeal({
      meal_name: foodData.meal_name,
      calories: foodData.calories.toString(),
      protein_g: foodData.protein_g.toString(),
      carbs_g: foodData.carbs_g.toString(),
      fats_g: foodData.fats_g.toString(),
      meal_type: "snack",
      portion_size: foodData.serving_size || "1 serving",
      recipe_notes: "",
      ingredients: [],
    });
    setQuickAddTab("manual");
    setIsQuickAddSheetOpen(true);
  };

  // Lookup ingredient nutrition data using AI
  const lookupIngredientNutrition = async (ingredientName: string): Promise<{
    calories_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fats_per_100g: number;
    source?: string;
  } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("lookup-ingredient", {
        body: { ingredientName },
      });

      if (error) {
        console.error("Ingredient lookup error:", error);
        // If it's a 404, the ingredient wasn't found - return null to trigger manual entry
        if (error.message?.includes("404") || error.message?.includes("not found")) {
          return null;
        }
        // For other errors, also return null to trigger manual entry
        return null;
      }

      if (data?.error) {
        // Edge function returned an error (e.g., not found)
        console.log("Ingredient not found:", data.error);
        return null;
      }

      if (data?.nutritionData) {
        return data.nutritionData;
      }

      return null;
    } catch (error) {
      console.error("Error looking up ingredient:", error);
      return null;
    }
  };

  // Auto-calculate meal totals from ingredients
  const calculateMealTotalsFromIngredients = () => {
    if (manualMeal.ingredients.length === 0) {
      // If no ingredients, clear calculated values (but keep manual entries)
      return;
    }

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;
    let hasAnyNutritionData = false;

    manualMeal.ingredients.forEach((ingredient) => {
      if (ingredient.calories_per_100g !== undefined) {
        totalCalories += (ingredient.calories_per_100g * ingredient.grams) / 100;
        hasAnyNutritionData = true;
      }
      if (ingredient.protein_per_100g !== undefined) {
        totalProtein += (ingredient.protein_per_100g * ingredient.grams) / 100;
      }
      if (ingredient.carbs_per_100g !== undefined) {
        totalCarbs += (ingredient.carbs_per_100g * ingredient.grams) / 100;
      }
      if (ingredient.fats_per_100g !== undefined) {
        totalFats += (ingredient.fats_per_100g * ingredient.grams) / 100;
      }
    });

    if (!hasAnyNutritionData) return;

    // Always update with calculated totals from ingredients
    // User can manually override by typing in the fields
    setManualMeal((prev) => ({
      ...prev,
      calories: Math.round(totalCalories).toString(),
      protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
      carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
      fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
    }));
  };

  // Auto-calculate when ingredients change
  useEffect(() => {
    if (manualMeal.ingredients.length > 0) {
      // Only calculate if we have ingredients with nutrition data
      const hasNutritionData = manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined);
      if (hasNutritionData) {
        calculateMealTotalsFromIngredients();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMeal.ingredients]);

  // Handle manual nutrition entry
  const handleManualNutritionSubmit = () => {
    if (!manualNutritionDialog.calories_per_100g) {
      toast({
        title: "Calories Required",
        description: "Please enter calories per 100g",
        variant: "destructive",
      });
      return;
    }

    const ingredientName = manualNutritionDialog.ingredientName;
    const nutritionData = {
      calories_per_100g: parseFloat(manualNutritionDialog.calories_per_100g),
      protein_per_100g: manualNutritionDialog.protein_per_100g ? parseFloat(manualNutritionDialog.protein_per_100g) : 0,
      carbs_per_100g: manualNutritionDialog.carbs_per_100g ? parseFloat(manualNutritionDialog.carbs_per_100g) : 0,
      fats_per_100g: manualNutritionDialog.fats_per_100g ? parseFloat(manualNutritionDialog.fats_per_100g) : 0,
    };

    // Add ingredient with manual nutrition data
    const newIngredients = [
      ...manualMeal.ingredients,
      {
        name: ingredientName,
        grams: manualNutritionDialog.grams,
        ...nutritionData,
      }
    ];

    // Calculate totals immediately
    const totalCalories = newIngredients.reduce((sum, ing) =>
      sum + (ing.calories_per_100g || 0) * ing.grams / 100, 0
    );
    const totalProtein = newIngredients.reduce((sum, ing) =>
      sum + (ing.protein_per_100g || 0) * ing.grams / 100, 0
    );
    const totalCarbs = newIngredients.reduce((sum, ing) =>
      sum + (ing.carbs_per_100g || 0) * ing.grams / 100, 0
    );
    const totalFats = newIngredients.reduce((sum, ing) =>
      sum + (ing.fats_per_100g || 0) * ing.grams / 100, 0
    );

    // Update meal with ingredients and calculated totals
    setManualMeal({
      ...manualMeal,
      ingredients: newIngredients,
      calories: Math.round(totalCalories).toString(),
      protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
      carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
      fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
    });

    // Reset dialog
    setManualNutritionDialog({
      open: false,
      ingredientName: "",
      grams: 0,
      calories_per_100g: "",
      protein_per_100g: "",
      carbs_per_100g: "",
      fats_per_100g: "",
    });

    setIngredientLookupError(null);

    toast({
      title: "Ingredient Added",
      description: `${ingredientName} added with manual nutrition data`,
    });
  };

  const initiateDeleteMeal = (meal: Meal) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  };

  const handleDeleteMeal = async () => {
    if (!mealToDelete || !userId) return;

    const deletedId = mealToDelete.id;

    // 1. Optimistic UI removal
    const updatedMeals = meals.filter(m => m.id !== deletedId);
    setMeals(updatedMeals);
    setDeleteDialogOpen(false);
    setMealToDelete(null);

    // 2. Update localCache with meal removed
    localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);

    // 3. Enqueue delete to syncQueue
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "delete",
      payload: {},
      recordId: deletedId,
      timestamp: Date.now(),
    });

    // 4. Attempt inline Supabase delete
    try {
      const { error } = await supabase
        .from("nutrition_logs")
        .delete()
        .eq("id", deletedId);

      if (error) throw error;

      syncQueue.dequeueByRecordId(userId, deletedId);
      toast({ title: "Meal deleted" });
      await loadMeals(true);
    } catch (error) {
      console.error("Error deleting meal (queued for sync):", error);
      toast({ title: "Deleted offline", description: "Will sync when connected." });
    }
  };

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0);
  const totalFats = meals.reduce((sum, meal) => sum + (meal.fats_g || 0), 0);

  // Trigger AI wisdom after meals change (debounced)
  useEffect(() => {
    if (totalCalories === 0 || !userId) {
      setAiWisdomAdvice(null);
      return;
    }
    const timer = setTimeout(() => {
      generateWisdomAdvice();
    }, 1500);
    return () => clearTimeout(timer);
  }, [meals.length, totalCalories]);

  const handleAnalyseDiet = async (forceRefresh = false) => {
    if (!userId || meals.length === 0) return;

    const cacheKey = `diet_analysis_${selectedDate}`;
    if (!forceRefresh) {
      const cached = AIPersistence.load(userId, cacheKey);
      if (cached) {
        setDietAnalysis(cached);
        return;
      }
    }

    setDietAnalysisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-diet", {
        body: {
          meals: meals.map(m => ({
            meal_name: m.meal_name,
            calories: m.calories,
            protein_g: m.protein_g || 0,
            carbs_g: m.carbs_g || 0,
            fats_g: m.fats_g || 0,
            meal_type: m.meal_type,
            ingredients: m.ingredients,
          })),
          profile: contextProfile ? {
            age: contextProfile.age,
            sex: contextProfile.sex,
            height_cm: contextProfile.height_cm,
            current_weight_kg: contextProfile.current_weight_kg,
            activity_level: contextProfile.activity_level,
            training_frequency: contextProfile.training_frequency,
          } : {},
          macroGoals: aiMacroGoals ? {
            calorieTarget: dailyCalorieTarget,
            proteinGrams: aiMacroGoals.proteinGrams,
            carbsGrams: aiMacroGoals.carbsGrams,
            fatsGrams: aiMacroGoals.fatsGrams,
          } : {},
          date: selectedDate,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data.analysisData as DietAnalysisResult;
      setDietAnalysis(result);
      AIPersistence.save(userId, cacheKey, result, 6);
      triggerHapticSuccess();
    } catch (error) {
      console.error("Error analysing diet:", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Could not analyse your diet",
        variant: "destructive",
      });
    } finally {
      setDietAnalysisLoading(false);
    }
  };

  const getOverlayProps = () => {
    if (dietAnalysisLoading) {
      return {
        steps: [
          { icon: Utensils, label: "Reviewing meals", color: "text-blue-400" },
          { icon: PieChartIcon, label: "Estimating micronutrients", color: "text-green-500" },
          { icon: Search, label: "Identifying gaps", color: "text-yellow-400" },
          { icon: Sparkles, label: "Generating recommendations", color: "text-blue-400" },
        ],
        title: "Analysing Diet",
        subtitle: "Evaluating your full day of eating..."
      };
    }
    if (generatingPlan) {
      return {
        steps: [
          { icon: Activity, label: "Analyzing nutritional needs", color: "text-blue-400" },
          { icon: Utensils, label: "Designing meal structure", color: "text-green-500" },
          { icon: Sparkles, label: "Optimizing recipes", color: "text-yellow-400" },
        ],
        title: "Generating Meal Plan",
        subtitle: "Creating a personalized nutrition strategy..."
      };
    }
    if (aiAnalyzing) {
      return {
        steps: [
          { icon: Search, label: "Identifying food items", color: "text-blue-400" },
          { icon: Database, label: "Retrieving macros", color: "text-blue-500" },
          { icon: CheckCircle, label: "Finalizing log", color: "text-green-400" },
        ],
        title: "Analyzing Meal",
        subtitle: "Processing your input..."
      };
    }
    if (aiAnalyzingIngredient) {
      return {
        steps: [
          { icon: Search, label: "Searching database", color: "text-blue-400" },
          { icon: PieChartIcon, label: "Calculating portion macros", color: "text-yellow-500" },
        ],
        title: "Analyzing Ingredient",
        subtitle: "Looking up nutritional data..."
      };
    }
    return { steps: [], title: "", subtitle: "" };
  };

  const overlayProps = getOverlayProps();
  const isAiActive = generatingPlan || aiAnalyzing || aiAnalyzingIngredient || dietAnalysisLoading;

  // Handle food selected from search dialog
  const handleFoodSearchSelected = async (food: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
    portion_size: string;
  }) => {
    if (!userId) return;

    const mealId = crypto.randomUUID();

    const optimisticMeal: Meal = {
      id: mealId,
      meal_name: food.meal_name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fats_g: food.fats_g,
      meal_type: foodSearchMealType,
      portion_size: food.portion_size,
      date: selectedDate,
      is_ai_generated: false,
    };

    // 1. Optimistic UI update
    const updatedMeals = [...meals, optimisticMeal];
    setMeals(updatedMeals);

    // 2. Persist to localCache (survives app kill)
    localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);

    // 3. Enqueue to syncQueue (survives app kill)
    const dbPayload = {
      id: mealId,
      user_id: userId,
      date: selectedDate,
      meal_name: food.meal_name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fats_g: food.fats_g,
      meal_type: foodSearchMealType,
      portion_size: food.portion_size,
      recipe_notes: null,
      ingredients: null,
      is_ai_generated: false,
    };
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: mealId,
      timestamp: Date.now(),
    });

    // 4. Attempt inline Supabase insert
    try {
      const { error } = await supabase.from("nutrition_logs").insert(dbPayload as any);

      if (error) throw error;

      syncQueue.dequeueByRecordId(userId, mealId);
      celebrateSuccess();
      toast({ title: "Food logged!", description: `${food.meal_name} · ${food.calories} kcal` });
      await loadMeals(true);
    } catch (error) {
      console.error("Error logging food (queued for sync):", error);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  };

  // Open food actions for a meal type
  const openFoodSearch = (mealType: string) => {
    setFoodSearchMealType(mealType);
    setIsFoodSearchOpen(true);
  };

  return (
    <>
      <AIGeneratingOverlay
        isOpen={isAiActive}
        isGenerating={isAiActive}
        steps={overlayProps.steps}
        title={overlayProps.title}
        subtitle={overlayProps.subtitle}
        onCompletion={() => { }}
      />
      <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto overflow-x-hidden">

        {/* ═══ Wizard's Nutrition Wisdom ═══ */}
        <button
          className="w-full text-left rounded-2xl bg-gradient-to-r from-primary/10 via-secondary/8 to-primary/5 p-3.5 border border-primary/15 hover:border-primary/30 active:scale-[0.99] transition-all group"
          onClick={() => generateTrainingFoodIdeas()}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/15 p-2 flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <img src={wizardLogo} alt="Wizard" className="w-10 h-10 rounded-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm">Wizard's Daily Wisdom</h3>
                  <Dumbbell className="h-3.5 w-3.5 text-primary/60" />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {trainingWisdomLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {aiWisdomLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
                    <span className="text-muted-foreground/50">Updating advice…</span>
                  </span>
                ) : aiWisdomAdvice ? (
                  <span>
                    <Sparkles className="inline h-3 w-3 text-primary/40 mr-0.5 -mt-0.5" />
                    {aiWisdomAdvice}
                  </span>
                ) : (
                  getNutritionWisdom()
                )}
              </p>
              <p className="text-[10px] text-primary/50 mt-1 font-medium">Tap for pre & post training food ideas →</p>
            </div>
          </div>
        </button>

        {/* ═══ MFP Dashboard: Calories + Macros ═══ */}
        <MacroPieChart
          calories={totalCalories}
          calorieTarget={dailyCalorieTarget}
          protein={totalProtein}
          carbs={totalCarbs}
          fats={totalFats}
          proteinGoal={aiMacroGoals?.proteinGrams}
          carbsGoal={aiMacroGoals?.carbsGrams}
          fatsGoal={aiMacroGoals?.fatsGrams}
          onEditTargets={() => {
            const currentCalories = dailyCalorieTarget;
            const currentProtein = aiMacroGoals?.proteinGrams || 0;
            const currentCarbs = aiMacroGoals?.carbsGrams || 0;
            const currentFats = aiMacroGoals?.fatsGrams || 0;
            setEditingTargets({
              calories: currentCalories.toString(),
              protein: currentProtein.toString(),
              carbs: currentCarbs.toString(),
              fats: currentFats.toString(),
            });
            setIsEditTargetsDialogOpen(true);
          }}
        />

        {/* ═══ Date Navigator ═══ */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full bg-muted/40 hover:bg-muted/70 active:scale-[0.97] transition-all"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
            {selectedDate === format(new Date(), "yyyy-MM-dd")
              ? "Today"
              : format(new Date(selectedDate), "EEE, MMM d")}
          </button>
          <button
            onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* ═══ Meal Sections (MFP-style) ═══ */}
        <div className="space-y-2">
          {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => {
            const groupMeals = meals.filter(
              (m) => (m.meal_type || "other").toLowerCase() === mealType
            );
            const groupCalories = groupMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const isActionExpanded = expandedMealActions === mealType;
            const MealIcon = { breakfast: Sunrise, lunch: Salad, dinner: UtensilsCrossed, snack: Apple }[mealType];
            const mealIconColor = { breakfast: "text-orange-400", lunch: "text-blue-400", dinner: "text-purple-400", snack: "text-green-400" }[mealType];

            return (
              <div key={mealType} className="glass-card overflow-hidden transition-all duration-300">
                {/* Section header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MealIcon className={`h-4 w-4 ${mealIconColor}`} />
                    <h3 className="text-sm font-semibold capitalize">{mealType}</h3>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {groupCalories > 0 ? `${Math.round(groupCalories)} kcal` : ""}
                  </span>
                </div>

                {/* Food items */}
                {groupMeals.length > 0 && (
                  <div className="px-2">
                    {groupMeals.map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        onDelete={() => initiateDeleteMeal(meal)}
                      />
                    ))}
                  </div>
                )}

                {/* Add Food button + action menu */}
                <div className="border-t border-border/10">
                  <button
                    onClick={() => setExpandedMealActions(isActionExpanded ? null : mealType)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.99] transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Food
                    {isActionExpanded ? (
                      <ChevronUp className="h-3 w-3 ml-0.5" />
                    ) : (
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    )}
                  </button>

                  {/* Expanded action grid */}
                  {isActionExpanded && (
                    <div className="grid grid-cols-5 gap-1 px-3 pb-3 pt-1 animate-fade-in">
                      <button
                        onClick={() => openFoodSearch(mealType)}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                      >
                        <Search className="h-4 w-4 text-blue-500" />
                        <span className="text-[10px] text-muted-foreground">Search</span>
                      </button>
                      <BarcodeScanner
                        onFoodScanned={handleBarcodeScanned}
                        disabled={generatingPlan || savingAllMeals}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors !h-auto !border-0 !bg-transparent !px-0"
                      />
                      <button
                        onClick={() => {
                          setManualMeal(prev => ({ ...prev, meal_type: mealType }));
                          setQuickAddTab("ai");
                          setIsQuickAddSheetOpen(true);
                          setExpandedMealActions(null);
                        }}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                      >
                        <Sparkles className="h-4 w-4 text-blue-500" />
                        <span className="text-[10px] text-muted-foreground">Quick</span>
                      </button>
                      <VoiceInput
                        onTranscription={handleVoiceInput}
                        disabled={generatingPlan || savingAllMeals || aiAnalyzing}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors !h-auto !border-0 !bg-transparent !px-0"
                      />
                      <button
                        onClick={() => {
                          setManualMeal(prev => ({
                            ...prev,
                            meal_type: mealType,
                            meal_name: "",
                            calories: "",
                            protein_g: "",
                            carbs_g: "",
                            fats_g: "",
                            portion_size: "",
                            recipe_notes: "",
                            ingredients: [],
                          }));
                          setAiMealDescription("");
                          setAiLineItems([]);
                          setAiAnalysisComplete(false);
                          setQuickAddTab("manual");
                          setIsQuickAddSheetOpen(true);
                          setExpandedMealActions(null);
                        }}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                      >
                        <Edit2 className="h-4 w-4 text-green-500" />
                        <span className="text-[10px] text-muted-foreground">Manual</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══ Diet Analysis Section ═══ */}
        <div data-tutorial="analyse-diet">
        {dietAnalysis ? (
          <DietAnalysisCard
            analysis={dietAnalysis}
            onDismiss={() => {
              setDietAnalysis(null);
              if (userId) AIPersistence.remove(userId, `diet_analysis_${selectedDate}`);
            }}
            onRefresh={() => handleAnalyseDiet(true)}
            refreshing={dietAnalysisLoading}
          />
        ) : meals.length > 0 && (
          <button
            onClick={() => handleAnalyseDiet()}
            disabled={dietAnalysisLoading}
            className="glass-card w-full p-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Analyse Diet</span>
          </button>
        )}
        </div>

        {/* ═══ AI Meal Ideas Section ═══ */}
        <div className="space-y-3" data-tutorial="generate-meal-plan">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Meal Plan Ideas</h2>
            <Button
              onClick={() => setIsAiDialogOpen(true)}
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 rounded-xl border-primary/20 text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3" />
              Generate
            </Button>
          </div>

          {mealPlanIdeas.length === 0 ? (
            <div className="glass-card border-dashed py-10 text-center">
              <Sparkles className="h-7 w-7 text-primary/50 mx-auto mb-2 mix-blend-screen" />
              <p className="text-sm font-medium text-foreground">No meal ideas yet</p>
              <p className="text-xs text-foreground/60 mt-0.5">Generate AI meal suggestions above</p>
            </div>
          ) : (
            <ErrorBoundary>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={() => saveMealIdeasToDatabase(mealPlanIdeas)}
                    disabled={savingAllMeals || loggingMeal !== null}
                    size="sm"
                    className="flex-1 h-8 text-xs rounded-xl"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Save All ({mealPlanIdeas.length})
                  </Button>
                  <Button onClick={clearMealIdeas} variant="outline" size="sm" className="h-8 text-xs rounded-xl">
                    <X className="mr-1 h-3 w-3" />
                    Clear
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {mealPlanIdeas.map((meal) => {
                    const p = meal.protein_g || 0;
                    const c = meal.carbs_g || 0;
                    const f = meal.fats_g || 0;
                    const pCal = p * 4;
                    const cCal = c * 4;
                    const fCal = f * 9;
                    const macroTotal = pCal + cCal + fCal;

                    // SVG mini donut data
                    const R = 22;
                    const CIRC = 2 * Math.PI * R;
                    const pArc = macroTotal > 0 ? (pCal / macroTotal) * CIRC : 0;
                    const cArc = macroTotal > 0 ? (cCal / macroTotal) * CIRC : 0;
                    const fArc = macroTotal > 0 ? (fCal / macroTotal) * CIRC : 0;
                    const pOffset = 0;
                    const cOffset = pArc;
                    const fOffset = pArc + cArc;

                    const mealTypeButtons = [
                      { type: "breakfast", Icon: Sunrise, color: "text-orange-400", label: "Bkfst" },
                      { type: "lunch", Icon: Salad, color: "text-blue-400", label: "Lunch" },
                      { type: "dinner", Icon: UtensilsCrossed, color: "text-purple-400", label: "Dinner" },
                      { type: "snack", Icon: Apple, color: "text-green-400", label: "Snack" },
                    ];

                    const isExpanded = expandedMealIdeas.has(meal.id);
                    const hasDetails = (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) || meal.recipe_notes;

                    return (
                      <div key={meal.id} className="glass-card overflow-hidden transition-all duration-300">
                        {/* Tappable top section: donut + name + macros */}
                        <div
                          className={`p-4 ${hasDetails ? "cursor-pointer active:bg-white/[0.02] transition-colors" : ""}`}
                          onClick={() => {
                            if (!hasDetails) return;
                            setExpandedMealIdeas(prev => {
                              const next = new Set(prev);
                              if (next.has(meal.id)) next.delete(meal.id);
                              else next.add(meal.id);
                              return next;
                            });
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {/* Mini macro donut */}
                            <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                                <circle cx="28" cy="28" r={R} fill="none" stroke="hsl(var(--border) / 0.15)" strokeWidth="5" />
                                {macroTotal > 0 && (
                                  <>
                                    <circle cx="28" cy="28" r={R} fill="none" stroke="#3b82f6" strokeWidth="5"
                                      strokeDasharray={`${pArc} ${CIRC - pArc}`}
                                      strokeDashoffset={-pOffset}
                                      strokeLinecap="butt"
                                    />
                                    <circle cx="28" cy="28" r={R} fill="none" stroke="#f97316" strokeWidth="5"
                                      strokeDasharray={`${cArc} ${CIRC - cArc}`}
                                      strokeDashoffset={-cOffset}
                                      strokeLinecap="butt"
                                    />
                                    <circle cx="28" cy="28" r={R} fill="none" stroke="#a855f7" strokeWidth="5"
                                      strokeDasharray={`${fArc} ${CIRC - fArc}`}
                                      strokeDashoffset={-fOffset}
                                      strokeLinecap="butt"
                                    />
                                  </>
                                )}
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] font-bold tabular-nums">{meal.calories}</span>
                              </div>
                            </div>

                            {/* Name + macro dots + chevron */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm leading-tight text-foreground">{meal.meal_name}</h4>
                              {meal.portion_size && (
                                <p className="text-[10px] text-foreground/80 mt-0.5">{meal.portion_size}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2">
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  <span className="text-[10px] tabular-nums font-medium">{Math.round(p)}g P</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                  <span className="text-[10px] tabular-nums font-medium">{Math.round(c)}g C</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span className="text-[10px] tabular-nums font-medium">{Math.round(f)}g F</span>
                                </div>
                              </div>
                            </div>

                            {/* Expand/collapse chevron */}
                            {hasDetails && (
                              <ChevronDown className={`h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            )}
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/20 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                              {meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5">Ingredients</p>
                                  <div className="space-y-0.5">
                                    {meal.ingredients.map((ing: Ingredient, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                                        <span className="text-foreground/80">{ing.name}</span>
                                        <span className="text-foreground/60 tabular-nums ml-2 flex-shrink-0">{ing.grams}g</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {meal.recipe_notes && (
                                <div className="mt-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">Method</p>
                                  <p className="text-[11px] text-foreground/80 leading-relaxed">{meal.recipe_notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Add to meal type buttons */}
                        <div className="border-t border-white/10 grid grid-cols-4 bg-black/10">
                          {mealTypeButtons.map((btn) => (
                            <button
                              key={btn.type}
                              onClick={() => handleLogMealIdea(meal, btn.type)}
                              disabled={loggingMeal === meal.id || savingAllMeals}
                              className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-foreground/80 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.97] transition-all disabled:opacity-40 border-r border-white/5 last:border-r-0"
                            >
                              <btn.Icon className={`h-3.5 w-3.5 ${btn.color}`} />
                              <span>{btn.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ErrorBoundary>
          )}
        </div>

        {/* ═══ All Dialogs (preserved from original) ═══ */}

        {/* Food Search Dialog */}
        <FoodSearchDialog
          open={isFoodSearchOpen}
          onOpenChange={setIsFoodSearchOpen}
          onFoodSelected={handleFoodSearchSelected}
          mealType={foodSearchMealType}
        />

        {/* Quick Add Bottom Sheet (AI + Manual tabs) */}
        <Sheet open={isQuickAddSheetOpen} onOpenChange={(open) => {
          setIsQuickAddSheetOpen(open);
          if (!open) {
            setIngredientLookupError(null);
            setBarcodeBaseMacros(null);
            setServingMultiplier(1);
            setAiLineItems([]);
            setAiAnalysisComplete(false);
          }
        }}>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto pb-32 pt-0">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <SheetHeader className="pb-3">
              <SheetTitle className="text-base">Add Meal</SheetTitle>
            </SheetHeader>

            {/* Pill tab switcher */}
            <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-4">
              <button
                onClick={() => setQuickAddTab("ai")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${quickAddTab === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Sparkles className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                AI Quick Fill
              </button>
              <button
                onClick={() => setQuickAddTab("manual")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${quickAddTab === "manual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Edit2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                Manual
              </button>
            </div>

            {/* Meal type selector (shared) */}
            <div className="mb-4">
              <Select
                value={manualMeal.meal_type}
                onValueChange={(v) => setManualMeal(prev => ({ ...prev, meal_type: v }))}
              >
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── AI Tab ── */}
            {quickAddTab === "ai" && (
              <div className={`space-y-3 ${!aiAnalysisComplete ? "flex flex-col items-center justify-center min-h-[40vh]" : ""}`}>
                <div className={`flex flex-col gap-2 ${!aiAnalysisComplete ? "w-full max-w-md" : ""}`}>
                  <Textarea
                    placeholder={"e.g. 2 slices tiger bread with nutella, a glass of whole milk, and a banana\n\nBe as descriptive as possible — portions, brands, and prep details help get more accurate results"}
                    value={aiMealDescription}
                    onChange={(e) => setAiMealDescription(e.target.value)}
                    disabled={aiAnalyzing}
                    className="flex-1 text-sm min-h-[80px] resize-none"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && aiMealDescription.trim() && !aiAnalyzing) {
                        e.preventDefault();
                        handleAiAnalyzeMeal();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAiAnalyzeMeal}
                    disabled={aiAnalyzing || !aiMealDescription.trim()}
                    className="w-full"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {aiAnalyzing ? "Analyzing…" : "Analyze"}
                  </Button>
                </div>

                {/* AI Line Items */}
                {aiAnalysisComplete && aiLineItems.length > 0 && (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Items
                    </p>
                    <div className="rounded-xl border border-border/40 divide-y divide-border/20 overflow-hidden">
                      {aiLineItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">{item.quantity}</p>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                            <span className="font-semibold text-foreground">{item.calories}</span>
                            <span>{Math.round(item.protein_g)}P</span>
                            <span>{Math.round(item.carbs_g)}C</span>
                            <span>{Math.round(item.fats_g)}F</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAiLineItems(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Totals bar */}
                    {aiLineItems.length > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 text-xs">
                        <span className="font-semibold">Total</span>
                        <div className="flex gap-3 tabular-nums">
                          <span className="font-semibold text-primary">
                            {aiLineItems.reduce((s, i) => s + i.calories, 0)} kcal
                          </span>
                          <span className="text-muted-foreground">
                            {Math.round(aiLineItems.reduce((s, i) => s + i.protein_g, 0))}P
                          </span>
                          <span className="text-muted-foreground">
                            {Math.round(aiLineItems.reduce((s, i) => s + i.carbs_g, 0))}C
                          </span>
                          <span className="text-muted-foreground">
                            {Math.round(aiLineItems.reduce((s, i) => s + i.fats_g, 0))}F
                          </span>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleSaveAiMeal}
                      disabled={aiLineItems.length === 0}
                      className="w-full"
                    >
                      Add Meal
                    </Button>
                  </div>
                )}
                <div className="h-10 w-full" /> {/* Extra bottom spacer for better scrolling */}
              </div>
            )}

            {/* ── Manual Tab ── */}
            {quickAddTab === "manual" && (
              <div className="space-y-3">
                {/* Name */}
                <Input
                  placeholder="Meal name *"
                  value={manualMeal.meal_name}
                  onChange={(e) => setManualMeal({ ...manualMeal, meal_name: e.target.value })}
                  className="text-sm"
                />

                {/* Serving Size Adjustment — only for barcode-scanned items */}
                {barcodeBaseMacros && (
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Serving Size</p>
                      <span className="text-xs text-muted-foreground">{barcodeBaseMacros.serving_size}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground flex-1">Amount</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={Math.round(servingMultiplier * barcodeBaseMacros.serving_weight_g)}
                          onChange={(e) => {
                            const grams = parseFloat(e.target.value);
                            if (!isNaN(grams) && grams > 0) {
                              const m = grams / barcodeBaseMacros.serving_weight_g;
                              setServingMultiplier(Math.round(m * 10) / 10);
                              setManualMeal(prev => ({
                                ...prev,
                                calories: Math.round(barcodeBaseMacros.calories * m).toString(),
                                protein_g: (Math.round(barcodeBaseMacros.protein_g * m * 10) / 10).toString(),
                                carbs_g: (Math.round(barcodeBaseMacros.carbs_g * m * 10) / 10).toString(),
                                fats_g: (Math.round(barcodeBaseMacros.fats_g * m * 10) / 10).toString(),
                                portion_size: `${Math.round(grams)}g`,
                              }));
                            }
                          }}
                          className="w-20 text-sm text-right h-8"
                        />
                        <span className="text-sm text-muted-foreground">g</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground flex-1">Servings</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.max(0.5, Math.round((servingMultiplier - 0.5) * 10) / 10);
                            setServingMultiplier(next);
                            setManualMeal(prev => ({
                              ...prev,
                              calories: Math.round(barcodeBaseMacros.calories * next).toString(),
                              protein_g: (Math.round(barcodeBaseMacros.protein_g * next * 10) / 10).toString(),
                              carbs_g: (Math.round(barcodeBaseMacros.carbs_g * next * 10) / 10).toString(),
                              fats_g: (Math.round(barcodeBaseMacros.fats_g * next * 10) / 10).toString(),
                              portion_size: `${Math.round(next * barcodeBaseMacros.serving_weight_g)}g`,
                            }));
                          }}
                          disabled={servingMultiplier <= 0.5}
                          className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="text-sm font-semibold w-8 text-center tabular-nums">{servingMultiplier}×</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.min(10, Math.round((servingMultiplier + 0.5) * 10) / 10);
                            setServingMultiplier(next);
                            setManualMeal(prev => ({
                              ...prev,
                              calories: Math.round(barcodeBaseMacros.calories * next).toString(),
                              protein_g: (Math.round(barcodeBaseMacros.protein_g * next * 10) / 10).toString(),
                              carbs_g: (Math.round(barcodeBaseMacros.carbs_g * next * 10) / 10).toString(),
                              fats_g: (Math.round(barcodeBaseMacros.fats_g * next * 10) / 10).toString(),
                              portion_size: `${Math.round(next * barcodeBaseMacros.serving_weight_g)}g`,
                            }));
                          }}
                          className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-1 border-t border-border/40 text-xs">
                      <span className="font-semibold text-primary">{manualMeal.calories} kcal</span>
                      <span className="text-muted-foreground">{manualMeal.protein_g}g P</span>
                      <span className="text-muted-foreground">{manualMeal.carbs_g}g C</span>
                      <span className="text-muted-foreground">{manualMeal.fats_g}g F</span>
                    </div>
                  </div>
                )}

                {/* Calories */}
                <div>
                  <Input
                    type="number"
                    placeholder="Calories *"
                    value={manualMeal.calories}
                    onChange={(e) => handleCalorieChange(e.target.value, setManualMeal)}
                    className="text-sm"
                  />
                  {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-calculated from ingredients</p>
                  )}
                </div>

                {/* P / C / F */}
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Protein g"
                    value={manualMeal.protein_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })}
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Carbs g"
                    value={manualMeal.carbs_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })}
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Fats g"
                    value={manualMeal.fats_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })}
                    className="text-sm"
                  />
                </div>

                {/* Ingredients */}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-1">
                  Ingredients (optional)
                </p>

                {/* AI ingredient fill */}
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 250g chicken breast"
                    value={aiIngredientDescription}
                    onChange={(e) => setAiIngredientDescription(e.target.value)}
                    disabled={aiAnalyzingIngredient}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAiAnalyzeIngredient}
                    disabled={aiAnalyzingIngredient || !aiIngredientDescription.trim()}
                    className="shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {aiAnalyzingIngredient ? "…" : "AI Add"}
                  </Button>
                </div>

                {/* Manual ingredient add */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Ingredient name"
                    value={newIngredient.name}
                    onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                    className="flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="g"
                    value={newIngredient.grams}
                    onChange={(e) => setNewIngredient({ ...newIngredient, grams: e.target.value })}
                    className="w-16 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!newIngredient.name.trim() || !newIngredient.grams) {
                        toast({ title: "Missing Information", description: "Please enter ingredient name and grams", variant: "destructive" });
                        return;
                      }
                      const ingredientName = newIngredient.name.trim();
                      const grams = parseFloat(newIngredient.grams);
                      if (isNaN(grams) || grams <= 0) {
                        toast({ title: "Invalid Amount", description: "Please enter a valid number of grams", variant: "destructive" });
                        return;
                      }
                      setLookingUpIngredient(true);
                      setIngredientLookupError(null);
                      try {
                        const nutritionData = await lookupIngredientNutrition(ingredientName);
                        if (nutritionData) {
                          const newIngredients = [
                            ...manualMeal.ingredients,
                            {
                              name: ingredientName,
                              grams,
                              calories_per_100g: nutritionData.calories_per_100g,
                              protein_per_100g: nutritionData.protein_per_100g,
                              carbs_per_100g: nutritionData.carbs_per_100g,
                              fats_per_100g: nutritionData.fats_per_100g,
                              source: nutritionData.source,
                            }
                          ];
                          const tc = newIngredients.reduce((s, i) => s + (i.calories_per_100g || 0) * i.grams / 100, 0);
                          const tp = newIngredients.reduce((s, i) => s + (i.protein_per_100g || 0) * i.grams / 100, 0);
                          const tcarb = newIngredients.reduce((s, i) => s + (i.carbs_per_100g || 0) * i.grams / 100, 0);
                          const tf = newIngredients.reduce((s, i) => s + (i.fats_per_100g || 0) * i.grams / 100, 0);
                          setManualMeal({
                            ...manualMeal,
                            ingredients: newIngredients,
                            calories: Math.round(tc).toString(),
                            protein_g: tp > 0 ? (Math.round(tp * 10) / 10).toString() : "",
                            carbs_g: tcarb > 0 ? (Math.round(tcarb * 10) / 10).toString() : "",
                            fats_g: tf > 0 ? (Math.round(tf * 10) / 10).toString() : "",
                          });
                          setNewIngredient({ name: "", grams: "" });
                          toast({ title: "Ingredient added", description: `Found nutrition data for ${ingredientName}` });
                        } else {
                          setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" });
                        }
                      } catch {
                        setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" });
                      } finally {
                        setLookingUpIngredient(false);
                      }
                    }}
                    disabled={lookingUpIngredient || !newIngredient.name.trim() || !newIngredient.grams}
                    className="shrink-0"
                  >
                    {lookingUpIngredient
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {ingredientLookupError && (
                  <p className="text-xs text-destructive">{ingredientLookupError}</p>
                )}

                {/* Ingredients list */}
                {manualMeal.ingredients.length > 0 && (
                  <div className="rounded-md border border-border/40 divide-y divide-border/30 overflow-hidden">
                    {manualMeal.ingredients.map((ingredient, idx) => {
                      const cal = ingredient.calories_per_100g !== undefined
                        ? Math.round(ingredient.calories_per_100g * ingredient.grams / 100)
                        : null;
                      return (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="flex-1 truncate">{ingredient.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{ingredient.grams}g</span>
                          {cal !== null && (
                            <span className="text-xs text-muted-foreground shrink-0">{cal} kcal</span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const updated = [...manualMeal.ingredients];
                              updated.splice(idx, 1);
                              setManualMeal({ ...manualMeal, ingredients: updated });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                    {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                      <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground bg-muted/30">
                        <span>Total</span>
                        <span>{manualMeal.ingredients.reduce((s, i) => s + i.grams, 0)}g</span>
                      </div>
                    )}
                  </div>
                )}

                <Button onClick={handleAddManualMeal} disabled={savingAllMeals} className="w-full mt-1">
                  {savingAllMeals ? "Adding…" : "Add Meal"}
                </Button>
                <div className="h-20 w-full" /> {/* Substantial bottom spacer for manual tab */}
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* AI Meal Plan Bottom Sheet */}
        <Dialog open={isAiDialogOpen} onOpenChange={(open) => {
          setIsAiDialogOpen(open);
          if (!open) setShowDevInput(false);
        }}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl">
            <DialogHeader className="pb-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Meal ideas · {format(new Date(selectedDate), "MMM d")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2">
                {["High protein", "Low carb", "Mediterranean", "Fight week prep"].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setAiPrompt(prev => prev ? `${prev.trimEnd()} ${chip.toLowerCase()}` : chip)}
                    className="px-3 py-1.5 rounded-full text-xs border border-primary/20 bg-primary/5 text-primary/90 active:scale-95 transition-transform"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Compact textarea */}
              <Textarea
                placeholder="Describe what you'd like to eat..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                className="resize-none rounded-xl border-primary/15 bg-primary/5"
              />

              {/* Remaining count */}
              {!devUnlocked && (
                <p className="text-xs text-muted-foreground text-center">
                  {DAILY_LIMIT - mealPlanUsageCount > 0
                    ? `${DAILY_LIMIT - mealPlanUsageCount} generation${DAILY_LIMIT - mealPlanUsageCount === 1 ? '' : 's'} remaining today`
                    : "Daily limit reached. Try again after 11:59 PM."}
                </p>
              )}

              {/* Blue gradient generate button */}
              <Button
                onClick={handleGenerateMealPlan}
                disabled={generatingPlan || (!devUnlocked && mealPlanUsageCount >= DAILY_LIMIT)}
                className="w-full bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/20 rounded-xl h-11 text-sm font-semibold"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generatingPlan ? "Generating..." : "Generate Meal Ideas"}
              </Button>

              {/* Dev password — hidden behind tiny toggle */}
              {!devUnlocked && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setShowDevInput(v => !v)}
                    className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    Dev
                  </button>
                  {showDevInput && (
                    <div className="flex gap-2 items-center w-full animate-in fade-in-0 slide-in-from-top-1 duration-200">
                      <Input
                        type="password"
                        placeholder="Dev passcode"
                        value={devPasswordInput}
                        onChange={(e) => setDevPasswordInput(e.target.value)}
                        className="h-8 text-xs flex-1 rounded-xl"
                      />
                      <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl" onClick={() => {
                        if (devPasswordInput === DEV_PASSWORD) {
                          setDevUnlocked(true);
                          setShowDevInput(false);
                          toast({ title: "Dev mode unlocked" });
                        } else {
                          toast({ title: "Wrong password", variant: "destructive" });
                        }
                      }}>
                        Unlock
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual Nutrition Input Dialog */}
        <Dialog open={manualNutritionDialog.open} onOpenChange={(open) => {
          if (!open) {
            setManualNutritionDialog({
              open: false,
              ingredientName: "",
              grams: 0,
              calories_per_100g: "",
              protein_per_100g: "",
              carbs_per_100g: "",
              fats_per_100g: "",
            });
            setIngredientLookupError(null);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enter Nutrition Data</DialogTitle>
              <DialogDescription>
                Could not find nutrition data for "{manualNutritionDialog.ingredientName}" online. Please enter the nutrition values per 100g.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">{manualNutritionDialog.ingredientName}</div>
                <div className="text-xs text-muted-foreground">{manualNutritionDialog.grams}g</div>
              </div>
              <div>
                <Label htmlFor="manual-calories-dialog">Calories per 100g *</Label>
                <Input
                  id="manual-calories-dialog"
                  type="number"
                  placeholder="165"
                  value={manualNutritionDialog.calories_per_100g}
                  onChange={(e) => {
                    const calories = e.target.value;
                    setManualNutritionDialog({
                      ...manualNutritionDialog,
                      calories_per_100g: calories,
                    });
                    debouncedMacroCalculation(calories, (macros) => {
                      setManualNutritionDialog(prev => ({
                        ...prev,
                        protein_per_100g: macros.protein_g,
                        carbs_per_100g: macros.carbs_g,
                        fats_per_100g: macros.fats_g
                      }));
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Macros will be automatically calculated based on calories
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="manual-protein-dialog">Protein (g)</Label>
                  <Input
                    id="manual-protein-dialog"
                    type="number"
                    step="0.1"
                    placeholder="31.0"
                    value={manualNutritionDialog.protein_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      protein_per_100g: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-carbs-dialog">Carbs (g)</Label>
                  <Input
                    id="manual-carbs-dialog"
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={manualNutritionDialog.carbs_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      carbs_per_100g: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-fats-dialog">Fats (g)</Label>
                  <Input
                    id="manual-fats-dialog"
                    type="number"
                    step="0.1"
                    placeholder="3.6"
                    value={manualNutritionDialog.fats_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      fats_per_100g: e.target.value
                    })}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setManualNutritionDialog({
                      open: false,
                      ingredientName: "",
                      grams: 0,
                      calories_per_100g: "",
                      protein_per_100g: "",
                      carbs_per_100g: "",
                      fats_per_100g: "",
                    });
                    setIngredientLookupError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleManualNutritionSubmit}
                >
                  Add Ingredient
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Nutrition Targets Dialog */}
        <Dialog open={isEditTargetsDialogOpen} onOpenChange={setIsEditTargetsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Daily Nutrition Targets</DialogTitle>
              <DialogDescription>
                Set your daily calorie and macro targets. These will override AI recommendations.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-calories">Daily Calories *</Label>
                <Input
                  id="edit-calories"
                  type="number"
                  placeholder="2000"
                  value={editingTargets.calories}
                  onChange={(e) => {
                    const calories = e.target.value;
                    const calorieValue = parseInt(calories) || 0;
                    const macros = calorieValue > 0 ? calculateMacrosFromCalories(calorieValue) : null;

                    setEditingTargets(prev => ({
                      ...prev,
                      calories,
                      ...(macros ? {
                        protein: macros.protein_g,
                        carbs: macros.carbs_g,
                        fats: macros.fats_g,
                      } : {}),
                    }));
                  }}
                  min="1"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Macro targets will be automatically calculated (Recommended: 1200-4000 kcal/day)</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="edit-protein">Protein (g)</Label>
                  <Input
                    id="edit-protein"
                    type="number"
                    step="1"
                    placeholder="150"
                    value={editingTargets.protein}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('protein', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, protein: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-carbs">Carbs (g)</Label>
                  <Input
                    id="edit-carbs"
                    type="number"
                    step="1"
                    placeholder="200"
                    value={editingTargets.carbs}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('carbs', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, carbs: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-fats">Fats (g)</Label>
                  <Input
                    id="edit-fats"
                    type="number"
                    step="1"
                    placeholder="65"
                    value={editingTargets.fats}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('fats', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, fats: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
              </div>
              {/* Live macro-calorie summary */}
              {(() => {
                const p = parseFloat(editingTargets.protein) || 0;
                const c = parseFloat(editingTargets.carbs) || 0;
                const f = parseFloat(editingTargets.fats) || 0;
                const calGoal = parseFloat(editingTargets.calories) || 0;
                const macroTotal = p * 4 + c * 4 + f * 9;
                const diff = Math.abs(macroTotal - calGoal);
                const totalMacroG = p + c + f;
                const pPct = totalMacroG > 0 ? Math.round((p / totalMacroG) * 100) : 0;
                const cPct = totalMacroG > 0 ? Math.round((c / totalMacroG) * 100) : 0;
                const fPct = totalMacroG > 0 ? 100 - pPct - cPct : 0;
                const color = calGoal === 0 ? 'text-muted-foreground' : diff <= 20 ? 'text-green-600' : diff <= 50 ? 'text-yellow-600' : 'text-red-600';
                return calGoal > 0 ? (
                  <p className={`text-xs font-medium ${color}`}>
                    Macro total: {Math.round(macroTotal)} / {Math.round(calGoal)} kcal &bull; {pPct}% P / {cPct}% C / {fPct}% F
                  </p>
                ) : null;
              })()}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditTargetsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    const calories = parseFloat(editingTargets.calories);
                    if (isNaN(calories) || calories <= 0) {
                      toast({
                        title: "Invalid calories",
                        description: "Please enter a valid calorie target (greater than 0)",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (calories < 800 || calories > 5000) {
                      toast({
                        title: "Calorie range warning",
                        description: "Calorie target is outside recommended range (800-5000 kcal/day)",
                        variant: "destructive",
                      });
                      return;
                    }

                    const macroCalories = (parseFloat(editingTargets.protein) || 0) * 4
                      + (parseFloat(editingTargets.carbs) || 0) * 4
                      + (parseFloat(editingTargets.fats) || 0) * 9;
                    const macroDiff = Math.abs(macroCalories - calories);
                    if (macroDiff > 50) {
                      toast({
                        title: "Macro-calorie mismatch",
                        description: `Your macros add up to ${Math.round(macroCalories)} kcal, which is ${Math.round(macroDiff)} kcal ${macroCalories > calories ? 'over' : 'under'} your calorie goal. Saving anyway.`,
                      });
                    }

                    try {
                      if (!userId) throw new Error("Not authenticated");

                      const originalProfile = { ...profile };
                      const optimisticProfile = {
                        ...profile,
                        manual_nutrition_override: true,
                        ai_recommended_calories: Math.round(calories),
                        ai_recommended_protein_g: editingTargets.protein ? parseFloat(editingTargets.protein) : profile?.ai_recommended_protein_g,
                        ai_recommended_carbs_g: editingTargets.carbs ? parseFloat(editingTargets.carbs) : profile?.ai_recommended_carbs_g,
                        ai_recommended_fats_g: editingTargets.fats ? parseFloat(editingTargets.fats) : profile?.ai_recommended_fats_g,
                      };

                      setProfile(optimisticProfile);
                      setIsEditTargetsDialogOpen(false);
                      toast({
                        title: "Targets updated!",
                        description: "Your daily nutrition targets have been set.",
                      });

                      const updateOperation = async () => {
                        const updateData: {
                          manual_nutrition_override: boolean;
                          ai_recommended_calories: number;
                          ai_recommended_protein_g?: number;
                          ai_recommended_carbs_g?: number;
                          ai_recommended_fats_g?: number;
                        } = {
                          manual_nutrition_override: true,
                          ai_recommended_calories: Math.round(calories),
                        };

                        if (editingTargets.protein) {
                          const protein = parseFloat(editingTargets.protein);
                          if (!isNaN(protein) && protein >= 0) {
                            updateData.ai_recommended_protein_g = protein;
                          }
                        }
                        if (editingTargets.carbs) {
                          const carbs = parseFloat(editingTargets.carbs);
                          if (!isNaN(carbs) && carbs >= 0) {
                            updateData.ai_recommended_carbs_g = carbs;
                          }
                        }
                        if (editingTargets.fats) {
                          const fats = parseFloat(editingTargets.fats);
                          if (!isNaN(fats) && fats >= 0) {
                            updateData.ai_recommended_fats_g = fats;
                          }
                        }

                        const { error } = await supabase
                          .from("profiles")
                          .update(updateData)
                          .eq("id", userId);

                        if (error) {
                          console.error("Supabase update error:", error);
                          if (error.code === "PGRST204") {
                            throw new Error(
                              "Database schema is missing required columns. Please run the migration: " +
                              "20251122230028_add_ai_nutrition_targets.sql and " +
                              "20251124213104_add_manual_nutrition_override.sql in your Supabase SQL Editor."
                            );
                          }
                          throw error;
                        }
                      };

                      const update = createNutritionTargetUpdate(
                        userId,
                        optimisticProfile,
                        originalProfile,
                        updateOperation
                      );

                      update.onError = (error: any, rollbackData: any) => {
                        setProfile(rollbackData);
                        console.error("Error updating targets:", error);
                        toast({
                          title: "Error",
                          description: error.message || "Failed to update nutrition targets. Changes have been reverted.",
                          variant: "destructive",
                        });
                      };

                      const success = await optimisticUpdateManager.executeOptimisticUpdate(update);

                      if (success) {
                        nutritionCache.remove(userId, 'profile');
                        nutritionCache.remove(userId, 'macroGoals');
                      }

                    } catch (error: any) {
                      console.error("Error in optimistic update setup:", error);
                      toast({
                        title: "Error",
                        description: error.message || "Failed to update nutrition targets",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Save Targets
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteMeal}
          title="Delete Meal Entry"
          itemName={mealToDelete ? `${mealToDelete.meal_name} (${mealToDelete.calories} cal)` : undefined}
        />
      </div>

      {/* Training Food Ideas Bottom Sheet */}
      <Sheet open={trainingWisdomSheetOpen} onOpenChange={setTrainingWisdomSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/15 p-2 flex-shrink-0">
                <img src={wizardLogo} alt="Wizard" className="w-10 h-10 rounded-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-base">Training Fuel Guide</SheetTitle>
                  <button
                    onClick={() => generateTrainingFoodIdeas(true)}
                    disabled={trainingWisdomLoading}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40 transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
                  >
                    {trainingWisdomLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M8 2V5l2-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                    Refresh
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Optimal pre & post training nutrition
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* Preference input */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="e.g. easily digestible, high carb, no dairy…"
              value={trainingPreference}
              onChange={(e) => setTrainingPreference(e.target.value)}
              disabled={trainingWisdomLoading}
              className="text-sm h-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trainingPreference.trim()) {
                  generateTrainingFoodIdeas(true);
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => generateTrainingFoodIdeas(true)}
              disabled={trainingWisdomLoading || !trainingPreference.trim()}
              className="h-9 px-3 shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Go
            </Button>
          </div>

          {trainingWisdomLoading ? (
            /* Animated progress steps */
            <div className="space-y-5 py-4">
              <div className="text-center mb-2">
                <p className="text-sm font-medium text-foreground">Crafting your training fuel plan…</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Personalizing based on your goals</p>
              </div>

              {/* Progress bar */}
              <div className="relative h-1 rounded-full bg-border/20 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-secondary to-primary" style={{ animation: 'trainingProgressGrow 8s ease-out forwards' }} />
              </div>
              <style>{`
                @keyframes trainingProgressGrow {
                  0% { width: 5%; }
                  30% { width: 35%; }
                  60% { width: 60%; }
                  80% { width: 80%; }
                  100% { width: 95%; }
                }
                @keyframes trainingStepFadeIn {
                  from { opacity: 0; transform: translateY(6px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>

              {/* Steps */}
              <div className="space-y-3">
                {[
                  { icon: "🎯", label: "Analyzing your macro targets", delay: "0s" },
                  { icon: "⚡", label: "Designing pre-training fuel", delay: "2s" },
                  { icon: "💪", label: "Crafting post-training recovery meals", delay: "4s" },
                  { icon: "✨", label: "Finalizing recommendations", delay: "6s" },
                ].map((step, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-500"
                    style={{ animation: `trainingStepFadeIn 0.5s ease-out ${step.delay} both` }}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm flex-shrink-0">
                      {step.icon}
                    </div>
                    <span className="text-sm text-muted-foreground">{step.label}</span>
                    <Loader2 className="h-3.5 w-3.5 text-primary/40 animate-spin ml-auto flex-shrink-0" style={{ animationDelay: step.delay }} />
                  </div>
                ))}
              </div>
            </div>
          ) : trainingWisdom ? (
            <div className="space-y-6">
              {/* Pre-Training Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-orange-500">Pre-Training</h4>
                </div>
                <div className="space-y-2.5">
                  {trainingWisdom.preMeals.map((meal, i) => (
                    <div key={i} className="glass-card p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-sm font-semibold">{meal.name}</h5>
                        <span className="text-[10px] font-medium text-orange-500/70 bg-orange-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                          {meal.timing}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{meal.description}</p>
                      <p className="text-[10px] font-medium text-muted-foreground/60 tabular-nums">{meal.macros}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Post-Training Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
                    <Dumbbell className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-blue-500">Post-Training</h4>
                </div>
                <div className="space-y-2.5">
                  {trainingWisdom.postMeals.map((meal, i) => (
                    <div key={i} className="glass-card p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-sm font-semibold">{meal.name}</h5>
                        <span className="text-[10px] font-medium text-blue-500/70 bg-blue-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                          {meal.timing}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{meal.description}</p>
                      <p className="text-[10px] font-medium text-muted-foreground/60 tabular-nums">{meal.macros}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tip */}
              {trainingWisdom.tip && (
                <div className="rounded-xl bg-primary/5 border border-primary/10 p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Wizard's Tip</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{trainingWisdom.tip}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Sparkles className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No training ideas available</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Tap the card above to generate ideas</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

