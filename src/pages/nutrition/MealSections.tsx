import { Suspense, lazy } from "react";
import { Plus, Search, RotateCcw, ScanLine } from "lucide-react";
import { MealCard } from "@/components/nutrition/MealCard";
import { MealCardSkeleton } from "@/components/ui/skeleton-loader";
import type { Meal } from "@/pages/nutrition/types";

const BarcodeScanner = lazy(() =>
  import("@/components/nutrition/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner }))
);

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

interface QuickActionsShape {
  lastMeal: Meal | null;
  repeatLastMeal: (mealType?: string) => void;
  toggleFavorite: (meal: Meal) => void;
  isFavorited: (meal: Meal) => boolean;
}

interface AiMealHandlers {
  handleBarcodeScanned: (data: any) => void;
}

interface MealSectionsProps {
  mealsLoading: boolean;
  meals: Meal[];
  quickActions: QuickActionsShape;
  aiMealHandlers: AiMealHandlers;
  generatingPlan: boolean;
  savingAllMeals: boolean;
  onDeleteMeal: (meal: Meal) => void;
  onOpenFoodSearch: () => void;
  onOpenQuickAdd: () => void;
  onOpenManualAdd: () => void;
}

/**
 * Renders meals as a stack of standalone cards (no parent container). Each
 * `MealCard` floats on its own. The logging action bar is rendered as a
 * separate card so the meal list reads as pure content (Cal-AI style).
 */
export function MealSections({
  mealsLoading,
  meals,
  quickActions,
  aiMealHandlers,
  generatingPlan,
  savingAllMeals,
  onDeleteMeal,
  onOpenFoodSearch,
  onOpenQuickAdd,
}: MealSectionsProps) {
  const visibleMeals = meals.filter((meal) => meal && typeof meal.id === "string" && meal.id.length > 0);
  const totalKcal = visibleMeals.reduce((sum, m) => sum + (m.calories || 0), 0);

  return (
    <div className="space-y-3">
      {/* Plain section heading — no card */}
      <div className="flex items-end justify-between px-1">
        <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
          Meals
        </h3>
        {visibleMeals.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground/60 pb-0.5">
            {visibleMeals.length} logged · {Math.round(totalKcal)} kcal
          </span>
        )}
      </div>

      {/* Meal cards — each one is its own standalone element */}
      {visibleMeals.length > 0 ? (
        <div className="space-y-2.5">
          {visibleMeals.map((meal, idx) => (
            <MealCard
              key={`${meal.id}:${idx}`}
              meal={meal}
              onDelete={() => onDeleteMeal(meal)}
              onFavorite={() => quickActions.toggleFavorite(meal)}
              isFavorited={quickActions.isFavorited(meal)}
            />
          ))}
        </div>
      ) : mealsLoading ? (
        <MealCardSkeleton />
      ) : (
        <div className="card-surface rounded-3xl px-4 py-6 text-center">
          <p className="text-[13px] text-muted-foreground/60">No meals yet — tap below to log one.</p>
        </div>
      )}

      {/* Logging actions — a separate card, distinct from the meal list */}
      <div className="card-surface rounded-3xl flex items-stretch overflow-hidden">
        <button
          onClick={() => onOpenQuickAdd()}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13.5px] font-semibold text-primary/90 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.99] transition-all"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
          Add Food
        </button>
        <div className="flex items-center gap-1 px-2 border-l border-border/15">
          <button
            onClick={() => onOpenFoodSearch()}
            className="p-2 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Search foods"
            title="Search"
          >
            <Search className="h-4 w-4 text-blue-500" />
          </button>
          <Suspense
            fallback={<div className="p-2"><ScanLine className="h-4 w-4 text-muted-foreground" /></div>}
          >
            <BarcodeScanner
              onFoodScanned={aiMealHandlers.handleBarcodeScanned}
              disabled={generatingPlan || savingAllMeals}
              className="p-2 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors !h-auto !border-0 !bg-transparent"
            />
          </Suspense>
          {quickActions.lastMeal && (
            <button
              onClick={() => quickActions.repeatLastMeal()}
              className="p-2 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Repeat last meal"
              title="Repeat last"
            >
              <RotateCcw className="h-4 w-4 text-amber-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
