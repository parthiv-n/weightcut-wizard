import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trophy, TrendingUp, Hash, Zap } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { ExercisePerformanceChart } from "./ExercisePerformanceChart";
import { formatWeight, formatVolume } from "@/lib/gymCalculations";
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
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-y-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-lg font-bold tracking-tight">{exercise.name}</SheetTitle>
          <p className="text-xs text-muted-foreground capitalize">
            {exercise.muscle_group.replace("_", " ")} · {exercise.equipment || "bodyweight"}
          </p>
        </SheetHeader>

        <motion.div
          variants={staggerContainer(60)}
          initial="hidden"
          animate="visible"
          className="space-y-5 mt-4"
        >
          {/* PR records */}
          {pr && (
            <motion.div variants={staggerItem} className="space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Personal Records</h4>
              <div className="grid grid-cols-2 gap-2">
                {pr.max_weight_kg != null && pr.max_weight_kg > 0 && (
                  <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                        <Trophy className="h-3 w-3 text-yellow-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Max Weight</span>
                    </div>
                    <div className="display-number text-xl">{formatWeight(pr.max_weight_kg)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                  </div>
                )}
                {pr.max_reps != null && pr.max_reps > 0 && (
                  <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                        <Hash className="h-3 w-3 text-yellow-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Max Reps</span>
                    </div>
                    <div className="display-number text-xl">{pr.max_reps}</div>
                  </div>
                )}
                {pr.estimated_1rm != null && pr.estimated_1rm > 0 && (
                  <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                        <Zap className="h-3 w-3 text-yellow-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Est. 1RM</span>
                    </div>
                    <div className="display-number text-xl">{formatWeight(pr.estimated_1rm)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                  </div>
                )}
                {pr.max_volume != null && pr.max_volume > 0 && (
                  <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                        <TrendingUp className="h-3 w-3 text-yellow-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Max Volume</span>
                    </div>
                    <div className="display-number text-xl">{formatVolume(pr.max_volume)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Strength Progression Chart */}
          <motion.div variants={staggerItem} className="space-y-2.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Strength Progression</h4>
            <div className="card-surface rounded-xl border border-border p-3">
              <ExercisePerformanceChart sets={sets} loading={loading} />
            </div>
          </motion.div>

          {/* Recent sets */}
          {sets.length > 0 && (
            <motion.div variants={staggerItem} className="space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Sets</h4>
              <div className="card-surface rounded-xl border border-border overflow-hidden divide-y divide-border/20">
                {sets.slice(0, 10).map(set => (
                  <div key={set.id} className="flex items-center gap-3 text-xs px-3 py-2.5">
                    <span className="text-muted-foreground w-16 shrink-0">
                      {new Date(set.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="display-number text-sm">
                      {set.is_bodyweight ? "BW" : `${formatWeight(set.weight_kg)} kg`}
                    </span>
                    <span className="text-muted-foreground">x</span>
                    <span className="display-number text-sm">{set.reps}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
