import { Button } from "@/components/ui/button";
import { Edit2, Trash2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";

interface Ingredient {
  name: string;
  grams: number;
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

export function MealCard({ meal, onEdit, onDelete }: MealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(meal.ingredients?.length || meal.portion_size || meal.recipe_notes);

  const getMealTypeDotColor = (type?: string) => {
    switch (type) {
      case "breakfast": return "bg-orange-500";
      case "lunch": return "bg-blue-500";
      case "dinner": return "bg-purple-500";
      case "snack": return "bg-green-500";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Main row */}
      <div className="flex items-center gap-3 py-3 border-b border-border/30">
        {/* Meal type dot */}
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getMealTypeDotColor(meal.meal_type)}`} />

        {/* Name + macros */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{meal.meal_name}</span>
            {meal.is_ai_generated && (
              <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>
          {(meal.protein_g || meal.carbs_g || meal.fats_g) && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-none">
              {[
                meal.protein_g ? `P ${Math.round(meal.protein_g)}g` : null,
                meal.carbs_g ? `C ${Math.round(meal.carbs_g)}g` : null,
                meal.fats_g ? `F ${Math.round(meal.fats_g)}g` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {/* Calories */}
        <span className="text-sm font-semibold text-primary flex-shrink-0">
          {meal.calories} kcal
        </span>

        {/* Expand chevron (when details exist) or inline delete (no details) */}
        {hasDetails ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        ) : onDelete ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="pl-4 pb-3 pt-2 space-y-2 animate-fade-in border-b border-border/20">
          {meal.ingredients && meal.ingredients.length > 0 && (
            <div className="space-y-1">
              {meal.ingredients.map((ingredient, idx) => (
                <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                  <span>{ingredient.name}</span>
                  <span>{ingredient.grams}g</span>
                </div>
              ))}
            </div>
          )}
          {meal.portion_size && !meal.ingredients?.length && (
            <p className="text-xs text-muted-foreground">Portion: {meal.portion_size}</p>
          )}
          {meal.recipe_notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{meal.recipe_notes}</p>
          )}
          {(onEdit || onDelete) && (
            <div className="flex gap-1 pt-1">
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 text-xs gap-1">
                  <Edit2 className="h-3 w-3" />
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
