import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight, Minus, Plus, X } from "lucide-react";

interface OpenFoodFactsProduct {
    code: string;
    product_name: string;
    brands?: string;
    nutriments: {
        "energy-kcal_100g"?: number;
        proteins_100g?: number;
        carbohydrates_100g?: number;
        fat_100g?: number;
    };
    serving_size?: string;
    image_small_url?: string;
}

interface FoodSearchResult {
    id: string;
    name: string;
    brand: string;
    calories_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fats_per_100g: number;
    serving_size?: string;
    image_url?: string;
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

export function FoodSearchDialog({ open, onOpenChange, onFoodSelected, mealType }: FoodSearchDialogProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<FoodSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
    const [servingGrams, setServingGrams] = useState(100);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

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
            const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,brands,nutriments,serving_size,image_small_url`;
            const response = await fetch(url, { signal: controller.signal });
            const data = await response.json();

            const foods: FoodSearchResult[] = (data.products || [])
                .filter((p: OpenFoodFactsProduct) => p.product_name && p.nutriments?.["energy-kcal_100g"])
                .map((p: OpenFoodFactsProduct) => ({
                    id: p.code,
                    name: p.product_name,
                    brand: p.brands || "",
                    calories_per_100g: Math.round(p.nutriments["energy-kcal_100g"] || 0),
                    protein_per_100g: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
                    carbs_per_100g: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
                    fats_per_100g: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
                    serving_size: p.serving_size,
                    image_url: p.image_small_url,
                }));

            setResults(foods);
        } catch (err: any) {
            if (err.name !== "AbortError") {
                console.error("Food search error:", err);
            }
        } finally {
            setSearching(false);
        }
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchFoods(query), 350);
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

                            {!searching && query.length < 2 && (
                                <div className="text-center py-12">
                                    <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-sm text-muted-foreground">Type to search the food database</p>
                                    <p className="text-xs text-muted-foreground/60 mt-1">Powered by OpenFoodFacts · 3M+ products</p>
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
                                            {food.image_url ? (
                                                <img
                                                    src={food.image_url}
                                                    alt=""
                                                    className="w-10 h-10 rounded-lg object-cover bg-muted flex-shrink-0"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-lg">🍽</span>
                                                </div>
                                            )}
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
