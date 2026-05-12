import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
                {p.campAge.weeksAhead >= 0 ? "+" : ""}
                {p.campAge.weeksAhead.toFixed(1)} wks vs schedule
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
      </SheetContent>
    </Sheet>
  );
}
