import { motion } from "motion/react";
import { staggerItem } from "@/lib/motion";
import { BarChart3, Calendar, Dumbbell, Clock, TrendingUp } from "lucide-react";
import { formatVolume } from "@/lib/gymCalculations";

interface SessionAnalyticsCardProps {
  sessionsThisWeek: number;
  avgDuration: number;
  totalSessions: number;
  mostTrainedMuscle: string;
  weeklyVolumes: { week: string; volume: number; sessions: number }[];
}

export function SessionAnalyticsCard({
  sessionsThisWeek, avgDuration, totalSessions,
  mostTrainedMuscle, weeklyVolumes,
}: SessionAnalyticsCardProps) {
  if (totalSessions === 0) return null;

  const maxVol = Math.max(...weeklyVolumes.map(w => w.volume), 1);

  return (
    <motion.div
      variants={staggerItem}
      className="glass-card rounded-2xl border border-border/50 p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" />
        Weekly Stats
      </div>

      {/* Mini volume chart */}
      {weeklyVolumes.length > 1 && (
        <div className="flex items-end gap-1 h-12">
          {weeklyVolumes.map((w, i) => (
            <div
              key={w.week}
              className="flex-1 rounded-t-sm bg-primary/30 hover:bg-primary/50 transition-colors relative group"
              style={{ height: `${Math.max((w.volume / maxVol) * 100, 4)}%` }}
            >
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {formatVolume(w.volume)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{sessionsThisWeek}</div>
            <div className="text-[10px] text-muted-foreground">This week</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{avgDuration}m</div>
            <div className="text-[10px] text-muted-foreground">Avg duration</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
          <Dumbbell className="h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{totalSessions}</div>
            <div className="text-[10px] text-muted-foreground">Total sessions</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-sm font-semibold capitalize">{mostTrainedMuscle.replace("_", " ")}</div>
            <div className="text-[10px] text-muted-foreground">Top muscle</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
