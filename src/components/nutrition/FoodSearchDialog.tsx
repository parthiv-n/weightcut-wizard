import { useState, useEffect, useCallback, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight, Minus, Plus, X, Clock, PlusCircle, Trash2 } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { logger } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

interface FoodSearchResult {
    id: string;
    name: string;
    brand: string;
    calories_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fats_per_100g: number;
    serving_size?: string;
    /** Typical serving in grams, when USDA declares one. Drives the
     *  "1 serving" quick-preset chip below the gram input. */
    serving_grams?: number | null;
}

interface FoodSearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFoodSelected: (food: {
        meal_name: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fats_g: number;
        serving_size: string;
        portion_size: string;
        meal_type?: string;
    }) => void;
    mealType?: string;
}

const SERVING_PRESETS = [50, 100, 150, 200, 250];
const SWIPE_THRESHOLD = 70;
const HIDDEN_RECENTS_KEY = "wcw_hidden_recent_meals";

const MEAL_TYPE_OPTIONS = [
    { value: "breakfast", label: "Breakfast" },
    { value: "lunch", label: "Lunch" },
    { value: "dinner", label: "Dinner" },
    { value: "snack", label: "Snack" },
] as const;

type MealTypeValue = (typeof MEAL_TYPE_OPTIONS)[number]["value"];

function normalizeMealType(v: string | undefined): MealTypeValue {
    const lower = (v || "").toLowerCase();
    return MEAL_TYPE_OPTIONS.some((o) => o.value === lower) ? (lower as MealTypeValue) : "snack";
}

/**
 * Compact stat panel for a food row. Calories sit prominently on the left;
 * macros are color-coded chips on the right. Wrapped in a subtle bordered
 * box so the numbers are visibly grouped and scannable at list density.
 */
function FoodStatPanel({
  calories,
  protein,
  carbs,
  fats,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}) {
  // Fixed column widths so calories and the three macro chips line up
  // vertically across every row in the list. The calories column is
  // right-aligned inside its own width so a 3-digit and 4-digit value
  // both anchor against the same gutter, and each macro chip is given a
  // fixed width so chip starts/ends never drift between rows.
  return (
    <div className="mt-1 rounded-lg bg-muted/30 border border-border/40 px-2 py-1.5 flex items-center gap-2">
      <div className="flex items-baseline gap-1 flex-shrink-0 w-[64px] justify-end">
        <span className="display-number text-[14px] text-primary leading-none tabular-nums">{calories}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">kcal</span>
      </div>
      <div className="flex items-center gap-2.5 text-[11px] font-semibold flex-shrink-0 ml-auto">
        {/* Display rounds to whole grams so the number column never exceeds
            3 chars — guarantees the digits can't bleed left into the
            previous macro chip's letter. */}
        <span className="text-blue-400 inline-flex items-baseline">
          <span className="tabular-nums min-w-[24px] text-right">{Math.round(protein)}</span>
          <span className="opacity-60 ml-0.5">P</span>
        </span>
        <span className="text-orange-400 inline-flex items-baseline">
          <span className="tabular-nums min-w-[24px] text-right">{Math.round(carbs)}</span>
          <span className="opacity-60 ml-0.5">C</span>
        </span>
        <span className="text-purple-400 inline-flex items-baseline">
          <span className="tabular-nums min-w-[24px] text-right">{Math.round(fats)}</span>
          <span className="opacity-60 ml-0.5">F</span>
        </span>
      </div>
    </div>
  );
}

