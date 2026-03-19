import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Copy, X } from "lucide-react";
import { motion } from "motion/react";
import { staggerItem } from "@/lib/motion";
import { SetRow } from "./SetRow";
import type { ExerciseGroup, PRType } from "@/pages/gym/types";
import type { ExercisePR } from "@/pages/gym/types";

interface ExerciseBlockProps {
  group: ExerciseGroup;
  pr?: ExercisePR | null;
  newPRSetIds?: Set<string>;
  onAddSet: (exerciseOrder: number, data: { weight_kg?: number | null; reps: number; rpe?: number | null; is_warmup?: boolean; is_bodyweight?: boolean }) => void;
  onUpdateSet: (setId: string, exerciseOrder: number, updates: Partial<{ weight_kg: number | null; reps: number; rpe: number | null; is_warmup: boolean }>) => void;
  onDeleteSet: (setId: string, exerciseOrder: number) => void;
  onDuplicateLastSet: (exerciseOrder: number) => void;
  onRemoveExercise: (exerciseOrder: number) => void;
  onExerciseTap?: (exerciseId: string) => void;
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-red-500/15 text-red-400",
  back: "bg-blue-500/15 text-blue-400",
  shoulders: "bg-purple-500/15 text-purple-400",
  biceps: "bg-pink-500/15 text-pink-400",
  triceps: "bg-orange-500/15 text-orange-400",
  quads: "bg-green-500/15 text-green-400",
  hamstrings: "bg-emerald-500/15 text-emerald-400",
  glutes: "bg-lime-500/15 text-lime-400",
  calves: "bg-teal-500/15 text-teal-400",
  abs: "bg-yellow-500/15 text-yellow-400",
  forearms: "bg-cyan-500/15 text-cyan-400",
  traps: "bg-indigo-500/15 text-indigo-400",
  full_body: "bg-violet-500/15 text-violet-400",
  cardio: "bg-rose-500/15 text-rose-400",
};

export function ExerciseBlock({
  group, pr, newPRSetIds, onAddSet, onUpdateSet, onDeleteSet,
  onDuplicateLastSet, onRemoveExercise, onExerciseTap,
}: ExerciseBlockProps) {
  const workingSets = useMemo(
    () => group.sets.filter(s => !s.is_warmup),
    [group.sets]
  );

  const handleAddSet = useCallback(() => {
    const lastSet = group.sets[group.sets.length - 1];
    onAddSet(group.exerciseOrder, {
      weight_kg: lastSet?.weight_kg ?? null,
      reps: lastSet?.reps ?? 10,
      is_bodyweight: group.exercise.is_bodyweight,
    });
  }, [group, onAddSet]);

  const handleUpdate = useCallback((setId: string, updates: any) => {
    onUpdateSet(setId, group.exerciseOrder, updates);
  }, [group.exerciseOrder, onUpdateSet]);

  const handleDelete = useCallback((setId: string) => {
    onDeleteSet(setId, group.exerciseOrder);
  }, [group.exerciseOrder, onDeleteSet]);

  const muscleColor = MUSCLE_COLORS[group.exercise.muscle_group] || "bg-muted text-muted-foreground";

  return (
    <motion.div variants={staggerItem} className="glass-card rounded-2xl border border-border/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onExerciseTap?.(group.exercise.id)}
          className="flex items-center gap-2 min-w-0"
        >
          <h3 className="font-semibold text-sm truncate">{group.exercise.name}</h3>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${muscleColor}`}>
            {group.exercise.muscle_group.replace("_", " ")}
          </span>
        </button>
        <button
          onClick={() => onRemoveExercise(group.exerciseOrder)}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove exercise"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Column headers */}
      {group.sets.length > 0 && (
        <div className="flex items-center gap-2 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">
          <div className="w-7 text-center">Set</div>
          <div className="w-[72px] text-center">Weight</div>
          <div className="w-[60px] text-center">Reps</div>
          <div className="w-[28px]" />
          <div className="flex-1" />
        </div>
      )}

      {/* Sets */}
      {group.sets.map((set, i) => {
        const setIndex = set.is_warmup ? i : workingSets.indexOf(set);
        const prTypesForSet: PRType[] = [];
        if (newPRSetIds?.has(set.id)) {
          // Show all PR types for this set — simplified for inline badge
          if (pr && set.weight_kg && set.weight_kg >= (pr.max_weight_kg ?? 0)) prTypesForSet.push("weight");
          if (pr && set.reps >= (pr.max_reps ?? 0)) prTypesForSet.push("reps");
        }

        return (
          <SetRow
            key={set.id}
            set={set}
            index={setIndex}
            prTypes={prTypesForSet}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        );
      })}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddSet}
          className="h-8 text-xs gap-1 text-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Set
        </Button>
        {group.sets.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicateLastSet(group.exerciseOrder)}
            className="h-8 text-xs gap-1 text-muted-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
        )}
      </div>
    </motion.div>
  );
}
