import { useCallback, useMemo } from "react";
import { Plus, Copy, X, ChevronRight } from "lucide-react";
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

const MUSCLE_BORDER_COLORS: Record<string, string> = {
  chest: "border-l-red-400",
  back: "border-l-blue-400",
  shoulders: "border-l-purple-400",
  biceps: "border-l-pink-400",
  triceps: "border-l-orange-400",
  quads: "border-l-green-400",
  hamstrings: "border-l-emerald-400",
  glutes: "border-l-lime-400",
  calves: "border-l-teal-400",
  abs: "border-l-yellow-400",
  forearms: "border-l-cyan-400",
  traps: "border-l-indigo-400",
  full_body: "border-l-violet-400",
  cardio: "border-l-rose-400",
};

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-red-500/10 text-red-400",
  back: "bg-blue-500/10 text-blue-400",
  shoulders: "bg-purple-500/10 text-purple-400",
  biceps: "bg-pink-500/10 text-pink-400",
  triceps: "bg-orange-500/10 text-orange-400",
  quads: "bg-green-500/10 text-green-400",
  hamstrings: "bg-emerald-500/10 text-emerald-400",
  glutes: "bg-lime-500/10 text-lime-400",
  calves: "bg-teal-500/10 text-teal-400",
  abs: "bg-yellow-500/10 text-yellow-400",
  forearms: "bg-cyan-500/10 text-cyan-400",
  traps: "bg-indigo-500/10 text-indigo-400",
  full_body: "bg-violet-500/10 text-violet-400",
  cardio: "bg-rose-500/10 text-rose-400",
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
  const borderColor = MUSCLE_BORDER_COLORS[group.exercise.muscle_group] || "border-l-muted-foreground";

  return (
    <motion.div
      variants={staggerItem}
      className={`glass-card rounded-2xl border border-border/50 border-l-[3px] ${borderColor} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <button
          onClick={() => onExerciseTap?.(group.exercise.id)}
          className="flex items-center gap-2 min-w-0 group"
        >
          <h3 className="font-bold text-[15px] tracking-tight truncate">{group.exercise.name}</h3>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${muscleColor}`}>
            {group.exercise.muscle_group.replace("_", " ")}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors" />
        </button>
        <button
          onClick={() => onRemoveExercise(group.exerciseOrder)}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Remove exercise"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Column headers */}
      {group.sets.length > 0 && (
        <div className="flex items-center gap-2 px-3 pb-1.5 text-[11px] text-muted-foreground/70 uppercase tracking-wider border-b border-border/20 mx-3 mb-1">
          <div className="w-8 text-center">Set</div>
          <div className="flex-1 text-center">Weight</div>
          <div className="flex-1 text-center">Reps</div>
          <div className="w-8" />
          <div className="w-8" />
        </div>
      )}

      {/* Sets */}
      <div className="divide-y divide-border/10">
        {group.sets.map((set, i) => {
          const setIndex = set.is_warmup ? i : workingSets.indexOf(set);
          const prTypesForSet: PRType[] = [];
          if (newPRSetIds?.has(set.id)) {
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
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 p-3 pt-2">
        <button
          onClick={handleAddSet}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 active:scale-95 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Set
        </button>
        {group.sets.length > 0 && (
          <button
            onClick={() => onDuplicateLastSet(group.exerciseOrder)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border/30 hover:bg-muted active:scale-95 transition-all"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
        )}
      </div>
    </motion.div>
  );
}
