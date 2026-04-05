import { useState, useEffect, useCallback, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight, Minus, Plus, X, Clock, PlusCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface FoodSearchResult {
    id: string;
    name: string;
    brand: string;
    calories_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fats_per_100g: number;
    serving_size?: string;
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
    }) => void;
    mealType?: string;
}

const SERVING_PRESETS = [50, 100, 150, 200, 250];
const SWIPE_THRESHOLD = 70;
const HIDDEN_RECENTS_KEY = "wcw_hidden_recent_meals";

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
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Load recent meals when dialog opens
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const { data } = await supabase
                    .from("nutrition_logs")
                    .select("meal_name, calories, protein_g, carbs_g, fats_g, portion_size")
                    .eq("is_ai_generated", false)
                    .order("created_at", { ascending: false })
                    .limit(50);
                if (!data?.length) { setRecentMeals([]); return; }

                // Deduplicate by meal_name, keep most recent, skip hidden
                const hidden = getHiddenRecents();
                const seen = new Set<string>();
                const unique: typeof data = [];
                for (const row of data) {
                    const key = row.meal_name.toLowerCase();
                    if (seen.has(key) || hidden.has(key)) continue;
                    seen.add(key);
                    unique.push(row);
                    if (unique.length >= 10) break;
                }

                setRecentMeals(unique.map((row) => {
                    const portionMatch = row.portion_size?.match(/(\d+(?:\.\d+)?)\s*g/i);
                    const portionGrams = portionMatch ? parseFloat(portionMatch[1]) : 100;
                    const scale = portionGrams > 0 ? 100 / portionGrams : 1;
                    return {
                        id: `recent-${row.meal_name}`,
                        name: row.meal_name,
                        brand: "",
                        calories_per_100g: Math.round((row.calories ?? 0) * scale),
                        protein_per_100g: Math.round((row.protein_g ?? 0) * scale * 10) / 10,
                        carbs_per_100g: Math.round((row.carbs_g ?? 0) * scale * 10) / 10,
                        fats_per_100g: Math.round((row.fats_g ?? 0) * scale * 10) / 10,
                        lastPortionGrams: Math.round(portionGrams),
                    };
                }));
            } catch (err) {
                logger.error("Failed to load recent meals", err);
            }
        })();
    }, [open]);

    // Warmup edge function on dialog open
    useEffect(() => {
        if (open) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`, {
                method: "GET",
            }).catch(() => {});
        }
    }, [open]);

    // Debounced search
    const searchFoods = useCallback(async (searchQuery: string) => {
        if (searchQuery.trim().length < 2) {
            setResults([]);
            return;
        }

        // Abort previous request
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setSearching(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({ query: searchQuery }),
                    signal: controller.signal,
                }
            );
            const data = await response.json();
            setResults(data.results || []);
        } catch (err: any) {
            if (err.name !== "AbortError") {
                logger.error("Food search error", err);
            }
        } finally {
            setSearching(false);
        }
    }, []);

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
        onFoodSelected({
            meal_name: selectedFood.name + (selectedFood.brand ? ` (${selectedFood.brand})` : ""),
            calories: scaledCalories,
            protein_g: scaledProtein,
            carbs_g: scaledCarbs,
            fats_g: scaledFats,
            serving_size: `${servingGrams}g`,
            portion_size: `${servingGrams}g`,
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                {!selectedFood ? (
                    <>
                        {/* Search header */}
                        <div className="p-4 pb-3 border-b border-border/40">
                            <DialogHeader className="mb-3">
                                <DialogTitle className="text-base">
                                    Search Food {mealType ? `· ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}` : ""}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search foods (e.g. chicken breast, banana…)"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="pl-9 text-sm h-10"
                                    autoFocus
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Results list */}
                        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[55vh]">
                            {searching && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">Searching…</span>
                                </div>
                            )}

                            {!searching && query.length >= 2 && results.length === 0 && (
                                <div className="text-center py-12">
                                    <p className="text-sm text-muted-foreground">No results found</p>
                                    <p className="text-xs text-muted-foreground/60 mt-1">Try a different search term</p>
                                </div>
                            )}

                            {!searching && query.length < 2 && recentMeals.length > 0 && (
                                <div>
                                    <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Recent</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const hidden = getHiddenRecents();
                                                recentMeals.forEach((m) => hidden.add(m.name.toLowerCase()));
                                                setHiddenRecents(hidden);
                                                setRecentMeals([]);
                                            }}
                                            className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors"
                                        >
                                            Clear all
                                        </button>
                                    </div>
                                    <div className="divide-y divide-border/30">
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
                                                        className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left min-w-0"
                                                    >
                                                        <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                                                            <Clock className="h-4 w-4 text-muted-foreground/50" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">{food.name}</p>
                                                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                                {food.calories_per_100g} kcal · P {food.protein_per_100g}g · C {food.carbs_per_100g}g · F {food.fats_per_100g}g
                                                                <span className="text-muted-foreground/40 ml-1">per 100g</span>
                                                            </p>
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const scale = food.lastPortionGrams / 100;
                                                            onFoodSelected({
                                                                meal_name: food.name,
                                                                calories: Math.round(food.calories_per_100g * scale),
                                                                protein_g: Math.round(food.protein_per_100g * scale * 10) / 10,
                                                                carbs_g: Math.round(food.carbs_per_100g * scale * 10) / 10,
                                                                fats_g: Math.round(food.fats_per_100g * scale * 10) / 10,
                                                                serving_size: `${food.lastPortionGrams}g`,
                                                                portion_size: `${food.lastPortionGrams}g`,
                                                            });
                                                            onOpenChange(false);
                                                        }}
                                                        className="px-3 py-3 mr-2 text-primary hover:text-primary/80 active:scale-95 transition-all flex-shrink-0"
                                                        title={`Quick add · ${food.lastPortionGrams}g`}
                                                    >
                                                        <PlusCircle className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </SwipeToDelete>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!searching && query.length < 2 && recentMeals.length === 0 && (
                                <div className="text-center py-12">
                                    <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-sm text-muted-foreground">Type to search the food database</p>
                                    <p className="text-xs text-muted-foreground/60 mt-1">Powered by USDA FoodData Central</p>
                                </div>
                            )}

                            {!searching && results.length > 0 && (
                                <div className="divide-y divide-border/30">
                                    {results.map((food) => (
                                        <button
                                            key={food.id}
                                            onClick={() => {
                                                setSelectedFood(food);
                                                setServingGrams(100);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                                                <span className="text-lg">🍽</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{food.name}</p>
                                                {food.brand && (
                                                    <p className="text-xs text-muted-foreground truncate">{food.brand}</p>
                                                )}
                                                <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                    {food.calories_per_100g} kcal · P {food.protein_per_100g}g · C {food.carbs_per_100g}g · F {food.fats_per_100g}g
                                                    <span className="text-muted-foreground/40 ml-1">per 100g</span>
                                                </p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Serving size panel */
                    <div className="p-4 space-y-5">
                        <div className="flex items-start gap-3">
                            <button
                                onClick={() => setSelectedFood(null)}
                                className="mt-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground"
                            >
                                ←
                            </button>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base truncate">{selectedFood.name}</h3>
                                {selectedFood.brand && (
                                    <p className="text-xs text-muted-foreground">{selectedFood.brand}</p>
                                )}
                            </div>
                        </div>

                        {/* Serving size input */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Serving Size</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setServingGrams(Math.max(10, servingGrams - 10))}
                                        className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={servingGrams}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value);
                                                if (!isNaN(v) && v > 0) setServingGrams(v);
                                            }}
                                            className="w-20 text-center text-sm h-8 font-semibold"
                                        />
                                        <span className="text-sm text-muted-foreground">g</span>
                                    </div>
                                    <button
                                        onClick={() => setServingGrams(servingGrams + 10)}
                                        className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Quick presets */}
                            <div className="flex gap-1.5 flex-wrap">
                                {SERVING_PRESETS.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setServingGrams(g)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${servingGrams === g
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            }`}
                                    >
                                        {g}g
                                    </button>
                                ))}
                                {selectedFood.serving_size && (
                                    <button
                                        onClick={() => {
                                            const match = selectedFood.serving_size?.match(/(\d+(?:\.\d+)?)\s*g/i);
                                            if (match) setServingGrams(Math.round(parseFloat(match[1])));
                                        }}
                                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80"
                                    >
                                        1 serving ({selectedFood.serving_size})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Nutrition breakdown */}
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                            <div className="text-center">
                                <p className="text-3xl font-bold text-primary tabular-nums">{scaledCalories}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">calories</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/30">
                                <div className="text-center">
                                    <p className="text-lg font-semibold text-blue-500 tabular-nums">{scaledProtein}g</p>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Protein</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-semibold text-orange-500 tabular-nums">{scaledCarbs}g</p>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbs</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-semibold text-purple-500 tabular-nums">{scaledFats}g</p>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fats</p>
                                </div>
                            </div>
                            {/* Per 100g reference */}
                            <p className="text-[10px] text-muted-foreground/50 text-center pt-1">
                                Per 100g: {selectedFood.calories_per_100g} kcal · P {selectedFood.protein_per_100g}g · C {selectedFood.carbs_per_100g}g · F {selectedFood.fats_per_100g}g
                            </p>
                        </div>

                        <Button onClick={handleLogFood} className="w-full h-11 font-semibold text-sm">
                            Log Food · {scaledCalories} kcal
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
