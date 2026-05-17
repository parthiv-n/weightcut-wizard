import { format, subDays, addDays } from "date-fns";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.webp";
import { MacroPieChart } from "@/components/nutrition/MacroPieChart";
import { SyncingIndicator } from "@/components/SyncingIndicator";
import { triggerHapticSelection } from "@/lib/haptics";
import type { MacroGoals } from "@/pages/nutrition/types";

interface WisdomState {
  aiWisdomAdvice: string | null;
  aiWisdomLoading: boolean;
  trainingWisdomLoading: boolean;
  getNutritionWisdom: () => string;
  generateTrainingFoodIdeas: (force?: boolean) => void;
}

interface NutritionHeroProps {
  wisdom: WisdomState;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  dailyCalorieTarget: number;
  effectiveMacroGoals: MacroGoals;
  onEditTargets: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  mealsLoading: boolean;
  mealsVisibleCount: number;
}

/**
 * Wisdom card + MacroPieChart + date navigator + pending sync pill.
 * Route component owns all state; this file is a pure presentational block.
 */
export function NutritionHero({
  wisdom,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFats,
  dailyCalorieTarget,
  effectiveMacroGoals,
  onEditTargets,
  selectedDate,
  setSelectedDate,
  mealsLoading,
  mealsVisibleCount,
}: NutritionHeroProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <>
      {/* Wizard's Nutrition Wisdom */}
      <button
        className="w-full text-left rounded-2xl card-surface p-3 border border-border hover:border-primary/30 active:scale-[0.99] transition-all group"
        onClick={() => wisdom.generateTrainingFoodIdeas()}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-1.5 flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <img src={wizardLogo} alt="Wizard" className="w-8 h-8 rounded-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm">Wizard's Daily Wisdom</h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {wisdom.trainingWisdomLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {wisdom.aiWisdomLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
                  <span className="text-muted-foreground/50">Updating advice…</span>
                </span>
              ) : wisdom.aiWisdomAdvice ? (
                <span>{wisdom.aiWisdomAdvice}</span>
              ) : (
                wisdom.getNutritionWisdom()
              )}
            </p>
            <p className="text-[13px] text-primary/50 mt-1 font-medium">Tap for pre & post training food ideas →</p>
          </div>
        </div>
      </button>

      {/* MFP Dashboard: Calories + Macros */}
      <MacroPieChart
        calories={totalCalories}
        calorieTarget={dailyCalorieTarget}
        protein={totalProtein}
        carbs={totalCarbs}
        fats={totalFats}
        proteinGoal={effectiveMacroGoals.proteinGrams}
        carbsGoal={effectiveMacroGoals.carbsGrams}
        fatsGoal={effectiveMacroGoals.fatsGrams}
        onEditTargets={onEditTargets}
      />

      {/* Date Navigator — Cal AI / MyFitnessPal pattern. Bare chevron
          glyphs (no chip bg, no outline) flank a single subtle date pill.
          Two-line date stack when off-today gives a "Today" jump cue below
          the weekday without a separate reset button. */}
      <div className="relative flex items-center justify-center gap-1">
        <button
          onClick={() => { setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd")); triggerHapticSelection(); }}
          aria-label="Previous day"
          className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground/70 active:text-foreground active:bg-foreground/5 transition-colors touch-manipulation"
        >
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </button>
        <button
          onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); triggerHapticSelection(); }}
          className="min-w-[160px] h-11 px-5 rounded-full bg-foreground/[0.04] dark:bg-white/[0.05] active:bg-foreground/[0.08] dark:active:bg-white/[0.09] active:scale-[0.98] transition-all touch-manipulation flex flex-col items-center justify-center leading-none"
        >
          {selectedDate === todayStr ? (
            <span className="text-[15px] font-semibold tracking-tight">Today</span>
          ) : (
            <>
              <span className="text-[15px] font-semibold tracking-tight">
                {format(new Date(selectedDate), "EEE, MMM d")}
              </span>
              <span className="text-[10px] text-muted-foreground/70 mt-0.5 uppercase tracking-wider">
                Tap for today
              </span>
            </>
          )}
        </button>
        <button
          onClick={() => { setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd")); triggerHapticSelection(); }}
          aria-label="Next day"
          className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground/70 active:text-foreground active:bg-foreground/5 transition-colors touch-manipulation"
        >
          <ChevronRight className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </button>
        <SyncingIndicator active={mealsLoading && mealsVisibleCount > 0} />
      </div>

    </>
  );
}
