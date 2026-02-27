import { forwardRef, useMemo } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StatBlock } from "../templates/StatBlock";
import { usePremium } from "@/hooks/usePremium";

interface Session {
  id: string;
  date: string;
  session_type: string;
  duration_minutes: number;
  rpe: number;
  intensity: string;
  intensity_level: number;
}

interface FightCampCalendarCardProps {
  sessions: Session[];
  timeRange: string;
  aspect?: AspectRatio;
}

const SPORT_COLORS: Record<string, string> = {
  BJJ: "#3b82f6",
  "Muay Thai": "#ef4444",
  Boxing: "#f97316",
  Wrestling: "#f59e0b",
  Sparring: "#fb923c",
  Strength: "#22c55e",
  Conditioning: "#10b981",
  Run: "#06b6d4",
  Recovery: "#8b5cf6",
  Rest: "#60a5fa",
  Other: "#6b7280",
};

const TIME_LABELS: Record<string, string> = {
  "1W": "Past Week",
  "1M": "Past Month",
  "1Y": "Past Year",
};

export const FightCampCalendarCard = forwardRef<HTMLDivElement, FightCampCalendarCardProps>(
  ({ sessions, timeRange, aspect = "square" }, ref) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";

    const stats = useMemo(() => {
      const nonRest = sessions.filter((s) => s.session_type !== "Rest");
      const totalDuration = nonRest.reduce((sum, s) => sum + s.duration_minutes, 0);
      const avgRpe = nonRest.length > 0 ? nonRest.reduce((sum, s) => sum + s.rpe, 0) / nonRest.length : 0;
      const avgIntensity =
        nonRest.length > 0 ? nonRest.reduce((sum, s) => sum + s.intensity_level, 0) / nonRest.length : 0;

      // Count by type
      const typeCounts: Record<string, number> = {};
      for (const s of nonRest) {
        typeCounts[s.session_type] = (typeCounts[s.session_type] ?? 0) + 1;
      }
      const typeBreakdown = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));

      // Sessions per week
      if (nonRest.length === 0) {
        return { total: 0, totalDuration, avgRpe, avgIntensity, typeBreakdown, sessionsPerWeek: 0 };
      }
      const dates = nonRest.map((s) => new Date(s.date).getTime());
      const range = Math.max(1, (Math.max(...dates) - Math.min(...dates)) / (7 * 24 * 60 * 60 * 1000));
      const sessionsPerWeek = nonRest.length / Math.max(1, range);

      // Dot grid: last 7 weeks × 7 days
      const dotGrid: boolean[][] = [];
      const today = new Date();
      for (let w = 6; w >= 0; w--) {
        const week: boolean[] = [];
        for (let d = 0; d < 7; d++) {
          const date = new Date(today);
          date.setDate(date.getDate() - (w * 7 + (6 - d)));
          const dateStr = date.toISOString().split("T")[0];
          week.push(sessions.some((s) => s.date === dateStr && s.session_type !== "Rest"));
        }
        dotGrid.push(week);
      }

      return { total: nonRest.length, totalDuration, avgRpe, avgIntensity, typeBreakdown, sessionsPerWeek, dotGrid };
    }, [sessions]);

    // Dot grid sizing — story mode fills the width as the centrepiece
    const dotSize = s ? 56 : 16;
    const dotGap = s ? 12 : 6;
    const dotRadius = s ? 14 : 4;

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s ? 40 : 24 }}>
          <div>
            <div
              style={{
                fontSize: s ? 24 : 14,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#2563eb",
                marginBottom: s ? 10 : 4,
              }}
            >
              TRAINING LOG
            </div>
            <div style={{ fontSize: s ? 22 : 16, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
              {TIME_LABELS[timeRange] ?? timeRange}
            </div>
          </div>
        </div>

        {/* Hero stat */}
        <div style={{ textAlign: "center", marginBottom: s ? 48 : 28 }}>
          <div
            style={{
              fontSize: s ? 112 : 72,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {stats.total}
          </div>
          <div style={{ fontSize: s ? 18 : 14, color: "rgba(255,255,255,0.45)", marginTop: s ? 14 : 8, fontWeight: 600, letterSpacing: "0.1em" }}>
            SESSIONS
          </div>
        </div>

        {/* Session type pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: s ? 14 : 10,
            justifyContent: "center",
            marginBottom: s ? 48 : 28,
          }}
        >
          {stats.typeBreakdown.map(({ type, count }) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: s ? 12 : 8,
                padding: s ? "12px 24px" : "8px 16px",
                borderRadius: 999,
                background: `${SPORT_COLORS[type] ?? "#6b7280"}20`,
                border: `1px solid ${SPORT_COLORS[type] ?? "#6b7280"}40`,
              }}
            >
              <div
                style={{
                  width: s ? 12 : 8,
                  height: s ? 12 : 8,
                  borderRadius: s ? 6 : 4,
                  backgroundColor: SPORT_COLORS[type] ?? "#6b7280",
                }}
              />
              <span style={{ fontSize: s ? 18 : 14, fontWeight: 600, color: "#ffffff" }}>
                {type}
              </span>
              <span style={{ fontSize: s ? 18 : 14, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                {count}
              </span>
            </div>
          ))}
        </div>

        {/* Dot grid heatmap */}
        {stats.dotGrid && (
          <div
            style={{
              display: "flex",
              gap: dotGap,
              justifyContent: "center",
              marginBottom: s ? 48 : 28,
            }}
          >
            {stats.dotGrid.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: dotGap }}>
                {week.map((active, di) => (
                  <div
                    key={di}
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotRadius,
                      backgroundColor: active ? "#2563eb" : "rgba(255,255,255,0.06)",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Stat blocks — compact row in story to keep focus on the grid */}
        <div style={{ display: "grid", gridTemplateColumns: s ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: s ? 12 : 12 }}>
          <StatBlock
            label="Duration"
            value={stats.totalDuration >= 60 ? `${Math.round(stats.totalDuration / 60)}` : `${stats.totalDuration}`}
            unit={stats.totalDuration >= 60 ? "hrs" : "min"}
            size={s ? "medium" : "default"}
          />
          <StatBlock label="Avg RPE" value={stats.avgRpe.toFixed(1)} unit="/10" size={s ? "medium" : "default"} />
          <StatBlock label="Intensity" value={stats.avgIntensity.toFixed(1)} unit="/5" size={s ? "medium" : "default"} />
          <StatBlock label="Per Week" value={stats.sessionsPerWeek.toFixed(1)} size={s ? "medium" : "default"} />
        </div>
      </CardShell>
    );
  }
);

FightCampCalendarCard.displayName = "FightCampCalendarCard";
