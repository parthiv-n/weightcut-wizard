import { memo } from "react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { Calendar, Dumbbell } from "lucide-react";
import { formatVolume } from "@/lib/gymCalculations";
import type { SessionWithSets } from "@/pages/gym/types";

interface SessionHistoryListProps {
  sessions: SessionWithSets[];
  loading: boolean;
  onSessionTap: (session: SessionWithSets) => void;
}

export const SessionHistoryList = memo(function SessionHistoryList({ sessions, loading, onSessionTap }: SessionHistoryListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card-surface rounded-2xl border border-border/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-20 rounded-full shimmer-skeleton" />
              <div className="h-4 w-16 rounded shimmer-skeleton" />
            </div>
            <div className="flex gap-4">
              <div className="h-3.5 w-12 rounded shimmer-skeleton" />
              <div className="h-3.5 w-20 rounded shimmer-skeleton" />
              <div className="h-3.5 w-16 rounded shimmer-skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="card-surface rounded-2xl border border-border/50 p-8 text-center">
        <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <Dumbbell className="h-6 w-6 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No workouts yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Start your first workout to see history here</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer(50)}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {sessions.map(session => (
        <motion.button
          key={session.id}
          variants={staggerItem}
          onClick={() => onSessionTap(session)}
          className="w-full card-surface rounded-2xl border border-border/50 p-4 text-left active:scale-[0.98] transition-transform relative overflow-hidden"
        >
          {/* Subtle gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.02] to-transparent pointer-events-none" />

          <div className="relative">
            <div className="flex items-center justify-between mb-2.5">
              <span className="px-2.5 py-1 rounded-full bg-primary/12 text-primary text-xs font-semibold">
                {session.session_type}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(session.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {session.duration_minutes && (
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums font-medium text-foreground/80">{session.duration_minutes}m</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums font-medium text-foreground/80">{session.exerciseCount}</span>
                <span>exercises</span>
              </span>
              {session.totalVolume > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums font-medium text-foreground/80">{formatVolume(session.totalVolume)} kg</span>
                </span>
              )}
            </div>

            {session.exerciseGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {session.exerciseGroups.slice(0, 4).map(g => (
                  <span key={g.exercise.id} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/20">
                    {g.exercise.name}
                  </span>
                ))}
                {session.exerciseGroups.length > 4 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/20">
                    +{session.exerciseGroups.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
});
