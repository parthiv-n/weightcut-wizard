import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Edit2, Loader2, Mic, MicOff, Plus, X } from "lucide-react";
import { triggerHapticSelection } from "@/lib/haptics";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { AICompactOverlay } from "@/components/AICompactOverlay";
import { MealPhotoScanOverlay } from "@/components/nutrition/MealPhotoScanOverlay";
import type { ManualMealForm } from "@/pages/nutrition/types";

interface AiMealShape {
  aiMealDescription: string;
  setAiMealDescription: React.Dispatch<React.SetStateAction<string>>;
  aiAnalyzing: boolean;
  aiLineItems: Array<{ name: string; quantity: string; calories: number; protein_g: number; carbs_g: number; fats_g: number }>;
  setAiLineItems: React.Dispatch<React.SetStateAction<any[]>>;
  aiAnalysisComplete: boolean;
  setAiAnalysisComplete: React.Dispatch<React.SetStateAction<boolean>>;
  photoBase64: string | null;
  setPhotoBase64: React.Dispatch<React.SetStateAction<string | null>>;
  photoAnalyzing: boolean;
  capturePhoto: () => Promise<string | null | undefined>;
  handlePhotoAnalyze: () => void;
  handleAiAnalyzeMeal: () => void;
  handleSaveAiMeal: () => void;
  barcodeBaseMacros: any;
  setBarcodeBaseMacros: React.Dispatch<React.SetStateAction<any>>;
  servingMultiplier: number;
  setServingMultiplier: React.Dispatch<React.SetStateAction<number>>;
  newIngredient: { name: string; grams: string };
  setNewIngredient: React.Dispatch<React.SetStateAction<{ name: string; grams: string }>>;
  lookingUpIngredient: boolean;
  setLookingUpIngredient: React.Dispatch<React.SetStateAction<boolean>>;
  lookupIngredientNutrition: (name: string) => Promise<any>;
  setManualNutritionDialog: React.Dispatch<React.SetStateAction<any>>;
  ingredientLookupError: string | null;
  setIngredientLookupError: React.Dispatch<React.SetStateAction<string | null>>;
}

interface AiTaskShape {
  id: string;
  label: string;
  steps: any[];
  startedAt: number;
}

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickAddTab: "ai" | "manual";
  setQuickAddTab: (tab: "ai" | "manual") => void;
  manualMeal: ManualMealForm;
  setManualMeal: React.Dispatch<React.SetStateAction<ManualMealForm>>;
  aiMeal: AiMealShape;
  macroCalc: {
    handleCalorieChange: (value: string, setter: React.Dispatch<React.SetStateAction<ManualMealForm>>) => void;
  };
  savingAllMeals: boolean;
  onAddManualMeal: () => void;
  aiTask: AiTaskShape | null;
  onCancelAi: () => void;
  onDismissTask: (id: string) => void;
  onToast: (args: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  gemBadge: React.ReactNode;
}

