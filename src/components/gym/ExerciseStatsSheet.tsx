import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { ExercisePerformanceChart } from "./ExercisePerformanceChart";
import { formatWeight, formatVolume } from "@/lib/gymCalculations";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { ExerciseProgressCard } from "@/components/share/cards/ExerciseProgressCard";
import type { Exercise, ExercisePR, GymSet } from "@/pages/gym/types";

interface ExerciseStatsSheetProps {
  exercise: Exercise | null;
  pr: ExercisePR | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExerciseStatsSheet({ exercise, pr, open, onOpenChange }: ExerciseStatsSheetProps) {
  // Share-card variant — `dark` (default solid background) or `transparent`
  // (over-photo, no background fill). Mirrors the swipe-to-toggle pattern in
  // GymTracker's session share dialog and the dashboard's fight-form sheet.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVariant, setShareVariant] = useState<"dark" | "transparent">("dark");
  // Reactive Convex query — chart and PRs auto-refresh as the user logs more
  // sets in any active session, including this one. No manual cache layer.
  const rows = useQuery(
    api.gym_sessions.listSetsForExercise,
    open && exercise ? { exerciseId: exercise.id as unknown as Id<"exercises">, limit: 100 } : "skip",
  );
  const sets = (rows ?? []) as unknown as GymSet[];
  const loading = open && exercise !== null && rows === undefined;

  if (!exercise) return null;

  // Has anything worth sharing? We require at least one working set so the
  // card doesn't render an empty PR strip and a "log more sessions" chart —
  // that'd be the wrong screenshot to post.
  const hasShareableData = sets.some((set) => !set.is_warmup);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
        {/* Header is centred: share lives in the top-left (absolute), the
            sheet's built-in close X stays in the top-right, and the title +
            muscle-group subline sit dead-centre between them. Mirrors the
            FightFormScoreSheet pattern so both share entry points feel the
            same. */}
        <SheetHeader className="relative flex flex-col items-center justify-center min-h-9 space-y-0 pb-1 px-9">
          <SheetTitle className="text-lg font-bold tracking-tight text-center">{exercise.name}</SheetTitle>
          <p className="text-xs text-muted-foreground capitalize text-center">
            {exercise.muscle_group.replace("_", " ")} · {exercise.equipment || "bodyweight"}
          </p>
          {hasShareableData && (
            <div className="absolute left-0 top-0">
              <ShareButton onClick={() => { setShareVariant("dark"); setShareOpen(true); }} />
            </div>
          )}
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
                    <div className="card-surface rounded-2xl border border-border p-3 space-y-1.5">
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
                    <div className="card-surface rounded-2xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Trophy className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Best Set</span>
                      </div>
                      <div className="display-number text-xl">{formatWeight(maxWeight)} <span className="text-xs text-muted-foreground font-normal">× {bestSet.reps}</span></div>
                    </div>
                  )}
                  {maxReps > 0 && (
                    <div className="card-surface rounded-2xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Trophy className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">Max Reps</span>
                      </div>
                      <div className="display-number text-xl">{maxReps}</div>
                    </div>
                  )}
                  {maxVolume > 0 && (
                    <div className="card-surface rounded-2xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-yellow-500/15 flex items-center justify-center">
                          <Trophy className="h-3 w-3 text-yellow-500" />
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
            <div className="card-surface rounded-2xl border border-border p-3">
              <ExercisePerformanceChart sets={sets} loading={loading} />
            </div>
          </motion.div>

          {/* Recent sets */}
          {sets.length > 0 && (
            <motion.div variants={staggerItem} className="space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Sets</h4>
              <div className="card-surface rounded-2xl border border-border overflow-hidden divide-y divide-border/20">
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

      {/* Shareable Instagram-story card. Lives outside the bottom sheet so the
          dialog overlay sits cleanly above it. Swipe horizontally on the
          preview to toggle the transparent / dark variant — matches the
          existing share dialogs in GymTracker and FightFormScoreSheet. */}
      <ShareCardDialog
        open={shareOpen}
        onOpenChange={(v) => { setShareOpen(v); if (v) setShareVariant("dark"); }}
        transparent={shareVariant === "transparent"}
        showSwipeHint
        title="Share Progress"
        shareTitle={`${exercise.name} progress`}
        shareText={`My ${exercise.name} progress on FightCamp Wizard`}
      >
        {({ cardRef, aspect, transparent }) => {
          let touchStartX = 0;
          const flashCardWrapper = (el: HTMLElement | null) => {
            if (!el) return;
            el.classList.remove("share-variant-flash");
            void el.offsetWidth;
            el.classList.add("share-variant-flash");
          };
          return (
            <div
              onTouchStart={(e) => { touchStartX = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const delta = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(delta) > 40) {
                  setShareVariant((v) => (v === "dark" ? "transparent" : "dark"));
                  flashCardWrapper(e.currentTarget as HTMLElement);
                }
              }}
            >
              <ExerciseProgressCard
                ref={cardRef}
                exerciseName={exercise.name}
                muscleGroup={exercise.muscle_group}
                sets={sets}
                aspect={aspect}
                transparent={transparent}
              />
            </div>
          );
        }}
      </ShareCardDialog>
    </Sheet>
  );
}
