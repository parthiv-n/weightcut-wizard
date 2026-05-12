import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";

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
  onRefresh: () => void;
};

const SUBSCORE_LABEL: Record<string, string> = {
  trainingLoad: "Training Load",
  sleep: "Sleep",
  weightCut: "Weight Cut",
  wellness: "Wellness",
  nutritionAdherence: "Nutrition",
};

const CEILING_COPY: Record<string, string> = {
  weight_cut_dangerous: "Weight loss rate is over 2%/week — capped until you slow down",
  sleep_debt: "Sleep debt over 10h — capped until you recover sleep",
  training_spike: "Training spike (ACWR > 1.8) — capped until load normalizes",
};

export function FightFormScoreSheet(p: Props) {
  return (
    <Sheet open={p.open} onOpenChange={(v) => !v && p.onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-3xl">Fight Form Score</SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex items-center gap-4">
          <span className="display-number text-6xl">{p.score}</span>
          <div>
            <div className="section-header">{p.label}</div>
            {p.campAge && (
              <div className="text-xs text-muted-foreground mt-1">
                Camp pace: {p.campAge.weeksAhead === 0
                  ? "on schedule"
                  : `${p.campAge.weeksAhead > 0 ? "+" : ""}${p.campAge.weeksAhead.toFixed(0)} wk${Math.abs(p.campAge.weeksAhead) === 1 ? "" : "s"} ${p.campAge.weeksAhead > 0 ? "ahead" : "behind"}`}
              </div>
            )}
            {p.phase && p.daysToFight != null && (
              <div className="text-xs text-muted-foreground">
                {p.phase} · {p.daysToFight} days to fight
              </div>
            )}
          </div>
        </div>

        {p.subScores && (
          <div className="mt-5 space-y-3">
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

        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={p.onRefresh} className="gap-2">
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>

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
      <CollapsibleContent className="mt-3 space-y-4 text-sm leading-relaxed">
        <section>
          <h4 className="font-semibold mb-1">What the number means</h4>
          <p className="text-muted-foreground">
            Fight Form Score is a single 0–100 readout of how well your camp is going right now. It
            blends short-term readiness (today's recovery, training, sleep) with long-term camp
            progress (weight cut trajectory, nutrition adherence). The number you see is a 3-day
            average — one off day won't tank it.
          </p>
        </section>

        <section>
          <h4 className="font-semibold mb-1">Labels at a glance</h4>
          <ul className="space-y-1 text-muted-foreground">
            <li><span className="text-emerald-400 font-medium">Sharp (80+)</span> — peaking; ride this</li>
            <li><span className="text-amber-400 font-medium">Sharpening (60–79)</span> — on track; small fixes available</li>
            <li><span className="text-orange-400 font-medium">Off Pace (40–59)</span> — drifting; pick one driver to address</li>
            <li><span className="text-rose-400 font-medium">At Risk (&lt;40)</span> — something's wrong; check the limiter and the ceiling banner</li>
          </ul>
        </section>

        <section>
          <h4 className="font-semibold mb-1">The five components</h4>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><span className="text-foreground">Training Load</span> — your acute:chronic workload ratio (last 7d ÷ last 28d). Sweet spot is 0.8–1.3. Too low = detraining; too high = injury risk.</li>
            <li><span className="text-foreground">Sleep</span> — 7-day debt vs an 8h/night target. 1h short × 7 nights is already a ~56pt deduction.</li>
            <li><span className="text-foreground">Weight Cut</span> — your loss rate vs the sustainable band (0.3–1.0% of bodyweight per week) and whether you'll hit your goal by fight night.</li>
            <li><span className="text-foreground">Wellness</span> — your Hooper Index (sleep quality + fatigue + soreness + stress) compared to your own baseline. Logged via the daily check-in.</li>
            <li><span className="text-foreground">Nutrition</span> — how many days last week you hit your calorie target (±10%) and whether protein cleared 80% of target.</li>
          </ul>
        </section>

        <section>
          <h4 className="font-semibold mb-1">Camp phase matters</h4>
          <p className="text-muted-foreground">
            Component weights shift automatically as you approach fight night. In build phase
            (&gt;14 days out) training load and weight cut share the spotlight. In peak (7–14 days)
            sleep and weight cut get heavier. In fight week (≤7 days) the score is dominated by
            weight cut, sleep, and wellness — training load barely matters.
          </p>
        </section>

        <section>
          <h4 className="font-semibold mb-1">Soft ceilings (why a great-looking score can still cap)</h4>
          <p className="text-muted-foreground">
            Some signals override everything else because they signal danger:
          </p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            <li>• Cutting &gt;2% bodyweight/week for 3+ days → capped at 50</li>
            <li>• Sleep debt &gt;10h over 7 days → capped at 65</li>
            <li>• Training spike (ACWR &gt; 1.8) → capped at 45</li>
          </ul>
          <p className="mt-1 text-muted-foreground">
            When a ceiling fires you'll see a yellow banner. The fix is mechanical: address the
            specific signal and the cap lifts within a few days.
          </p>
        </section>

        <section>
          <h4 className="font-semibold mb-1">How to use it day-to-day</h4>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Check it in the morning. The label tells you whether to push or recover.</li>
            <li>• Read the <span className="text-foreground">limiter</span> — that's where you'll move the score fastest.</li>
            <li>• Don't optimise for the number itself. Optimise for the components; the number follows.</li>
            <li>• One bad day is noise. Trends over 3–7 days are signal.</li>
            <li>• Calibrating state (under 7 days of data) is normal at the start of camp.</li>
          </ul>
        </section>

        <section>
          <h4 className="font-semibold mb-1">What it doesn't measure</h4>
          <p className="text-muted-foreground">
            No HRV/resting-HR yet (no wearable integration). Skill, technique, fight-IQ, and how
            specific the work is to your opponent aren't in here either. Use the score for
            physical preparation and adherence — not as the only signal for fight readiness.
          </p>
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}
