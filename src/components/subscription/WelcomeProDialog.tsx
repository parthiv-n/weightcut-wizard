import { Zap, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const UNLOCKED_FEATURES = [
  "Unlimited AI meal analysis",
  "AI Coach chat — no limits",
  "AI workout routine generator",
  "Fight week protocols & analysis",
  "Rehydration protocol generation",
  "Diet analysis & meal planning",
  "Training load analytics",
  "Weight trend AI insights",
];

interface WelcomeProDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeProDialog({ open, onClose }: WelcomeProDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10004] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 animate-in fade-in duration-300" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-3xl border border-primary/20 bg-background/98 dark:bg-zinc-900/98 shadow-[0_24px_80px_rgba(37,99,235,0.15)] animate-in zoom-in-95 fade-in duration-300 overflow-hidden">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-primary/20 blur-3xl rounded-full pointer-events-none" />

        <div className="relative p-6 pt-8 flex flex-col items-center text-center">
          {/* Icon */}
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>

          <h2 className="text-xl font-bold text-foreground">Welcome to Pro!</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-[260px]">
            You've unlocked the full FightCamp Wizard experience.
          </p>

          {/* Features grid */}
          <div className="w-full mt-6 space-y-2.5 text-left">
            {UNLOCKED_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[13px] text-foreground">{feature}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={onClose}
            className="w-full h-12 rounded-xl text-[15px] font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/25 mt-6 active:scale-[0.97] transition-transform"
          >
            Let's Go
          </Button>
        </div>
      </div>
    </div>
  );
}
