import { useState } from "react";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { FightFormLabel, FightFormState, ScoringPhase, SubScoreKey } from "@/scoring/types";

type Adherence = {
  weight: boolean;
  sleep: boolean;
  training: boolean;
  wellnessCheckin: boolean;
};

type CalibrationProgress = {
  daysWithAnyLog: number;
  daysNeeded: number;
  unlocked: boolean;
  perSource: {
    sleep: number;
    weight: number;
    training: number;
    wellness: number;
    nutrition: number;
  };
};

type Props = {
  state: FightFormState;
  label: FightFormLabel;
  phase: ScoringPhase | null;
  topDriver: SubScoreKey | null;
  topLimiter: SubScoreKey | null;
  appliedCeiling: { ruleId: string; cap: number } | null;
  adherence: Adherence;
  calibration: CalibrationProgress | null;
  onHeadlineTap?: () => void;
};

type SourceKey = "sleep" | "weight" | "training" | "wellness" | "nutrition";

const SOURCE_ORDER: SourceKey[] = ["sleep", "weight", "training", "wellness", "nutrition"];

const SOURCE_LABEL: Record<SourceKey, string> = {
  sleep: "Sleep",
  weight: "Weight",
  training: "Train",
  wellness: "Wellness",
  nutrition: "Meals",
};

// Maps each ring source to the SubScoreKey it informs (for highlight on driver/limiter).
const SOURCE_TO_SUBSCORE: Record<SourceKey, SubScoreKey> = {
  sleep: "sleep",
  weight: "weightCut",
  training: "trainingLoad",
  wellness: "wellness",
  nutrition: "nutritionAdherence",
};

const SUBSCORE_HUMAN: Record<SubScoreKey, string> = {
  trainingLoad: "Training load",
  sleep: "Sleep",
  weightCut: "Weight cut",
  wellness: "Wellness",
  nutritionAdherence: "Nutrition",
};

function adherenceForSource(a: Adherence, source: SourceKey): boolean {
  switch (source) {
    case "sleep": return a.sleep;
    case "weight": return a.weight;
    case "training": return a.training;
    case "wellness": return a.wellnessCheckin;
    case "nutrition": return false; // no per-day adherence bool yet for meals
  }
}

function nextMissingSource(adherence: Adherence): SourceKey | null {
  // Prefer the lightest-friction logs first: sleep & weight are sub-10s actions.
  const order: SourceKey[] = ["sleep", "weight", "wellness", "training", "nutrition"];
  for (const s of order) {
    if (s === "nutrition") continue; // can't reliably infer today-logged
    if (!adherenceForSource(adherence, s)) return s;
  }
  return null;
}

function headlineFor(p: Props): string {
  if (p.state === "no_camp") return "Set a target date and goal weight to start scoring your camp.";
  if (p.state === "paused")  return "Camp is paused. Log when ready to resume.";

  if (p.state === "calibrating") {
    if (!p.calibration) return "Logging your first days to calibrate your score.";
    const { daysWithAnyLog, daysNeeded, unlocked } = p.calibration;
    if (unlocked) return "Calibration complete. Finalizing your score now.";
    const missing = nextMissingSource(p.adherence);
    const remaining = Math.max(1, daysNeeded - daysWithAnyLog);
    if (missing) {
      return `${remaining} more ${remaining === 1 ? "day" : "days"} to unlock. Log ${SOURCE_LABEL[missing].toLowerCase()} today to advance.`;
    }
    return `${remaining} more ${remaining === 1 ? "day" : "days"} of logging to unlock your score.`;
  }

  // state === "ok"
  if (p.appliedCeiling) {
    if (p.appliedCeiling.ruleId === "weight_cut_dangerous") return "Score capped. Weight loss is too aggressive this week.";
    if (p.appliedCeiling.ruleId === "sleep_debt") return "Score capped. Sleep debt is over 10 hours.";
    if (p.appliedCeiling.ruleId === "training_spike") return "Score capped. Training load is spiking.";
    return `Score capped at ${p.appliedCeiling.cap}.`;
  }

  const driver = p.topDriver ? SUBSCORE_HUMAN[p.topDriver] : null;
  const limiter = p.topLimiter ? SUBSCORE_HUMAN[p.topLimiter] : null;

  if (p.label === "sharp") {
    if (driver) return `You're peaking. ${driver} is carrying it.`;
    return "You're peaking. Hold the line.";
  }
  if (p.label === "sharpening") {
    if (limiter) return `Trending up. ${limiter} is the next lever.`;
    return "Trending up. Small wins this week.";
  }
  if (p.label === "off_pace") {
    if (limiter) return `Drifting. ${limiter} is the brake.`;
    return "Drifting. Pick one component to fix this week.";
  }
  // at_risk
  if (limiter) return `At risk. ${limiter} needs attention now.`;
  return "At risk. Check the limiter and fix it first.";
}

