import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trophy, TrendingUp, Hash, Zap } from "lucide-react";
import { ExercisePerformanceChart } from "./ExercisePerformanceChart";
import { PRBadge } from "./PRBadge";
import { formatWeight, formatVolume, calculateEpley1RM } from "@/lib/gymCalculations";
import type { Exercise, ExercisePR, GymSet } from "@/pages/gym/types";

interface ExerciseStatsSheetProps {
  exercise: Exercise | null;
  pr: ExercisePR | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchHistory: (exerciseId: string) => Promise<GymSet[]>;
}

export function ExerciseStatsSheet({ exercise, pr, open, onOpenChange, fetchHistory }: ExerciseStatsSheetProps) {
  const [sets, setSets] = useState<GymSet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && exercise) {
      setLoading(true);
      fetchHistory(exercise.id).then(data => {
        setSets(data);
        setLoading(false);
      });
    }
  }, [open, exercise, fetchHistory]);

  if (!exercise) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{exercise.name}</SheetTitle>
          <p className="text-xs text-muted-foreground capitalize">
            {exercise.muscle_group.replace("_", " ")} · {exercise.equipment || "bodyweight"}
          </p>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {/* PR records */}
          {pr && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal Records</h4>
              <div className="grid grid-cols-2 gap-2">
                {pr.max_weight_kg != null && pr.max_weight_kg > 0 && (
                  <div className="p-3 rounded-xl bg-muted/30 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">Max Weight</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums">{formatWeight(pr.max_weight_kg)} kg</div>
                  </div>
                )}
                {pr.max_reps != null && pr.max_reps > 0 && (
                  <div className="p-3 rounded-xl bg-muted/30 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">Max Reps</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums">{pr.max_reps}</div>
                  </div>
                )}
                {pr.estimated_1rm != null && pr.estimated_1rm > 0 && (
                  <div className="p-3 rounded-xl bg-muted/30 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">Est. 1RM</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums">{formatWeight(pr.estimated_1rm)} kg</div>
                  </div>
                )}
                {pr.max_volume != null && pr.max_volume > 0 && (
                  <div className="p-3 rounded-xl bg-muted/30 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">Max Volume</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums">{formatVolume(pr.max_volume)} kg</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Performance chart */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Performance</h4>
            <ExercisePerformanceChart sets={sets} loading={loading} />
          </div>

          {/* Recent sets */}
          {sets.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Sets</h4>
              <div className="space-y-1">
                {sets.slice(0, 10).map(set => (
                  <div key={set.id} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-lg bg-muted/20">
                    <span className="text-muted-foreground w-16">
                      {new Date(set.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="tabular-nums font-medium">
                      {set.is_bodyweight ? "BW" : `${formatWeight(set.weight_kg)} kg`}
                    </span>
                    <span className="text-muted-foreground">x</span>
                    <span className="tabular-nums font-medium">{set.reps}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
