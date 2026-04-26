import { Suspense, lazy } from "react";
import { Plus, Search, RotateCcw, ScanLine, ChevronDown } from "lucide-react";
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
  groupedMeals: Record<string, Meal[]>;
  collapsedSections: Set<string>;
  setCollapsedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedMealActions: string | null;
  setExpandedMealActions: React.Dispatch<React.SetStateAction<string | null>>;
  quickActions: QuickActionsShape;
  aiMealHandlers: AiMealHandlers;
  generatingPlan: boolean;
  savingAllMeals: boolean;
  onDeleteMeal: (meal: Meal) => void;
  onOpenFoodSearch: (mealType: string) => void;
  onOpenQuickAdd: (mealType: MealType) => void;
  onOpenManualAdd: (mealType: MealType) => void;
}

/**
 * Renders the 4 meal type sections (Breakfast/Lunch/Dinner/Snack) with
 * collapsible expand + quick-add action rows. Plus the Favorites row.
 */
export function MealSections({
  mealsLoading,
  groupedMeals,
  collapsedSections,
  setCollapsedSections,
  expandedMealActions,
  setExpandedMealActions,
  quickActions,
  aiMealHandlers,
  generatingPlan,
  savingAllMeals,
  onDeleteMeal,
  onOpenFoodSearch,
  onOpenQuickAdd,
  onOpenManualAdd,
}: MealSectionsProps) {
  const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

  return (
    <div className="space-y-2">
      {mealTypes.map((mealType) => {
          const groupMeals = groupedMeals[mealType];
          const groupCalories = groupMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
          const hasMeals = groupMeals.length > 0;
          const isSectionCollapsed = !hasMeals && !mealsLoading
            ? !collapsedSections.has(`${mealType}_expanded`)
            : collapsedSections.has(mealType);
          const toggleSection = () => {
            setCollapsedSections((prev) => {
              const next = new Set(prev);
              if (!hasMeals && !mealsLoading) {
                if (next.has(`${mealType}_expanded`)) next.delete(`${mealType}_expanded`);
                else next.add(`${mealType}_expanded`);
              } else {
                if (next.has(mealType)) next.delete(mealType);
                else next.add(mealType);
              }
              return next;
            });
          };

          return (
            <div key={mealType} className="card-surface overflow-hidden">
              <button
                type="button"
                onClick={toggleSection}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 active:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-semibold capitalize">{mealType}</h3>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isSectionCollapsed ? "-rotate-90" : ""}`} />
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {groupCalories > 0 ? `${Math.round(groupCalories)} kcal` : ""}
                </span>
              </button>
              {!isSectionCollapsed && (
                <>
                  {groupMeals.length > 0 ? (
                    <div className="px-2">
                      {groupMeals
                        .filter((meal) => meal && typeof meal.id === "string" && meal.id.length > 0)
                        .map((meal, idx) => (
                          <MealCard
                            // Stable key — meal.id is guaranteed truthy by the
                            // filter above, idx makes it collision-proof even
                            // in pathological cases.
                            key={`${meal.id}:${idx}`}
                            meal={meal}
                            onDelete={() => onDeleteMeal(meal)}
                            onFavorite={() => quickActions.toggleFavorite(meal)}
                            isFavorited={quickActions.isFavorited(meal)}
                          />
                        ))}
                    </div>
                  ) : mealsLoading ? (
                    <div className="px-2 pb-1">
                      <MealCardSkeleton />
                    </div>
                  ) : null}
                  <div className="border-t border-border/10 flex items-stretch">
                    <button
                      onClick={() => onOpenQuickAdd(mealType)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.99] transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />Add Food
                    </button>
                    <div className="flex items-center gap-0.5 pr-2 border-l border-border/10">
                      <button
                        onClick={() => onOpenFoodSearch(mealType)}
                        className="p-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
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
                          className="p-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors !h-auto !border-0 !bg-transparent"
                        />
                      </Suspense>
                      {quickActions.lastMeal && (
                        <button
                          onClick={() => quickActions.repeatLastMeal(mealType)}
                          className="p-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                          aria-label="Repeat last meal"
                          title="Repeat last"
                        >
                          <RotateCcw className="h-4 w-4 text-amber-500" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
