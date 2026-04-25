import { useState, useEffect, useCallback, useMemo } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const [allData, setAllData] = useState<SleepRow[]>(() => {
    // Hydrate from cache synchronously to avoid skeleton flash
    if (!userId) return [];
    const cached = localCache.get<any[]>(userId, "sleep_logs", 24 * 60 * 60 * 1000);
    return cached ? cached.map(r => ({ date: r.date, hours: Number(r.hours) })) : [];
  });
  const [loading, setLoading] = useState(!allData.length);
  // Track the deepest timeframe we've fetched so a "1W → 3M" tab switch
  // triggers a backfill, but "3M → 1W" doesn't refetch.
  const [fetchedDepth, setFetchedDepth] = useState<Timeframe | null>(() =>
    !userId ? null : (localCache.get<any[]>(userId, "sleep_logs", 24 * 60 * 60 * 1000) ? "3M" : null)
  );

  useEffect(() => {
    if (!userId) return;

    // Serve cache instantly if not already hydrated from initializer
    if (!allData.length) {
      const cached = localCache.get<any[]>(userId, "sleep_logs", 24 * 60 * 60 * 1000);
      if (cached) {
        setAllData(cached.map(r => ({ date: r.date, hours: Number(r.hours) })));
        setLoading(false);
        setFetchedDepth("3M");
      }
    }

    // Skip refetch if we've already fetched at this depth or deeper. Order: 1W < 1M < 3M.
    const order: Record<Timeframe, number> = { "1W": 0, "1M": 1, "3M": 2 };
    if (fetchedDepth && order[fetchedDepth] >= order[timeframe]) return;

    // Fetch only the active timeframe — was hard-coded "3M" before, costing
    // ~80 extra rows on first paint for users who never expand past 1W.
    let cancelled = false;
    (async () => {
      try {
        const start = startDateFor(timeframe);
        const { data, error } = await withSupabaseTimeout(
          supabase
            .from("sleep_logs")
            .select("date, hours")
            .eq("user_id", userId)
            .gte("date", start)
            .order("date", { ascending: true })
        );
        if (cancelled) return;
        if (error) throw error;
        if (data) {
          // Postgres numeric type returns as string — coerce to number
          const typed = (data as any[]).map(r => ({ date: r.date, hours: Number(r.hours) }));
          setAllData(typed);
          localCache.set(userId, "sleep_logs", typed);
          setFetchedDepth(timeframe);
        }
      } catch (err) {
        logger.error("Failed to fetch sleep logs", err);
        if (!cancelled) {
          toast({ title: "Couldn't load sleep data", description: "Check your connection.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, timeframe, fetchedDepth]);

  // Listen for sleep-logged events from SleepLogger (Dashboard widget)
  useEffect(() => {
    const handler = () => {
      if (!userId) return;
      const cached = localCache.get<any[]>(userId, "sleep_logs", 24 * 60 * 60 * 1000);
      if (cached) setAllData(cached.map(r => ({ date: r.date, hours: Number(r.hours) })));
    };
    window.addEventListener("sleep-logged", handler);
    return () => window.removeEventListener("sleep-logged", handler);
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
