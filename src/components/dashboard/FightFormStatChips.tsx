import { FightFormTrendSparkline } from "./FightFormTrendSparkline";
import type { FightFormState } from "@/scoring/types";

type TrendPoint = { date: string; score: number; state: FightFormState };

type Props = {
  weight: { current: number; goal: number; pctComplete: number } | null;
  // Last N days of score points for the inline trend chart. The chip
  // formerly held "Camp Pace" which duplicated the caption already shown
  // by the insight strip — the trend replaces it with information the user
  // can't read off any other surface on the dashboard.
  trend: TrendPoint[] | null;
  latestScore: number | null;
  latestLabel: "sharp" | "sharpening" | "off_pace" | "at_risk" | null;
};

const LABEL_ACCENT: Record<NonNullable<Props["latestLabel"]>, { stroke: string; fill: string }> = {
  sharp: { stroke: "stroke-emerald-400", fill: "fill-emerald-400" },
  sharpening: { stroke: "stroke-amber-400", fill: "fill-amber-400" },
  off_pace: { stroke: "stroke-orange-400", fill: "fill-orange-400" },
  at_risk: { stroke: "stroke-rose-400", fill: "fill-rose-400" },
};

export function FightFormStatChips({ weight, trend, latestScore, latestLabel }: Props) {
  const accent = latestLabel ? LABEL_ACCENT[latestLabel] : null;
  const okCount = trend?.filter((p) => p.state === "ok").length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2 px-1">
      <div className="card-surface rounded-2xl p-3">
        <div className="section-header mb-1">Weight</div>
        {weight ? (
          <>
            <div className="display-number text-base">
              {weight.current.toFixed(1)} → {weight.goal.toFixed(1)} kg
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.round(weight.pctComplete * 100)}% complete
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Log a weight to begin</div>
        )}
      </div>

      <div className="card-surface rounded-2xl p-3 flex flex-col">
        <div className="flex items-baseline justify-between mb-1">
          <div className="section-header">14-day Trend</div>
          {latestScore != null && (
            <div className="display-number text-base tabular-nums">{Math.round(latestScore)}</div>
          )}
        </div>
        <div className="flex-1 min-h-[28px]">
          <FightFormTrendSparkline
            points={trend}
            accentClass={accent ? `${accent.stroke} ${accent.fill}` : undefined}
          />
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {okCount > 0
            ? `${okCount} scored ${okCount === 1 ? "day" : "days"}`
            : "Score not unlocked yet"}
        </div>
      </div>
    </div>
  );
}
