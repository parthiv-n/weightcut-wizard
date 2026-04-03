import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Activity, Moon, Ruler, Pencil, Trash2 } from "lucide-react";
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

function MetricRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-1">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
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

  if (!session) return null;

  const sessionColor = getSessionColor(session.session_type, customColors);
  const isRest = session.session_type === "Rest";
  const intensityDisplay = session.intensity_level ?? (session.intensity === "high" ? 5 : session.intensity === "moderate" ? 3 : 1);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[calc(100vh-6rem)] overflow-y-auto rounded-[24px]">
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

          {/* Metrics */}
          <div className="rounded-2xl border border-border/10 divide-y divide-border/10 px-3">
            {isRest ? (
              <>
                {session.sleep_quality && (
                  <MetricRow label="Sleep Quality" value={session.sleep_quality} icon={<Moon className="h-3.5 w-3.5 text-primary" />} />
                )}
                {session.fatigue_level != null && (
                  <MetricRow label="Fatigue Level" value={`${session.fatigue_level}/10`} />
                )}
                {session.mobility_done != null && (
                  <MetricRow label="Mobility" value={session.mobility_done ? "Done" : "Skipped"} />
                )}
              </>
            ) : (
              <>
                <MetricRow label="Duration" value={`${session.duration_minutes} min`} icon={<Activity className="h-3.5 w-3.5 text-primary" />} />
                <MetricRow label="RPE" value={`${session.rpe}/10`} icon={<Activity className="h-3.5 w-3.5 text-primary" />} />
                <MetricRow label="Intensity" value={`${intensityDisplay}/5`} icon={<Ruler className="h-3.5 w-3.5 text-primary" />} />
                {(session.soreness_level ?? 0) > 0 && (
                  <MetricRow label="Soreness" value={`${session.soreness_level}/10`} />
                )}
              </>
            )}
            {(session.sleep_hours ?? 0) > 0 && !isRest && (
              <MetricRow label="Sleep" value={`${session.sleep_hours}h`} icon={<Moon className="h-3.5 w-3.5 text-primary" />} />
            )}
          </div>

          {/* Notes */}
          {session.notes && (
            <div>
              <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground mb-1.5">Notes</p>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}

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
