import { forwardRef } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StatBlock } from "../templates/StatBlock";
import { MiniChart } from "../templates/MiniChart";
import type { FightWeekProjection } from "@/utils/fightWeekEngine";
import { usePremium } from "@/hooks/usePremium";

interface FightWeekSummaryCardProps {
  projection: FightWeekProjection;
  currentWeight: number;
  targetWeight: number;
  daysOut: number;
  aspect?: AspectRatio;
}

const BREAKDOWN_COLORS = {
  glycogen: "#3b82f6",
  fibre: "#22c55e",
  sodium: "#06b6d4",
  waterLoading: "#a855f7",
  dehydration: "#f59e0b",
};

const BREAKDOWN_LABELS = {
  glycogen: "Glycogen",
  fibre: "Fibre",
  sodium: "Sodium",
  waterLoading: "Water Load",
  dehydration: "Dehydration",
};

const SAFETY_COLORS: Record<string, string> = {
  green: "#22c55e",
  orange: "#f59e0b",
  red: "#ef4444",
};

const SAFETY_LABELS: Record<string, string> = {
  green: "ON TRACK",
  orange: "CAUTION",
  red: "CRITICAL",
};

export const FightWeekSummaryCard = forwardRef<HTMLDivElement, FightWeekSummaryCardProps>(
  ({ projection, currentWeight, targetWeight, daysOut, aspect = "square" }, ref) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";

    const breakdown = [
      { key: "glycogen", value: projection.glycogenLoss },
      { key: "fibre", value: projection.fibreLoss },
      { key: "sodium", value: projection.sodiumLoss },
      { key: "waterLoading", value: projection.waterLoadingLoss },
      { key: "dehydration", value: projection.dehydrationNeeded },
    ].filter((b) => b.value > 0);

    const chartData = projection.timeline.map((d) => ({ value: d.projectedWeight }));
    const safetyColor = SAFETY_COLORS[projection.overallSafety] ?? "#22c55e";
    const safetyLabel = SAFETY_LABELS[projection.overallSafety] ?? "ON TRACK";

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s ? 40 : 24 }}>
          <div>
            <div
              style={{
                fontSize: s ? 18 : 14,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#2563eb",
                marginBottom: s ? 8 : 4,
              }}
            >
              FIGHT WEEK
            </div>
            <div style={{ fontSize: s ? 20 : 16, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
              Weight Cut Protocol
            </div>
          </div>
          <div
            style={{
              padding: s ? "10px 24px" : "6px 16px",
              borderRadius: 999,
              fontSize: s ? 16 : 13,
              fontWeight: 700,
              color: safetyColor,
              background: `${safetyColor}15`,
              border: `1px solid ${safetyColor}30`,
            }}
          >
            {safetyLabel}
          </div>
        </div>

        {/* Hero stat */}
        <div style={{ textAlign: "center", marginBottom: s ? 44 : 28 }}>
          <div
            style={{
              fontSize: s ? 112 : 72,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {projection.totalToCut.toFixed(1)}
            <span style={{ fontSize: s ? 40 : 28, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>kg</span>
          </div>
          <div style={{ fontSize: s ? 18 : 14, color: "rgba(255,255,255,0.45)", marginTop: s ? 14 : 8, fontWeight: 600, letterSpacing: "0.1em" }}>
            TOTAL TO CUT
          </div>
        </div>

        {/* Weight arrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: s ? 24 : 16,
            marginBottom: s ? 44 : 28,
            fontSize: s ? 34 : 24,
            fontWeight: 700,
          }}
        >
          <span>{currentWeight.toFixed(1)} kg</span>
          <span style={{ color: "#2563eb", fontSize: s ? 28 : 20 }}>&rarr;</span>
          <span style={{ color: "#22c55e" }}>{targetWeight.toFixed(1)} kg</span>
        </div>

        {/* Stacked bar */}
        <div
          style={{
            display: "flex",
            height: s ? 36 : 24,
            borderRadius: s ? 18 : 12,
            overflow: "hidden",
            background: "rgba(255,255,255,0.05)",
            marginBottom: s ? 20 : 12,
          }}
        >
          {breakdown.map((b) => {
            const pct = (b.value / projection.totalToCut) * 100;
            if (pct < 1) return null;
            return (
              <div
                key={b.key}
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: BREAKDOWN_COLORS[b.key as keyof typeof BREAKDOWN_COLORS],
                  opacity: 0.85,
                }}
              />
            );
          })}
        </div>

        {/* Breakdown legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: s ? 20 : 12,
            marginBottom: s ? 44 : 28,
            justifyContent: "center",
          }}
        >
          {breakdown.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: s ? 10 : 6 }}>
              <div
                style={{
                  width: s ? 14 : 10,
                  height: s ? 14 : 10,
                  borderRadius: s ? 4 : 3,
                  backgroundColor: BREAKDOWN_COLORS[b.key as keyof typeof BREAKDOWN_COLORS],
                }}
              />
              <span style={{ fontSize: s ? 16 : 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                {BREAKDOWN_LABELS[b.key as keyof typeof BREAKDOWN_LABELS]} {b.value.toFixed(1)}kg
              </span>
            </div>
          ))}
        </div>

        {/* Stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: s ? 16 : 12, marginBottom: s ? 40 : 24 }}>
          <StatBlock
            label="% Bodyweight"
            value={projection.percentBW.toFixed(1)}
            unit="%"
            color={projection.percentBW <= 5 ? "#22c55e" : projection.percentBW <= 8 ? "#f59e0b" : "#ef4444"}
            size={s ? "large" : "default"}
          />
          <StatBlock label="Days Out" value={daysOut} unit="days" size={s ? "large" : "default"} />
          <StatBlock
            label="Dehydration"
            value={projection.dehydrationPercentBW.toFixed(1)}
            unit="% BW"
            color={SAFETY_COLORS[projection.dehydrationSafety]}
            size={s ? "large" : "default"}
          />
          <StatBlock
            label="Sauna Sessions"
            value={projection.saunaSessions}
            unit={projection.saunaSessions === 1 ? "session" : "sessions"}
            size={s ? "large" : "default"}
          />
        </div>

        {/* Mini projection chart */}
        {chartData.length >= 2 && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MiniChart
              data={chartData}
              type="area"
              color="#2563eb"
              fillColor="rgba(37,99,235,0.15)"
              referenceLine={targetWeight}
              referenceColor="#22c55e"
              height={s ? 260 : 160}
              width={960}
            />
          </div>
        )}
      </CardShell>
    );
  }
);

FightWeekSummaryCard.displayName = "FightWeekSummaryCard";
