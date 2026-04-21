import { useState, useEffect, useCallback, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight, Minus, Plus, X, Clock, PlusCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
    const { toast } = useToast();

    // Load recent meals when dialog opens. Uses v2 `meals_with_totals` view
    // (the legacy `nutrition_logs` table was archived and queries against it
    // hang in web, stalling the dialog open). Wrapped in a 5s timeout so a
    // wedged Supabase client can't freeze the UI — we just show no recents.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const timer = setTimeout(() => { cancelled = true; }, 5000);
        (async () => {
            try {
                const { data } = await supabase
                    .from("meals_with_totals")
                    .select("meal_name, total_calories, total_protein_g, total_carbs_g, total_fats_g, is_ai_generated, created_at")
                    .eq("is_ai_generated", false)
                    .order("created_at", { ascending: false })
                    .limit(50);
                if (cancelled) return;
                if (!data?.length) { setRecentMeals([]); return; }

                // Deduplicate by meal_name, keep most recent, skip hidden
                const hidden = getHiddenRecents();
                const seen = new Set<string>();
                const unique: typeof data = [];
                for (const row of data) {
                    const key = (row.meal_name ?? "").toLowerCase();
                    if (!key || seen.has(key) || hidden.has(key)) continue;
                    seen.add(key);
                    unique.push(row);
                    if (unique.length >= 10) break;
                }

                // No portion_size on meals_with_totals — treat recent totals as
                // a single 100g serving so per-100g and lastPortionGrams=100.
                setRecentMeals(unique.map((row) => ({
                    id: `recent-${row.meal_name}`,
                    name: row.meal_name as string,
                    brand: "",
                    calories_per_100g: Math.round(Number(row.total_calories ?? 0)),
                    protein_per_100g: Math.round(Number(row.total_protein_g ?? 0) * 10) / 10,
                    carbs_per_100g: Math.round(Number(row.total_carbs_g ?? 0) * 10) / 10,
                    fats_per_100g: Math.round(Number(row.total_fats_g ?? 0) * 10) / 10,
                    lastPortionGrams: 100,
                })));
            } catch (err) {
                if (!cancelled) logger.error("Failed to load recent meals", err);
            } finally {
                clearTimeout(timer);
            }
        })();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open]);

    // Phase 1.2: removed unauthenticated warmup ping — it was emitting 401s on
    // every dialog open and the real search request already warms the isolate.

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

        // Hard wall-clock timeout so a wedged Supabase client / dead edge
        // fn can't leave the user waiting indefinitely. 8s is well beyond
        // typical p95 (~800ms) but short enough to retry or show an error.
        const timeoutTimer = setTimeout(() => controller.abort(), 8000);

        setSearching(true);
        try {
            // Read the JWT straight from localStorage — synchronous, never
            // contends with Supabase's internal auth mutex (which can be
            // wedged and make `supabase.auth.getSession()` hang). The token
            // is what the edge function validates; we only need to involve
            // Supabase auth if the token is actually missing or expired.
            const readStoredToken = (): { access_token: string; expires_at: number } | null => {
                try {
                    const raw = localStorage.getItem("weightcut-wizard-auth");
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    const access = parsed?.access_token ?? parsed?.currentSession?.access_token;
                    const exp = parsed?.expires_at ?? parsed?.currentSession?.expires_at ?? 0;
                    return access ? { access_token: access, expires_at: Number(exp) || 0 } : null;
                } catch {
                    return null;
                }
            };

            const nowSec = Math.floor(Date.now() / 1000);
            let token = readStoredToken();
            const needsRefresh =
                !token?.access_token || (token.expires_at > 0 && token.expires_at - nowSec < 60);

            if (needsRefresh) {
                const refreshRace = await Promise.race([
                    supabase.auth.refreshSession(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("refreshSession timed out")), 4000)
                    ),
                ]).catch((e) => {
                    logger.warn("Food search: session refresh failed", { error: String(e) });
                    return null;
                });
                const refreshed = refreshRace?.data?.session;
                if (refreshed?.access_token) {
                    token = {
                        access_token: refreshed.access_token,
                        expires_at: refreshed.expires_at ?? 0,
                    };
                } else {
                    // Re-read storage — autoRefreshToken may have just written
                    // a new token even though our race lost to the timer.
                    const fresh = readStoredToken();
                    if (fresh?.access_token) {
                        token = fresh;
                    }
                }
            }

            if (!token?.access_token) {
                toast({
                    title: "Sign-in expired",
                    description: "Please reopen the app to sign in again.",
                    variant: "destructive",
                });
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token.access_token}`,
                    },
                    body: JSON.stringify({ query: searchQuery }),
                    signal: controller.signal,
                }
            );

            if (response.status === 401) {
                // Edge function returns { error, retryable: true } — surface as auth error.
                let retryable = false;
                try {
                    const body = await response.json();
                    retryable = !!body?.retryable;
                } catch {
                    // non-JSON body — fall through
                }
                logger.warn("Food search: 401 from edge function", { retryable });
                toast({
                    title: "Sign-in expired",
                    description: "Please reopen the app to sign in again.",
                    variant: "destructive",
                });
                return;
            }

            const data = await response.json();
            setResults(data.results || []);
        } catch (err: any) {
            if (err.name !== "AbortError") {
                logger.error("Food search error", err);
                // Timeout / abort means the Supabase client is likely wedged.
                // Trigger recovery (debounced) and let the user try again —
                // the next keystroke will land on a fresh client.
                if (controller.signal.aborted) {
                    const { recoverSupabaseConnection } = await import("@/lib/connectionRecovery");
                    recoverSupabaseConnection("food-search-timeout").catch(() => {});
                    toast({
                        title: "Search timed out",
                        description: "Reconnecting — try again in a moment.",
                        variant: "destructive",
                    });
                }
            }
        } finally {
            clearTimeout(timeoutTimer);
            setSearching(false);
        }
    }, [toast]);

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
                        <div className="px-4 pt-4 pb-3 border-b border-border/30">
                            <DialogHeader className="mb-2.5">
                                <DialogTitle className="text-[15px] font-semibold text-center">
                                    Search Food {mealType ? `· ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}` : ""}
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
                                                            <p className="text-[13px] text-muted-foreground/70">
                                                                {food.calories_per_100g} kcal · {food.protein_per_100g}P · {food.carbs_per_100g}C · {food.fats_per_100g}F
                                                            </p>
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
                                                    <p className="text-[13px] text-muted-foreground/60 truncate">{food.brand}</p>
                                                )}
                                                <p className="text-[13px] text-muted-foreground/70">
                                                    {food.calories_per_100g} kcal · {food.protein_per_100g}P · {food.carbs_per_100g}C · {food.fats_per_100g}F
                                                </p>
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
                                {selectedFood.serving_size && (
                                    <button
                                        onClick={() => {
                                            const match = selectedFood.serving_size?.match(/(\d+(?:\.\d+)?)\s*g/i);
                                            if (match) setServingGrams(Math.round(parseFloat(match[1])));
                                        }}
                                        className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-muted/40 text-muted-foreground active:bg-muted/60"
                                    >
                                        1 srv ({selectedFood.serving_size})
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
                            <p className="text-[13px] text-muted-foreground/50 text-center">
                                Per 100g: {selectedFood.calories_per_100g} kcal · P {selectedFood.protein_per_100g}g · C {selectedFood.carbs_per_100g}g · F {selectedFood.fats_per_100g}g
                            </p>
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
