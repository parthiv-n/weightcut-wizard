import { Button } from "@/components/ui/button";
import { Edit2, Trash2, ChevronDown, Sparkles } from "lucide-react";
import { useState, useRef, memo } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion";
import { MacroDonut } from "./MacroDonut";
import { triggerHaptic, triggerHapticWarning, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

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
}

const DELETE_THRESHOLD = -80;

export const MealCard = memo(function MealCard({ meal, onEdit, onDelete }: MealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(meal.ingredients?.length || meal.portion_size || meal.recipe_notes);
  const prefersReducedMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  const crossedRef = useRef(false);

  const p = meal.protein_g || 0;
  const c = meal.carbs_g || 0;
  const f = meal.fats_g || 0;

  const [isDragging, setIsDragging] = useState(false);
  const canSwipe = !!onDelete && !prefersReducedMotion;

  const handleToggle = () => {
    if (hasDetails) {
      triggerHaptic(ImpactStyle.Light);
      setExpanded(prev => !prev);
    }
  };

  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl">
      {/* Delete background (only visible while dragging) */}
      {canSwipe && isDragging && (
        <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 rounded-2xl px-6">
          <Trash2 className="h-5 w-5 text-destructive-foreground" />
        </div>
      )}

      {/* Draggable foreground card */}
      <motion.div
        className="glass-card relative"
        style={{ x: canSwipe ? dragX : undefined }}
        drag={canSwipe ? "x" : false}
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.1}
        dragSnapToOrigin
        onDragStart={() => {
          crossedRef.current = false;
          setIsDragging(true);
          triggerHapticSelection();
        }}
        onDrag={() => {
          if (!crossedRef.current && dragX.get() < DELETE_THRESHOLD) {
            crossedRef.current = true;
            triggerHapticWarning();
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
          className="flex items-center gap-3 p-3 cursor-pointer"
          onClick={handleToggle}
          role={hasDetails ? "button" : undefined}
          aria-expanded={hasDetails ? expanded : undefined}
        >
          {/* Mini donut */}
          <MacroDonut protein={p} carbs={c} fat={f} calories={meal.calories} size={40} />

          {/* Name + colored macro labels */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5">
              <span className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2">{meal.meal_name}</span>
              {meal.is_ai_generated && (
                <Sparkles className="h-3 w-3 text-primary flex-shrink-0 drop-shadow-md" />
              )}
            </div>
            {(p > 0 || c > 0 || f > 0) && (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="text-[10px] tabular-nums font-medium">{Math.round(p)}g P</span></div>
                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span className="text-[10px] tabular-nums font-medium">{Math.round(c)}g C</span></div>
                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /><span className="text-[10px] tabular-nums font-medium">{Math.round(f)}g F</span></div>
              </div>
            )}
          </div>

          {/* Expand chevron */}
          {hasDetails && (
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-shrink-0 text-muted-foreground"
              aria-label={expanded ? "Collapse meal details" : "Expand meal details"}
              onClick={(e) => { e.stopPropagation(); handleToggle(); }}
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>

        {/* Expanded details */}
        {hasDetails && (
          <div className="disclosure-panel" data-expanded={expanded} aria-hidden={!expanded}>
            <div className="disclosure-inner">
              <div className="px-3 pb-3 pt-2 space-y-2 border-t border-border/20 bg-black/10">
                {meal.ingredients && meal.ingredients.length > 0 && (
                  <div className="space-y-1">
                    {meal.ingredients.map((ingredient, idx) =>
                      ingredient.calories != null ? (
                        <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex-1 min-w-0 truncate">
                            {ingredient.quantity ? `${ingredient.quantity} ` : ""}{ingredient.name}
                          </span>
                          <span className="flex-shrink-0 ml-2 tabular-nums">
                            {ingredient.calories} · P{Math.round(ingredient.protein_g || 0)}  C{Math.round(ingredient.carbs_g || 0)}  F{Math.round(ingredient.fats_g || 0)}
                          </span>
                        </div>
                      ) : (
                        <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                          <span>{ingredient.name}</span>
                          <span>{ingredient.grams}g</span>
                        </div>
                      )
                    )}
                  </div>
                )}
                {meal.portion_size && !meal.ingredients?.length && (
                  <p className="text-xs text-muted-foreground">Portion: {meal.portion_size}</p>
                )}
                {meal.recipe_notes && !meal.ingredients?.some(i => i.calories != null) && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{meal.recipe_notes}</p>
                )}
                {(onEdit || onDelete) && (
                  <div className="flex gap-1 pt-1">
                    {onEdit && (
                      <Button variant="ghost" size="sm" onClick={onEdit} className="h-9 px-3 text-xs gap-1">
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDelete}
                        className="h-9 px-3 text-xs gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
});
