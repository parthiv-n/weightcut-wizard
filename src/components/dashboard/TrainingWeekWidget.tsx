import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionColor, getUserColors } from "@/lib/sessionColors";
import { AnimatedRing } from "@/components/motion";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { triggerHapticSelection } from "@/lib/haptics";

interface WeekSession {
  id: string;
  date: string;
  session_type: string;
  duration_minutes: number;
  rpe: number;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

interface TrainingWeekWidgetProps {
  userId: string;
}

export const TrainingWeekWidget = memo(function TrainingWeekWidget({ userId }: TrainingWeekWidgetProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<WeekSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [customColors] = useState(() => getUserColors(userId));

  const fetchWeekSessions = useCallback(async () => {
    try {
      const now = new Date();
      const ws = startOfWeek(now, { weekStartsOn: 1 });
      const we = endOfWeek(now, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("fight_camp_calendar")
        .select("id, date, session_type, duration_minutes, rpe")
        .eq("user_id", userId)
        .gte("date", format(ws, "yyyy-MM-dd"))
        .lte("date", format(we, "yyyy-MM-dd"))
        .neq("session_type", "Rest");

      if (error) throw error;
      setSessions((data as WeekSession[]) || []);
    } catch {
      // Fail silently — widget is non-critical
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchWeekSessions(); }, [fetchWeekSessions]);

  // Build day-of-week map (Mon=0..Sun=6)
  const dayMap = new Map<number, WeekSession[]>();
  const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
  for (const s of sessions) {
    const d = new Date(s.date + "T12:00:00");
    const dayIdx = Math.round((d.getTime() - ws.getTime()) / (24 * 60 * 60 * 1000));
    if (dayIdx >= 0 && dayIdx < 7) {
      if (!dayMap.has(dayIdx)) dayMap.set(dayIdx, []);
      dayMap.get(dayIdx)!.push(s);
    }
  }

  // Stats
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((s, x) => s + x.duration_minutes, 0);

  // Type breakdown for the ring segments
  const typeCounts = new Map<string, number>();
  for (const s of sessions) {
    typeCounts.set(s.session_type, (typeCounts.get(s.session_type) ?? 0) + 1);
  }
  const typeEntries = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Today's day index (Mon=0)
  const todayIdx = (new Date().getDay() + 6) % 7;
  // Days that have passed (including today)
  const daysElapsed = todayIdx + 1;
  // Ring progress: sessions logged / days elapsed (cap at 1)
  const activeDays = new Set(sessions.map(s => s.date)).size;
  const ringProgress = Math.min(activeDays / daysElapsed, 1);

  // Dominant session color for ring
  const dominantType = typeEntries[0]?.[0] ?? "Other";
  const ringColor = getSessionColor(dominantType, customColors);

  if (loading) {
    return (
      <div className="glass-card p-5 rounded-2xl">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex justify-between mt-4 px-1">
          {DAY_LABELS.map((_, i) => (
            <Skeleton key={i} className="w-7 h-9 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass-card p-5 rounded-2xl cursor-pointer active:scale-[0.98] transition-all duration-200"
      onClick={() => {
        triggerHapticSelection();
        navigate("/training-calendar?openLogSession=true");
      }}
    >
      {/* Top row: ring + stats + chevron */}
      <div className="flex items-center gap-4">
        {/* Activity ring */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <AnimatedRing
            progress={ringProgress}
            size={80}
            strokeWidth={6}
            gradientColors={[ringColor, ringColor]}
            id="training-week-ring"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="display-number text-lg font-bold">{totalSessions}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Training This Week
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="display-number text-2xl font-bold">
              {totalMinutes >= 60 ? Math.round(totalMinutes / 60) : totalMinutes}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              {totalMinutes >= 60 ? "hrs" : "min"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalSessions === 0 ? "No sessions yet" : `${activeDays} day${activeDays !== 1 ? "s" : ""} active`}
          </p>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
      </div>

      {/* Week day bar chart */}
      <div className="flex items-end justify-between mt-4 px-1 gap-1.5">
        {DAY_LABELS.map((label, i) => {
          const daySessions = dayMap.get(i) ?? [];
          const isToday = i === todayIdx;
          const isFuture = i > todayIdx;
          const totalDayMin = daySessions.reduce((s, x) => s + x.duration_minutes, 0);
          // Normalize bar height: 0-36px range
          const maxMin = 120; // normalize against 2hr
          const barH = daySessions.length > 0 ? Math.max(8, Math.round((totalDayMin / maxMin) * 36)) : 0;

          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              {/* Bar */}
              <div className="w-full flex flex-col justify-end items-center" style={{ height: 40 }}>
                {daySessions.length > 0 ? (
                  <div
                    className="w-full rounded-md transition-all duration-500"
                    style={{
                      height: barH,
                      background: daySessions.length === 1
                        ? getSessionColor(daySessions[0].session_type, customColors)
                        : `linear-gradient(to top, ${daySessions.map(s => getSessionColor(s.session_type, customColors)).join(", ")})`,
                      maxWidth: 28,
                    }}
                  />
                ) : (
                  <div
                    className="w-full rounded-md"
                    style={{
                      height: 4,
                      maxWidth: 28,
                      background: isFuture ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
              </div>
              {/* Label */}
              <span className={`text-[10px] font-medium ${
                isToday
                  ? "text-foreground"
                  : isFuture
                    ? "text-foreground/20"
                    : "text-muted-foreground"
              }`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Type legend pills */}
      {typeEntries.length > 0 && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {typeEntries.slice(0, 4).map(([type, count]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{
                background: `${getSessionColor(type, customColors)}15`,
                color: getSessionColor(type, customColors),
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: getSessionColor(type, customColors) }}
              />
              {type} {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
