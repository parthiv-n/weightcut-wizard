import { forwardRef } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StravaPeriodLabel } from "../templates/StravaStat";
import { usePremium } from "@/hooks/usePremium";
import type { FightFormLabel, ScoringPhase, SubScore, SubScoreKey } from "@/scoring/types";

interface FightFormScoreCardProps {
  score: number;
  label: FightFormLabel;
  phase: ScoringPhase | null;
  daysToFight: number | null;
  campAge: { weeksAhead: number } | null;
  subScores: Record<SubScoreKey, SubScore> | null;
  aspect?: AspectRatio;
  transparent?: boolean;
}

const LABEL_DISPLAY: Record<FightFormLabel, string> = {
  sharp: "Sharp",
  sharpening: "Sharpening",
  off_pace: "Off Pace",
  at_risk: "At Risk",
};

// Color tokens for the label and ring stroke. Mirrors the dashboard hero
// ring so a screenshot recipient sees the same emotional palette they'd see
// in-app. Keep these in sync with FightFormRing.LABEL_RGB.
const LABEL_COLOR: Record<FightFormLabel, string> = {
  sharp: "#10B981",       // emerald-500
  sharpening: "#FBBF24",  // amber-400
  off_pace: "#F97316",    // orange-500
  at_risk: "#F43F5E",     // rose-500
};

const SUBSCORE_LABEL: Record<SubScoreKey, string> = {
  trainingLoad: "Training",
  sleep: "Sleep",
  weightCut: "Weight Cut",
  wellness: "Wellness",
  nutritionAdherence: "Nutrition",
};

const PHASE_DISPLAY: Record<ScoringPhase, string> = {
  build: "Build phase",
  peak: "Peak phase",
  fightWeek: "Fight week",
};

function phaseLine(phase: ScoringPhase | null, daysToFight: number | null): string {
  if (!phase) return "Fight Form Score";
  const phaseTxt = PHASE_DISPLAY[phase];
  if (daysToFight != null && daysToFight > 0) {
    return `${phaseTxt} · ${daysToFight} days to fight`;
  }
  return phaseTxt;
}

function campPaceLine(campAge: { weeksAhead: number } | null): string | null {
  if (!campAge) return null;
  if (campAge.weeksAhead === 0) return "On schedule";
  const n = Math.abs(campAge.weeksAhead);
  const unit = n === 1 ? "week" : "weeks";
  return campAge.weeksAhead > 0
    ? `${n} ${unit} ahead of schedule`
    : `${n} ${unit} behind schedule`;
}

// Inline SVG ring renderer matching FightFormRing's visual proportions but
// blown up to share-card scale. No animation — capture must be deterministic.
function ShareRing({
  score,
  color,
  diameter,
  stroke,
  transparent,
}: {
  score: number;
  color: string;
  diameter: number;
  stroke: number;
  transparent?: boolean;
}) {
  const radius = (diameter - stroke) / 2;
  const cx = diameter / 2;
  const cy = diameter / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, score / 100));
  const dash = circumference * progress;
  const trackColor = transparent ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";

  return (
    <svg
      width={diameter}
      height={diameter}
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle cx={cx} cy={cy} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
    </svg>
  );
}

export const FightFormScoreCard = forwardRef<HTMLDivElement, FightFormScoreCardProps>(
  ({ score, label, phase, daysToFight, campAge, subScores, aspect = "square", transparent }, ref) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";
    const labelColor = LABEL_COLOR[label];

    // Sort subscores by impact (value × weight) so the strongest signals
    // appear first — matches the bottom-sheet order users see in-app.
    const sortedSubs = subScores
      ? (Object.entries(subScores) as Array<[SubScoreKey, SubScore]>)
          .sort(([, a], [, b]) => b.value * b.weight - a.value * a.weight)
      : [];

    const ringDiameter = s ? 720 : 480;
    const ringStroke = s ? 40 : 28;
    const scoreSize = s ? 240 : 160;
    const labelSize = s ? 56 : 36;

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium} transparent={transparent}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <StravaPeriodLabel text={phaseLine(phase, daysToFight)} s={s} transparent={transparent} />

          {/* Hero ring — centered, with score + label stacked inside. */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative", marginBottom: s ? 64 : 28 }}>
            <ShareRing
              score={score}
              color={labelColor}
              diameter={ringDiameter}
              stroke={ringStroke}
              transparent={transparent}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: s ? 12 : 6,
              }}
            >
              <div
                style={{
                  fontSize: scoreSize,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: "#ffffff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(score)}
              </div>
              <div
                style={{
                  fontSize: labelSize,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: labelColor,
                  textTransform: "uppercase",
                }}
              >
                {LABEL_DISPLAY[label]}
              </div>
              <div
                style={{
                  fontSize: s ? 22 : 14,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: transparent ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.45)",
                  marginTop: s ? 8 : 4,
                }}
              >
                Fight Form Score
              </div>
            </div>
          </div>

          {/* Sub-score strip — five compact rows so the recipient sees the
              full breakdown, not just the headline number. */}
          {sortedSubs.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: s ? 18 : 10,
                background: transparent ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.04)",
                border: transparent ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: s ? 28 : 18,
                padding: s ? "32px 40px" : "18px 22px",
                marginBottom: s ? 32 : 14,
              }}
            >
              {sortedSubs.map(([key, sub]) => {
                const pct = Math.max(0, Math.min(100, sub.value));
                return (
                  <div key={key} style={{ display: "flex", flexDirection: "column", gap: s ? 8 : 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span
                        style={{
                          fontSize: s ? 26 : 16,
                          fontWeight: 700,
                          color: "#ffffff",
                        }}
                      >
                        {SUBSCORE_LABEL[key]}
                      </span>
                      <span
                        style={{
                          fontSize: s ? 28 : 17,
                          fontWeight: 800,
                          color: labelColor,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {Math.round(pct)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: s ? 8 : 5,
                        borderRadius: 999,
                        background: transparent ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 999,
                          background: labelColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Camp pace footer (if available). */}
          {campPaceLine(campAge) && (
            <div
              style={{
                textAlign: "center",
                fontSize: s ? 22 : 14,
                fontWeight: 600,
                color: transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Camp pace · {campPaceLine(campAge)}
            </div>
          )}
        </div>
      </CardShell>
    );
  },
);

FightFormScoreCard.displayName = "FightFormScoreCard";
