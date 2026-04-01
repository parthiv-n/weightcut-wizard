import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Plus, Clock, Dumbbell, Trash2, TrendingUp, Check } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem, springs } from "@/lib/motion";
import { ExerciseBlock } from "./ExerciseBlock";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { formatVolume } from "@/lib/gymCalculations";
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

  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  return (
    <div className="display-number text-4xl tracking-tight">
      {hrs > 0 && <>{hrs}:</>}
      {hrs > 0 ? mins.toString().padStart(2, "0") : mins}:{secs.toString().padStart(2, "0")}
    </div>
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

  const totalVolume = useMemo(() => {
    let vol = 0;
    for (const group of workout.exerciseGroups) {
      for (const set of group.sets) {
        if (!set.is_warmup && set.weight_kg && set.reps) {
          vol += set.weight_kg * set.reps;
        }
      }
    }
    return vol;
  }, [workout.exerciseGroups]);

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
      {/* Live session header card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springs.responsive}
        className="glass-card rounded-2xl border border-border/50 p-5 relative overflow-hidden"
      >
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

        <div className="relative space-y-4">
          {/* Top row: badge + discard */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                {workout.sessionType}
              </span>
            </div>
            <button
              onClick={() => setDiscardDialogOpen(true)}
              className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Discard workout"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Centered timer */}
          <div className="text-center py-2">
            <ElapsedTimer startedAt={workout.startedAt} />
            <p className="text-xs text-muted-foreground mt-1">Elapsed Time</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-muted/30 p-2.5 text-center">
              <Dumbbell className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
              <div className="display-number text-sm">{workout.exerciseGroups.length}</div>
              <div className="text-[10px] text-muted-foreground">Exercises</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-2.5 text-center">
              <TrendingUp className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
              <div className="display-number text-sm">{totalSets}</div>
              <div className="text-[10px] text-muted-foreground">Working Sets</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-2.5 text-center">
              <Clock className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
              <div className="display-number text-sm">{formatVolume(totalVolume)}<span className="text-[10px] text-muted-foreground font-normal"> kg</span></div>
              <div className="text-[10px] text-muted-foreground">Volume</div>
            </div>
          </div>
        </div>
      </motion.div>

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
        <button
          onClick={onOpenExercisePicker}
          className="w-full h-14 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center gap-2.5 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] transition-all"
        >
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          Add Exercise
        </button>
      </motion.div>

      {/* Finish button */}
      {totalSets > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.responsive}
        >
          <button
            onClick={() => setFinishSheetOpen(true)}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
          >
            <Check className="h-4.5 w-4.5" />
            Finish Workout
          </button>
        </motion.div>
      )}

      {/* Finish workout dialog */}
      <Dialog open={finishSheetOpen} onOpenChange={setFinishSheetOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-xl bg-muted/30 p-4 space-y-2">
              <label className="text-sm font-medium block">Duration (minutes)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Auto-calculated"
                value={durationOverride}
                onChange={(e) => setDurationOverride(e.target.value)}
                className="h-11 bg-background/50"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use elapsed time ({Math.round((Date.now() - workout.startedAt) / 60000)} min)
              </p>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 space-y-2">
              <label className="text-sm font-medium block">
                Perceived Fatigue: <span className="text-primary">{fatigue[0]}/10</span>
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

            <div className="rounded-xl bg-muted/30 p-4 space-y-2">
              <label className="text-sm font-medium block">Notes</label>
              <Textarea
                placeholder="How did the workout feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px] resize-none bg-background/50"
              />
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-2"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
            >
              <Check className="h-4 w-4" />
              Complete Workout
            </button>
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
