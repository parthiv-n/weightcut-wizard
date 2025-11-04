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
import { Plus, Sparkles, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { MealCard } from "@/components/nutrition/MealCard";
import { CalorieBudgetIndicator } from "@/components/nutrition/CalorieBudgetIndicator";
import { VoiceInput } from "@/components/nutrition/VoiceInput";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import { format, subDays, addDays } from "date-fns";
import wizardNutrition from "@/assets/wizard-nutrition.png";
import { Badge } from "@/components/ui/badge";

interface Ingredient {
  name: string;
  grams: number;
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
  const [profile, setProfile] = useState<any>(null);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [safetyStatus, setSafetyStatus] = useState<"green" | "yellow" | "red">("green");
  const [safetyMessage, setSafetyMessage] = useState("");
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

  const [newIngredient, setNewIngredient] = useState({ name: "", grams: "" });

  useEffect(() => {
    loadProfile();
    loadMeals();
  }, [selectedDate]);

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
    if (!manualMeal.meal_name || !manualMeal.calories) {
      toast({
        title: "Missing information",
        description: "Please fill in at least meal name and calories",
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

  const handleDeleteMeal = async (mealId: string) => {
    try {
      const { error } = await supabase
        .from("nutrition_logs")
        .delete()
        .eq("id", mealId);

      if (error) throw error;

      toast({ title: "Meal deleted" });
      loadMeals();
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

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={wizardNutrition} alt="Wizard" className="w-32 h-32" />
          <div>
            <h1 className="text-3xl font-bold">Nutrition</h1>
            <p className="text-muted-foreground mt-1">AI-powered meal planning for safe weight loss</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <BarcodeScanner onFoodScanned={handleBarcodeScanned} disabled={loading} />
          <VoiceInput onTranscription={handleVoiceInput} disabled={loading || aiAnalyzing} />
          <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Sparkles className="mr-2 h-4 w-4" />
                AI Meal Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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

          <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Meal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <div className="flex gap-2">
                    <Input
                      id="ai-description"
                      placeholder="E.g., 250g grilled chicken salad with olive oil"
                      value={aiMealDescription}
                      onChange={(e) => setAiMealDescription(e.target.value)}
                      disabled={aiAnalyzing}
                    />
                    <Button
                      type="button"
                      onClick={handleAiAnalyzeMeal}
                      disabled={aiAnalyzing || !aiMealDescription.trim()}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {aiAnalyzing ? "Analyzing..." : "Analyze"}
                    </Button>
                  </div>
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
                  <div>
                    <Label htmlFor="calories">Calories *</Label>
                    <Input
                      id="calories"
                      type="number"
                      placeholder="400"
                      value={manualMeal.calories}
                      onChange={(e) => setManualMeal({ ...manualMeal, calories: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input
                      id="protein"
                      type="number"
                      placeholder="30"
                      value={manualMeal.protein_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input
                      id="carbs"
                      type="number"
                      placeholder="40"
                      value={manualMeal.carbs_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fats">Fats (g)</Label>
                    <Input
                      id="fats"
                      type="number"
                      placeholder="15"
                      value={manualMeal.fats_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Ingredients (in grams)</Label>
                    <div className="space-y-2 mt-2">
                      {manualMeal.ingredients.map((ingredient, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <span className="flex-1">{ingredient.name}</span>
                          <span className="font-medium">{ingredient.grams}g</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newIngredients = [...manualMeal.ingredients];
                              newIngredients.splice(idx, 1);
                              setManualMeal({ ...manualMeal, ingredients: newIngredients });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ingredient name"
                          value={newIngredient.name}
                          onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                        />
                        <Input
                          type="number"
                          placeholder="Grams"
                          value={newIngredient.grams}
                          onChange={(e) => setNewIngredient({ ...newIngredient, grams: e.target.value })}
                          className="w-32"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (newIngredient.name && newIngredient.grams) {
                              setManualMeal({
                                ...manualMeal,
                                ingredients: [
                                  ...manualMeal.ingredients,
                                  { name: newIngredient.name, grams: parseFloat(newIngredient.grams) }
                                ]
                              });
                              setNewIngredient({ name: "", grams: "" });
                            }
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {manualMeal.ingredients.length > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t font-semibold">
                          <span>Total weight:</span>
                          <span>
                            {manualMeal.ingredients.reduce((sum, ing) => sum + ing.grams, 0)}g
                          </span>
                        </div>
                      )}
                    </div>
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
                    <Label htmlFor="notes">Recipe/Notes</Label>
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
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
        >
          ←
        </Button>
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
        >
          →
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
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
          <CardTitle className="text-center text-lg">Daily Macronutrient Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-1">Total Calories</p>
              <p className="text-3xl font-bold text-primary">{totalCalories}</p>
              <p className="text-xs text-muted-foreground mt-1">kcal</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-1">Protein</p>
              <p className="text-3xl font-bold text-blue-600">{totalProtein.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">grams</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-1">Carbs</p>
              <p className="text-3xl font-bold text-orange-600">{totalCarbs.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">grams</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-1">Fats</p>
              <p className="text-3xl font-bold text-green-600">{totalFats.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">grams</p>
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
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => setIsAiDialogOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Meal Ideas
                  </Button>
                  <Button variant="outline" onClick={() => setIsManualDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Meal Manually
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
                  onDelete={() => handleDeleteMeal(meal.id)}
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
    </div>
  );
}
