import { ComposedChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DashboardWeightChartProps {
  data: Array<{ date: string; weight: number }>;
  weightUnit: "kg" | "lb";
}

// Thin wrapper around recharts so the heavy chart bundle (~100KB gzipped) can
// be code-split via React.lazy in Dashboard.tsx — speeds up first paint.
export default function DashboardWeightChart({ data, weightUnit }: DashboardWeightChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={9}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: 11,
          }}
          formatter={(value: number) => [`${value.toFixed(1)} ${weightUnit}`, "Weight"]}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", r: 2.5, strokeWidth: 1.5, stroke: "hsl(var(--background))" }}
          activeDot={{ r: 4, strokeWidth: 1.5 }}
          animationDuration={0}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
