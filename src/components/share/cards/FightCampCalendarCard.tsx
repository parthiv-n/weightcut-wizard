import { forwardRef, useMemo } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StatBlock } from "../templates/StatBlock";
import { usePremium } from "@/hooks/usePremium";
import { getSessionColor } from "@/lib/sessionColors";

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
  timeRange: "day" | "week" | "month";
  aspect?: AspectRatio;
  customColors?: Record<string, string>;
  transparent?: boolean;
}

const TIME_LABELS: Record<string, string> = {
  day: "Today",
  week: "Past Week",
  month: "Past Month",
};

type DayData = { date: string; dayLabel: string; sessions: Session[] };

function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayOfWeekLabel(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function getShortDayLabel(d: Date): string {
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

export const FightCampCalendarCard = forwardRef<HTMLDivElement, FightCampCalendarCardProps>(
  ({ sessions, timeRange, aspect = "square", customColors, transparent }, ref) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";

    const stats = useMemo(() => {
      const nonRest = sessions.filter((sess) => sess.session_type !== "Rest");
      const totalDuration = nonRest.reduce((sum, sess) => sum + sess.duration_minutes, 0);
      const avgRpe = nonRest.length > 0 ? nonRest.reduce((sum, sess) => sum + sess.rpe, 0) / nonRest.length : 0;
      const avgIntensity =
        nonRest.length > 0 ? nonRest.reduce((sum, sess) => sum + sess.intensity_level, 0) / nonRest.length : 0;

      const typeCounts: Record<string, number> = {};
      for (const sess of nonRest) {
        typeCounts[sess.session_type] = (typeCounts[sess.session_type] ?? 0) + 1;
      }
      const typeBreakdown = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));

      if (nonRest.length === 0) {
        return { total: 0, totalDuration, avgRpe, avgIntensity, typeBreakdown, sessionsPerWeek: 0 };
      }
      const dates = nonRest.map((sess) => new Date(sess.date).getTime());
      const range = Math.max(1, (Math.max(...dates) - Math.min(...dates)) / (7 * 24 * 60 * 60 * 1000));
      const sessionsPerWeek = nonRest.length / Math.max(1, range);

      return { total: nonRest.length, totalDuration, avgRpe, avgIntensity, typeBreakdown, sessionsPerWeek };
    }, [sessions]);

    const { days, maxDayMinutes } = useMemo(() => {
      const today = new Date();
      const sessionsByDate: Record<string, Session[]> = {};
      for (const sess of sessions) {
        if (sess.session_type === "Rest") continue;
        if (!sessionsByDate[sess.date]) sessionsByDate[sess.date] = [];
        sessionsByDate[sess.date].push(sess);
      }

      let daysList: DayData[] = [];

      if (timeRange === "day") {
        // Most recent day with sessions, or today
        const todayStr = formatDateStr(today);
        if (sessionsByDate[todayStr]?.length) {
          daysList = [{ date: todayStr, dayLabel: "Today", sessions: sessionsByDate[todayStr] }];
        } else {
          const sortedDates = Object.keys(sessionsByDate).sort().reverse();
          if (sortedDates.length > 0) {
            const d = sortedDates[0];
            const dateObj = new Date(d + "T12:00:00");
            daysList = [{ date: d, dayLabel: getDayOfWeekLabel(dateObj), sessions: sessionsByDate[d] }];
          } else {
            daysList = [{ date: todayStr, dayLabel: "Today", sessions: [] }];
          }
        }
      } else if (timeRange === "week") {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = formatDateStr(d);
          daysList.push({
            date: dateStr,
            dayLabel: getDayOfWeekLabel(d),
            sessions: sessionsByDate[dateStr] ?? [],
          });
        }
      } else {
        // month: last ~35 days aligned to week start (Sunday)
        const end = new Date(today);
        // Go back 34 days from today to get ~5 weeks
        const rawStart = new Date(today);
        rawStart.setDate(rawStart.getDate() - 34);
        // Align to previous Sunday
        const startDay = rawStart.getDay();
        rawStart.setDate(rawStart.getDate() - startDay);

        for (let d = new Date(rawStart); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateStr(d);
          daysList.push({
            date: dateStr,
            dayLabel: getShortDayLabel(d),
            sessions: sessionsByDate[dateStr] ?? [],
          });
        }
      }

      let maxMin = 0;
      for (const day of daysList) {
        const total = day.sessions.reduce((sum, sess) => sum + sess.duration_minutes, 0);
        if (total > maxMin) maxMin = total;
      }

      return { days: daysList, maxDayMinutes: maxMin || 60 };
    }, [sessions, timeRange]);

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium} transparent={transparent}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s ? 40 : 12 }}>
          <div>
            <div
              style={{
                fontSize: s ? 28 : 15,
                fontWeight: 800,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#2563eb",
                marginBottom: s ? 10 : 2,
              }}
            >
              TRAINING LOG
            </div>
            <div style={{ fontSize: s ? 24 : 15, color: transparent ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)", fontWeight: 700 }}>
              {TIME_LABELS[timeRange] ?? timeRange}
            </div>
          </div>
        </div>

        {/* Hero stat */}
        <div style={{ textAlign: "center", marginBottom: s ? 48 : 14 }}>
          <div
            style={{
              fontSize: s ? 128 : 72,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {stats.total}
          </div>
          <div style={{ fontSize: s ? 20 : 14, color: transparent ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)", marginTop: s ? 14 : 6, fontWeight: 700, letterSpacing: "0.1em" }}>
            SESSIONS
          </div>
        </div>

        {/* Session type pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: s ? 14 : 8,
            justifyContent: "center",
            marginBottom: s ? 48 : 14,
          }}
        >
          {stats.typeBreakdown.map(({ type, count }) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: s ? 12 : 8,
                padding: s ? "12px 24px" : "6px 14px",
                borderRadius: 999,
                background: `${getSessionColor(type, customColors)}30`,
                border: `1px solid ${getSessionColor(type, customColors)}60`,
              }}
            >
              <div
                style={{
                  width: s ? 12 : 8,
                  height: s ? 12 : 8,
                  borderRadius: s ? 6 : 4,
                  backgroundColor: getSessionColor(type, customColors),
                }}
              />
              <span style={{ fontSize: s ? 20 : 13, fontWeight: 700, color: "#ffffff" }}>
                {type}
              </span>
              <span style={{ fontSize: s ? 20 : 13, fontWeight: 800, color: transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.8)" }}>
                {count}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline visual */}
        {timeRange === "day" && <DayView days={days} s={s} customColors={customColors} />}
        {timeRange === "week" && <WeekView days={days} maxDayMinutes={maxDayMinutes} s={s} customColors={customColors} transparent={transparent} />}
        {timeRange === "month" && <MonthView days={days} s={s} customColors={customColors} transparent={transparent} />}

        {/* Stat blocks */}
        <div style={{ display: "grid", gridTemplateColumns: s ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: s ? 12 : 8 }}>
          <StatBlock
            label="Duration"
            value={stats.totalDuration >= 60 ? `${Math.round(stats.totalDuration / 60)}` : `${stats.totalDuration}`}
            unit={stats.totalDuration >= 60 ? "hrs" : "min"}
            size={s ? "medium" : "default"}
            transparent={transparent}
          />
          <StatBlock label="Avg RPE" value={stats.avgRpe.toFixed(1)} unit="/10" size={s ? "medium" : "default"} transparent={transparent} />
          <StatBlock label="Intensity" value={stats.avgIntensity.toFixed(1)} unit="/5" size={s ? "medium" : "default"} transparent={transparent} />
          <StatBlock label="Per Week" value={stats.sessionsPerWeek.toFixed(1)} size={s ? "medium" : "default"} transparent={transparent} />
        </div>
      </CardShell>
    );
  }
);

FightCampCalendarCard.displayName = "FightCampCalendarCard";

/* ─── Day View: horizontal session bars ─── */
function DayView({ days, s, customColors }: { days: DayData[]; s: boolean; customColors?: Record<string, string> }) {
  const daySessions = days[0]?.sessions ?? [];
  const barHeight = s ? 80 : 44;
  const barGap = s ? 12 : 6;
  const barRadius = s ? 16 : 10;

  return (
    <div style={{ marginBottom: s ? 48 : 14, display: "flex", flexDirection: "column", gap: barGap }}>
      {daySessions.length === 0 && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: s ? 20 : 14, padding: s ? 40 : 20 }}>
          No sessions today
        </div>
      )}
      {daySessions.slice(0, s ? 6 : 5).map((sess, i) => (
        <div
          key={sess.id || i}
          style={{
            height: barHeight,
            borderRadius: barRadius,
            backgroundColor: getSessionColor(sess.session_type, customColors) + "E6", // ~90% opacity
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: s ? "0 32px" : "0 16px",
          }}
        >
          <span style={{ fontSize: s ? 24 : 16, fontWeight: 700, color: "#ffffff" }}>
            {sess.session_type}
          </span>
          <span style={{ fontSize: s ? 22 : 15, fontWeight: 700, color: "#ffffff" }}>
            {sess.duration_minutes} min
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Week View: stacked column chart (SVG) ─── */
function WeekView({ days, maxDayMinutes, s, customColors, transparent }: { days: DayData[]; maxDayMinutes: number; s: boolean; customColors?: Record<string, string>; transparent?: boolean }) {
  const colWidth = s ? 120 : 100;
  const colGap = s ? 18 : 12;
  const maxColHeight = s ? 600 : 240;
  const segGap = s ? 3 : 2;
  const labelAreaHeight = s ? 70 : 40;
  const svgWidth = 7 * colWidth + 6 * colGap;
  const svgHeight = maxColHeight + labelAreaHeight;
  const padX = Math.floor((960 - svgWidth) / 2);

  return (
    <div
      style={{
        marginBottom: s ? 48 : 14,
        background: transparent ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.03)",
        border: transparent ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
        borderRadius: s ? 24 : 12,
        padding: s ? "32px 16px" : "12px 10px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <svg viewBox={`0 0 960 ${svgHeight}`} width="100%" style={{ maxWidth: 960 }}>
        {days.map((day, i) => {
          const x = padX + i * (colWidth + colGap);
          const totalMin = day.sessions.reduce((sum, sess) => sum + sess.duration_minutes, 0);
          const dateObj = new Date(day.date + "T12:00:00");
          const dateNum = dateObj.getDate();

          if (day.sessions.length === 0) {
            return (
              <g key={day.date}>
                <rect
                  x={x}
                  y={maxColHeight - 4}
                  width={colWidth}
                  height={4}
                  rx={2}
                  fill={transparent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}
                />
                <text
                  x={x + colWidth / 2}
                  y={maxColHeight + (s ? 30 : 18)}
                  textAnchor="middle"
                  fill={transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)"}
                  fontSize={s ? 22 : 16}
                  fontWeight={700}
                >
                  {day.dayLabel}
                </text>
                <text
                  x={x + colWidth / 2}
                  y={maxColHeight + (s ? 56 : 34)}
                  textAnchor="middle"
                  fill={transparent ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)"}
                  fontSize={s ? 20 : 14}
                >
                  {dateNum}
                </text>
              </g>
            );
          }

          // Stack segments bottom-up
          const totalGaps = (day.sessions.length - 1) * segGap;
          const availableHeight = (totalMin / maxDayMinutes) * maxColHeight - totalGaps;
          let currentY = maxColHeight;

          const segments = day.sessions.map((sess, si) => {
            const proportion = sess.duration_minutes / totalMin;
            const segHeight = Math.max(4, proportion * availableHeight);
            currentY -= segHeight;
            const rect = (
              <rect
                key={si}
                x={x}
                y={currentY}
                width={colWidth}
                height={segHeight}
                rx={segHeight > 8 ? 6 : 3}
                fill={getSessionColor(sess.session_type, customColors)}
              />
            );
            currentY -= segGap;
            return rect;
          });

          return (
            <g key={day.date}>
              {segments}
              <text
                x={x + colWidth / 2}
                y={maxColHeight + (s ? 30 : 18)}
                textAnchor="middle"
                fill={transparent ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.7)"}
                fontSize={s ? 22 : 16}
                fontWeight={700}
              >
                {day.dayLabel}
              </text>
              <text
                x={x + colWidth / 2}
                y={maxColHeight + (s ? 56 : 34)}
                textAnchor="middle"
                fill={transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)"}
                fontSize={s ? 20 : 14}
              >
                {dateNum}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Month View: calendar heatmap with multi-color cells ─── */
function MonthView({ days, s, customColors, transparent }: { days: DayData[]; s: boolean; customColors?: Record<string, string>; transparent?: boolean }) {
  const cellSize = s ? 40 : 24;
  const cellGap = s ? 6 : 3;
  const cellRadius = s ? 8 : 4;
  const headerHeight = s ? 30 : 18;
  const labelWidth = s ? 80 : 52;

  // Group days into weeks (7 per row, starting Sunday)
  const weeks: DayData[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const gridWidth = 7 * (cellSize + cellGap) - cellGap;
  const gridHeight = headerHeight + weeks.length * (cellSize + cellGap) - cellGap;
  const totalWidth = labelWidth + gridWidth;

  return (
    <div
      style={{
        marginBottom: s ? 48 : 14,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${totalWidth} ${gridHeight}`}
        width="100%"
        style={{ maxWidth: totalWidth * (s ? 2.5 : 3) }}
      >
        <defs>
          {/* Clip paths for rounded cells */}
          {weeks.map((week, wi) =>
            week.map((_, di) => {
              const cx = labelWidth + di * (cellSize + cellGap);
              const cy = headerHeight + wi * (cellSize + cellGap);
              return (
                <clipPath key={`clip-${wi}-${di}`} id={`clip-${wi}-${di}`}>
                  <rect x={cx} y={cy} width={cellSize} height={cellSize} rx={cellRadius} />
                </clipPath>
              );
            })
          )}
        </defs>

        {/* Day-of-week header */}
        {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
          <text
            key={i}
            x={labelWidth + i * (cellSize + cellGap) + cellSize / 2}
            y={headerHeight - (s ? 8 : 6)}
            textAnchor="middle"
            fill={transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)"}
            fontSize={s ? 18 : 13}
            fontWeight={600}
          >
            {label}
          </text>
        ))}

        {/* Rows */}
        {weeks.map((week, wi) => {
          const cy = headerHeight + wi * (cellSize + cellGap);
          // Week start label
          const firstDay = week[0];
          const dateObj = new Date(firstDay.date + "T12:00:00");
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const weekLabel = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;

          return (
            <g key={wi}>
              <text
                x={labelWidth - (s ? 12 : 8)}
                y={cy + cellSize / 2 + (s ? 5 : 4)}
                textAnchor="end"
                fill={transparent ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)"}
                fontSize={s ? 16 : 12}
              >
                {weekLabel}
              </text>

              {week.map((day, di) => {
                const cx = labelWidth + di * (cellSize + cellGap);
                const sessionCount = day.sessions.length;

                if (sessionCount === 0) {
                  return (
                    <rect
                      key={di}
                      x={cx}
                      y={cy}
                      width={cellSize}
                      height={cellSize}
                      rx={cellRadius}
                      fill={transparent ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.1)"}
                    />
                  );
                }

                // Multi-color split cell
                const sliceCount = Math.min(sessionCount, 4);
                const sliceHeight = cellSize / sliceCount;

                return (
                  <g key={di} clipPath={`url(#clip-${wi}-${di})`}>
                    {day.sessions.slice(0, 4).map((sess, si) => (
                      <rect
                        key={si}
                        x={cx}
                        y={cy + si * sliceHeight}
                        width={cellSize}
                        height={sliceHeight}
                        fill={getSessionColor(sess.session_type, customColors)}
                      />
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
