import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Brain, ChevronRight, Dumbbell, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout, withRetry } from "@/lib/timeoutWrapper";
import { AIPersistence } from "@/lib/aiPersistence";
import { triggerHapticSelection } from "@/lib/haptics";
import { useSubscription } from "@/hooks/useSubscription";
import { getSessionColor, getUserColors } from "@/lib/sessionColors";
import { logger } from "@/lib/logger";

interface TrainingInsightsWidgetProps {
  userId: string;
}

interface SessionRow {
  id: string;
  date: string;
  session_type: string;
  notes: string | null;
  rpe: number | null;
  intensity: string | null;
  duration_minutes: number | null;
}

interface DisciplineInsight {
  session_type: string;
  last_logged: string;
  what_you_did: string;
  next_focus: string;
}

interface CachedInsight {
  fingerprint: string;
  insight: DisciplineInsight;
}

const MAX_DISCIPLINES = 8;
const SESSIONS_PER_DISCIPLINE = 3;
const LOOKBACK_DAYS = 60;
const CACHE_TTL_HOURS = 24 * 30; // fingerprint is the real cache key — TTL is GC only

function cacheKey(sessionType: string): string {
  return `training_insight_${sessionType.toLowerCase().replace(/\s+/g, "_")}`;
}

async function fetchRecentSessions(userId: string): Promise<SessionRow[]> {
  const since = format(subDays(new Date(), LOOKBACK_DAYS), "yyyy-MM-dd");
  const { data, error } = await withRetry(
    () =>
      withSupabaseTimeout(
        supabase
          .from("fight_camp_calendar")
          .select("id, date, session_type, notes, rpe, intensity, duration_minutes")
          .eq("user_id", userId)
          .gte("date", since)
          .neq("session_type", "Rest")
          .not("notes", "is", null)
          .order("date", { ascending: false })
          .limit(120),
        8000,
        "Fetch training-insights sessions"
      ),
    1,
    500
  );
  if (error) throw error;
  return ((data ?? []) as SessionRow[]).filter(
    (s) => typeof s.notes === "string" && s.notes.trim().length > 0
  );
}

function groupByDiscipline(rows: SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const key = row.session_type;
    if (!key) continue;
    const arr = map.get(key) ?? [];
    if (arr.length < SESSIONS_PER_DISCIPLINE) {
      arr.push(row);
      map.set(key, arr);
    }
  }
  // Cap to MAX_DISCIPLINES, ordered by most-recent latest session
  return new Map(
    Array.from(map.entries())
      .sort((a, b) => (a[1][0].date < b[1][0].date ? 1 : -1))
      .slice(0, MAX_DISCIPLINES)
  );
}