function SourceDot({
  source,
  loggedToday,
  daysInLast7,
  isDriver,
  isLimiter,
  showCount,
}: {
  source: SourceKey;
  loggedToday: boolean;
  daysInLast7: number;
  isDriver: boolean;
  isLimiter: boolean;
  showCount: boolean;
}) {
  // Filled circle when today is logged. Outline ring with 7-segment progress
  // arc when not. During calibrating, a numeric "n/7" badge under the dot
  // makes per-source progress concrete instead of decorative.
  const ringColor = isLimiter
    ? "border-amber-400/70"
    : isDriver
      ? "border-emerald-400/70"
      : "border-border";

  const fillColor = isLimiter
    ? "bg-amber-400/80"
    : isDriver
      ? "bg-emerald-400/80"
      : "bg-foreground/80";

  // Shape fallback for color-blind users: a tiny up arrow above the driver
  // and down arrow above the limiter, so the diagnostic reads without
  // relying on the emerald/amber colour pair alone.
  const indicator = isDriver ? (
    <ArrowUp aria-label="driver" className="size-2.5 text-emerald-400" strokeWidth={3} />
  ) : isLimiter ? (
    <ArrowDown aria-label="limiter" className="size-2.5 text-amber-400" strokeWidth={3} />
  ) : (
    <span className="size-2.5" aria-hidden />
  );

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      {indicator}
      <div
        className={cn(
          "h-3 w-3 rounded-full border transition-colors",
          ringColor,
          loggedToday ? fillColor : "bg-transparent",
        )}
        aria-hidden
      />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 whitespace-nowrap">
        {SOURCE_LABEL[source]}
      </span>
      {showCount && (
        <span className="text-[10px] font-bold display-number tabular-nums leading-none">
          {daysInLast7}<span className="text-muted-foreground/60">/7</span>
        </span>
      )}
    </div>
  );
}

