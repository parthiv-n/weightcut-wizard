import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { decodeRunMeta } from "@/lib/runMeta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { getSessionColor } from "@/lib/sessionColors";
import { triggerHapticSelection } from "@/lib/haptics";
import type { Tables } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;

interface SessionDetailDrawerProps {
  session: TrainingCalendarRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (session: TrainingCalendarRow) => void;
  onDelete: (id: string) => void;
  customColors: Record<string, string>;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(url);
}

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-muted/30 dark:bg-white/[0.03] border border-border/20 px-3 py-2 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-base font-bold tabular-nums" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

export function SessionDetailDrawer({
  session,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  customColors,
}: SessionDetailDrawerProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isRun = session?.session_type === "Run";
  const { meta: runMeta, notes: cleanNotes } = useMemo(
    () => isRun && session ? decodeRunMeta(session.notes) : { meta: null, notes: session?.notes ?? "" },
    [isRun, session?.notes]
  );

  if (!session) return null;

  const sessionColor = getSessionColor(session.session_type, customColors);
  const isRest = session.session_type === "Rest";
  const intensityDisplay = session.intensity_level ?? (session.intensity === "high" ? 5 : session.intensity === "moderate" ? 3 : 1);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md rounded-[24px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: sessionColor }} />
              <DialogTitle className="text-2xl font-bold">{session.session_type}</DialogTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1 text-left">
              {format(parseISO(session.date), "EEEE, MMMM do yyyy")}
            </p>
          </DialogHeader>

          {/* Media */}
          {session.media_url && (
            <div className="rounded-2xl overflow-hidden border border-border/20">
              {isVideo(session.media_url) ? (
                <video
                  src={session.media_url}
                  className="w-full max-h-64 object-cover"
                  controls
                  playsInline
                />
              ) : (
                <img
                  src={session.media_url}
                  alt="Session media"
                  className="w-full max-h-64 object-cover"
                />
              )}
            </div>
          )}

          {/* Notes — prominent, first thing the user sees */}
          {(isRun ? cleanNotes : session.notes) && (
            <div className="rounded-2xl border border-border/20 bg-muted/10 dark:bg-white/[0.02] p-4">
              <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{isRun ? cleanNotes : session.notes}</p>
            </div>
          )}

          {/* Metrics — compact chip grid */}
          <div className="grid grid-cols-3 gap-2">
            {isRest ? (
              <>
                {session.sleep_quality && <MetricChip label="Sleep" value={session.sleep_quality} />}
                {session.fatigue_level != null && <MetricChip label="Fatigue" value={`${session.fatigue_level}/10`} />}
                {session.mobility_done != null && <MetricChip label="Mobility" value={session.mobility_done ? "Done" : "Skip"} />}
              </>
            ) : (
              <>
                {isRun && runMeta ? (
                  <>
                    {runMeta.distance && <MetricChip label="Distance" value={`${runMeta.distance} ${runMeta.unit}`} color={sessionColor} />}
                    {runMeta.time && <MetricChip label="Time" value={runMeta.time} />}
                    {runMeta.pace && <MetricChip label="Pace" value={`${runMeta.pace}/${runMeta.unit}`} />}
                  </>
                ) : (
                  <>
                    <MetricChip label="Duration" value={`${session.duration_minutes}m`} color={sessionColor} />
                    <MetricChip label="RPE" value={`${session.rpe}/10`} />
                    <MetricChip label="Intensity" value={`${intensityDisplay}/5`} />
                  </>
                )}
                {(session.soreness_level ?? 0) > 0 && <MetricChip label="Soreness" value={`${session.soreness_level}/10`} />}
                {(session.sleep_hours ?? 0) > 0 && <MetricChip label="Sleep" value={`${session.sleep_hours}h`} />}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-2xl font-semibold text-base gap-2"
              onClick={() => {
                triggerHapticSelection();
                onEdit(session);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="h-12 w-12 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              onClick={() => {
                triggerHapticSelection();
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          onDelete(session.id);
          setDeleteOpen(false);
          onOpenChange(false);
        }}
        title="Delete Session"
        description={`Delete this ${session.session_type} session?`}
      />
    </>
  );
}
