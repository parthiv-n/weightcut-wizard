import { forwardRef } from "react";
import { CardShell, type AspectRatio } from "../templates/CardShell";
import { StatBlock } from "../templates/StatBlock";
import { usePremium } from "@/hooks/usePremium";
import { format } from "date-fns";

interface NutritionCardProps {
  date: string;
  calories: number;
  calorieTarget: number;
  protein: number;
  carbs: number;
  fats: number;
  proteinGoal: number;
  carbsGoal: number;
  fatsGoal: number;
  mealCount: number;
  streak: number;
  totalMealsLogged: number;
  aspect?: AspectRatio;
}

export const NutritionCard = forwardRef<HTMLDivElement, NutritionCardProps>(
  (
    {
      date,
      calories,
      calorieTarget,
      protein,
      carbs,
      fats,
      proteinGoal,
      carbsGoal,
      fatsGoal,
      mealCount,
      streak,
      totalMealsLogged,
      aspect = "square",
    },
    ref
  ) => {
    const { isPremium } = usePremium();
    const s = aspect === "story";

    const calPct = calorieTarget > 0 ? Math.min(calories / calorieTarget, 1.5) : 0;
    const isOver = calories > calorieTarget;
    const ringColor = isOver ? "#ef4444" : "#22c55e";

    // SVG ring geometry
    const ringSize = s ? 320 : 220;
    const strokeW = s ? 18 : 14;
    const radius = (ringSize - strokeW) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - Math.min(calPct, 1));

    const macros = [
      { label: "Protein", value: protein, goal: proteinGoal, color: "#3b82f6" },
      { label: "Carbs", value: carbs, goal: carbsGoal, color: "#f59e0b" },
      { label: "Fat", value: fats, goal: fatsGoal, color: "#a855f7" },
    ];

    return (
      <CardShell ref={ref} aspect={aspect} isPremium={isPremium}>
        {/* Header */}
        <div style={{ marginBottom: s ? 40 : 24 }}>
          <div
            style={{
              fontSize: s ? 18 : 14,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
              color: "#3b82f6",
              marginBottom: s ? 8 : 4,
            }}
          >
            NUTRITION
          </div>
          <div
            style={{
              fontSize: s ? 20 : 16,
              color: "rgba(255,255,255,0.5)",
              fontWeight: 500,
            }}
          >
            {format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          </div>
        </div>

        {/* Calorie Ring */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: s ? 48 : 28,
          }}
        >
          <div style={{ position: "relative", width: ringSize, height: ringSize }}>
            <svg
              width={ringSize}
              height={ringSize}
              style={{ transform: "rotate(-90deg)" }}
            >
              {/* Background track */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={strokeW}
              />
              {/* Progress arc */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            {/* Center text */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: s ? 72 : 48,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: "#ffffff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(calories)}
              </span>
              <span
                style={{
                  fontSize: s ? 18 : 13,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  color: "rgba(255,255,255,0.35)",
                  marginTop: s ? 4 : 2,
                }}
              >
                KCAL
              </span>
            </div>
          </div>
        </div>

        {/* Target label below ring */}
        <div
          style={{
            textAlign: "center",
            fontSize: s ? 18 : 14,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 600,
            marginTop: s ? -32 : -18,
            marginBottom: s ? 48 : 28,
          }}
        >
          of {Math.round(calorieTarget).toLocaleString()} target
        </div>

        {/* Macro Bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: s ? 24 : 16, marginBottom: s ? 48 : 28 }}>
          {macros.map((m) => {
            const pct = m.goal > 0 ? Math.min((m.value / m.goal) * 100, 100) : 0;
            return (
              <div key={m.label}>
                {/* Label row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: s ? 10 : 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: s ? 10 : 8 }}>
                    <div
                      style={{
                        width: s ? 12 : 10,
                        height: s ? 12 : 10,
                        borderRadius: "50%",
                        background: m.color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: s ? 18 : 14,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {m.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: s ? 18 : 14,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.6)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Math.round(m.value)}
                    {m.goal > 0 ? ` / ${Math.round(m.goal)} g` : " g"}
                  </span>
                </div>
                {/* Bar */}
                {m.goal > 0 && (
                  <div
                    style={{
                      width: "100%",
                      height: s ? 12 : 8,
                      borderRadius: s ? 6 : 4,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: s ? 6 : 4,
                        background: m.color,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stat Blocks */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: s ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: s ? 16 : 12,
          }}
        >
          <StatBlock label="Meals Today" value={mealCount} />
          <StatBlock label="Streak" value={streak} unit="days" color="#f59e0b" />
          <StatBlock label="Cal Target" value={Math.round(calorieTarget).toLocaleString()} unit="kcal" />
          <StatBlock label="Total Logged" value={totalMealsLogged} unit="meals" />
        </div>
      </CardShell>
    );
  }
);

NutritionCard.displayName = "NutritionCard";
