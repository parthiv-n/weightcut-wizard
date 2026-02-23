import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyStrainEntry, ForecastResult } from "@/utils/performanceEngine";

interface StrainChartProps {
  strainHistory: DailyStrainEntry[];
  forecast: ForecastResult;
}

export function StrainChart({ strainHistory, forecast }: StrainChartProps) {
  // Build chart data: 7 days + 1 forecast day
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const chartData = [
    ...strainHistory.map(entry => ({
      date: entry.date,
      strain: parseFloat(entry.strain.toFixed(1)),
      forecast: null as number | null,
      label: format(parseISO(entry.date), "EEE"),
    })),
    {
      date: tomorrowStr,
      strain: null as number | null,
      forecast: parseFloat(forecast.predictedStrain.toFixed(1)),
      label: "Proj",
    },
  ];

  // Connect the last real point to the forecast with a bridging entry
  if (strainHistory.length > 0) {
    const lastReal = strainHistory[strainHistory.length - 1];
    chartData[chartData.length - 1] = {
      ...chartData[chartData.length - 1],
    };
    // Add a bridge point: last real day also has forecast value for continuity
    chartData[strainHistory.length - 1] = {
      ...chartData[strainHistory.length - 1],
      forecast: parseFloat(lastReal.strain.toFixed(1)),
    };
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            domain={[0, 21]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            ticks={[0, 7, 14, 21]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`${value}/21`, "Strain"]}
            labelFormatter={(label: string) => label}
          />
          <ReferenceLine
            y={15}
            stroke="hsl(var(--destructive))"
            strokeDasharray="3 3"
            strokeOpacity={0.3}
          />
          {/* Main strain line */}
          <Line
            type="monotone"
            dataKey="strain"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload.strain === null) return <></>;
              const isToday = payload.date === todayStr;
              return (
                <circle
                  key={payload.date}
                  cx={cx}
                  cy={cy}
                  r={isToday ? 5 : 3}
                  fill={isToday ? "hsl(var(--primary))" : "hsl(var(--card))"}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                />
              );
            }}
            connectNulls={false}
          />
          {/* Forecast dotted line */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload.forecast === null || payload.strain !== null) return <></>;
              return (
                <circle
                  key={`forecast-${payload.date}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="hsl(var(--muted-foreground))"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  opacity={0.7}
                />
              );
            }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
