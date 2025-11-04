import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";

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
  };
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MealCard({ meal, onEdit, onDelete }: MealCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getMealTypeColor = (type?: string) => {
    switch (type) {
      case "breakfast": return "bg-orange-500/10 text-orange-600";
      case "lunch": return "bg-blue-500/10 text-blue-600";
      case "dinner": return "bg-purple-500/10 text-purple-600";
      case "snack": return "bg-green-500/10 text-green-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg">{meal.meal_name}</CardTitle>
              {meal.is_ai_generated && (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {meal.meal_type && (
                <Badge variant="outline" className={getMealTypeColor(meal.meal_type)}>
                  {meal.meal_type}
                </Badge>
              )}
              <Badge variant="secondary">{meal.calories} cal</Badge>
              {meal.protein_g && (
                <span className="text-xs text-muted-foreground">
                  P: {meal.protein_g}g
                </span>
              )}
              {meal.carbs_g && (
                <span className="text-xs text-muted-foreground">
                  C: {meal.carbs_g}g
                </span>
              )}
              {meal.fats_g && (
                <span className="text-xs text-muted-foreground">
                  F: {meal.fats_g}g
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {(meal.portion_size || meal.recipe_notes) && (
        <>
          <CardContent className="pt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full justify-between"
            >
              <span>Details</span>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {expanded && (
              <div className="mt-3 space-y-2 text-sm animate-fade-in">
                {meal.portion_size && (
                  <div>
                    <span className="font-semibold">Portion:</span> {meal.portion_size}
                  </div>
                )}
                {meal.recipe_notes && (
                  <div>
                    <span className="font-semibold">Recipe:</span>
                    <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{meal.recipe_notes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}
