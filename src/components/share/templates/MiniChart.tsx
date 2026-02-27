import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface MiniChartProps {
  data: { value: number }[];
  type?: "line" | "area";
  color?: string;
  fillColor?: string;
  referenceLine?: number;
  referenceColor?: string;
  height?: number;
  width?: number;
}

export function MiniChart({
  data,
  type = "line",
  color = "#2563eb",
  fillColor,
  referenceLine,
  referenceColor = "#f59e0b",
  height = 200,
  width = 960,
}: MiniChartProps) {
  if (data.length < 2) return null;

  const ChartComponent = type === "area" ? AreaChart : LineChart;
  const DataComponent = type === "area" ? Area : Line;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          {referenceLine !== undefined && (
            <ReferenceLine
              y={referenceLine}
              stroke={referenceColor}
              strokeDasharray="6 4"
              strokeWidth={2}
            />
          )}
          {type === "area" ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              fill={fillColor ?? `${color}33`}
              isAnimationActive={false}
              dot={false}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              isAnimationActive={false}
              dot={false}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
