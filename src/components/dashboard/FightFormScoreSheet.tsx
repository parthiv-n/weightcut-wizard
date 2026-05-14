import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { FightFormHowItWorksTour } from "./FightFormHowItWorksTour";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { FightFormScoreCard } from "@/components/share/cards/FightFormScoreCard";
import type { FightFormLabel, ScoringPhase, SubScoreKey, SubScore as SubScoreType } from "@/scoring/types";

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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVariant, setShareVariant] = useState<"dark" | "transparent">("dark");
  return (
    <Sheet open={p.open} onOpenChange={(v) => !v && p.onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader className="relative">
          <SheetTitle className="text-3xl text-center">Fight Form Score</SheetTitle>
          {/* Absolute-positioned so the title stays optically centered; the
              built-in close X already lives in the top-right of the Sheet so
              we mirror its position with the share button on the top-left. */}
          <div className="absolute left-0 top-0">
            <ShareButton onClick={() => { setShareVariant("dark"); setShareOpen(true); }} />
          </div>
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
                  <div className="text-xs font-semibold text-foreground/90 mt-1 truncate">
                    {sub.reason.replace(/\s*—\s*/g, ", ")}
                  </div>
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

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={(v) => { setShareOpen(v); if (v) setShareVariant("dark"); }}
        transparent={shareVariant === "transparent"}
        showSwipeHint
        title="Share Fight Form Score"
        shareTitle="Fight Form Score"
        shareText={`My Fight Form Score is ${p.score} — ${LABEL_DISPLAY[p.label] ?? p.label}`}
      >
        {({ cardRef, aspect, transparent }) => {
          let touchStartX = 0;
          const flash = (el: HTMLElement | null) => {
            if (!el) return;
            el.classList.remove("share-variant-flash");
            void el.offsetWidth;
            el.classList.add("share-variant-flash");
          };
          return (
            <div
              onTouchStart={(e) => { touchStartX = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const delta = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(delta) > 40) {
                  setShareVariant((v) => v === "dark" ? "transparent" : "dark");
                  flash(e.currentTarget as HTMLElement);
                }
              }}
            >
              <FightFormScoreCard
                ref={cardRef}
                score={p.score}
                label={(p.label as FightFormLabel) ?? "off_pace"}
                phase={(p.phase as ScoringPhase | null) ?? null}
                daysToFight={p.daysToFight}
                campAge={p.campAge}
                subScores={p.subScores as Record<SubScoreKey, SubScoreType> | null}
                aspect={aspect}
                transparent={transparent}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 }}>
                <button
                  onClick={() => setShareVariant("dark")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: shareVariant === "dark" ? "#ffffff" : "rgba(255,255,255,0.35)",
                    transition: "color 0.2s",
                  }}
                >
                  Dark
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["dark", "transparent"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setShareVariant(v)}
                      aria-label={`${v} style`}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        background: shareVariant === v ? "#ffffff" : "rgba(255,255,255,0.3)",
                        transition: "background 0.2s",
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setShareVariant("transparent")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: shareVariant === "transparent" ? "#ffffff" : "rgba(255,255,255,0.35)",
                    transition: "color 0.2s",
                  }}
                >
                  Transparent
                </button>
              </div>
            </div>
          );
        }}
      </ShareCardDialog>
    </Sheet>
  );
}

function ScoreGuide() {
  const [tourOpen, setTourOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setTourOpen(true)}
        className="mt-6 border-t border-border/50 pt-4 flex w-full items-center justify-between text-left hover:opacity-80 transition-opacity"
      >
        <span className="section-header">How your score works</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
      <FightFormHowItWorksTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  );
}
