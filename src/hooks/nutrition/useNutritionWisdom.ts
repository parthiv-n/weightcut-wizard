import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import type { TrainingFoodTip, MacroGoals } from "@/pages/nutrition/types";

interface UseNutritionWisdomParams {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  dailyCalorieTarget: number;
  aiMacroGoals: MacroGoals | null;
  mealsLength: number;
}

export function useNutritionWisdom(params: UseNutritionWisdomParams) {
  const {
    totalCalories, totalProtein, totalCarbs, totalFats,
    dailyCalorieTarget, aiMacroGoals, mealsLength,
  } = params;

  const { userId } = useUser();
  const { toast } = useToast();
  const { safeAsync, isMounted } = useSafeAsync();
  const { checkAIAccess, openPaywall, openNoGemsDialog, incrementLocalUsage, markLimitReached, handleAILimitError } = useSubscription();

  const [trainingWisdom, setTrainingWisdom] = useState<TrainingFoodTip | null>(null);
  const [trainingWisdomLoading, setTrainingWisdomLoading] = useState(false);
  const [trainingWisdomSheetOpen, setTrainingWisdomSheetOpen] = useState(false);
  const [trainingPreference, setTrainingPreference] = useState("");

  const [aiWisdomAdvice, setAiWisdomAdvice] = useState<string | null>(null);
  const [aiWisdomLoading, setAiWisdomLoading] = useState(false);
  const wisdomGenRef = useState({ lastHash: "" })[0];

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

  const generateWisdomAdvice = async (userInitiated = false) => {
    if (!userId || totalCalories === 0) {
      safeAsync(setAiWisdomAdvice)(null);
      return;
    }

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
      if (!checkAIAccess()) {
        // Only show paywall if user explicitly tapped something
        if (userInitiated) openNoGemsDialog();
        return;
      }

      const calGoal = dailyCalorieTarget;
      const pGoal = aiMacroGoals?.proteinGrams || 0;
      const cGoal = aiMacroGoals?.carbsGrams || 0;
      const fGoal = aiMacroGoals?.fatsGrams || 0;

      const { data, error } = await supabase.functions.invoke("meal-planner", {
        body: {
          prompt: `You are a combat sports nutritionist. Give ONE short sentence (max 25 words) of personalised advice for a fighter based on their intake today.\n\nCurrent intake: ${Math.round(totalCalories)} kcal (goal: ${calGoal}), ${Math.round(totalProtein)}g protein (goal: ${pGoal}g), ${Math.round(totalCarbs)}g carbs (goal: ${cGoal}g), ${Math.round(totalFats)}g fat (goal: ${fGoal}g).\n\nReturn ONLY the advice sentence, no JSON, no quotes, no explanation. Be specific (mention actual foods) and motivating. Use fight/training context.`,
          action: "generate",
          userData: { dailyCalorieTarget: calGoal },
        },
      });

      if (!isMounted()) return;
      if (error) {
        if (handleAILimitError(error)) return;
        throw new Error(await extractEdgeFunctionError(error, "Could not generate nutrition advice"));
      }
      if (data?.error) throw new Error(data.error);
      incrementLocalUsage();

      let advice: string | null = null;
      if (data?.mealPlan) {
        if (typeof data.mealPlan === 'string') {
          advice = data.mealPlan.trim();
        }
      }
      if (data?.rawResponse && typeof data.rawResponse === 'string') {
        advice = data.rawResponse.trim();
      }

      if (advice && advice.length > 10 && advice.length < 200) {
        advice = advice.replace(/^["']|["']$/g, '').trim();
        setAiWisdomAdvice(advice);
        AIPersistence.save(userId, cacheKey, advice, 6);
        wisdomGenRef.lastHash = hash;
      }
    } catch (err) {
      logger.error("Wisdom advice error", err);
    } finally {
      safeAsync(setAiWisdomLoading)(false);
    }
  };

  const generateTrainingFoodIdeas = async (forceRefresh = false) => {
    if (trainingWisdomLoading) return;

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

    if (!checkAIAccess()) {
      openNoGemsDialog();
      return;
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
          userData: { dailyCalorieTarget: calorieTarget, proteinGoal },
        },
      });

      if (!isMounted()) return;
      if (error) {
        if (handleAILimitError(error)) return;
        throw new Error(await extractEdgeFunctionError(error, "Could not generate training food ideas"));
      }
      if (data?.error) throw new Error(data.error);
      incrementLocalUsage();

      let trainingData: TrainingFoodTip | null = null;

      if (data?.mealPlan) {
        try {
          if (typeof data.mealPlan === 'string') {
            trainingData = JSON.parse(data.mealPlan);
          } else if (data.mealPlan.preMeals) {
            trainingData = data.mealPlan;
          }
        } catch {
          // Fallback
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
      logger.error("Training food ideas error", err);
      toast({ title: "Could not generate ideas", description: "Please try again later", variant: "destructive" });
    } finally {
      safeAsync(setTrainingWisdomLoading)(false);
    }
  };

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
  }, [mealsLength, totalCalories]);

  return {
    trainingWisdom,
    trainingWisdomLoading,
    trainingWisdomSheetOpen, setTrainingWisdomSheetOpen,
    trainingPreference, setTrainingPreference,
    aiWisdomAdvice,
    aiWisdomLoading,
    getNutritionWisdom,
    generateWisdomAdvice,
    generateTrainingFoodIdeas,
  };
}
