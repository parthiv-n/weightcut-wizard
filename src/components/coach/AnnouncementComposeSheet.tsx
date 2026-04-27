import { useMemo, useState } from "react";
import { Loader2, Send, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { celebrateSuccess, triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { AthleteAvatar } from "./AthleteAvatar";
import type { AthleteOverviewRow } from "@/hooks/coach/useCoachData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gymId: string;
  gymName: string;
  athletes: AthleteOverviewRow[];
  onSent?: () => void;
}

const MAX_BODY = 2000;

export function AnnouncementComposeSheet({ open, onOpenChange, gymId, gymName, athletes, onSent }: Props) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const remaining = MAX_BODY - body.length;
  const canSend = useMemo(() => {
    if (sending) return false;
    if (!body.trim()) return false;
    if (mode === "specific" && selected.size === 0) return false;
    return true;
  }, [body, mode, selected, sending]);

  const toggleSelected = (userId: string) => {
    triggerHaptic(ImpactStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const reset = () => {
    setBody("");
    setMode("all");
    setSelected(new Set());
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    triggerHaptic(ImpactStyle.Medium);
    try {
      const targets = mode === "specific" ? Array.from(selected) : null;
      const { error } = await supabase.rpc("create_announcement", {
        p_gym_id: gymId,
        p_body: body.trim(),
        p_target_user_ids: targets,
      });
      if (error) throw error;
      celebrateSuccess();
      toast({
        title: "Announcement sent",
        description: mode === "all"
          ? `Broadcast to all athletes in ${gymName}`
          : `Sent to ${selected.size} athlete${selected.size === 1 ? "" : "s"}`,
      });
      reset();
      onOpenChange(false);
      onSent?.();
    } catch (err: any) {
      logger.error("AnnouncementComposeSheet: send failed", err);
      toast({ title: "Could not send announcement", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] [&>button]:hidden max-h-[85vh] flex flex-col"
      >
        <div className="flex justify-center pt-1 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        {/* Header with always-visible Send button (iOS compose pattern) */}
        <div className="flex items-center justify-between px-1 pb-3 shrink-0 gap-3">
          <SheetHeader className="text-left flex-1 min-w-0">
            <SheetTitle className="text-base font-semibold">New announcement</SheetTitle>
            <p className="text-[12px] text-muted-foreground truncate">{gymName}</p>
          </SheetHeader>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.95] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <><Send className="h-3 w-3" /> Send</>
            )}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-1">
          {/* Audience segmented control */}
          <div className="flex bg-muted/40 dark:bg-white/[0.06] rounded-2xl p-1 border border-border/40">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${mode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              All athletes
            </button>
            <button
              type="button"
              onClick={() => setMode("specific")}
              className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${mode === "specific" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Specific
            </button>
          </div>

          {/* Athlete picker — only when specific */}
          {mode === "specific" && (
            <div className="card-surface rounded-2xl border border-border overflow-hidden">
              {athletes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center px-3 py-4">No athletes in this gym yet.</p>
              ) : (
                <div className="divide-y divide-border/40 max-h-[40vh] overflow-y-auto">
                  {athletes.map((a) => {
                    const isSel = selected.has(a.user_id);
                    return (
                      <button
                        key={a.user_id}
                        type="button"
                        onClick={() => toggleSelected(a.user_id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[48px] active:bg-muted/30 transition-colors text-left"
                      >
                        <AthleteAvatar avatarUrl={a.avatar_url} name={a.display_name} size={32} />
                        <span className="flex-1 text-[13px] font-medium truncate">{a.display_name}</span>
                        <span
                          className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${isSel ? "bg-primary border-primary" : "border-border"}`}
                          aria-hidden
                        >
                          {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selected.size > 0 && (
                <div className="border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
                  {selected.size} selected
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="card-surface rounded-2xl border border-border p-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              placeholder="Share a tip, schedule change, or shoutout…"
              rows={5}
              className="w-full bg-transparent text-[14px] leading-relaxed resize-none placeholder:text-muted-foreground/60 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end pt-1">
              <span className={`text-[10px] tabular-nums ${remaining < 100 ? "text-amber-500" : "text-muted-foreground/60"}`}>
                {remaining}
              </span>
            </div>
          </div>
        </div>

        {/* Secondary full-width Send so it's discoverable even if user
            scrolls down past the sticky header. */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="mt-3 w-full h-11 rounded-2xl bg-primary text-primary-foreground text-[14px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><Send className="h-3.5 w-3.5" /> Send announcement</>
          )}
        </button>
      </SheetContent>
    </Sheet>
  );
}
