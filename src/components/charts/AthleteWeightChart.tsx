import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface AthleteWeightChartProps {
  data: Array<{ date: string; weight_kg: number }>;
}

// Thin wrapper around recharts so the ~100KB charts bundle defers until first
// paint via React.lazy in AthleteDetail.tsx.
export default function AthleteWeightChart({ data }: AthleteWeightChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={9}
          tickLine={false}
          axisLine={false}
          width={28}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
        />
        <Line
          type="monotone"
          dataKey="weight_kg"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 2, fill: "hsl(var(--primary))" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
