import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown } from "lucide-react";

type SubScore = { value: number; weight: number; reason: string };

type Props = {
  open: boolean;
  onClose: () => void;
  score: number;
  label: string;
  phase: string | null;
  daysToFight: number | null;
  campAge: { weeksAhead: number } | null;
  subScores: Record<string, SubScore> | null;
  topDriver: string | null;
  topLimiter: string | null;
  appliedCeiling: { ruleId: string; cap: number } | null;
  coachNarrative?: string | null;
  actionItems?: string[];
};

const SUBSCORE_LABEL: Record<string, string> = {
  trainingLoad: "Training Load",
  sleep: "Sleep",
  weightCut: "Weight Cut",
  wellness: "Wellness",
  nutritionAdherence: "Nutrition",
};

const LABEL_DISPLAY: Record<string, string> = {
  sharp: "Sharp",
  sharpening: "Sharpening",
  off_pace: "Off Pace",
  at_risk: "At Risk",
};

const CEILING_COPY: Record<string, string> = {
  weight_cut_dangerous: "Weight loss rate is over 2%/week. Score is capped until the rate slows.",
  sleep_debt: "Sleep debt is over 10 hours. Score is capped until sleep recovers.",
  training_spike: "Training spike (ACWR over 1.8). Score is capped until load normalizes.",
};

function campPaceCopy(weeksAhead: number): string {
  if (weeksAhead === 0) return "On schedule";
  const n = Math.abs(weeksAhead);
  const unit = n === 1 ? "week" : "weeks";
  return weeksAhead > 0
    ? `${weeksAhead.toFixed(0)} ${unit} ahead of schedule`
    : `${weeksAhead.toFixed(0)} ${unit} behind schedule`;
}

function phaseCopy(phase: string | null): string | null {
  if (!phase) return null;
  if (phase === "fightWeek") return "Fight week";
  if (phase === "peak") return "Peak phase";
  if (phase === "build") return "Build phase";
  return phase;
}

export function FightFormScoreSheet(p: Props) {
  return (
    <Sheet open={p.open} onOpenChange={(v) => !v && p.onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-3xl text-center">Fight Form Score</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col items-center text-center">
          <span className="display-number text-7xl leading-none">{p.score}</span>
          <div className="section-header mt-2">{LABEL_DISPLAY[p.label] ?? p.label}</div>
          {p.campAge && (
            <div className="text-xs text-muted-foreground mt-2">
              {campPaceCopy(p.campAge.weeksAhead)}
            </div>
          )}
          {phaseCopy(p.phase) && p.daysToFight != null && (
            <div className="text-xs text-muted-foreground">
              {phaseCopy(p.phase)} · {p.daysToFight} days to fight
            </div>
          )}
        </div>

        {p.subScores && (
          <div className="mt-6 space-y-3">
            <div className="section-header">What's driving your score</div>
            {Object.entries(p.subScores)
              .sort(([, a], [, b]) => b.value * b.weight - a.value * a.weight)
              .map(([key, sub]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm">
                    <span>
                      {SUBSCORE_LABEL[key]}
                      {key === p.topLimiter ? " · limiter" : ""}
                      {key === p.topDriver ? " · driver" : ""}
                    </span>
                    <span className="display-number text-sm">{sub.value}</span>
                  </div>
                  <Progress value={sub.value} className="h-1.5 mt-1" />
                  <div className="text-xs text-muted-foreground mt-1">{sub.reason}</div>
                </div>
              ))}
          </div>
        )}

        {p.appliedCeiling && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <div className="text-sm">
              {CEILING_COPY[p.appliedCeiling.ruleId] ?? "Score capped"} (cap: {p.appliedCeiling.cap})
            </div>
          </div>
        )}

        {p.coachNarrative && (
          <div className="mt-5">
            <div className="section-header mb-2">Coach's Take</div>
            <p className="text-sm leading-relaxed">{p.coachNarrative}</p>
          </div>
        )}

        {p.actionItems && p.actionItems.length > 0 && (
          <div className="mt-5">
            <div className="section-header mb-2">Action Items</div>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              {p.actionItems.map((it, i) => <li key={i}>{it}</li>)}
            </ol>
          </div>
        )}

        <ScoreGuide />
      </SheetContent>
    </Sheet>
  );
}

function ScoreGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6 border-t border-border/50 pt-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
        <span className="section-header">How your score works</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-6 text-sm leading-relaxed">

        <section className="space-y-2">
          <h4 className="font-semibold text-base">What the number means</h4>
          <p className="text-muted-foreground">
            Fight Form Score is a single number from 0 to 100 that tells you how well your camp is
            going right now.
          </p>
          <p className="text-muted-foreground">
            It blends two things into one figure. Short-term readiness covers today's recovery,
            training, and sleep. Long-term progress covers your weight cut trajectory and your
            nutrition adherence.
          </p>
          <p className="text-muted-foreground">
            The number on screen is a 3-day rolling average. One bad day will not tank it.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-base">What each label means</h4>
          <div className="space-y-2 text-muted-foreground">
            <div>
              <span className="text-emerald-400 font-medium">Sharp (80 and up).</span>{" "}
              You are peaking. Hold the line.
            </div>
            <div>
              <span className="text-amber-400 font-medium">Sharpening (60 to 79).</span>{" "}
              You are on track. Small adjustments will move the score.
            </div>
            <div>
              <span className="text-orange-400 font-medium">Off Pace (40 to 59).</span>{" "}
              You are drifting. Pick one component to fix this week.
            </div>
            <div>
              <span className="text-rose-400 font-medium">At Risk (under 40).</span>{" "}
              Something is wrong. Check the limiter and any ceiling banner first.
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="font-semibold text-base">The five components</h4>

          <div>
            <div className="font-medium">Training Load</div>
            <p className="text-muted-foreground">
              The ratio of your last 7 days of training to your last 28 days. The sweet spot is
              0.8 to 1.3. Below that you are detraining. Above that you are spiking risk.
            </p>
          </div>

          <div>
            <div className="font-medium">Sleep</div>
            <p className="text-muted-foreground">
              Your 7-day sleep debt against an 8-hour target. Coming up 1 hour short every night
              for a week costs roughly 56 points.
            </p>
          </div>

          <div>
            <div className="font-medium">Weight Cut</div>
            <p className="text-muted-foreground">
              Your weekly loss rate versus a sustainable band of 0.3% to 1.0% of bodyweight. It
              also factors in whether your current pace will hit your goal weight by fight night.
            </p>
          </div>

          <div>
            <div className="font-medium">Wellness</div>
            <p className="text-muted-foreground">
              Your Hooper Index, which combines sleep quality, fatigue, soreness, and stress. Logged
              via the daily check-in. Compared to your own baseline, not a population average.
            </p>
          </div>

          <div>
            <div className="font-medium">Nutrition</div>
            <p className="text-muted-foreground">
              How many days in the last 7 you hit your calorie target within 10%, plus whether
              protein cleared 80% of target each day.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-base">Camp phase matters</h4>
          <p className="text-muted-foreground">
            Component weights shift automatically as fight night approaches.
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              <span className="text-foreground">Build phase</span> (more than 14 days out).
              Training Load and Weight Cut carry the most weight.
            </li>
            <li>
              <span className="text-foreground">Peak phase</span> (7 to 14 days out). Sleep and
              Weight Cut get heavier.
            </li>
            <li>
              <span className="text-foreground">Fight Week</span> (7 days or fewer). Weight Cut,
              Sleep, and Wellness dominate. Training Load barely matters.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-base">Soft ceilings</h4>
          <p className="text-muted-foreground">
            Some signals are dangerous enough to cap your score regardless of how good the other
            components look.
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Cutting more than 2% of bodyweight per week for 3 or more days caps the score at 50.</li>
            <li>Sleep debt over 10 hours in a 7-day window caps the score at 65.</li>
            <li>A training spike with ACWR over 1.8 caps the score at 45.</li>
          </ul>
          <p className="text-muted-foreground">
            When a ceiling fires you will see a yellow banner near the top. Fix the specific
            signal and the cap lifts within a few days.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-base">How to use it day-to-day</h4>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Check the score in the morning. The label tells you whether to push or recover.</li>
            <li>Read the <span className="text-foreground">limiter</span>. That is the component holding the score down, and it is also where you can move the number the fastest.</li>
            <li>Optimise for the components, not the number. The number will follow.</li>
            <li>One bad day is noise. Trends over 3 to 7 days are signal.</li>
            <li>If you see a Calibrating state, that is normal. It clears once you have 7 days of logged data.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-base">What it doesn't measure</h4>
          <p className="text-muted-foreground">
            There is no HRV or resting heart rate yet, because there is no wearable integration.
            Skill, technique, fight IQ, and how specific your training is to your opponent are
            also outside this score.
          </p>
          <p className="text-muted-foreground">
            Use Fight Form Score for physical preparation and adherence. It is not the only signal
            for fight readiness.
          </p>
        </section>

      </CollapsibleContent>
    </Collapsible>
  );
}
