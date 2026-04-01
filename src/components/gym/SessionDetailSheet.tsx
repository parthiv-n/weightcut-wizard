import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Clock, Dumbbell, TrendingUp, Brain, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { formatWeight, formatVolume } from "@/lib/gymCalculations";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import type { SessionWithSets } from "@/pages/gym/types";

interface SessionDetailSheetProps {
  session: SessionWithSets | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionDetailSheet({ session, open, onOpenChange, onDelete }: SessionDetailSheetProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!session) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-y-auto">
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
                    <div className="glass-card rounded-xl border border-border/50 text-center p-3">
                      <Clock className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                      <div className="display-number text-base">{session.duration_minutes}<span className="text-xs text-muted-foreground font-normal">m</span></div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Duration</div>
                    </div>
                  )}
                  <div className="glass-card rounded-xl border border-border/50 text-center p-3">
                    <Dumbbell className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                    <div className="display-number text-base">{session.exerciseCount}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Exercises</div>
                  </div>
                  <div className="glass-card rounded-xl border border-border/50 text-center p-3">
                    <TrendingUp className="h-4 w-4 mx-auto mb-1.5 text-primary" />
                    <div className="display-number text-base">{formatVolume(session.totalVolume)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Volume</div>
                  </div>
                  {hasFatigue && (
                    <div className="glass-card rounded-xl border border-border/50 text-center p-3">
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
              <motion.div variants={staggerItem} className="mb-5 glass-card rounded-xl border border-border/50 p-3.5 text-sm text-muted-foreground">
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
                  <div className="glass-card rounded-xl border border-border/50 overflow-hidden divide-y divide-border/15">
                    {group.sets.map((set, i) => (
                      <div key={set.id} className={`flex items-center gap-3 text-xs px-3 py-2.5 ${set.is_warmup ? "opacity-40" : ""}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          set.is_warmup ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary"
                        }`}>
                          {set.is_warmup ? "W" : group.sets.filter((s, j) => j <= i && !s.is_warmup).length}
                        </span>
                        <span className="tabular-nums font-semibold text-sm">
                          {set.is_bodyweight ? "BW" : `${formatWeight(set.weight_kg)} kg`}
                        </span>
                        <span className="text-muted-foreground">x</span>
                        <span className="tabular-nums font-semibold text-sm">{set.reps}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 border-destructive/20"
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
