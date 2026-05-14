import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export type TutorialCard = {
  // Stable key for the step (used for React reconciliation).
  key: string;
  title: string;
  icon: LucideIcon;
  blurb: string;
  // Optional second line (e.g. "Inputs: ...") rendered subdued under blurb.
  meta?: string;
  // Optional component slot for a value/stat readout next to the title
  // (e.g. "Your current value: 78/100" in the calibration tour).
  rightSlot?: React.ReactNode;
};

type Props = {
  open: boolean;
  onClose: () => void;
  cards: TutorialCard[];
  // Subhead label shown above the title in tiny uppercase — e.g.
  // "How your score works" or "What each label means".
  eyebrow?: string;
};

// Shared visual shell for the in-app tutorials (calibration tour,
// score-explainer tour, future onboarding). Centralised so a styling change
// only has to land here. The native Dialog close X handles "skip" so the
// header doesn't carry a competing skip control.
export function TutorialDialog({ open, onClose, cards, eyebrow }: Props) {
  const [step, setStep] = useState(0);
  const total = cards.length;

  // Reset to step 0 whenever the dialog is reopened so the next tour run
  // starts from the top rather than wherever the user left off.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (total === 0) return null;
  const card = cards[Math.min(step, total - 1)];
  const Icon = card.icon;
  const isLast = step === total - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <div className="p-6 pr-12 space-y-5">
          {/* Header line — leaves the right edge clear for the Dialog's
              built-in 44px close X so the two never overlap. */}
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-bold">
            {step + 1} of {total}
            {eyebrow ? ` · ${eyebrow}` : ""}
          </span>

          <div className="flex items-start gap-3">
            <div className="size-10 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
              <Icon className="size-5 text-foreground/80" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold leading-tight">{card.title}</h3>
              {card.rightSlot && (
                <div className="mt-0.5">{card.rightSlot}</div>
              )}
            </div>
          </div>

          <p className="text-[13.5px] text-muted-foreground leading-relaxed">{card.blurb}</p>
          {card.meta && (
            <p className="text-[12px] text-muted-foreground/70">{card.meta}</p>
          )}

          <div className="flex justify-center gap-1.5 pt-1">
            {cards.map((c, i) => (
              <span
                key={c.key}
                className={
                  i === step
                    ? "h-1.5 w-5 rounded-full bg-foreground transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all"
                }
              />
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            {step > 0 && (
              <Button variant="ghost" className="flex-1" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() => (isLast ? onClose() : setStep(step + 1))}
            >
              {isLast ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
