import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trophy, TrendingUp, Hash, Zap } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { ExercisePerformanceChart } from "./ExercisePerformanceChart";
import { formatWeight, formatVolume } from "@/lib/gymCalculations";
import { localCache } from "@/lib/localCache";
import { useUser } from "@/contexts/UserContext";
import type { Exercise, ExercisePR, GymSet } from "@/pages/gym/types";

interface ExerciseStatsSheetProps {
  exercise: Exercise | null;
  pr: ExercisePR | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchHistory: (exerciseId: string) => Promise<GymSet[]>;
}

export function ExerciseStatsSheet({ exercise, pr, open, onOpenChange, fetchHistory }: ExerciseStatsSheetProps) {
  const { userId } = useUser();
  const [sets, setSets] = useState<GymSet[]>([]);
  const [loading, setLoading] = useState(false);
  const lastExerciseId = useRef<string | null>(null);

  useEffect(() => {
    if (open && exercise) {
      // Serve cached data instantly for the chart (stale-while-revalidate)
      if (userId) {
        const cached = localCache.get<GymSet[]>(userId, `gym_exercise_history_${exercise.id}`);
        if (cached) {
          setSets(cached);
          // If same exercise, skip refetch
          if (lastExerciseId.current === exercise.id) return;
        }
      }
      lastExerciseId.current = exercise.id;
      setLoading(true);
      fetchHistory(exercise.id).then(data => {
        setSets(data);
        setLoading(false);
      });
    }
  }, [open, exercise, fetchHistory, userId]);

  if (!exercise) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
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
          {/* PR records — derived from actual sets for accuracy */}
          {sets.length > 0 && (() => {
            const workingSets = sets.filter(s => !s.is_warmup);
            const maxWeight = Math.max(0, ...workingSets.map(s => s.weight_kg ?? 0));
            const maxReps = Math.max(0, ...workingSets.map(s => s.reps));
            const maxVolume = Math.max(0, ...workingSets.map(s => (s.weight_kg ?? 0) * s.reps));
            // Best set = heaviest weight, show its reps
            const bestSet = workingSets.reduce<typeof workingSets[number] | null>((best, s) => {
              const w = s.weight_kg ?? 0;
              if (!best || w > (best.weight_kg ?? 0)) return s;
              if (w === (best.weight_kg ?? 0) && s.reps > best.reps) return s;
              return best;
            }, null);

            return (
              <motion.div variants={staggerItem} className="space-y-2.5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Personal Records</h4>
                <div className="grid grid-cols-2 gap-2">
                  {maxWeight > 0 && (
                    <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Trophy className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Heaviest</span>
                      </div>
                      <div className="display-number text-xl">{formatWeight(maxWeight)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                    </div>
                  )}
                  {bestSet && maxWeight > 0 && (
                    <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Zap className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Best Set</span>
                      </div>
                      <div className="display-number text-xl">{formatWeight(maxWeight)} <span className="text-xs text-muted-foreground font-normal">× {bestSet.reps}</span></div>
                    </div>
                  )}
                  {maxReps > 0 && (
                    <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Hash className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Max Reps</span>
                      </div>
                      <div className="display-number text-xl">{maxReps}</div>
                    </div>
                  )}
                  {maxVolume > 0 && (
                    <div className="card-surface rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <TrendingUp className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Best Volume</span>
                      </div>
                      <div className="display-number text-xl">{formatVolume(maxVolume)} <span className="text-xs text-muted-foreground font-normal">kg</span></div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}

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
