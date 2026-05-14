import { Edit2, Trash2, Star, Flame, Zap, Wheat, Droplet } from "lucide-react";
import { useState, useRef, useEffect, memo } from "react";
import { coerceMealName } from "@/lib/mealName";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion";
import { MacroDonut } from "./MacroDonut";
import { triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
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
    created_at?: string;
    photo_url?: string | null;
  };
  onEdit?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
  isFavorited?: boolean;
}

function formatMealTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
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

  const mealTypeLabel = meal.meal_type ? meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1).toLowerCase() : null;
  const timeLabel = formatMealTime(meal.created_at);

  return (
    <div className="relative overflow-hidden rounded-3xl">
      {/* Delete background (only visible while dragging) */}
      {canSwipe && isDragging && (
        <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 rounded-3xl px-6">
          <Trash2 className="h-5 w-5 text-destructive-foreground" />
        </div>
      )}

      {/* Draggable foreground card — standalone, no parent wrapper */}
      <motion.div
        className="relative rounded-3xl card-surface"
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
        whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
        transition={springs.snappy}
      >
        <div
          className="flex items-stretch gap-3.5 p-3 cursor-pointer"
          onClick={handleOpenDetails}
          role="button"
          aria-label={`Open details for ${coerceMealName(meal.meal_name, meal.meal_type)}`}
        >
          {/* Photo slot — when the meal has an AI-scanner photo, render the
              actual image; otherwise fall back to the macro donut. */}
          <div className="flex-shrink-0 w-[78px] h-[78px] rounded-2xl bg-muted/40 flex items-center justify-center overflow-hidden">
            {meal.photo_url ? (
              <img
                src={meal.photo_url}
                alt={coerceMealName(meal.meal_name, meal.meal_type)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <MacroDonut protein={p} carbs={c} fat={f} calories={meal.calories} size={64} />
            )}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            {/* Name + time */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-semibold leading-snug text-foreground line-clamp-1">
                  {coerceMealName(meal.meal_name, meal.meal_type)}
                </span>
                {mealTypeLabel && (
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60 mt-0.5">
                    {mealTypeLabel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onFavorite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerHapticSelection(); onFavorite(); }}
                    className="h-6 w-6 flex items-center justify-center rounded-full"
                    aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`h-4 w-4 transition-colors ${isFavorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                  </button>
                )}
                {timeLabel && (
                  <span className="text-[11px] font-medium text-muted-foreground/70 tabular-nums whitespace-nowrap bg-muted/50 px-2 py-0.5 rounded-full">
                    {timeLabel}
                  </span>
                )}
              </div>
            </div>

            {/* kcal */}
            <div className="flex items-center gap-1.5 mt-1">
              <Flame className="h-3.5 w-3.5 text-orange-500" strokeWidth={2.4} />
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {meal.calories}
                <span className="text-[11px] font-medium text-muted-foreground/70 ml-0.5">kcal</span>
              </span>
            </div>

            {/* Macro chips with iconography (Cal-AI style) */}
            {(p > 0 || c > 0 || f > 0) && (
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-blue-500" strokeWidth={2.4} fill="currentColor" />
                  <span className="text-[11px] tabular-nums font-semibold text-foreground/85">{Math.round(p)}g</span>
                </div>
                <div className="flex items-center gap-1">
                  <Wheat className="h-3 w-3 text-orange-500" strokeWidth={2.2} />
                  <span className="text-[11px] tabular-nums font-semibold text-foreground/85">{Math.round(c)}g</span>
                </div>
                <div className="flex items-center gap-1">
                  <Droplet className="h-3 w-3 text-purple-500" strokeWidth={2.4} fill="currentColor" />
                  <span className="text-[11px] tabular-nums font-semibold text-foreground/85">{Math.round(f)}g</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </motion.div>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-[340px] p-0 overflow-hidden rounded-2xl">
          <VisuallyHidden><DialogTitle>{coerceMealName(meal.meal_name, meal.meal_type)}</DialogTitle></VisuallyHidden>
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="pr-8">
              <p className="text-[15px] font-semibold leading-tight text-foreground break-words">{coerceMealName(meal.meal_name, meal.meal_type)}</p>
              {meal.meal_type && (
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-0.5 font-semibold">{meal.meal_type}</p>
              )}
            </div>

            {/* Calories */}
            <div className="text-center py-1">
              <div className="text-[28px] font-bold tabular-nums text-foreground leading-none tracking-tight">{meal.calories}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-1">kcal</div>
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
