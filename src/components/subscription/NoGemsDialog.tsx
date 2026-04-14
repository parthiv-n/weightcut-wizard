import { Loader2 } from "lucide-react";
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
      <DialogContent className="sm:max-w-[240px] rounded-xl p-0 border-0 bg-card/90 backdrop-blur-xl overflow-hidden gap-0 shadow-2xl">
        <VisuallyHidden><DialogTitle>No gems remaining</DialogTitle></VisuallyHidden>

        <div className="pt-4 pb-3 px-4 text-center">
          <p className="text-[15px] font-semibold text-foreground">Out of Gems</p>
          <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
            {countdown
              ? <>Free gem in <span className="font-medium tabular-nums text-foreground">{countdown}</span></>
              : "Watch an ad or upgrade."
            }
          </p>
        </div>

        <div className="border-t border-border/40">
          <button
            onClick={async () => { await onWatchAd(); }}
            disabled={!canWatchAd || loading}
            className="w-full py-2.5 text-[14px] font-normal text-primary active:bg-muted/50 transition-colors disabled:opacity-35"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </span>
            ) : canWatchAd ? `Watch Ad (${adsRemaining} left)` : "No Ads Left"}
          </button>

          <div className="border-t border-border/40" />

          <button onClick={onGoPro} className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors">
            Go Pro
          </button>

          <div className="border-t border-border/40" />

          <button onClick={() => onOpenChange(false)} className="w-full py-2.5 text-[14px] font-normal text-muted-foreground active:bg-muted/50 transition-colors">
            Not Now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