async function callTrainingInsights(
  sessionType: string,
  sessions: SessionRow[]
): Promise<{ insight?: DisciplineInsight; status: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { status: 401 };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/training-insights`;
  const latest = sessions[0];
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      session_type: sessionType,
      fingerprint: latest?.id ?? "",
      session_id: latest?.id ?? null,
      session_date: latest?.date ?? null,
      sessions: sessions.map((s) => ({
        date: s.date,
        notes: s.notes,
        rpe: s.rpe,
        intensity: s.intensity,
        duration_minutes: s.duration_minutes,
      })),
    }),
  });

  if (!resp.ok) {
    return { status: resp.status };
  }
  const body = await resp.json();
  return { insight: body?.insight as DisciplineInsight | undefined, status: 200 };
}

export const TrainingInsightsWidget = memo(function TrainingInsightsWidget({
  userId,
}: TrainingInsightsWidgetProps) {
  const { isPremium, openPaywall } = useSubscription();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<DisciplineInsight[]>([]);
  const [emptyState, setEmptyState] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const userColors = useMemo(() => (userId ? getUserColors(userId) : {}), [userId, open]);

  const handleCardPress = useCallback(() => {
    triggerHapticSelection();
    if (!isPremium) {
      openPaywall();
      return;
    }
    setOpen(true);
  }, [isPremium, openPaywall]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setErrorMsg(null);

    const run = async () => {
      setLoading(true);
      setEmptyState(false);

      try {
        const rows = await fetchRecentSessions(userId);
        if (rows.length === 0) {
          if (!cancelled) {
            setInsights([]);
            setEmptyState(true);
          }
          return;
        }

        const grouped = groupByDiscipline(rows);
        if (grouped.size === 0) {
          if (!cancelled) {
            setInsights([]);
            setEmptyState(true);
          }
          return;
        }

        // Stale-while-revalidate: paint cached insights immediately
        const initial: DisciplineInsight[] = [];
        const toFetch: Array<{ sessionType: string; sessions: SessionRow[]; fingerprint: string }> = [];

        for (const [sessionType, sessions] of grouped.entries()) {
          const fingerprint = sessions[0].id;
          const cached = AIPersistence.load(userId, cacheKey(sessionType)) as
            | CachedInsight
            | null;
          if (cached && cached.fingerprint === fingerprint && cached.insight) {
            initial.push(cached.insight);
          } else {
            // Push a placeholder so order is stable; replaced once fetched
            if (cached?.insight) initial.push(cached.insight);
            toFetch.push({ sessionType, sessions, fingerprint });
          }
        }

        if (!cancelled) setInsights(initial);

        if (toFetch.length === 0) return;

        const results = await Promise.all(
          toFetch.map(async ({ sessionType, sessions, fingerprint }) => {
            const { insight, status } = await callTrainingInsights(sessionType, sessions);
            if (status === 403) {
              return { sessionType, premiumRequired: true as const };
            }
            if (insight) {
              AIPersistence.save(
                userId,
                cacheKey(sessionType),
                { fingerprint, insight } satisfies CachedInsight,
                CACHE_TTL_HOURS
              );
              return { sessionType, insight };
            }
            return { sessionType, error: status };
          })
        );

        if (cancelled) return;

        if (results.some((r) => "premiumRequired" in r && r.premiumRequired)) {
          setOpen(false);
          openPaywall();
          return;
        }

        setInsights((prev) => {
          const map = new Map<string, DisciplineInsight>();
          for (const ins of prev) map.set(ins.session_type, ins);
          for (const r of results) {
            if ("insight" in r && r.insight) {
              map.set(r.sessionType, r.insight);
            }
          }
          // Order by original grouped iteration
          return Array.from(grouped.keys())
            .map((k) => map.get(k))
            .filter((v): v is DisciplineInsight => !!v);
        });

        const failedCount = results.filter(
          (r) => !("insight" in r) || !r.insight
        ).length;
        if (failedCount > 0 && initial.length === 0) {
          setErrorMsg("Couldn't generate insights. Try again later.");
        }
      } catch (err) {
        if (!cancelled) {
          logger.warn("training-insights failed", { err });
          setErrorMsg("Couldn't load training insights.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open, userId, openPaywall]);

  const headline = useMemo(() => {
    if (insights.length === 0) return null;
    const types = insights.map((i) => i.session_type);
    if (types.length === 1) return `Latest ${types[0]} session reviewed`;
    if (types.length === 2) return `${types[0]} & ${types[1]} reviewed`;
    return `${types.length} disciplines reviewed`;
  }, [insights]);

  return (
    <>
      <button
        onClick={handleCardPress}
        className="w-full text-left card-surface rounded-2xl border border-border p-3 flex items-center gap-3 active:scale-[0.99] transition-all"
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPremium ? "bg-primary/15" : "bg-muted/40"
          }`}
        >
          {isPremium ? (
            <Dumbbell className="h-4 w-4 text-primary" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-semibold">Training Coach</p>
            {!isPremium && (
              <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">
                Pro
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {isPremium
              ? "Things to work on, drilled from your last sessions"
              : "Upgrade to see things to work on after each session"}
          </p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[85vh] rounded-t-xl border-0 bg-card/95 backdrop-blur-xl overflow-y-auto p-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
        >
          <div className="px-4 pt-4 pb-2">
            <SheetHeader>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-[13px] font-semibold">
                    Training Coach
                  </SheetTitle>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(), "EEEE, MMM d")}
                  </p>
                </div>
              </div>
            </SheetHeader>
          </div>

          <div className="px-4 space-y-3">
            {headline && !loading && (
              <p className="display-number text-base text-foreground">{headline}</p>
            )}

            {loading && insights.length === 0 && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="card-surface rounded-2xl border border-border p-3 space-y-2"
                  >
                    <div className="h-2.5 rounded shimmer-skeleton w-1/3" />
                    <div className="h-2.5 rounded shimmer-skeleton w-full" />
                    <div className="h-2.5 rounded shimmer-skeleton w-4/5" />
                  </div>
                ))}
              </div>
            )}

            {!loading && emptyState && (
              <div className="card-surface rounded-2xl border border-border p-4 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Log a session with notes to get coaching insights.
                </p>
              </div>
            )}

            {!loading && !emptyState && errorMsg && insights.length === 0 && (
              <div className="card-surface rounded-2xl border border-border p-4 text-center">
                <p className="text-[13px] text-muted-foreground">{errorMsg}</p>
              </div>
            )}

            {insights.map((insight) => {
              const color = getSessionColor(insight.session_type, userColors);
              return (
                <div
                  key={insight.session_type}
                  className="card-surface rounded-2xl border border-border p-3 space-y-2 relative overflow-hidden"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                      {insight.session_type}
                    </span>
                    {insight.last_logged && (
                      <span className="text-[11px] text-muted-foreground">
                        {(() => {
                          try {
                            return format(new Date(insight.last_logged), "MMM d");
                          } catch {
                            return insight.last_logged;
                          }
                        })()}
                      </span>
                    )}
                  </div>
                  {insight.what_you_did && (
                    <p className="text-[13px] text-muted-foreground leading-snug">
                      {insight.what_you_did}
                    </p>
                  )}
                  {insight.next_focus && (
                    <div
                      className="rounded-lg p-2.5"
                      style={{
                        backgroundColor: `${color}10`,
                        border: `1px solid ${color}33`,
                      }}
                    >
                      <p
                        className="text-[10px] uppercase tracking-wide font-semibold mb-1"
                        style={{ color }}
                      >
                        Focus next
                      </p>
                      <p className="text-[13px] text-foreground leading-snug">
                        {insight.next_focus}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && insights.length > 0 && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Refreshing latest discipline…
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
});
