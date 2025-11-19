import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Calendar as CalendarIcon, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { MealCard } from "@/components/nutrition/MealCard";
import { CalorieBudgetIndicator } from "@/components/nutrition/CalorieBudgetIndicator";
import { VoiceInput } from "@/components/nutrition/VoiceInput";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import { format, subDays, addDays } from "date-fns";
import wizardNutrition from "@/assets/wizard-nutrition.png";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { nutritionLogSchema } from "@/lib/validation";

interface Ingredient {
  name: string;
  grams: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fats_per_100g?: number;
  source?: string; // e.g., "USDA", "Nutrition Database", "AI Analysis"
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
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [isManualMacrosDialogOpen, setIsManualMacrosDialogOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [safetyStatus, setSafetyStatus] = useState<"green" | "yellow" | "red">("green");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);
  const [aiMacroGoals, setAiMacroGoals] = useState<{
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
    recommendedCalories: number;
  } | null>(null);
  const [fetchingMacroGoals, setFetchingMacroGoals] = useState(false);
  const { toast } = useToast();

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
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiIngredientDescription, setAiIngredientDescription] = useState("");
  const [aiAnalyzingIngredient, setAiAnalyzingIngredient] = useState(false);

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
    loadProfile();
    loadMeals();
  }, [selectedDate]);

  useEffect(() => {
    if (profile) {
      fetchMacroGoals();
    }
  }, [profile]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile(data);
      calculateCalorieTarget(data);
    }
  };

  const calculateCalorieTarget = (profileData: any) => {
    const currentWeight = profileData.current_weight_kg || 70;
    const goalWeight = profileData.goal_weight_kg || 65;
    const tdee = profileData.tdee || 2000;
    const daysToGoal = Math.ceil(
      (new Date(profileData.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
    const safeWeeklyLoss = Math.min(weeklyWeightLoss, 1);
    const dailyDeficit = (safeWeeklyLoss * 7700) / 7;
    const target = Math.max(tdee - dailyDeficit, tdee * 0.8);

    const weeklyLossPercent = (weeklyWeightLoss / currentWeight) * 100;
    
    if (weeklyLossPercent > 1.5 || weeklyWeightLoss > 1) {
      setSafetyStatus("red");
      setSafetyMessage("⚠️ WARNING: Weight loss rate exceeds safe limits! Increase calorie intake.");
    } else if (weeklyLossPercent > 1 || weeklyWeightLoss > 0.75) {
      setSafetyStatus("yellow");
      setSafetyMessage("⚠️ CAUTION: Approaching maximum safe weight loss rate");
    } else {
      setSafetyStatus("green");
      setSafetyMessage("✓ Safe and sustainable weight loss pace");
    }

    setDailyCalorieTarget(Math.round(target));
  };

  const getCurrentWeight = async (profileData: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return profileData?.current_weight_kg || 0;

    const { data: weightLogs } = await supabase
      .from("weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
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
      // No fight week target set, clear macro goals
      setAiMacroGoals(null);
      return;
    }

    setFetchingMacroGoals(true);
    try {
      const currentWeight = await getCurrentWeight(profile);

      const { data, error } = await supabase.functions.invoke("weight-tracker-analysis", {
        body: {
          currentWeight,
          goalWeight: fightWeekTarget,
          fightNightWeight: profile.goal_weight_kg,
          targetDate: profile.target_date,
          activityLevel: profile.activity_level,
          age: profile.age,
          sex: profile.sex,
          heightCm: profile.height_cm,
          tdee: profile.tdee
        }
      });

      if (error) {
        // Silently fail - don't show error toast, just don't show goals
        setAiMacroGoals(null);
      } else if (data?.analysis) {
        setAiMacroGoals({
          proteinGrams: data.analysis.proteinGrams || 0,
          carbsGrams: data.analysis.carbsGrams || 0,
          fatsGrams: data.analysis.fatsGrams || 0,
          recommendedCalories: data.analysis.recommendedCalories || 0,
        });
      }
    } catch (error) {
      // Silently fail
      setAiMacroGoals(null);
    } finally {
      setFetchingMacroGoals(false);
    }
  };

  const loadMeals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", selectedDate)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading meals:", error);
      return;
    }

    // Cast ingredients from Json to Ingredient[]
    const typedMeals = (data || []).map(meal => ({
      ...meal,
      ingredients: (meal.ingredients as unknown) as Ingredient[] | undefined,
    }));

    setMeals(typedMeals as Meal[]);
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

    setLoading(true);
    try {
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

      if (response.error) throw response.error;

      const { mealPlan, dailyCalorieTarget: target, safetyStatus: status, safetyMessage: message } = response.data;

      // Store as meal plan ideas instead of logging them
      const ideasToStore: Meal[] = [];
      
      if (mealPlan.mealPlan) {
        const plan = mealPlan.mealPlan;
        
        if (plan.breakfast) {
          ideasToStore.push({
            id: `idea-breakfast-${Date.now()}`,
            meal_name: plan.breakfast.name,
            calories: plan.breakfast.calories,
            protein_g: plan.breakfast.protein,
            carbs_g: plan.breakfast.carbs,
            fats_g: plan.breakfast.fats,
            meal_type: "breakfast",
            portion_size: plan.breakfast.portion,
            recipe_notes: plan.breakfast.recipe,
            ingredients: plan.breakfast.ingredients || undefined,
            is_ai_generated: true,
            date: selectedDate,
          });
        }

        if (plan.lunch) {
          ideasToStore.push({
            id: `idea-lunch-${Date.now()}`,
            meal_name: plan.lunch.name,
            calories: plan.lunch.calories,
            protein_g: plan.lunch.protein,
            carbs_g: plan.lunch.carbs,
            fats_g: plan.lunch.fats,
            meal_type: "lunch",
            portion_size: plan.lunch.portion,
            recipe_notes: plan.lunch.recipe,
            ingredients: plan.lunch.ingredients || undefined,
            is_ai_generated: true,
            date: selectedDate,
          });
        }

        if (plan.dinner) {
          ideasToStore.push({
            id: `idea-dinner-${Date.now()}`,
            meal_name: plan.dinner.name,
            calories: plan.dinner.calories,
            protein_g: plan.dinner.protein,
            carbs_g: plan.dinner.carbs,
            fats_g: plan.dinner.fats,
            meal_type: "dinner",
            portion_size: plan.dinner.portion,
            recipe_notes: plan.dinner.recipe,
            ingredients: plan.dinner.ingredients || undefined,
            is_ai_generated: true,
            date: selectedDate,
          });
        }

        if (plan.snacks && Array.isArray(plan.snacks)) {
          plan.snacks.forEach((snack: any, idx: number) => {
            ideasToStore.push({
              id: `idea-snack-${idx}-${Date.now()}`,
              meal_name: snack.name,
              calories: snack.calories,
              protein_g: snack.protein,
              carbs_g: snack.carbs,
              fats_g: snack.fats,
              meal_type: "snack",
              portion_size: snack.portion,
              recipe_notes: snack.recipe,
              ingredients: snack.ingredients || undefined,
              is_ai_generated: true,
              date: selectedDate,
            });
          });
        }
      }

      setMealPlanIdeas(ideasToStore);
      setDailyCalorieTarget(target || dailyCalorieTarget);
      setSafetyStatus(status || safetyStatus);
      setSafetyMessage(message || safetyMessage);

      toast({
        title: "Meal plan generated!",
        description: `${ideasToStore.length} meal ideas created. Click "Log This Meal" to add them to your day.`,
      });

      setIsAiDialogOpen(false);
      setAiPrompt("");
    } catch (error: any) {
      console.error("Error generating meal plan:", error);
      const errorMsg = error?.message || error?.error || "Failed to generate meal plan";
      toast({
        title: "❌ Error generating meal plan",
        description: typeof errorMsg === 'string' ? errorMsg : "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogMealIdea = async (mealIdea: Meal) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        date: selectedDate,
        meal_name: mealIdea.meal_name,
        calories: mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
      } as any);

      if (error) throw error;

      toast({
        title: "Meal logged!",
        description: `${mealIdea.meal_name} added to your day`,
      });

      await loadMeals();
    } catch (error) {
      console.error("Error logging meal:", error);
      toast({
        title: "Error",
        description: "Failed to log meal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualMeal = async () => {
    // Validate input
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

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        date: selectedDate,
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
      } as any);

      if (error) throw error;

      toast({ title: "Meal added successfully" });
      setIsManualDialogOpen(false);
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
      loadMeals();
    } catch (error) {
      console.error("Error adding meal:", error);
      toast({
        title: "Error",
        description: "Failed to add meal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: aiMealDescription },
      });

      if (error) throw error;

      const { nutritionData } = data;
      
      setManualMeal({
        meal_name: nutritionData.meal_name,
        calories: nutritionData.calories.toString(),
        protein_g: nutritionData.protein_g.toString(),
        carbs_g: nutritionData.carbs_g.toString(),
        fats_g: nutritionData.fats_g.toString(),
        meal_type: manualMeal.meal_type,
        portion_size: nutritionData.portion_size,
        recipe_notes: manualMeal.recipe_notes,
        ingredients: nutritionData.ingredients || [],
      });

      toast({
        title: "Analysis complete!",
        description: "Nutritional information has been filled in",
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
    setAiMealDescription(transcribedText);
    
    // Automatically analyze the meal
    setAiAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: transcribedText },
      });

      if (error) throw error;

      const { nutritionData } = data;
      
      // Auto-add the meal directly
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: insertError } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        date: selectedDate,
        meal_name: nutritionData.meal_name,
        calories: nutritionData.calories,
        protein_g: nutritionData.protein_g,
        carbs_g: nutritionData.carbs_g,
        fats_g: nutritionData.fats_g,
        meal_type: "snack", // Default to snack for voice inputs
        portion_size: nutritionData.portion_size,
        recipe_notes: null,
        ingredients: nutritionData.ingredients || null,
        is_ai_generated: true,
      } as any);

      if (insertError) throw insertError;

      toast({
        title: "Meal added!",
        description: `${nutritionData.meal_name} (${nutritionData.calories} cal) logged successfully`,
      });

      await loadMeals();
    } catch (error: any) {
      console.error("Error processing voice input:", error);
      toast({
        title: "Failed to add meal",
        description: error.message || "Failed to process voice input",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleBarcodeScanned = async (foodData: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  }) => {
    setManualMeal({
      meal_name: foodData.meal_name,
      calories: foodData.calories.toString(),
      protein_g: foodData.protein_g.toString(),
      carbs_g: foodData.carbs_g.toString(),
      fats_g: foodData.fats_g.toString(),
      meal_type: "snack",
      portion_size: "100g",
      recipe_notes: "",
      ingredients: [],
    });
    setIsManualDialogOpen(true);
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
    if (!mealToDelete) return;

    try {
      const { error } = await supabase
        .from("nutrition_logs")
        .delete()
        .eq("id", mealToDelete.id);

      if (error) throw error;

      toast({ title: "Meal deleted" });
      loadMeals();
      setDeleteDialogOpen(false);
      setMealToDelete(null);
    } catch (error) {
      console.error("Error deleting meal:", error);
      toast({
        title: "Error",
        description: "Failed to delete meal",
        variant: "destructive",
      });
    }
  };

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0);
  const totalFats = meals.reduce((sum, meal) => sum + (meal.fats_g || 0), 0);

  // Helper function to calculate difference and color coding
  const getMacroDifference = (current: number, goal: number) => {
    const difference = goal - current;
    const percentDiff = goal > 0 ? Math.abs(difference / goal) * 100 : 0;
    
    let colorClass = "text-green-600 dark:text-green-400";
    if (percentDiff > 20) {
      colorClass = "text-red-600 dark:text-red-400";
    } else if (percentDiff > 10) {
      colorClass = "text-yellow-600 dark:text-yellow-400";
    }

    return {
      difference,
      percentDiff,
      colorClass,
      displayText: difference >= 0 
        ? `${Math.round(difference)} remaining`
        : `${Math.round(Math.abs(difference))} over`
    };
  };

  return (
    <div className="space-y-6 p-3 sm:p-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <img src={wizardNutrition} alt="Wizard" className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 flex-shrink-0" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Nutrition</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">AI-powered meal planning</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          <BarcodeScanner onFoodScanned={handleBarcodeScanned} disabled={loading} />
          <VoiceInput onTranscription={handleVoiceInput} disabled={loading || aiAnalyzing} />
          <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
            <DialogTrigger asChild>
              <Button className="whitespace-nowrap">
                <Sparkles className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">AI Meal Plan</span>
                <span className="sm:hidden">AI Plan</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] sm:w-full">
              <DialogHeader>
                <DialogTitle>Generate Meal Plan Ideas for {format(new Date(selectedDate), "MMM d, yyyy")}</DialogTitle>
                <DialogDescription>
                  Describe what kind of meals you'd like. These will be created as suggestions that you can log to your day.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aiPrompt">What would you like to eat?</Label>
                  <Textarea
                    id="aiPrompt"
                    placeholder="E.g., 'I want high-protein meals with chicken and vegetables, no dairy' or 'Mediterranean diet with fish'"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button onClick={handleGenerateMealPlan} disabled={loading} className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {loading ? "Generating ideas..." : "Generate Meal Ideas"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isManualDialogOpen} onOpenChange={(open) => {
            setIsManualDialogOpen(open);
            if (!open) {
              // Reset ingredient lookup error when dialog closes
              setIngredientLookupError(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="whitespace-nowrap">
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Add Meal</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
              <DialogHeader>
                <DialogTitle>Add Manual Meal</DialogTitle>
                <DialogDescription>
                  Log a meal manually with nutritional information or let AI analyze it
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* AI Quick Fill Section */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                  <Label htmlFor="ai-description" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Quick Fill (Optional)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Describe your meal and AI will estimate nutritional values
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="ai-description"
                      placeholder="E.g., 250g grilled chicken salad with olive oil"
                      value={aiMealDescription}
                      onChange={(e) => setAiMealDescription(e.target.value)}
                      disabled={aiAnalyzing}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleAiAnalyzeMeal}
                      disabled={aiAnalyzing || !aiMealDescription.trim()}
                      className="whitespace-nowrap flex-shrink-0"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {aiAnalyzing ? "Analyzing..." : "Analyze"}
                    </Button>
                  </div>
                </div>

                {/* AI Quick Fill Ingredients Section */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                  <Label htmlFor="ai-ingredient-description" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Quick Fill Ingredients
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Describe a single ingredient with weight and AI will add it to your ingredients list
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="ai-ingredient-description"
                      placeholder="E.g., 250g chicken breast, 1 cup rice, 100g salmon"
                      value={aiIngredientDescription}
                      onChange={(e) => setAiIngredientDescription(e.target.value)}
                      disabled={aiAnalyzingIngredient}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleAiAnalyzeIngredient}
                      disabled={aiAnalyzingIngredient || !aiIngredientDescription.trim()}
                      className="whitespace-nowrap flex-shrink-0"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {aiAnalyzingIngredient ? "Analyzing..." : "Add Ingredient"}
                    </Button>
                  </div>
                </div>

                {/* Manually input macros button */}
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsManualMacrosDialogOpen(true)}
                    className="w-full sm:w-auto"
                  >
                    Manually input macros
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="meal_name">Meal Name *</Label>
                    <Input
                      id="meal_name"
                      placeholder="E.g., Grilled Chicken Salad"
                      value={manualMeal.meal_name}
                      onChange={(e) => setManualMeal({ ...manualMeal, meal_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="meal_type">Meal Type</Label>
                    <Select
                      value={manualMeal.meal_type}
                      onValueChange={(value) => setManualMeal({ ...manualMeal, meal_type: value })}
                    >
                      <SelectTrigger>
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
                  <div className="col-span-2">
                    <Label htmlFor="portion">Portion Description (optional)</Label>
                    <Input
                      id="portion"
                      placeholder="E.g., 1 plate, 2 servings"
                      value={manualMeal.portion_size}
                      onChange={(e) => setManualMeal({ ...manualMeal, portion_size: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="notes">Recipe/Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Preparation notes or recipe details"
                      value={manualMeal.recipe_notes}
                      onChange={(e) => setManualMeal({ ...manualMeal, recipe_notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <Button onClick={handleAddManualMeal} disabled={loading} className="w-full">
                  {loading ? "Adding..." : "Add Meal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Manual Macros Dialog */}
          <Dialog open={isManualMacrosDialogOpen} onOpenChange={setIsManualMacrosDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
              <DialogHeader>
                <DialogTitle>Manually Input Macros</DialogTitle>
                <DialogDescription>
                  Enter calories, macros, and ingredients for your meal
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="manual-calories" className="flex items-center gap-2">
                      Calories *
                      {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                        <Badge variant="outline" className="text-xs">
                          Auto-calculated
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="manual-calories"
                      type="number"
                      placeholder="400"
                      value={manualMeal.calories}
                      onChange={(e) => setManualMeal({ ...manualMeal, calories: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="manual-protein" className="flex items-center gap-2">
                      Protein (g)
                      {manualMeal.ingredients.some(ing => ing.protein_per_100g !== undefined) && (
                        <Badge variant="outline" className="text-xs">
                          Auto-calculated
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="manual-protein"
                      type="number"
                      step="0.1"
                      placeholder="30"
                      value={manualMeal.protein_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="manual-carbs" className="flex items-center gap-2">
                      Carbs (g)
                      {manualMeal.ingredients.some(ing => ing.carbs_per_100g !== undefined) && (
                        <Badge variant="outline" className="text-xs">
                          Auto-calculated
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="manual-carbs"
                      type="number"
                      step="0.1"
                      placeholder="40"
                      value={manualMeal.carbs_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="manual-fats" className="flex items-center gap-2">
                      Fats (g)
                      {manualMeal.ingredients.some(ing => ing.fats_per_100g !== undefined) && (
                        <Badge variant="outline" className="text-xs">
                          Auto-calculated
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="manual-fats"
                      type="number"
                      step="0.1"
                      placeholder="15"
                      value={manualMeal.fats_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Ingredients (in grams)</Label>
                    <div className="space-y-2 mt-2">
                      {manualMeal.ingredients.map((ingredient, idx) => {
                        const hasNutritionData = ingredient.calories_per_100g !== undefined;
                        const ingredientCalories = hasNutritionData ? Math.round((ingredient.calories_per_100g * ingredient.grams) / 100) : null;
                        const ingredientProtein = hasNutritionData ? Math.round(((ingredient.protein_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;
                        const ingredientCarbs = hasNutritionData ? Math.round(((ingredient.carbs_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;
                        const ingredientFats = hasNutritionData ? Math.round(((ingredient.fats_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;

                        return (
                          <div key={idx} className="p-3 bg-muted rounded-md space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{ingredient.name}</span>
                                  <span className="text-sm text-muted-foreground">{ingredient.grams}g</span>
                                  {!hasNutritionData && (
                                    <Badge variant="outline" className="text-xs">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      No nutrition data
                                    </Badge>
                                  )}
                                  {hasNutritionData && ingredient.source && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      <span className="text-[10px]">Source: {ingredient.source}</span>
                                    </Badge>
                                  )}
                                </div>
                                {hasNutritionData && (
                                  <div className="text-xs text-muted-foreground mt-1 space-x-3">
                                    <span>Cal: {ingredientCalories}kcal</span>
                                    <span>P: {ingredientProtein?.toFixed(1)}g</span>
                                    <span>C: {ingredientCarbs?.toFixed(1)}g</span>
                                    <span>F: {ingredientFats?.toFixed(1)}g</span>
                                  </div>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newIngredients = [...manualMeal.ingredients];
                                  newIngredients.splice(idx, 1);
                                  setManualMeal({ ...manualMeal, ingredients: newIngredients });
                                }}
                                className="flex-shrink-0"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="Ingredient name"
                          value={newIngredient.name}
                          onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Grams"
                          value={newIngredient.grams}
                          onChange={(e) => setNewIngredient({ ...newIngredient, grams: e.target.value })}
                          className="w-full sm:w-32"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            if (!newIngredient.name.trim() || !newIngredient.grams) {
                              toast({
                                title: "Missing Information",
                                description: "Please enter ingredient name and grams",
                                variant: "destructive",
                              });
                              return;
                            }

                            const ingredientName = newIngredient.name.trim();
                            const grams = parseFloat(newIngredient.grams);

                            if (isNaN(grams) || grams <= 0) {
                              toast({
                                title: "Invalid Amount",
                                description: "Please enter a valid number of grams",
                                variant: "destructive",
                              });
                              return;
                            }

                            setLookingUpIngredient(true);
                            setIngredientLookupError(null);

                            try {
                              // Lookup nutrition data for the ingredient
                              const nutritionData = await lookupIngredientNutrition(ingredientName);

                              if (nutritionData) {
                                // Add ingredient with nutrition data
                                const newIngredients = [
                                  ...manualMeal.ingredients,
                                  {
                                    name: ingredientName,
                                    grams: grams,
                                    calories_per_100g: nutritionData.calories_per_100g,
                                    protein_per_100g: nutritionData.protein_per_100g,
                                    carbs_per_100g: nutritionData.carbs_per_100g,
                                    fats_per_100g: nutritionData.fats_per_100g,
                                    source: nutritionData.source,
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
                                
                                // Update meal with ingredients and calculated totals in one call
                                setManualMeal({
                                  ...manualMeal,
                                  ingredients: newIngredients,
                                  calories: Math.round(totalCalories).toString(),
                                  protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
                                  carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
                                  fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
                                });
                                
                                setNewIngredient({ name: "", grams: "" });
                                toast({
                                  title: "Ingredient Added",
                                  description: `Found nutrition data for ${ingredientName}. Meal totals updated.`,
                                });
                              } else {
                                // Not found - open manual nutrition dialog
                                setManualNutritionDialog({
                                  open: true,
                                  ingredientName: ingredientName,
                                  grams: grams,
                                  calories_per_100g: "",
                                  protein_per_100g: "",
                                  carbs_per_100g: "",
                                  fats_per_100g: "",
                                });
                              }
                            } catch (error) {
                              console.error("Error looking up ingredient:", error);
                              setIngredientLookupError("Failed to lookup ingredient. Please enter nutrition data manually.");
                              setManualNutritionDialog({
                                open: true,
                                ingredientName: ingredientName,
                                grams: grams,
                                calories_per_100g: "",
                                protein_per_100g: "",
                                carbs_per_100g: "",
                                fats_per_100g: "",
                              });
                            } finally {
                              setLookingUpIngredient(false);
                            }
                          }}
                          disabled={lookingUpIngredient || !newIngredient.name.trim() || !newIngredient.grams}
                          className="flex-shrink-0"
                        >
                          {lookingUpIngredient ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Looking up...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                      {ingredientLookupError && (
                        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                          {ingredientLookupError}
                        </div>
                      )}
                      {manualMeal.ingredients.length > 0 && (
                        <div className="space-y-1 pt-2 border-t">
                          <div className="flex justify-between items-center font-semibold">
                            <span>Total weight:</span>
                            <span>
                              {manualMeal.ingredients.reduce((sum, ing) => sum + ing.grams, 0)}g
                            </span>
                          </div>
                          {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                            <div className="text-xs text-muted-foreground">
                              Nutrition totals are calculated automatically above
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsManualMacrosDialogOpen(false)}
                  >
                    Done
                  </Button>
                </div>
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
                  <Label htmlFor="manual-calories">Calories per 100g *</Label>
                  <Input
                    id="manual-calories"
                    type="number"
                    placeholder="165"
                    value={manualNutritionDialog.calories_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      calories_per_100g: e.target.value
                    })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="manual-protein">Protein (g)</Label>
                    <Input
                      id="manual-protein"
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
                    <Label htmlFor="manual-carbs">Carbs (g)</Label>
                    <Input
                      id="manual-carbs"
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
                    <Label htmlFor="manual-fats">Fats (g)</Label>
                    <Input
                      id="manual-fats"
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          ←
        </Button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CalendarIcon className="h-4 w-4" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto min-w-[140px]"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          →
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          Today
        </Button>
      </div>

      <CalorieBudgetIndicator
        dailyTarget={dailyCalorieTarget}
        consumed={totalCalories}
        safetyStatus={safetyStatus}
        safetyMessage={safetyMessage}
      />

      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5 border-2">
        <CardHeader>
          <CardTitle className="text-center text-base sm:text-lg">Daily Macronutrient Totals</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {/* Horizontal layout on all screen sizes, with responsive sizing for mobile */}
          <div className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {/* Calories */}
            <div className="text-center">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">Total Calories</p>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">{totalCalories}</p>
              {aiMacroGoals && (
                <>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Goal: {Math.round(aiMacroGoals.recommendedCalories)}</p>
                  {(() => {
                    const diff = getMacroDifference(totalCalories, aiMacroGoals.recommendedCalories);
                    return (
                      <p className={`text-[10px] sm:text-xs font-medium mt-0.5 ${diff.colorClass}`}>
                        {diff.displayText}
                      </p>
                    );
                  })()}
                </>
              )}
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">kcal</p>
            </div>
            {/* Protein */}
            <div className="text-center">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">Protein</p>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">{totalProtein.toFixed(1)}</p>
              {aiMacroGoals && (
                <>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Goal: {Math.round(aiMacroGoals.proteinGrams)}g</p>
                  {(() => {
                    const diff = getMacroDifference(totalProtein, aiMacroGoals.proteinGrams);
                    return (
                      <p className={`text-[10px] sm:text-xs font-medium mt-0.5 ${diff.colorClass}`}>
                        {diff.displayText}
                      </p>
                    );
                  })()}
                </>
              )}
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">grams</p>
            </div>
            {/* Carbs */}
            <div className="text-center">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">Carbs</p>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600">{totalCarbs.toFixed(1)}</p>
              {aiMacroGoals && (
                <>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Goal: {Math.round(aiMacroGoals.carbsGrams)}g</p>
                  {(() => {
                    const diff = getMacroDifference(totalCarbs, aiMacroGoals.carbsGrams);
                    return (
                      <p className={`text-[10px] sm:text-xs font-medium mt-0.5 ${diff.colorClass}`}>
                        {diff.displayText}
                      </p>
                    );
                  })()}
                </>
              )}
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">grams</p>
            </div>
            {/* Fats */}
            <div className="text-center">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">Fats</p>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600">{totalFats.toFixed(1)}</p>
              {aiMacroGoals && (
                <>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Goal: {Math.round(aiMacroGoals.fatsGrams)}g</p>
                  {(() => {
                    const diff = getMacroDifference(totalFats, aiMacroGoals.fatsGrams);
                    return (
                      <p className={`text-[10px] sm:text-xs font-medium mt-0.5 ${diff.colorClass}`}>
                        {diff.displayText}
                      </p>
                    );
                  })()}
                </>
              )}
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">grams</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="logged" className="w-full">
        <TabsList>
          <TabsTrigger value="logged">Today's Logged Meals</TabsTrigger>
          <TabsTrigger value="ideas">Meal Plan Ideas</TabsTrigger>
        </TabsList>

        <TabsContent value="logged" className="space-y-4 mt-6">
          {meals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No meals logged for this day</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Add a meal manually, scan a barcode, or generate meal ideas
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button onClick={() => setIsAiDialogOpen(true)} className="whitespace-nowrap">
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Generate Meal Ideas</span>
                    <span className="sm:hidden">Generate Ideas</span>
                  </Button>
                  <Button variant="outline" onClick={() => setIsManualDialogOpen(true)} className="whitespace-nowrap">
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Add Meal Manually</span>
                    <span className="sm:hidden">Add Meal</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  onDelete={() => initiateDeleteMeal(meal)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ideas" className="space-y-4 mt-6">
          {mealPlanIdeas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No meal plan ideas generated yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Click "AI Meal Plan" to generate personalized meal suggestions
                </p>
                <Button onClick={() => setIsAiDialogOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Meal Ideas
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mealPlanIdeas.map((meal) => (
                <Card key={meal.id}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold">{meal.meal_name}</h3>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant="outline">{meal.calories} cal</Badge>
                          <Badge variant="outline">{meal.protein_g}g protein</Badge>
                          <Badge variant="outline">{meal.carbs_g}g carbs</Badge>
                          <Badge variant="outline">{meal.fats_g}g fats</Badge>
                          <Badge>{meal.meal_type}</Badge>
                        </div>
                      </div>
                    </div>
                    {meal.portion_size && (
                      <p className="text-sm text-muted-foreground mb-2">
                        <strong>Portion:</strong> {meal.portion_size}
                      </p>
                    )}
                    {meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium mb-1">Ingredients:</p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside">
                          {meal.ingredients.map((ing: Ingredient, idx: number) => (
                            <li key={idx}>{ing.name} - {ing.grams}g</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {meal.recipe_notes && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-1">Recipe:</p>
                        <p className="text-sm text-muted-foreground">{meal.recipe_notes}</p>
                      </div>
                    )}
                    <Button onClick={() => handleLogMealIdea(meal)} disabled={loading} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Log This Meal
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteMeal}
        title="Delete Meal Entry"
        itemName={mealToDelete ? `${mealToDelete.meal_name} (${mealToDelete.calories} cal)` : undefined}
      />
    </div>
  );
}
