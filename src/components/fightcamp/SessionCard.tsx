import { Activity, Moon, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSessionColor, COLOR_PALETTE } from "@/lib/sessionColors";
import type { Tables } from "@/integrations/supabase/types";

type FightCampCalendarRow = Tables<"fight_camp_calendar">;

interface SessionCardProps {
  session: FightCampCalendarRow;
  customColors: Record<string, string>;
  userId: string | null;
  onEdit: (session: FightCampCalendarRow) => void;
  onDelete: (id: string) => void;
  onColorChange: (sessionType: string, color: string) => void;
}

export function SessionCard({ session, customColors, userId, onEdit, onDelete, onColorChange }: SessionCardProps) {
  const isRest = session.session_type === 'Rest';
  const sessionColor = getSessionColor(session.session_type, customColors);

  return (
    <Card className="p-4 rounded-[20px] shadow-sm glass-card overflow-hidden relative border-border/10 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => onEdit(session)}>
      <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: sessionColor }} />

      <div className="flex justify-between items-start ml-2">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-white/20 hover:ring-white/40 transition-all"
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
          <h4 className="font-bold text-lg text-foreground">{session.session_type}</h4>
        </div>
        <div>
          {isRest ? (
            <div className="flex items-center gap-3 text-sm text-foreground/80 mt-1 font-medium flex-wrap">
              {session.sleep_quality && <span>Sleep: {session.sleep_quality}</span>}
              {session.fatigue_level && <><span>•</span><span>Fatigue: {session.fatigue_level}/10</span></>}
              {session.mobility_done && <><span>•</span><span>Mobility ✓</span></>}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-foreground/80 mt-1 font-medium">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {session.duration_minutes} min</span>
              <span>•</span>
              <span>RPE {session.rpe}</span>
              <span>•</span>
              <span>Int {session.intensity_level ?? (session.intensity === 'high' ? 5 : session.intensity === 'moderate' ? 3 : 1)}/5</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {session.sleep_hours > 0 && (
            <div className="text-xs text-foreground/80 flex items-center justify-end gap-1 mt-1 font-medium">
              <Moon className="w-3 h-3 text-primary" /> {session.sleep_hours}h
            </div>
          )}
        </div>
      </div>

      {session.soreness_level > 0 && (
        <div className="mt-3 ml-2 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-2 py-1 rounded-md inline-block font-medium">
          Soreness Level: {session.soreness_level}/10
        </div>
      )}

      {session.notes && (
        <p className="mt-2 ml-2 text-xs text-muted-foreground italic line-clamp-2">
          {session.notes}
        </p>
      )}
    </Card>
  );
}
