import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Star } from "lucide-react";
import { useState, useRef, useEffect, memo } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion";
import { MacroDonut } from "./MacroDonut";
import { triggerHaptic, triggerHapticWarning, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface Ingredient {
  name: string;
  grams: number;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  quantity?: string;
}

interface MealCardProps {
  meal: {
    id?: string;
    meal_name: string;
    calories: number;
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
    meal_type?: string;
    portion_size?: string;
    recipe_notes?: string;
    is_ai_generated?: boolean;
    ingredients?: Ingredient[];
  };
  onEdit?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
  isFavorited?: boolean;
}

const DELETE_THRESHOLD = -80;

export const MealCard = memo(function MealCard({ meal, onEdit, onDelete, onFavorite, isFavorited }: MealCardProps) {
  const [showHint, setShowHint] = useState(() => {
    return !localStorage.getItem('wcw_swipe_hint_shown');
  });

  useEffect(() => {
    if (showHint) {
      const timer = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem('wcw_swipe_hint_shown', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showHint]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  const crossedRef = useRef(false);

  const p = meal.protein_g || 0;
  const c = meal.carbs_g || 0;
  const f = meal.fats_g || 0;

  const [isDragging, setIsDragging] = useState(false);
  const canSwipe = !!onDelete && !prefersReducedMotion;

  const handleOpenDetails = () => {
    triggerHaptic(ImpactStyle.Light);
    setDetailsOpen(true);
  };

  // Macro wheel helpers — 100%-sum via largest remainder
  const proteinCal = p * 4;
  const carbsCal = c * 4;
  const fatsCal = f * 9;
  const macroTotal = proteinCal + carbsCal + fatsCal || 1;
  const raw = [proteinCal, carbsCal, fatsCal].map((v) => (v / macroTotal) * 100);
  const floors = raw.map((v) => Math.floor(v));
  let rem = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (let k = 0; k < order.length && rem > 0; k++, rem--) pcts[order[k].i] += 1;
  const [pPct, cPct, fPct] = pcts;
  const wheelMask = "radial-gradient(farthest-side, transparent calc(100% - 7px), #fff calc(100% - 7px))";
  const wheelStyle = (pct: number, cssColor: string): React.CSSProperties => ({
    background: `conic-gradient(${cssColor} ${pct * 3.6}deg, hsl(var(--muted) / 0.3) ${pct * 3.6}deg)`,
    mask: wheelMask,
    WebkitMask: wheelMask,
  });

  return (
    <div className="relative mb-1 overflow-hidden rounded-2xl">
      {/* Delete background (only visible while dragging) */}
      {canSwipe && isDragging && (
        <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 rounded-2xl px-5">
          <Trash2 className="h-4 w-4 text-destructive-foreground" />
        </div>
      )}

      {/* Draggable foreground card */}
      <motion.div
        className="relative rounded-2xl"
        style={{ x: canSwipe ? dragX : undefined }}
        drag={canSwipe ? "x" : false}
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.1}
        dragSnapToOrigin
        onDragStart={() => {
          crossedRef.current = false;
          setIsDragging(true);
        }}
        onDrag={() => {
          if (!crossedRef.current && dragX.get() < DELETE_THRESHOLD) {
            crossedRef.current = true;
          }
          if (crossedRef.current && dragX.get() > DELETE_THRESHOLD) {
            crossedRef.current = false;
          }
        }}
        onDragEnd={() => {
          setIsDragging(false);
          if (dragX.get() < DELETE_THRESHOLD) {
            onDelete?.();
          }
        }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
        transition={springs.snappy}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer"
          onClick={handleOpenDetails}
          role="button"
          aria-label={`Open details for ${meal.meal_name || "meal"}`}
        >
          {/* Mini donut */}
          <MacroDonut protein={p} carbs={c} fat={f} calories={meal.calories} size={30} />

          {/* Name + colored macro labels */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold leading-tight text-foreground truncate">{meal.meal_name || "Untitled"}</span>
            </div>
            {(p > 0 || c > 0 || f > 0) && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-blue-500" /><span className="text-[9px] tabular-nums font-medium text-muted-foreground">{Math.round(p)}g</span></div>
                <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-orange-500" /><span className="text-[9px] tabular-nums font-medium text-muted-foreground">{Math.round(c)}g</span></div>
                <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-purple-500" /><span className="text-[9px] tabular-nums font-medium text-muted-foreground">{Math.round(f)}g</span></div>
              </div>
            )}
          </div>

          {/* Calorie badge */}
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground flex-shrink-0">{meal.calories}</span>

          {/* Favorite star */}
          {onFavorite && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerHapticSelection(); onFavorite(); }}
              className="h-6 w-6 flex-shrink-0 flex items-center justify-center"
              aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`h-3 w-3 transition-colors ${isFavorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
            </button>
          )}

        </div>
      </motion.div>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-[340px] p-0 overflow-hidden rounded-2xl">
          <VisuallyHidden><DialogTitle>{meal.meal_name || "Meal details"}</DialogTitle></VisuallyHidden>
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="pr-8">
              <p className="text-[15px] font-semibold leading-tight text-foreground break-words">{meal.meal_name || "Untitled"}</p>
              {meal.meal_type && (
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-0.5 font-semibold">{meal.meal_type}</p>
              )}
            </div>

            {/* Calories */}
            <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-[22px] font-black tabular-nums text-primary display-number leading-none tracking-tight">{meal.calories}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">kcal</div>
            </div>

            {/* Macro wheels */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Protein", grams: p, pct: pPct, color: "rgb(59 130 246)", text: "text-blue-500" },
                { label: "Carbs", grams: c, pct: cPct, color: "rgb(249 115 22)", text: "text-orange-500" },
                { label: "Fats", grams: f, pct: fPct, color: "rgb(168 85 247)", text: "text-purple-500" },
              ].map((m) => (
                <div key={m.label} className="flex flex-col items-center gap-1 p-2">
                  <div className="relative w-16 h-16">
                    <div className="w-full h-full rounded-full" style={wheelStyle(m.pct, m.color)} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                      <span className={`text-[14px] font-black tabular-nums tracking-tight ${m.text}`}>{Math.round(m.grams)}g</span>
                      <span className="text-[9px] font-semibold tabular-nums text-muted-foreground mt-0.5">{m.pct}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Serving / portion */}
            {meal.portion_size && (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Serving</p>
                <p className="text-[13px] text-foreground/90 leading-snug mt-0.5">{meal.portion_size}</p>
              </div>
            )}

            {/* Ingredients */}
            {meal.ingredients && meal.ingredients.length > 0 && (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Ingredients</p>
                <div className="divide-y divide-border/20">
                  {meal.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 py-1 text-[12px]">
                      <span className="flex-1 min-w-0 text-foreground/90">
                        {ing.quantity ? `${ing.quantity} ` : ""}{ing.name}
                      </span>
                      <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                        {ing.calories != null
                          ? <>{ing.calories} · P{Math.round(ing.protein_g || 0)} C{Math.round(ing.carbs_g || 0)} F{Math.round(ing.fats_g || 0)}</>
                          : <>{ing.grams}g</>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recipe notes */}
            {meal.recipe_notes && (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Notes</p>
                <p className="text-[12px] text-foreground/90 leading-snug whitespace-pre-wrap mt-0.5">{meal.recipe_notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {(onEdit || onDelete) && (
            <div className="flex border-t border-border/40">
              {onEdit && (
                <button
                  onClick={() => { setDetailsOpen(false); onEdit(); }}
                  className="flex-1 py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {onEdit && onDelete && <div className="w-px bg-border/40" />}
              {onDelete && (
                <button
                  onClick={() => { setDetailsOpen(false); onDelete(); }}
                  className="flex-1 py-2.5 text-[14px] font-semibold text-destructive active:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {showHint && (
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1 animate-[fadeSlideUp_0.3s_ease-out_both]">
          ← Swipe to edit or delete
        </p>
      )}
    </div>
  );
});
