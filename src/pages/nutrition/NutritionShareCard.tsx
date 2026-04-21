import { lazy, Suspense } from "react";
import { NutritionCard } from "@/components/share/cards/NutritionCard";
import type { MacroGoals } from "@/pages/nutrition/types";

const ShareCardDialog = lazy(() =>
  import("@/components/share/ShareCardDialog").then((m) => ({ default: m.ShareCardDialog }))
);

interface NutritionShareCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  dailyCalorieTarget: number;
  aiMacroGoals: MacroGoals | null;
  mealCount: number;
  nutritionStreak: number;
  totalMealsLogged: number;
}

export function NutritionShareCard({
  open,
  onOpenChange,
  selectedDate,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFats,
  dailyCalorieTarget,
  aiMacroGoals,
  mealCount,
  nutritionStreak,
  totalMealsLogged,
}: NutritionShareCardProps) {
  return (
    <Suspense fallback={null}>
      <ShareCardDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Share Nutrition"
        shareTitle="My Nutrition Stats"
        shareText="Check out my nutrition tracking on FightCamp Wizard!"
      >
        {({ cardRef, aspect }) => (
          <NutritionCard
            ref={cardRef}
            date={selectedDate}
            calories={totalCalories}
            calorieTarget={dailyCalorieTarget}
            protein={totalProtein}
            carbs={totalCarbs}
            fats={totalFats}
            proteinGoal={aiMacroGoals?.proteinGrams ?? 0}
            carbsGoal={aiMacroGoals?.carbsGrams ?? 0}
            fatsGoal={aiMacroGoals?.fatsGrams ?? 0}
            mealCount={mealCount}
            streak={nutritionStreak}
            totalMealsLogged={totalMealsLogged}
            aspect={aspect}
          />
        )}
      </ShareCardDialog>
    </Suspense>
  );
}
