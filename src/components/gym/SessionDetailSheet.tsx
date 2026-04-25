import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Dumbbell, TrendingUp, Brain, Trash2, Pencil, Check } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { formatWeight, formatVolume } from "@/lib/gymCalculations";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import type { GymSet, SessionWithSets } from "@/pages/gym/types";

interface SessionDetailSheetProps {
  session: SessionWithSets | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (sessionId: string) => void;
  onUpdateSet?: (setId: string, updates: Partial<{ weight_kg: number | null; reps: number; is_warmup: boolean }>) => Promise<void>;
  onDeleteSet?: (setId: string) => Promise<void>;
}

interface EditableSetRowProps {
  set: GymSet;
  label: string;
  onUpdateSet: (setId: string, updates: Partial<{ weight_kg: number | null; reps: number }>) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
}

function EditableSetRow({ set, label, onUpdateSet, onDeleteSet }: EditableSetRowProps) {
  const [weightStr, setWeightStr] = useState(set.weight_kg?.toString() ?? "");
  const [repsStr, setRepsStr] = useState(set.reps.toString());

  const handleWeightBlur = useCallback(() => {
    const val = weightStr === "" ? null : parseFloat(weightStr);
    if (val !== set.weight_kg) {
      onUpdateSet(set.id, { weight_kg: val !== null && !isNaN(val) ? val : null });
    }
  }, [weightStr, set.id, set.weight_kg, onUpdateSet]);

  const handleRepsBlur = useCallback(() => {
    const val = parseInt(repsStr, 10);
    if (!isNaN(val) && val > 0 && val !== set.reps) {
      onUpdateSet(set.id, { reps: val });
    }
  }, [repsStr, set.id, set.reps, onUpdateSet]);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${set.is_warmup ? "opacity-60" : ""}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        set.is_warmup ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary"
      }`}>
        {label}
      </span>
      <Input
        type="number"
        inputMode="decimal"
        placeholder={set.is_bodyweight ? "BW" : "kg"}
        value={weightStr}
        onChange={(e) => setWeightStr(e.target.value)}
        onBlur={handleWeightBlur}
        disabled={set.is_bodyweight}
        className="h-9 w-[72px] text-center text-sm font-medium tabular-nums bg-background/50 border-border/40"
      />
      <span className="text-muted-foreground text-xs">×</span>
      <Input
        type="number"
        inputMode="numeric"
        placeholder="reps"
        value={repsStr}
        onChange={(e) => setRepsStr(e.target.value)}
        onBlur={handleRepsBlur}
        className="h-9 w-[72px] text-center text-sm font-medium tabular-nums bg-background/50 border-border/40"
      />
      <button
        onClick={() => onDeleteSet(set.id)}
        className="ml-auto shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/40 active:text-destructive active:bg-destructive/10 transition-all"
        aria-label="Delete set"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SessionDetailSheet({ session, open, onOpenChange, onDelete, onUpdateSet, onDeleteSet }: SessionDetailSheetProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const canEdit = Boolean(onUpdateSet && onDeleteSet);

  if (!session) return null;

  // Reset edit mode when sheet closes
  const handleOpenChange = (next: boolean) => {
    if (!next) setEditMode(false);
    onOpenChange(next);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}>
          <SheetHeader className="pb-1">
            <SheetTitle className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-primary/12 text-primary text-xs font-semibold">
                {session.session_type}
              </span>
              <span className="text-sm text-muted-foreground font-normal">
                {new Date(session.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </SheetTitle>
          </SheetHeader>

          <motion.div
            variants={staggerContainer(50)}
            initial="hidden"
            animate="visible"
          >
            {/* Stats */}
            {(() => {
              const hasDuration = session.duration_minutes != null && session.duration_minutes > 0;
              const hasFatigue = session.perceived_fatigue != null && session.perceived_fatigue > 0;
              const count = 2 + (hasDuration ? 1 : 0) + (hasFatigue ? 1 : 0);
              const cols = count <= 2 ? "grid-cols-2" : count === 3 ? "grid-cols-3" : "grid-cols-2";
              return (
                <motion.div variants={staggerItem} className={`grid ${cols} gap-2 mt-4 mb-5`}>
                  {hasDuration && (
                    <div className="card-surface rounded-2xl border border-border text-center p-3">
                      <Clock className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                      <div className="display-number text-base">{session.duration_minutes}<span className="text-xs text-muted-foreground font-normal">m</span></div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Duration</div>
                    </div>
                  )}
                  <div className="card-surface rounded-2xl border border-border text-center p-3">
                    <Dumbbell className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                    <div className="display-number text-base">{session.exerciseCount}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Exercises</div>
                  </div>
                  <div className="card-surface rounded-2xl border border-border text-center p-3">
                    <TrendingUp className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                    <div className="display-number text-base">{formatVolume(session.totalVolume)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Volume</div>
                  </div>
                  {hasFatigue && (
                    <div className="card-surface rounded-2xl border border-border text-center p-3">
                      <Brain className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                      <div className="display-number text-base">{session.perceived_fatigue}<span className="text-xs text-muted-foreground font-normal">/10</span></div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Fatigue</div>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* Notes */}
            {session.notes && (
              <motion.div variants={staggerItem} className="mb-5 card-surface rounded-2xl border border-border p-3.5 text-sm text-muted-foreground">
                {session.notes}
              </motion.div>
            )}

            {/* Exercises + sets */}
            <div className="space-y-4">
              {session.exerciseGroups.map((group) => (
                <motion.div
                  key={`${group.exerciseOrder}-${group.exercise.id}`}
                  variants={staggerItem}
                  className="space-y-1.5"
                >
                  <h4 className="font-bold text-sm tracking-tight">{group.exercise.name}</h4>
                  <div className="card-surface rounded-2xl border border-border overflow-hidden divide-y divide-border/15">
                    {group.sets.map((set, i) => {
                      const label = set.is_warmup
                        ? "W"
                        : String(group.sets.filter((s, j) => j <= i && !s.is_warmup).length);

                      if (editMode && onUpdateSet && onDeleteSet) {
                        return (
                          <EditableSetRow
                            key={set.id}
                            set={set}
                            label={label}
                            onUpdateSet={onUpdateSet}
                            onDeleteSet={onDeleteSet}
                          />
                        );
                      }

                      return (
                        <div key={set.id} className={`flex items-center gap-3 text-xs px-3 py-2.5 ${set.is_warmup ? "opacity-40" : ""}`}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            set.is_warmup ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary"
                          }`}>
                            {label}
                          </span>
                          <span className="tabular-nums font-semibold text-sm">
                            {set.is_bodyweight ? "BW" : `${formatWeight(set.weight_kg)} kg`}
                          </span>
                          <span className="text-muted-foreground">x</span>
                          <span className="tabular-nums font-semibold text-sm">{set.reps}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <SheetFooter className="mt-6 pb-4 flex-row gap-2 sm:flex-row sm:space-x-0">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => setEditMode(v => !v)}
                className="flex-1 gap-2"
              >
                {editMode ? (
                  <>
                    <Check className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 border-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete Session
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          onDelete(session.id);
          setDeleteOpen(false);
          onOpenChange(false);
        }}
        title="Delete Session"
        description="This will permanently delete this workout session and all its sets."
      />
    </>
  );
}
