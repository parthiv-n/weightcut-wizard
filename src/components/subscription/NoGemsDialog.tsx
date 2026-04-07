import { Gem, Play, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-[24px]">
        <DialogHeader className="items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
            <Gem className="h-7 w-7 text-amber-500" />
          </div>
          <DialogTitle className="text-lg">Out of AI Calls</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Watch a short video to earn 1 gem and continue.
          </p>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Button
            onClick={async () => { await onWatchAd(); }}
            disabled={!canWatchAd || loading}
            className="w-full h-12 rounded-xl text-sm font-semibold bg-gradient-to-r from-green-600 to-green-500"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Loading...' : 'Watch Ad for 1 Gem'}
          </Button>

          {!canWatchAd && (
            <p className="text-xs text-center text-muted-foreground">Daily ad limit reached</p>
          )}

          <Button
            onClick={onGoPro}
            variant="outline"
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            <Zap className="h-4 w-4 mr-2" />
            Go Pro — Unlimited
          </Button>

          {canWatchAd && (
            <p className="text-xs text-center text-muted-foreground">
              {adsRemaining} ad{adsRemaining !== 1 ? 's' : ''} remaining today
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