export function FightFormInsightStrip(p: Props) {
  const [legendOpen, setLegendOpen] = useState(false);

  if (p.state === "no_camp" || p.state === "paused") {
    return (
      <p className="text-[12px] text-muted-foreground text-center mt-2 px-6 max-w-xs mx-auto leading-snug">
        {headlineFor(p)}
      </p>
    );
  }

  const headline = headlineFor(p);
  // Hide the per-source "n/7" badges once the threshold is met — the score
  // is already finalizing and the numbers stop being a learning signal.
  const showCount =
    p.state === "calibrating"
    && p.calibration != null
    && !p.calibration.unlocked;

  // When the strip carries diagnostic info (an applied cap, or a driver/
  // limiter once the score is unlocked) we surface a "Why?" tap target so
  // the user can pull up the full explanation sheet instead of guessing
  // what "Score capped — training load is spiking" actually means.
  const isTappable =
    !!p.onHeadlineTap &&
    (p.appliedCeiling != null || (p.state === "ok" && (p.topDriver != null || p.topLimiter != null)));

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      {isTappable ? (
        <button
          type="button"
          onClick={p.onHeadlineTap}
          className="block text-[13px] text-foreground/90 text-center px-6 max-w-sm leading-snug active:opacity-70 transition-opacity"
          aria-label="Show explanation"
        >
          <span>{headline}</span>{" "}
          <span className="text-[11px] font-semibold text-primary underline underline-offset-2 decoration-primary/40 whitespace-nowrap">
            Why?
          </span>
        </button>
      ) : (
        <p className="text-[13px] text-foreground/90 text-center px-6 max-w-sm leading-snug">
          {headline}
        </p>
      )}

      <div className="relative w-full max-w-[320px]">
        <div className="grid grid-cols-5 gap-2">
          {SOURCE_ORDER.map((s) => {
            const sub = SOURCE_TO_SUBSCORE[s];
            return (
              <SourceDot
                key={s}
                source={s}
                loggedToday={adherenceForSource(p.adherence, s)}
                daysInLast7={p.calibration?.perSource[s] ?? 0}
                isDriver={p.state === "ok" && sub === p.topDriver}
                isLimiter={p.state === "ok" && sub === p.topLimiter}
                showCount={showCount}
              />
            );
          })}
        </div>
        {/* Discreet "?" floats over the right edge of the dots row so the
            legend is one tap away without taking a row of its own. */}
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          aria-label="What do these dots mean?"
          className="absolute -right-1 -top-1 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground/70 active:text-foreground active:bg-muted/40 transition-colors"
        >
          <HelpCircle className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>

      {p.state === "calibrating" && p.calibration && !p.calibration.unlocked && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Day {Math.min(p.calibration.daysWithAnyLog, p.calibration.daysNeeded)} of {p.calibration.daysNeeded}
        </p>
      )}

      <DotsLegendSheet open={legendOpen} onOpenChange={setLegendOpen} />
    </div>
  );
}

function DotsLegendSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle className="text-xl text-center">What the dots mean</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* The five signals */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70 mb-2">
              The five daily signals
            </p>
            <ul className="space-y-2 text-[13px] leading-snug text-foreground/90">
              <li><span className="font-semibold text-foreground">Sleep</span> · last night's sleep duration and quality</li>
              <li><span className="font-semibold text-foreground">Weight</span> · today's morning weigh-in</li>
              <li><span className="font-semibold text-foreground">Train</span> · today's training session and intensity</li>
              <li><span className="font-semibold text-foreground">Wellness</span> · your daily mood, stress, and soreness check-in</li>
              <li><span className="font-semibold text-foreground">Meals</span> · today's calories and macros vs your targets</li>
            </ul>
          </section>

          {/* Filled vs outline */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70 mb-2">
              Dot state
            </p>
            <div className="space-y-2.5 text-[13px] text-foreground/90">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-foreground/80 border border-border" aria-hidden />
                <span>Filled. You've logged this today.</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-transparent border border-border" aria-hidden />
                <span>Outline only. Not logged yet today.</span>
              </div>
            </div>
          </section>

          {/* Driver / limiter arrows */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70 mb-2">
              Once your score is unlocked
            </p>
            <div className="space-y-3 text-[13px] text-foreground/90 leading-snug">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 mt-0.5">
                  <ArrowUp className="h-3 w-3 text-emerald-400" strokeWidth={3} />
                  <div className="h-3 w-3 rounded-full bg-emerald-400/80 border border-emerald-400/70" aria-hidden />
                </div>
                <p>
                  <span className="font-semibold text-emerald-400">Green up arrow</span> marks your
                  top driver. This signal is doing the most to lift your score right now.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 mt-0.5">
                  <ArrowDown className="h-3 w-3 text-amber-400" strokeWidth={3} />
                  <div className="h-3 w-3 rounded-full bg-amber-400/80 border border-amber-400/70" aria-hidden />
                </div>
                <p>
                  <span className="font-semibold text-amber-400">Amber down arrow</span> marks your
                  top limiter. This signal is the biggest thing holding your score back. Fix it first.
                </p>
              </div>
            </div>
          </section>

          <p className="text-[12px] text-muted-foreground text-center leading-snug pt-1">
            Log all five most days. Your score gets sharper the more it has to learn from.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
