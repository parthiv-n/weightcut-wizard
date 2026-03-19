import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Plus, Square, Clock, Dumbbell, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem, springs } from "@/lib/motion";
import { ExerciseBlock } from "./ExerciseBlock";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import type { ActiveWorkout, Exercise, ExercisePR, GymSet } from "@/pages/gym/types";

interface ActiveSessionViewProps {
  workout: ActiveWorkout;
  exercises: Exercise[];
  prs: Map<string, ExercisePR>;
  newPRSetIds: Set<string>;
  onOpenExercisePicker: () => void;
  onAddSet: (exerciseOrder: number, data: { weight_kg?: number | null; reps: number; rpe?: number | null; is_warmup?: boolean; is_bodyweight?: boolean }) => void;
  onUpdateSet: (setId: string, exerciseOrder: number, updates: Partial<{ weight_kg: number | null; reps: number; rpe: number | null; is_warmup: boolean }>) => void;
  onDeleteSet: (setId: string, exerciseOrder: number) => void;
  onDuplicateLastSet: (exerciseOrder: number) => void;
  onRemoveExercise: (exerciseOrder: number) => void;
  onFinish: (opts: { durationMinutes?: number; notes?: string; perceivedFatigue?: number }) => void;
  onDiscard: () => void;
  onExerciseTap?: (exerciseId: string) => void;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="tabular-nums font-mono text-sm text-muted-foreground">
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export function ActiveSessionView({
  workout, exercises, prs, newPRSetIds,
  onOpenExercisePicker, onAddSet, onUpdateSet, onDeleteSet,
  onDuplicateLastSet, onRemoveExercise, onFinish, onDiscard, onExerciseTap,
}: ActiveSessionViewProps) {
  const [finishSheetOpen, setFinishSheetOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [fatigue, setFatigue] = useState([5]);
  const [durationOverride, setDurationOverride] = useState("");

  const totalSets = workout.exerciseGroups.reduce((sum, g) => sum + g.sets.filter(s => !s.is_warmup).length, 0);

  const handleFinish = useCallback(() => {
    const dur = durationOverride ? parseInt(durationOverride, 10) : undefined;
    onFinish({
      durationMinutes: dur && !isNaN(dur) ? dur : undefined,
      notes: notes || undefined,
      perceivedFatigue: fatigue[0],
    });
    setFinishSheetOpen(false);
  }, [durationOverride, notes, fatigue, onFinish]);

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
            {workout.sessionType}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <ElapsedTimer startedAt={workout.startedAt} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDiscardDialogOpen(true)}
            className="text-destructive hover:text-destructive h-8 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => setFinishSheetOpen(true)}
            className="h-8 text-xs gap-1"
            disabled={totalSets === 0}
          >
            <Square className="h-3 w-3" />
            Finish
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{workout.exerciseGroups.length} exercises</span>
        <span>{totalSets} working sets</span>
      </div>

      {/* Exercise blocks */}
      <motion.div
        variants={staggerContainer(60)}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {workout.exerciseGroups.map(group => (
          <ExerciseBlock
            key={`${group.exerciseOrder}-${group.exercise.id}`}
            group={group}
            pr={prs.get(group.exercise.id)}
            newPRSetIds={newPRSetIds}
            onAddSet={onAddSet}
            onUpdateSet={onUpdateSet}
            onDeleteSet={onDeleteSet}
            onDuplicateLastSet={onDuplicateLastSet}
            onRemoveExercise={onRemoveExercise}
            onExerciseTap={onExerciseTap}
          />
        ))}
      </motion.div>

      {/* Add exercise button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springs.gentle}
      >
        <Button
          variant="outline"
          onClick={onOpenExercisePicker}
          className="w-full h-12 gap-2 border-dashed border-2"
        >
          <Plus className="h-5 w-5" />
          Add Exercise
        </Button>
      </motion.div>

      {/* Finish workout dialog */}
      <Dialog open={finishSheetOpen} onOpenChange={setFinishSheetOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Duration (minutes)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Auto-calculated"
                value={durationOverride}
                onChange={(e) => setDurationOverride(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use elapsed time ({Math.round((Date.now() - workout.startedAt) / 60000)} min)
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Perceived Fatigue: {fatigue[0]}/10
              </label>
              <Slider
                value={fatigue}
                onValueChange={setFatigue}
                min={1}
                max={10}
                step={1}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Fresh</span>
                <span>Destroyed</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes</label>
              <Textarea
                placeholder="How did the workout feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </div>

            <Button onClick={handleFinish} className="w-full h-11">
              Complete Workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      <DeleteConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onConfirm={onDiscard}
        title="Discard Workout"
        description="This will permanently delete this workout session and all logged sets."
      />
    </div>
  );
}
