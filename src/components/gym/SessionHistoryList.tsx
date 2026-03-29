import { memo } from "react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { Calendar, Clock, Dumbbell, TrendingUp } from "lucide-react";
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
          <div key={i} className="glass-card rounded-2xl border border-border/50 p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-2" />
            <div className="h-3 bg-muted rounded w-40" />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Dumbbell className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No workouts yet</p>
        <p className="text-xs mt-1">Start your first workout to see history here</p>
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
          className="w-full glass-card rounded-2xl border border-border/50 p-4 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">
              {session.session_type}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {session.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {session.duration_minutes}m
              </span>
            )}
            <span className="flex items-center gap-1">
              <Dumbbell className="h-3 w-3" />
              {session.exerciseCount} exercises
            </span>
            {session.totalVolume > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {formatVolume(session.totalVolume)} kg
              </span>
            )}
          </div>

          {session.exerciseGroups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {session.exerciseGroups.slice(0, 4).map(g => (
                <span key={g.exercise.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {g.exercise.name}
                </span>
              ))}
              {session.exerciseGroups.length > 4 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  +{session.exerciseGroups.length - 4} more
                </span>
              )}
            </div>
          )}
        </motion.button>
      ))}
    </motion.div>
  );
});
