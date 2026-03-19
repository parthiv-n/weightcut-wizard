import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Dumbbell, TrendingUp, Brain, Trash2 } from "lucide-react";
import { formatWeight, formatVolume, calculateVolume } from "@/lib/gymCalculations";
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
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                {session.session_type}
              </span>
              <span className="text-sm text-muted-foreground font-normal">
                {new Date(session.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
            {session.duration_minutes && (
              <div className="text-center p-2 rounded-xl bg-muted/50">
                <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-sm font-semibold">{session.duration_minutes}m</div>
                <div className="text-[10px] text-muted-foreground">Duration</div>
              </div>
            )}
            <div className="text-center p-2 rounded-xl bg-muted/50">
              <Dumbbell className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <div className="text-sm font-semibold">{session.exerciseCount}</div>
              <div className="text-[10px] text-muted-foreground">Exercises</div>
            </div>
            <div className="text-center p-2 rounded-xl bg-muted/50">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <div className="text-sm font-semibold">{formatVolume(session.totalVolume)} kg</div>
              <div className="text-[10px] text-muted-foreground">Volume</div>
            </div>
            {session.perceived_fatigue && (
              <div className="text-center p-2 rounded-xl bg-muted/50">
                <Brain className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-sm font-semibold">{session.perceived_fatigue}/10</div>
                <div className="text-[10px] text-muted-foreground">Fatigue</div>
              </div>
            )}
          </div>

          {/* Notes */}
          {session.notes && (
            <div className="mb-4 p-3 rounded-xl bg-muted/30 text-sm text-muted-foreground">
              {session.notes}
            </div>
          )}

          {/* Exercises + sets */}
          <div className="space-y-4">
            {session.exerciseGroups.map(group => (
              <div key={`${group.exerciseOrder}-${group.exercise.id}`} className="space-y-1.5">
                <h4 className="font-semibold text-sm">{group.exercise.name}</h4>
                <div className="space-y-0.5">
                  {group.sets.map((set, i) => (
                    <div key={set.id} className={`flex items-center gap-3 text-xs px-2 py-1 rounded-lg ${set.is_warmup ? "opacity-50" : ""}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                        set.is_warmup ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
                      }`}>
                        {set.is_warmup ? "W" : group.sets.filter((s, j) => j <= i && !s.is_warmup).length}
                      </span>
                      <span className="tabular-nums font-medium">
                        {set.is_bodyweight ? "BW" : `${formatWeight(set.weight_kg)} kg`}
                      </span>
                      <span className="text-muted-foreground">x</span>
                      <span className="tabular-nums font-medium">{set.reps} reps</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="w-full text-destructive hover:text-destructive gap-2"
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
