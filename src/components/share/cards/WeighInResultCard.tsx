import { forwardRef } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StatBlock } from "../templates/StatBlock";
import { usePremium } from "@/hooks/usePremium";

interface WeighInResultCardProps {
  startWeight: number;
  endWeight: number;
  targetWeight: number;
  aspect?: AspectRatio;
}

export const WeighInResultCard = forwardRef<HTMLDivElement, WeighInResultCardProps>(
  ({ startWeight, endWeight, targetWeight, aspect = "square" }, ref) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";
    const madeWeight = endWeight <= targetWeight;
    const delta = startWeight - endWeight;
    const deltaPercent = (delta / startWeight) * 100;

    const heroColor = madeWeight ? "#22c55e" : "#ef4444";
    const heroText = madeWeight ? "MADE WEIGHT!" : "WEIGH-IN";
    const gradientOverlay = madeWeight
      ? "radial-gradient(ellipse at 50% 30%, rgba(34,197,94,0.15) 0%, transparent 60%)"
      : "radial-gradient(ellipse at 50% 30%, rgba(239,68,68,0.1) 0%, transparent 60%)";

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium}>
        {/* Celebration gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: gradientOverlay,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: s ? 56 : 32,
            position: "relative",
          }}
        >
          {/* Success checkmark */}
          {madeWeight && (
            <div
              style={{
                width: s ? 120 : 80,
                height: s ? 120 : 80,
                borderRadius: s ? 60 : 40,
                background: "rgba(34,197,94,0.15)",
                border: `${s ? 3 : 2}px solid rgba(34,197,94,0.3)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: s ? 60 : 40,
              }}
            >
              &#10003;
            </div>
          )}

          {/* Hero text */}
          <div
            style={{
              fontSize: s ? 64 : 42,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: heroColor,
              textAlign: "center",
            }}
          >
            {heroText}
          </div>

          {/* Weight display */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: s ? 40 : 24,
              fontSize: s ? 52 : 36,
              fontWeight: 700,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: s ? 18 : 14, color: "rgba(255,255,255,0.4)", marginBottom: s ? 8 : 4, fontWeight: 600, letterSpacing: "0.1em" }}>
                START
              </div>
              <div>{startWeight.toFixed(1)}</div>
            </div>
            <div style={{ color: heroColor, fontSize: s ? 40 : 28 }}>&rarr;</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: s ? 18 : 14, color: "rgba(255,255,255,0.4)", marginBottom: s ? 8 : 4, fontWeight: 600, letterSpacing: "0.1em" }}>
                WEIGH-IN
              </div>
              <div style={{ color: heroColor }}>{endWeight.toFixed(1)}</div>
            </div>
          </div>

          <div style={{ fontSize: s ? 18 : 14, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
            Target: {targetWeight.toFixed(1)} kg
          </div>

          {/* Delta stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: s ? 20 : 16, width: "100%", maxWidth: s ? 700 : 500 }}>
            <StatBlock label="Total Cut" value={delta.toFixed(1)} unit="kg" color={heroColor} size={s ? "large" : "default"} />
            <StatBlock label="% Bodyweight" value={deltaPercent.toFixed(1)} unit="%" color={heroColor} size={s ? "large" : "default"} />
          </div>
        </div>
      </CardShell>
    );
  }
);

WeighInResultCard.displayName = "WeighInResultCard";