export function QuickAddDialog({
  open,
  onOpenChange,
  quickAddTab,
  setQuickAddTab,
  manualMeal,
  setManualMeal,
  aiMeal,
  macroCalc,
  savingAllMeals,
  onAddManualMeal,
  aiTask,
  onCancelAi,
  onDismissTask,
  onToast,
  gemBadge,
}: QuickAddDialogProps) {
  // Track if user has seen the AI placeholder before
  const [hasSeenAiPlaceholder, setHasSeenAiPlaceholder] = useState(() => {
    try { return localStorage.getItem("wcw_ai_meal_placeholder_seen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (open && quickAddTab === "ai" && !hasSeenAiPlaceholder) {
      setHasSeenAiPlaceholder(true);
      try { localStorage.setItem("wcw_ai_meal_placeholder_seen", "1"); } catch { /* swallow */ }
    }
  }, [open, quickAddTab, hasSeenAiPlaceholder]);

  const { isListening, isSupported: voiceSupported, startListening, stopListening, interimText } = useSpeechRecognition({
    onTranscript: (text: string) => aiMeal.setAiMealDescription((prev) => (prev ? prev + " " + text : text)),
    onError: (error: string) => onToast({ title: "Voice Input", description: error, variant: "destructive" }),
  });

  const totalAiLineItemCalories = aiMeal.aiLineItems.reduce((s, i) => s + i.calories, 0);
  const totalAiProtein = aiMeal.aiLineItems.reduce((s, i) => s + i.protein_g, 0);
  const totalAiCarbs = aiMeal.aiLineItems.reduce((s, i) => s + i.carbs_g, 0);
  const totalAiFats = aiMeal.aiLineItems.reduce((s, i) => s + i.fats_g, 0);
  const macroCals = [totalAiProtein * 4, totalAiCarbs * 4, totalAiFats * 9];
  const macroTotal = macroCals.reduce((s, v) => s + v, 0) || 1;
  const rawPcts = macroCals.map((c) => (c / macroTotal) * 100);
  const floors = rawPcts.map((v) => Math.floor(v));
  let remainder = 100 - floors.reduce((s, v) => s + v, 0);
  const order = rawPcts.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) pcts[order[k].i] += 1;
  const [proteinPct, carbsPct, fatsPct] = pcts;
  const wheelMask = "radial-gradient(farthest-side, transparent calc(100% - 7px), #fff calc(100% - 7px))";
  const wheel = (pct: number, cssColor: string): React.CSSProperties => ({
    background: `conic-gradient(${cssColor} ${pct * 3.6}deg, hsl(var(--muted) / 0.3) ${pct * 3.6}deg)`,
    mask: wheelMask,
    WebkitMask: wheelMask,
  });

  const handleAddIngredient = async () => {
    if (!aiMeal.newIngredient.name.trim() || !aiMeal.newIngredient.grams) {
      onToast({ title: "Missing Information", description: "Please enter ingredient name and grams", variant: "destructive" });
      return;
    }
    const ingredientName = aiMeal.newIngredient.name.trim();
    const grams = parseFloat(aiMeal.newIngredient.grams);
    if (isNaN(grams) || grams <= 0) {
      onToast({ title: "Invalid Amount", description: "Please enter a valid number of grams", variant: "destructive" });
      return;
    }
    aiMeal.setLookingUpIngredient(true);
    aiMeal.setIngredientLookupError(null);
    try {
      const nutritionData = await aiMeal.lookupIngredientNutrition(ingredientName);
      if (nutritionData) {
        const newIngredients = [
          ...manualMeal.ingredients,
          {
            name: ingredientName,
            grams,
            calories_per_100g: nutritionData.calories_per_100g,
            protein_per_100g: nutritionData.protein_per_100g,
            carbs_per_100g: nutritionData.carbs_per_100g,
            fats_per_100g: nutritionData.fats_per_100g,
            source: nutritionData.source,
          },
        ];
        const tc = newIngredients.reduce((s, i) => s + (i.calories_per_100g || 0) * i.grams / 100, 0);
        const tp = newIngredients.reduce((s, i) => s + (i.protein_per_100g || 0) * i.grams / 100, 0);
        const tcarb = newIngredients.reduce((s, i) => s + (i.carbs_per_100g || 0) * i.grams / 100, 0);
        const tf = newIngredients.reduce((s, i) => s + (i.fats_per_100g || 0) * i.grams / 100, 0);
        setManualMeal({
          ...manualMeal,
          ingredients: newIngredients,
          calories: Math.round(tc).toString(),
          protein_g: tp > 0 ? (Math.round(tp * 10) / 10).toString() : "",
          carbs_g: tcarb > 0 ? (Math.round(tcarb * 10) / 10).toString() : "",
          fats_g: tf > 0 ? (Math.round(tf * 10) / 10).toString() : "",
        });
        aiMeal.setNewIngredient({ name: "", grams: "" });
      } else {
        aiMeal.setManualNutritionDialog({
          open: true,
          ingredientName,
          grams,
          calories_per_100g: "",
          protein_per_100g: "",
          carbs_per_100g: "",
          fats_per_100g: "",
        });
      }
    } catch {
      aiMeal.setManualNutritionDialog({
        open: true,
        ingredientName,
        grams,
        calories_per_100g: "",
        protein_per_100g: "",
        carbs_per_100g: "",
        fats_per_100g: "",
      });
    } finally {
      aiMeal.setLookingUpIngredient(false);
    }
  };

  const handleBarcodeServingSet = (next: number, grams?: number) => {
    const base = aiMeal.barcodeBaseMacros!;
    aiMeal.setServingMultiplier(next);
    const gramTotal = grams ?? Math.round(next * base.serving_weight_g);
    setManualMeal((prev) => ({
      ...prev,
      calories: Math.round(base.calories * next).toString(),
      protein_g: (Math.round(base.protein_g * next * 10) / 10).toString(),
      carbs_g: (Math.round(base.carbs_g * next * 10) / 10).toString(),
      fats_g: (Math.round(base.fats_g * next * 10) / 10).toString(),
      portion_size: `${gramTotal}g`,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`w-[calc(100vw-2.5rem)] max-w-[320px] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-[28px] p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0 ${aiTask ? "[&>button]:hidden" : ""}`}>
        {aiTask && (
          aiMeal.photoAnalyzing && aiMeal.photoBase64 ? (
            <MealPhotoScanOverlay
              isOpen={true}
              isGenerating={true}
              photoBase64={aiMeal.photoBase64}
              steps={aiTask.steps}
              startedAt={aiTask.startedAt}
              title={aiTask.label}
              onCancel={() => { onCancelAi(); onDismissTask(aiTask.id); }}
            />
          ) : (
            <AICompactOverlay
              isOpen={true}
              isGenerating={true}
              steps={aiTask.steps}
              startedAt={aiTask.startedAt}
              title={aiTask.label}
              onCancel={() => { onCancelAi(); onDismissTask(aiTask.id); }}
            />
          )
        )}
        <div className="px-3 pt-3 pb-2">
          <DialogHeader><DialogTitle className="text-[13px] font-semibold text-center">Add Meal</DialogTitle></DialogHeader>
        </div>
        <div className="px-3">
          <div className="flex gap-0.5 p-0.5 rounded-md bg-muted/40 mb-2 mt-0.5">
            <button onClick={() => setQuickAddTab("ai")} className={`flex-1 py-1 text-[13px] font-semibold rounded transition-all ${quickAddTab === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              AI
            </button>
            <button onClick={() => setQuickAddTab("manual")} className={`flex-1 py-1 text-[13px] font-semibold rounded transition-all ${quickAddTab === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <Edit2 className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />Manual
            </button>
          </div>
          <Select value={manualMeal.meal_type} onValueChange={(v) => setManualMeal((prev) => ({ ...prev, meal_type: v }))}>
            <SelectTrigger className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20 mb-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="breakfast">Breakfast</SelectItem>
              <SelectItem value="lunch">Lunch</SelectItem>
              <SelectItem value="dinner">Dinner</SelectItem>
              <SelectItem value="snack">Snack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {quickAddTab === "ai" && (
          <div className="px-3 pb-3 space-y-1.5">
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={async () => { await aiMeal.capturePhoto(); }} disabled={aiMeal.aiAnalyzing}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-muted/30 active:bg-muted/50 transition-colors disabled:opacity-40">
                <Camera className="h-3 w-3 text-primary" /><span className="text-[13px] font-semibold">Photo</span>
              </button>
              <button type="button" onClick={() => { const ta = document.querySelector<HTMLTextAreaElement>("#ai-meal-description"); if (ta) ta.focus(); }}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-muted/30 active:bg-muted/50 transition-colors">
                <Edit2 className="h-3 w-3 text-muted-foreground" /><span className="text-[13px] font-semibold">Describe</span>
              </button>
            </div>
            {aiMeal.photoBase64 && (
              <div className="relative rounded-md overflow-hidden">
                <img src={`data:image/jpeg;base64,${aiMeal.photoBase64}`} alt="Meal" className="w-full h-28 object-cover" />
                <button type="button" onClick={() => aiMeal.setPhotoBase64(null)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/50 flex items-center justify-center">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            )}
            <Textarea
              id="ai-meal-description"
              placeholder={isListening ? "Listening..." : (aiMeal.photoBase64 ? "Details (optional)" : (hasSeenAiPlaceholder ? "What did you eat?" : "e.g. bread with nutella, banana"))}
              value={aiMeal.aiMealDescription} onChange={(e) => aiMeal.setAiMealDescription(e.target.value)} disabled={aiMeal.aiAnalyzing}
              className={`text-[13px] min-h-[40px] resize-none rounded-md border-border/30 bg-muted/20 py-1.5 px-2 ${isListening ? "border-red-500/30" : ""}`} rows={2}
              onFocus={() => { setTimeout(() => { const el = document.activeElement; if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 300); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !aiMeal.aiAnalyzing) { e.preventDefault(); if (aiMeal.photoBase64) aiMeal.handlePhotoAnalyze(); else aiMeal.handleAiAnalyzeMeal(); } }} />
            {isListening && interimText && <p className="text-[13px] text-muted-foreground/60 italic px-0.5">{interimText}</p>}
            <div className="flex gap-1">
              {voiceSupported && (
                <button type="button" onClick={() => { triggerHapticSelection(); if (isListening) stopListening(); else startListening(); }} disabled={aiMeal.aiAnalyzing}
                  className={`flex items-center justify-center gap-0.5 px-2 h-7 rounded-md text-[13px] font-semibold transition-all ${isListening ? "bg-red-500/15 text-red-500 animate-pulse" : "bg-muted/30 text-muted-foreground active:bg-muted/50"}`}>
                  {isListening ? <MicOff className="h-2.5 w-2.5" /> : <Mic className="h-2.5 w-2.5" />}
                  {isListening ? "Stop" : "Voice"}
                </button>
              )}
              <Button type="button" size="sm" onClick={() => { if (isListening) stopListening(); if (aiMeal.photoBase64) aiMeal.handlePhotoAnalyze(); else aiMeal.handleAiAnalyzeMeal(); }} disabled={aiMeal.aiAnalyzing || (!aiMeal.photoBase64 && !aiMeal.aiMealDescription.trim())} className="flex-1 h-7 rounded-md text-[13px]">
                {aiMeal.aiAnalyzing ? "Analyzing…" : <>{aiMeal.photoBase64 ? "Analyze Photo" : "Analyze"}{gemBadge}</>}
              </Button>
            </div>
            {aiMeal.aiAnalysisComplete && aiMeal.aiLineItems.length > 0 && (
              <div className="space-y-1 animate-fade-in pt-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Items</p>
                <div className="rounded-md divide-y divide-border/20 overflow-hidden bg-muted/20 max-h-40 overflow-y-auto">
                  {aiMeal.aiLineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1">
                      <div className="flex-1 min-w-0"><p className="text-[13px] font-medium truncate">{item.name}</p><p className="text-[13px] text-muted-foreground truncate">{item.quantity}</p></div>
                      <div className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums flex-shrink-0">
                        <span className="font-semibold text-foreground">{item.calories}</span><span>{Math.round(item.protein_g)}P</span><span>{Math.round(item.carbs_g)}C</span><span>{Math.round(item.fats_g)}F</span>
                      </div>
                      <button type="button" onClick={() => aiMeal.setAiLineItems((prev) => prev.filter((_, i) => i !== idx))} className="h-4 w-4 flex items-center justify-center text-muted-foreground active:text-destructive flex-shrink-0">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="text-[22px] font-black tabular-nums text-primary display-number leading-none tracking-tight">{totalAiLineItemCalories}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">kcal</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: "Protein", grams: totalAiProtein, pct: proteinPct, color: "rgb(59 130 246)", text: "text-blue-500" },
                      { label: "Carbs", grams: totalAiCarbs, pct: carbsPct, color: "rgb(249 115 22)", text: "text-orange-500" },
                      { label: "Fats", grams: totalAiFats, pct: fatsPct, color: "rgb(168 85 247)", text: "text-purple-500" },
                    ].map((m) => (
                      <div key={m.label} className="flex flex-col items-center gap-1.5 p-2">
                        <div className="relative w-20 h-20">
                          <div className="w-full h-full rounded-full" style={wheel(m.pct, m.color)} />
                          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                            <span className={`text-[17px] font-black tabular-nums tracking-tight ${m.text}`}>{Math.round(m.grams)}g</span>
                            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground mt-1">{m.pct}%</span>
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <Input value={manualMeal.meal_name} onChange={(e) => setManualMeal((prev) => ({ ...prev, meal_name: e.target.value }))} placeholder="Meal name" className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                <button onClick={aiMeal.handleSaveAiMeal} disabled={aiMeal.aiLineItems.length === 0} className="w-full py-2 text-[13px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 disabled:opacity-40">Add Meal</button>
              </div>
            )}
          </div>
        )}

        {quickAddTab === "manual" && (
          <div className="px-3 pb-3 space-y-1.5">
            <Input placeholder="Meal name *" value={manualMeal.meal_name} onChange={(e) => setManualMeal({ ...manualMeal, meal_name: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" autoFocus />
            {aiMeal.barcodeBaseMacros && (
              <div className="rounded-md bg-muted/20 p-2 space-y-1.5">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Serving</p><span className="text-[13px] text-muted-foreground">{aiMeal.barcodeBaseMacros.serving_size}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-[13px] text-muted-foreground flex-1">Amount</span>
                  <div className="flex items-center gap-0.5">
                    <Input type="number" min="1" step="1" value={Math.round(aiMeal.servingMultiplier * aiMeal.barcodeBaseMacros.serving_weight_g)}
                      onChange={(e) => { const grams = parseFloat(e.target.value); if (!isNaN(grams) && grams > 0) { const m = grams / aiMeal.barcodeBaseMacros!.serving_weight_g; handleBarcodeServingSet(Math.round(m * 10) / 10, Math.round(grams)); } }}
                      className="w-14 text-[13px] text-right h-6 rounded" /><span className="text-[13px] text-muted-foreground">g</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5"><span className="text-[13px] text-muted-foreground flex-1">Servings</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleBarcodeServingSet(Math.max(0.5, Math.round((aiMeal.servingMultiplier - 0.5) * 10) / 10))}
                      disabled={aiMeal.servingMultiplier <= 0.5} className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[13px] font-medium active:bg-muted/60 transition-colors disabled:opacity-40">−</button>
                    <span className="text-[13px] font-semibold w-6 text-center tabular-nums">{aiMeal.servingMultiplier}×</span>
                    <button type="button" onClick={() => handleBarcodeServingSet(Math.min(10, Math.round((aiMeal.servingMultiplier + 0.5) * 10) / 10))}
                      className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[13px] font-medium active:bg-muted/60 transition-colors">+</button>
                  </div>
                </div>
                <div className="flex gap-2 pt-1 border-t border-border/20 text-[13px]">
                  <span className="font-semibold text-primary">{manualMeal.calories} kcal</span><span className="text-muted-foreground">{manualMeal.protein_g}P</span><span className="text-muted-foreground">{manualMeal.carbs_g}C</span><span className="text-muted-foreground">{manualMeal.fats_g}F</span>
                </div>
              </div>
            )}
            <Input type="number" inputMode="numeric" placeholder="Calories *" value={manualMeal.calories} onChange={(e) => macroCalc.handleCalorieChange(e.target.value, setManualMeal)} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
            <div className="grid grid-cols-3 gap-1">
              <Input type="number" inputMode="decimal" step="0.1" placeholder="Protein" value={manualMeal.protein_g} onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
              <Input type="number" inputMode="decimal" step="0.1" placeholder="Carbs" value={manualMeal.carbs_g} onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
              <Input type="number" inputMode="decimal" step="0.1" placeholder="Fats" value={manualMeal.fats_g} onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Ingredients (optional)</p>
            <div className="flex gap-1">
              <Input placeholder="Ingredient" value={aiMeal.newIngredient.name} onChange={(e) => aiMeal.setNewIngredient({ ...aiMeal.newIngredient, name: e.target.value })} className="flex-1 text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
              <Input type="number" inputMode="numeric" placeholder="g" value={aiMeal.newIngredient.grams} onChange={(e) => aiMeal.setNewIngredient({ ...aiMeal.newIngredient, grams: e.target.value })} className="w-12 text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
              <Button type="button" size="sm" variant="outline" onClick={handleAddIngredient}
                disabled={aiMeal.lookingUpIngredient || !aiMeal.newIngredient.name.trim() || !aiMeal.newIngredient.grams} className="shrink-0 h-7 rounded-md border-border/30 px-1.5">
                {aiMeal.lookingUpIngredient ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
              </Button>
            </div>
            {aiMeal.ingredientLookupError && <p className="text-[13px] text-destructive">{aiMeal.ingredientLookupError}</p>}
            {manualMeal.ingredients.length > 0 && (
              <div className="rounded-md divide-y divide-border/20 overflow-hidden bg-muted/20">
                {manualMeal.ingredients.map((ingredient, idx) => {
                  const cal = ingredient.calories_per_100g !== undefined ? Math.round(ingredient.calories_per_100g * ingredient.grams / 100) : null;
                  return (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1 text-[13px]">
                      <span className="flex-1 truncate">{ingredient.name}</span><span className="text-muted-foreground shrink-0">{ingredient.grams}g</span>
                      {cal !== null && <span className="text-muted-foreground shrink-0">{cal}kcal</span>}
                      <button type="button" className="h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground active:text-destructive"
                        onClick={() => { const updated = [...manualMeal.ingredients]; updated.splice(idx, 1); setManualMeal({ ...manualMeal, ingredients: updated }); }}><X className="h-2.5 w-2.5" /></button>
                    </div>
                  );
                })}
                {manualMeal.ingredients.some((ing) => ing.calories_per_100g !== undefined) && (
                  <div className="flex justify-between px-2 py-0.5 text-[13px] text-muted-foreground bg-muted/30"><span>Total</span><span>{manualMeal.ingredients.reduce((s, i) => s + i.grams, 0)}g</span></div>
                )}
              </div>
            )}
            <button onClick={onAddManualMeal} disabled={savingAllMeals} className="w-full py-2 text-[13px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 disabled:opacity-40">
              {savingAllMeals ? "Adding…" : "Add Meal"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