function getHiddenRecents(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDDEN_RECENTS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function setHiddenRecents(names: Set<string>) {
    localStorage.setItem(HIDDEN_RECENTS_KEY, JSON.stringify([...names]));
}

/** Swipeable row — swipe left to reveal delete action */
function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
    const [offsetX, setOffsetX] = useState(0);
    const startX = useRef(0);
    const swiping = useRef(false);

    const onTouchStart = (e: ReactTouchEvent) => {
        startX.current = e.touches[0].clientX;
        swiping.current = false;
    };
    const onTouchMove = (e: ReactTouchEvent) => {
        const dx = e.touches[0].clientX - startX.current;
        if (dx < -10) swiping.current = true;
        if (swiping.current) setOffsetX(Math.min(0, dx));
    };
    const onTouchEnd = () => {
        if (offsetX < -SWIPE_THRESHOLD) {
            onDelete();
        }
        setOffsetX(0);
        swiping.current = false;
    };

    return (
        <div className="relative overflow-hidden">
            {/* Delete background revealed on swipe */}
            <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-destructive"
                style={{ width: Math.max(0, -offsetX) }}>
                <Trash2 className="h-4 w-4 text-destructive-foreground" />
            </div>
            <div
                style={{ transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? "transform 0.2s ease" : "none" }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {children}
            </div>
        </div>
    );
}

export function FoodSearchDialog({ open, onOpenChange, onFoodSelected, mealType }: FoodSearchDialogProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<FoodSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
    const [servingGrams, setServingGrams] = useState(100);
    const [recentMeals, setRecentMeals] = useState<(FoodSearchResult & { lastPortionGrams: number })[]>([]);
    const [chosenMealType, setChosenMealType] = useState<MealTypeValue>(() => normalizeMealType(mealType));
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const { toast } = useToast();
    const foodSearchAction = useAction(api.actions.foodSearch.run);

    // Re-sync the meal-type chooser to the caller's hint when the dialog
    // opens. After that point the user's pick stands until close.
    useEffect(() => {
        if (open) setChosenMealType(normalizeMealType(mealType));
    }, [open, mealType]);

    // Recents list temporarily disabled — the legacy `meals_with_totals` view
    // is gone in the Convex backend and the per-day equivalent didn't make the
    // beta cut. Falls through to the "type to search" empty state.
    useEffect(() => {
        if (!open) return;
        setRecentMeals([]);
    }, [open]);

    // Phase 1.2: removed unauthenticated warmup ping — it was emitting 401s on
    // every dialog open and the real search request already warms the isolate.

    // Debounced search via Convex action.
    const searchFoods = useCallback(async (searchQuery: string) => {
        if (searchQuery.trim().length < 2) {
            setResults([]);
            return;
        }

        // Abort previous request
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Hard wall-clock timeout so a wedged action call can't leave the
        // user waiting indefinitely. 8s is well beyond typical p95 (~800ms).
        const timeoutTimer = setTimeout(() => controller.abort(), 8000);

        setSearching(true);
        try {
            // Convex `useAction` handles auth + retries internally; we only
            // need to apply the abort + timeout for UX consistency.
            const result = (await Promise.race([
                foodSearchAction({ query: searchQuery }),
                new Promise<never>((_, reject) => {
                    controller.signal.addEventListener("abort", () =>
                        reject(new DOMException("aborted", "AbortError")),
                    );
                }),
            ])) as { results?: any[] };
            setResults(result.results || []);
        } catch (err: any) {
            if (err?.name !== "AbortError") {
                logger.error("Food search error", err);
                if (controller.signal.aborted) {
                    toast({
                        title: "Search timed out",
                        description: "Try again in a moment.",
                        variant: "destructive",
                    });
                }
            }
        } finally {
            clearTimeout(timeoutTimer);
            setSearching(false);
        }
    }, [toast, foodSearchAction]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchFoods(query), 200);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, searchFoods]);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
            setSelectedFood(null);
            setServingGrams(100);
        }
    }, [open]);

    const scaledCalories = selectedFood ? Math.round(selectedFood.calories_per_100g * servingGrams / 100) : 0;
    const scaledProtein = selectedFood ? Math.round(selectedFood.protein_per_100g * servingGrams / 100 * 10) / 10 : 0;
    const scaledCarbs = selectedFood ? Math.round(selectedFood.carbs_per_100g * servingGrams / 100 * 10) / 10 : 0;
    const scaledFats = selectedFood ? Math.round(selectedFood.fats_per_100g * servingGrams / 100 * 10) / 10 : 0;

    const handleLogFood = () => {
        if (!selectedFood) return;
        const mainEl = document.querySelector("main");
        const scrollY = mainEl?.scrollTop ?? 0;
        onFoodSelected({
            meal_name: selectedFood.name + (selectedFood.brand ? ` (${selectedFood.brand})` : ""),
            calories: scaledCalories,
            protein_g: scaledProtein,
            carbs_g: scaledCarbs,
            fats_g: scaledFats,
            serving_size: `${servingGrams}g`,
            portion_size: `${servingGrams}g`,
            meal_type: chosenMealType,
        });
        onOpenChange(false);
        requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = scrollY; });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[340px] w-[92vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-0 bg-card/95 backdrop-blur-xl shadow-2xl">
                {!selectedFood ? (
                    <>
                        {/* Search header */}
                        <div className="px-4 pt-4 pb-3 border-b border-border/30 space-y-2.5">
                            <DialogHeader>
                                <DialogTitle className="text-[15px] font-semibold text-center">
                                    Search Food
                                </DialogTitle>
                            </DialogHeader>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search foods..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="pl-9 text-[13px] h-8 rounded-lg border-border/30 bg-muted/20"
                                    autoFocus
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            {/* Meal-type chooser — applies to every "log" path below */}
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-1.5">
                                    Log to
                                </p>
                                <div className="grid grid-cols-4 gap-1">
                                    {MEAL_TYPE_OPTIONS.map((opt) => {
                                        const active = chosenMealType === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setChosenMealType(opt.value)}
                                                aria-pressed={active}
                                                className={`py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                                                    active
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted/40 text-muted-foreground/80 active:bg-muted/60"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Results list */}
                        <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[60vh]">
                            {searching && (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    <span className="ml-1.5 text-[13px] text-muted-foreground">Searching…</span>
                                </div>
                            )}

                            {!searching && query.length >= 2 && results.length === 0 && (
                                <div className="text-center py-8">
                                    <p className="text-[13px] text-muted-foreground">No results found</p>
                                </div>
                            )}

                            {!searching && query.length < 2 && recentMeals.length > 0 && (
                                <div>
                                    <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                                        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/60">Recent</span>
                                        <button
                                            onClick={() => {
                                                const hidden = getHiddenRecents();
                                                recentMeals.forEach((m) => hidden.add(m.name.toLowerCase()));
                                                setHiddenRecents(hidden);
                                                setRecentMeals([]);
                                            }}
                                            className="text-[13px] text-muted-foreground/60 active:text-destructive transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="divide-y divide-border/20">
                                        {recentMeals.map((food) => (
                                            <SwipeToDelete
                                                key={food.id}
                                                onDelete={() => {
                                                    const hidden = getHiddenRecents();
                                                    hidden.add(food.name.toLowerCase());
                                                    setHiddenRecents(hidden);
                                                    setRecentMeals((prev) => prev.filter((m) => m.id !== food.id));
                                                }}
                                            >
                                                <div className="flex items-center bg-background">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedFood(food);
                                                            setServingGrams(food.lastPortionGrams);
                                                        }}
                                                        className="flex-1 flex items-center gap-2 px-3 py-1.5 active:bg-muted/50 transition-colors text-left min-w-0"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-medium truncate">{food.name}</p>
                                                            <p className="text-[10px] text-muted-foreground/50 mt-0.5 uppercase tracking-wide">per 100g</p>
                                                            <FoodStatPanel
                                                                calories={food.calories_per_100g}
                                                                protein={food.protein_per_100g}
                                                                carbs={food.carbs_per_100g}
                                                                fats={food.fats_per_100g}
                                                            />
                                                        </div>
                                                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const mainEl = document.querySelector("main");
                                                            const scrollY = mainEl?.scrollTop ?? 0;
                                                            const scale = food.lastPortionGrams / 100;
                                                            onFoodSelected({
                                                                meal_name: food.name,
                                                                calories: Math.round(food.calories_per_100g * scale),
                                                                protein_g: Math.round(food.protein_per_100g * scale * 10) / 10,
                                                                carbs_g: Math.round(food.carbs_per_100g * scale * 10) / 10,
                                                                fats_g: Math.round(food.fats_per_100g * scale * 10) / 10,
                                                                serving_size: `${food.lastPortionGrams}g`,
                                                                portion_size: `${food.lastPortionGrams}g`,
                                                                meal_type: chosenMealType,
                                                            });
                                                            onOpenChange(false);
                                                            requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = scrollY; });
                                                        }}
                                                        className="px-2 py-1.5 mr-1 text-primary active:scale-95 transition-all flex-shrink-0"
                                                        title={`Quick add · ${food.lastPortionGrams}g`}
                                                    >
                                                        <PlusCircle className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </SwipeToDelete>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!searching && query.length < 2 && recentMeals.length === 0 && (
                                <div className="text-center py-8">
                                    <p className="text-[13px] text-muted-foreground">Type to search foods</p>
                                </div>
                            )}

                            {!searching && results.length > 0 && (
                                <div className="divide-y divide-border/20">
                                    {results.map((food) => (
                                        <button
                                            key={food.id}
                                            onClick={() => {
                                                setSelectedFood(food);
                                                setServingGrams(100);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 active:bg-muted/50 transition-colors text-left"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-medium truncate">{food.name}</p>
                                                {food.brand && (
                                                    <p className="text-[12px] text-muted-foreground/60 truncate">{food.brand}</p>
                                                )}
                                                <p className="text-[10px] text-muted-foreground/50 mt-0.5 uppercase tracking-wide">per 100g</p>
                                                <FoodStatPanel
                                                    calories={food.calories_per_100g}
                                                    protein={food.protein_per_100g}
                                                    carbs={food.carbs_per_100g}
                                                    fats={food.fats_per_100g}
                                                />
                                            </div>
                                            <ChevronRight className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Serving size panel */
                    <div className="px-4 pt-3 pb-4 space-y-3">
                        <div className="flex items-center gap-2.5">
                            <button
                                onClick={() => setSelectedFood(null)}
                                className="p-1 rounded-md active:bg-muted/50 text-muted-foreground"
                            >
                                ←
                            </button>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-[14px] truncate">{selectedFood.name}</h3>
                                {selectedFood.brand && (
                                    <p className="text-[13px] text-muted-foreground">{selectedFood.brand}</p>
                                )}
                            </div>
                        </div>

                        {/* Serving size input */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-medium">Serving Size</span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setServingGrams(Math.max(10, servingGrams - 10))}
                                        className="h-6 w-6 rounded-full bg-muted/40 flex items-center justify-center active:bg-muted/60 transition-colors"
                                    >
                                        <Minus className="h-3 w-3" />
                                    </button>
                                    <div className="flex items-center gap-0.5">
                                        <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={servingGrams}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value);
                                                if (!isNaN(v) && v > 0) setServingGrams(v);
                                            }}
                                            className="w-16 text-center text-[13px] h-7 font-semibold rounded-md border-border/30 bg-muted/20"
                                        />
                                        <span className="text-[13px] text-muted-foreground">g</span>
                                    </div>
                                    <button
                                        onClick={() => setServingGrams(servingGrams + 10)}
                                        className="h-6 w-6 rounded-full bg-muted/40 flex items-center justify-center active:bg-muted/60 transition-colors"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>

                            {/* Quick presets */}
                            <div className="flex gap-1 flex-wrap">
                                {SERVING_PRESETS.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setServingGrams(g)}
                                        className={`px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors ${servingGrams === g
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted/40 text-muted-foreground active:bg-muted/60"
                                            }`}
                                    >
                                        {g}g
                                    </button>
                                ))}
                                {selectedFood.serving_grams && selectedFood.serving_grams !== 100 && (
                                    <button
                                        onClick={() => setServingGrams(selectedFood.serving_grams!)}
                                        className={`px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors ${
                                            servingGrams === selectedFood.serving_grams
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted/40 text-muted-foreground active:bg-muted/60"
                                        }`}
                                    >
                                        1 srv ({selectedFood.serving_size ?? `${selectedFood.serving_grams}g`})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Nutrition breakdown */}
                        <div className="rounded-lg bg-muted/20 p-3 space-y-2">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-primary tabular-nums">{scaledCalories}</p>
                                <p className="text-[13px] text-muted-foreground uppercase tracking-wider">calories</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-border/20">
                                <div className="text-center">
                                    <p className="text-[15px] font-semibold text-blue-500 tabular-nums">{scaledProtein}g</p>
                                    <p className="text-[13px] uppercase tracking-wider text-muted-foreground">Protein</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[15px] font-semibold text-orange-500 tabular-nums">{scaledCarbs}g</p>
                                    <p className="text-[13px] uppercase tracking-wider text-muted-foreground">Carbs</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[15px] font-semibold text-purple-500 tabular-nums">{scaledFats}g</p>
                                    <p className="text-[13px] uppercase tracking-wider text-muted-foreground">Fats</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-border/30 pt-1">
                            <button onClick={handleLogFood} className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors">
                                Log Food · {scaledCalories} kcal
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
