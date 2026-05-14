import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
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
  if (p.state === "paused")  return "Camp is paused — log when ready to resume.";

  if (p.state === "calibrating") {
    if (!p.calibration) return "Logging your first days to calibrate your score.";
    const { daysWithAnyLog, daysNeeded, unlocked } = p.calibration;
    if (unlocked) return "Calibration complete — finalizing your score now.";
    const missing = nextMissingSource(p.adherence);
    const remaining = Math.max(1, daysNeeded - daysWithAnyLog);
    if (missing) {
      return `${remaining} more ${remaining === 1 ? "day" : "days"} to unlock — log ${SOURCE_LABEL[missing].toLowerCase()} today to advance.`;
    }
    return `${remaining} more ${remaining === 1 ? "day" : "days"} of logging to unlock your score.`;
  }

  // state === "ok"
  if (p.appliedCeiling) {
    if (p.appliedCeiling.ruleId === "weight_cut_dangerous") return "Score capped — weight loss is too aggressive this week.";
    if (p.appliedCeiling.ruleId === "sleep_debt") return "Score capped — sleep debt is over 10 hours.";
    if (p.appliedCeiling.ruleId === "training_spike") return "Score capped — training load is spiking.";
    return `Score capped at ${p.appliedCeiling.cap}.`;
  }

  const driver = p.topDriver ? SUBSCORE_HUMAN[p.topDriver] : null;
  const limiter = p.topLimiter ? SUBSCORE_HUMAN[p.topLimiter] : null;

  if (p.label === "sharp") {
    if (driver) return `You're peaking — ${driver.toLowerCase()} is carrying it.`;
    return "You're peaking — hold the line.";
  }
  if (p.label === "sharpening") {
    if (limiter) return `Trending up — ${limiter.toLowerCase()} is the next lever.`;
    return "Trending up — small wins this week.";
  }
  if (p.label === "off_pace") {
    if (limiter) return `Drifting — ${limiter.toLowerCase()} is the brake.`;
    return "Drifting — pick one component to fix this week.";
  }
  // at_risk
  if (limiter) return `At risk — ${limiter.toLowerCase()} needs attention now.`;
  return "At risk — check the limiter and fix it first.";
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

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      <p className="text-[13px] text-foreground/90 text-center px-6 max-w-sm leading-snug">
        {headline}
      </p>

      <div className="grid grid-cols-5 gap-2 w-full max-w-[320px]">
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

      {p.state === "calibrating" && p.calibration && !p.calibration.unlocked && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Day {Math.min(p.calibration.daysWithAnyLog, p.calibration.daysNeeded)} of {p.calibration.daysNeeded}
        </p>
      )}
    </div>
  );
}
