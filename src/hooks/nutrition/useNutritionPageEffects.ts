import { useEffect, useRef } from "react";
import type { ManualMealForm } from "@/pages/nutrition/types";
import { setQuickAddSheetOpenRef } from "@/hooks/nutrition";

interface Params {
  userId: string | null;
  isQuickAddSheetOpen: boolean;
  quickAddTab: "ai" | "manual";
  searchParams: URLSearchParams;
  setSearchParams: (sp: URLSearchParams, opts?: { replace?: boolean }) => void;
  setIsQuickAddSheetOpen: (open: boolean) => void;
  setQuickAddTab: (tab: "ai" | "manual") => void;
  manualMeal: ManualMealForm;
  setManualMeal: React.Dispatch<React.SetStateAction<ManualMealForm>>;
  tasks: Array<{ id: string; status: string; type: string; result?: unknown }>;
  dismissTask: (id: string) => void;
  setDietAnalysis: (value: unknown) => void;
}

/**
 * Centralizes lifecycle effects for the Nutrition page:
 * - analyze-meal + food-search edge function warmup
 * - FoodSearchDialog chunk preload
 * - URL param auto-open of quick-add sheet
 * - Recalculate meal totals from ingredients with nutrition data
 * - Handle completed diet-analysis AI tasks
 */
export function useNutritionPageEffects({
  userId,
  isQuickAddSheetOpen,
  quickAddTab,
  searchParams,
  setSearchParams,
  setIsQuickAddSheetOpen,
  setQuickAddTab,
  manualMeal,
  setManualMeal,
  tasks,
  dismissTask,
  setDietAnalysis,
}: Params) {
  // Warmup analyze-meal edge function when quick add sheet opens on AI tab
  useEffect(() => {
    setQuickAddSheetOpenRef(isQuickAddSheetOpen);
    if (isQuickAddSheetOpen && quickAddTab === "ai" && userId) {
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase.functions.invoke("analyze-meal", { method: "GET" } as any).catch(() => {});
      });
    }
  }, [isQuickAddSheetOpen, quickAddTab, userId]);

  // Warmup food-search edge function so search dialog opens instantly.
  // Must include Authorization; food-search returns 401 on anon pings post-hardening.
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [userId]);

  // Preload FoodSearchDialog chunk so it's ready when user taps search
  useEffect(() => {
    const t = setTimeout(() => {
      import("@/components/nutrition/FoodSearchDialog").catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Auto-open from URL params (deferred to avoid race with QuickLog sheet close)
  useEffect(() => {
    let tab: "ai" | "manual" | null = null;
    if (searchParams.get("openAddMeal") === "true") { tab = "ai"; searchParams.delete("openAddMeal"); }
    if (searchParams.get("openManualMeal") === "true") { tab = "manual"; searchParams.delete("openManualMeal"); }
    if (tab) {
      const targetTab = tab;
      setSearchParams(searchParams, { replace: true });
      const t = setTimeout(() => {
        setQuickAddTab(targetTab);
        setIsQuickAddSheetOpen(true);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [searchParams, setSearchParams, setIsQuickAddSheetOpen, setQuickAddTab]);

  // Auto-calculate meal totals from ingredients when macros per 100g are known
  useEffect(() => {
    if (manualMeal.ingredients.length > 0) {
      const hasNutritionData = manualMeal.ingredients.some((ing) => ing.calories_per_100g !== undefined);
      if (hasNutritionData) {
        let tc = 0, tp = 0, tcarb = 0, tf = 0;
        manualMeal.ingredients.forEach((ingredient) => {
          if (ingredient.calories_per_100g !== undefined) tc += (ingredient.calories_per_100g * ingredient.grams) / 100;
          if (ingredient.protein_per_100g !== undefined) tp += (ingredient.protein_per_100g * ingredient.grams) / 100;
          if (ingredient.carbs_per_100g !== undefined) tcarb += (ingredient.carbs_per_100g * ingredient.grams) / 100;
          if (ingredient.fats_per_100g !== undefined) tf += (ingredient.fats_per_100g * ingredient.grams) / 100;
        });
        setManualMeal((prev) => ({
          ...prev,
          calories: Math.round(tc).toString(),
          protein_g: Math.round(tp * 10) / 10 !== 0 ? (Math.round(tp * 10) / 10).toString() : "",
          carbs_g: Math.round(tcarb * 10) / 10 !== 0 ? (Math.round(tcarb * 10) / 10).toString() : "",
          fats_g: Math.round(tf * 10) / 10 !== 0 ? (Math.round(tf * 10) / 10).toString() : "",
        }));
      }
    }
  }, [manualMeal.ingredients, setManualMeal]);

  // Pick up completed diet-analysis AI tasks and apply results to local state
  const handledTaskRef = useRef<string | null>(null);
  useEffect(() => {
    const done = tasks.find((t) => t.status === "done" && t.type === "diet-analysis" && t.result && handledTaskRef.current !== t.id);
    if (done) {
      handledTaskRef.current = done.id;
      setDietAnalysis(done.result);
      dismissTask(done.id);
    }
  }, [tasks, dismissTask, setDietAnalysis]);
}
