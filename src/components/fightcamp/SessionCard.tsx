import { memo, useMemo } from "react";
import { Moon, Check, Image } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSessionColor, COLOR_PALETTE } from "@/lib/sessionColors";
import { decodeRunMeta } from "@/lib/runMeta";
import type { Tables } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;

interface SessionCardProps {
  session: TrainingCalendarRow;
  customColors: Record<string, string>;
  userId: string | null;
  onView: (session: TrainingCalendarRow) => void;
  onColorChange: (sessionType: string, color: string) => void;
}

export const SessionCard = memo(function SessionCard({ session, customColors, userId, onView, onColorChange }: SessionCardProps) {
  const isRest = session.session_type === 'Rest';
  const isRun = session.session_type === 'Run';
  const sessionColor = getSessionColor(session.session_type, customColors);
  const intensityDisplay = session.intensity_level
    ?? (session.intensity === 'high' ? 5 : session.intensity === 'moderate' ? 3 : 1);
  const { meta: runMeta, notes: cleanNotes } = useMemo(
    () => isRun ? decodeRunMeta(session.notes) : { meta: null, notes: session.notes ?? "" },
    [isRun, session.notes]
  );

  return (
    <div
      className="glass-card rounded-2xl p-5 cursor-pointer active:scale-[0.98] transition-all duration-200 border-border/10 overflow-hidden relative"
      onClick={() => onView(session)}
    >
      {/* Top color accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
        style={{ background: `linear-gradient(90deg, ${sessionColor}, transparent)` }}
      />

      {/* Header: type name + media icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white/10 hover:ring-white/30 transition-all"
                style={{ backgroundColor: sessionColor }}
                onClick={(e) => e.stopPropagation()}
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" side="bottom" align="start" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PALETTE.map(color => (
                  <button
                    key={color}
                    className="w-8 h-8 rounded-full flex items-center justify-center ring-1 ring-white/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      if (!userId) return;
                      onColorChange(session.session_type, color);
                    }}
                  >
                    {sessionColor === color && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <h4 className="font-semibold text-[15px] text-foreground tracking-tight">
            {session.session_type}
          </h4>
        </div>
        {session.media_url && (
          <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center">
            <Image className="w-3.5 h-3.5 text-foreground/50" />
          </div>
        )}
      </div>

      {/* Hero stat row */}
      {isRest ? (
        <div className="flex items-end gap-4 mt-4">
          {session.sleep_quality && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                Sleep
              </span>
              <p className="display-number text-2xl text-foreground mt-0.5">
                {session.sleep_quality}
              </p>
            </div>
          )}
          {session.fatigue_level != null && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                Fatigue
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="display-number text-2xl text-foreground">
                  {session.fatigue_level}
                </span>
                <span className="text-xs text-foreground/40 font-medium">/10</span>
              </div>
            </div>
          )}
          {session.mobility_done && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                Mobility
              </span>
              <div className="flex items-center gap-1 mt-1.5">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">Done</span>
              </div>
            </div>
          )}
        </div>
      ) : isRun && runMeta ? (
        <div className="flex items-end gap-4 mt-4">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
              Distance
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="display-number text-2xl text-foreground">
                {runMeta.distance}
              </span>
              <span className="text-xs text-foreground/40 font-medium">{runMeta.unit}</span>
            </div>
          </div>
          {runMeta.time && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                Time
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="display-number text-2xl" style={{ color: sessionColor }}>
                  {runMeta.time}
                </span>
              </div>
            </div>
          )}
          {runMeta.pace && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                Pace
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="display-number text-2xl text-foreground">
                  {runMeta.pace}
                </span>
                <span className="text-xs text-foreground/40 font-medium">/{runMeta.unit}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-4 mt-4">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
              Duration
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="display-number text-2xl text-foreground">
                {session.duration_minutes}
              </span>
              <span className="text-xs text-foreground/40 font-medium">min</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
              RPE
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="display-number text-2xl" style={{ color: sessionColor }}>
                {session.rpe}
              </span>
              <span className="text-xs text-foreground/40 font-medium">/10</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
              Intensity
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="display-number text-2xl text-foreground">
                {intensityDisplay}
              </span>
              <span className="text-xs text-foreground/40 font-medium">/5</span>
            </div>
          </div>
        </div>
      )}

      {/* Secondary indicators: soreness + sleep pills */}
      {(session.soreness_level > 0 || session.sleep_hours > 0) && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {session.soreness_level > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-500/10 text-red-400">
              Soreness {session.soreness_level}/10
            </span>
          )}
          {session.sleep_hours > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400">
              <Moon className="w-3 h-3" />
              {session.sleep_hours}h sleep
            </span>
          )}
        </div>
      )}

      {/* Notes preview */}
      {(isRun ? cleanNotes : session.notes) && (
        <p className="mt-3 text-[12px] text-foreground/35 line-clamp-1 leading-relaxed">
          {isRun ? cleanNotes : session.notes}
        </p>
      )}
    </div>
  );
});
