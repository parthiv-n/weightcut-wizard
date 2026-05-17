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
    <div className="grid grid-cols-2 gap-2 px-1 items-stretch">
      <div className="card-surface rounded-2xl px-3 py-2 flex flex-col justify-center">
        <div className="section-header">Weight</div>
        {weight ? (
          <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
            <div className="display-number text-sm whitespace-nowrap tabular-nums">
              {weight.current.toFixed(1)} → {weight.goal.toFixed(1)} kg
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {Math.round(weight.pctComplete * 100)}%
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground mt-0.5">Log a weight to begin</div>
        )}
      </div>

      <div className="card-surface rounded-2xl px-3 py-2 flex flex-col justify-center">
        <div className="flex items-baseline justify-between">
          <div className="section-header">14-day Trend</div>
          {latestScore != null && (
            <div className="display-number text-sm tabular-nums">{Math.round(latestScore)}</div>
          )}
        </div>
        <div className="min-h-[18px] mt-0.5">
          <FightFormTrendSparkline
            points={trend}
            accentClass={accent ? `${accent.stroke} ${accent.fill}` : undefined}
          />
        </div>
      </div>
    </div>
  );
}
