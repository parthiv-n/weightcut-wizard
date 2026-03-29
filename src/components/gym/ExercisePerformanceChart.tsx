import { memo, useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { GymSet } from "@/pages/gym/types";

type TimeFilter = "1W" | "1M" | "3M" | "ALL";

interface ExercisePerformanceChartProps {
  sets: GymSet[];
  loading?: boolean;
}

export const ExercisePerformanceChart = memo(function ExercisePerformanceChart({ sets, loading }: ExercisePerformanceChartProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("1M");
  const [chartType, setChartType] = useState<"weight" | "volume">("weight");

  if (loading) {
    return <div className="h-48 rounded-xl bg-muted/30 animate-pulse" />;
  }

  if (sets.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    );
  }

  const now = Date.now();
  const filterMs: Record<TimeFilter, number> = {
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
    "3M": 90 * 24 * 60 * 60 * 1000,
    "ALL": Infinity,
  };

  const filteredSets = sets
    .filter(s => now - new Date(s.created_at).getTime() < filterMs[timeFilter])
    .reverse();

  // Group by date, take best weight/volume per date
  const dateMap = new Map<string, { weight: number; volume: number; reps: number }>();
  for (const s of filteredSets) {
    const date = s.created_at.split("T")[0];
    const existing = dateMap.get(date);
    const vol = (s.weight_kg ?? 0) * s.reps;
    if (!existing) {
      dateMap.set(date, { weight: s.weight_kg ?? 0, volume: vol, reps: s.reps });
    } else {
      if ((s.weight_kg ?? 0) > existing.weight) existing.weight = s.weight_kg ?? 0;
      existing.volume = Math.max(existing.volume, vol);
    }
  }

  const data = Array.from(dateMap.entries()).map(([date, vals]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    ...vals,
  }));

  const filters: TimeFilter[] = ["1W", "1M", "3M", "ALL"];

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex items-center gap-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setTimeFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              timeFilter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setChartType(chartType === "weight" ? "volume" : "weight")}
          className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80"
        >
          {chartType === "weight" ? "Weight" : "Volume"}
        </button>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "weight" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                name="Weight (kg)"
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                }}
              />
              <Bar
                dataKey="volume"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                name="Volume (kg)"
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
