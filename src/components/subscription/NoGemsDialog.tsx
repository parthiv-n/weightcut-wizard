import { useEffect, useRef } from "react";
import { Gem, Play, Crown, Loader2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useNextGemCountdown } from "./AILimitTimer";

interface NoGemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWatchAd: () => Promise<void>;
  onGoPro: () => void;
  adsRemaining: number;
  loading: boolean;
}

export function NoGemsDialog({ open, onOpenChange, onWatchAd, onGoPro, adsRemaining, loading }: NoGemsDialogProps) {
  const canWatchAd = adsRemaining > 0;
  const countdown = useNextGemCountdown(0, false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 8 seconds — pauses during ad loading, restarts when done
  useEffect(() => {
    if (!open || loading) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => onOpenChange(false), 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open, loading, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px] rounded-[28px] p-0 border-border/30 bg-background overflow-hidden gap-0">
        <VisuallyHidden><DialogTitle>No gems remaining</DialogTitle></VisuallyHidden>
        {/* Header */}
        <div className="pt-6 pb-4 px-6 text-center">
          <div className="h-11 w-11 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
            <Gem className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-[15px] font-semibold text-foreground">No gems remaining</p>
          <p className="text-[13px] text-muted-foreground mt-1">Watch a short video or go Pro to continue</p>
        </div>

        {/* Actions */}
        <div className="px-4 space-y-2">
          <button
            onClick={async () => { await onWatchAd(); }}
            disabled={!canWatchAd || loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/30 active:scale-[0.98] transition-all disabled:opacity-40 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
              {loading ? <Loader2 className="h-4 w-4 text-green-500 animate-spin" /> : <Play className="h-4 w-4 text-green-500" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">{loading ? 'Loading ad...' : 'Watch Ad'}</p>
              <p className="text-[11px] text-muted-foreground">
                {canWatchAd ? `Earn 1 gem · ${adsRemaining} left today` : 'Daily limit reached'}
              </p>
            </div>
          </button>

          <button
            onClick={onGoPro}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/20 active:scale-[0.98] transition-all text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Crown className="h-4 w-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Go Pro</p>
              <p className="text-[11px] text-muted-foreground">Unlimited AI · No ads</p>
            </div>
          </button>

        </div>

        {/* Free gem countdown */}
        {countdown && (
          <div className="px-4 pb-4 pt-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-muted/20 dark:bg-white/[0.03] border border-border/20 py-2.5 px-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">
                Free gem in <span className="font-semibold text-foreground tabular-nums">{countdown}</span>
              </span>
            </div>
          </div>
        )}
        {!countdown && <div className="pb-4" />}
      </DialogContent>
    </Dialog>
  );
}
