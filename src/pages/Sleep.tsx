import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import { Moon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useUser } from "@/contexts/UserContext";

type Timeframe = "1W" | "1M" | "3M";

interface SleepRow {
  date: string;
  hours: number;
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = { "1W": 7, "1M": 30, "3M": 90 };

function startDateFor(tf: Timeframe): string {
  const d = new Date();
  d.setDate(d.getDate() - TIMEFRAME_DAYS[tf]);
  return d.toISOString().slice(0, 10);
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDate().toString();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[hsl(0_0%_8%)] border border-border/50 px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold text-foreground">{payload[0].value.toFixed(1)}h</p>
    </div>
  );
};

export default function Sleep() {
  const { userId } = useUser();

  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  // Convex query — reactive, no manual cache or loading state needed.
  const rawLogs = useQuery(api.sleep_logs.listForUser, userId ? { limit: 90 } : "skip");
  const allData: SleepRow[] = useMemo(
    () => (rawLogs ?? []).map(r => ({ date: r.date, hours: Number(r.hours) })).sort((a, b) => a.date.localeCompare(b.date)),
    [rawLogs],
  );
  const loading = rawLogs === undefined;
  // Touch unused vars to keep the timeframe signature compatible with the buttons below.
  void startDateFor;
  // No-op effect placeholder kept to preserve existing dependency graph reads.
  useEffect(() => {
    // sleep-logged events are no longer needed — Convex queries are reactive.
  }, [userId]);

  const filtered = useMemo(() => {
    const cutoff = startDateFor(timeframe);
    return allData.filter((r) => r.date >= cutoff);
  }, [allData, timeframe]);

  const stats = useMemo(() => {
    if (!filtered.length) return { avg: 0, best: 0, worst: 0 };
    const vals = filtered.map((r) => r.hours);
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: sum / vals.length,
      best: Math.max(...vals),
      worst: Math.min(...vals),
    };
  }, [filtered]);

  const chartData = useMemo(
    () => filtered.map((r) => ({ date: formatDay(r.date), hours: r.hours })),
    [filtered]
  );

  if (loading && !allData.length) {
    return (
      <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
        <div className="h-6 w-24 rounded bg-muted/30 animate-pulse" />
        <div className="card-surface rounded-2xl h-[220px] animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-surface rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Sleep</h1>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30">
          {(["1W", "1M", "3M"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card-surface rounded-2xl p-3">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <ReferenceArea
              y1={7}
              y2={8}
              fill="hsl(217 91% 58%)"
              fillOpacity={0.05}
              stroke="none"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, "auto"]}
              tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="hours"
              stroke="hsl(217 91% 58%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "hsl(217 91% 58%)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: "Average", value: stats.avg },
          { label: "Best", value: stats.best },
          { label: "Worst", value: stats.worst },
        ] as const).map((s) => (
          <div key={s.label} className="card-surface rounded-2xl p-3 text-center">
            <p className="text-lg font-bold display-number">{s.value.toFixed(1)}h</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
