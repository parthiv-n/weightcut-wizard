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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[300px] rounded-[24px] p-0 border-border/50 bg-background overflow-hidden gap-0">
        <VisuallyHidden><DialogTitle>No gems remaining</DialogTitle></VisuallyHidden>
        {/* Header */}
        <div className="pt-6 pb-3 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
            <Gem className="h-5.5 w-5.5 text-amber-500" />
          </div>
          <p className="text-base font-bold text-foreground">Out of Gems</p>
          <p className="text-xs text-muted-foreground mt-1">Choose an option to continue</p>
        </div>

        {/* Actions */}
        <div className="px-4 space-y-2">
          <button
            onClick={async () => { await onWatchAd(); }}
            disabled={!canWatchAd || loading}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-green-500/15 border border-green-500/30 active:scale-[0.97] transition-all disabled:opacity-40 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500/20">
              {loading ? <Loader2 className="h-4 w-4 text-green-500 animate-spin" /> : <Play className="h-4 w-4 text-green-500" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">{loading ? 'Loading ad...' : 'Watch Ad'}</p>
              <p className="text-[11px] text-muted-foreground">
                {canWatchAd ? `Earn 1 gem · ${adsRemaining} left today` : 'Daily limit reached'}
              </p>
            </div>
          </button>

          <button
            onClick={onGoPro}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-primary/10 border border-primary/30 active:scale-[0.97] transition-all text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20">
              <Crown className="h-4 w-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Go Pro</p>
              <p className="text-[11px] text-muted-foreground">Unlimited AI · No ads</p>
            </div>
          </button>

        </div>

        {/* Free gem countdown */}
        {countdown && (
          <div className="px-4 pb-4 pt-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-muted/30 border border-border/30 py-2.5 px-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">
                Free gem in <span className="font-bold text-foreground tabular-nums">{countdown}</span>
              </span>
            </div>
          </div>
        )}
        {!countdown && <div className="pb-4" />}
      </DialogContent>
    </Dialog>
  );
}
