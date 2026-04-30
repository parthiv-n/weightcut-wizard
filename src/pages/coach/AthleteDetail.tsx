import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";
import { useUser } from "@/contexts/UserContext";
import { useAthleteDetail } from "@/hooks/coach/useAthleteDetail";
import { useCoachRealtimeSync } from "@/hooks/coach/useCoachRealtimeSync";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { localCache } from "@/lib/localCache";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { globalLoading } from "@/lib/globalLoading";
import { logger } from "@/lib/logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AthleteAvatar } from "@/components/coach/AthleteAvatar";
import { StrainSparkline } from "@/components/coach/StrainSparkline";
import { FightTargetBadge } from "@/components/coach/FightTargetBadge";
import ErrorBoundary from "@/components/ErrorBoundary";
import { registerPullRefresh } from "@/lib/pullRefreshRegistry";
import { getSessionColor } from "@/lib/sessionColors";

function fmtPct(value: number, goal: number | null): string {
  if (!goal || goal <= 0) return "—";
  return `${Math.round((value / goal) * 100)}%`;
}

export default function AthleteDetail() {
  const { id: athleteId } = useParams<{ id: string }>();
  const { userId, profile } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useAthleteDetail(userId, athleteId ?? null);

  // Realtime sync — refresh detail when this specific athlete logs anything.
  useCoachRealtimeSync(userId, () => { /* dashboard refresh handled there */ }, (ev) => {
    if (athleteId && ev.athlete_user_id === athleteId) refresh();
  });
  useEffect(() => registerPullRefresh(() => refresh()), [refresh]);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Block unauthorised viewers — only coaches reach this route.
  if (profile && profile.role !== "coach") {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-[13px] text-muted-foreground">Coach access only.</p>
      </div>
    );
  }

  if (loading && !data) return <DashboardSkeleton />;

  if (error || !data || !data.profile) {
    return (
      <div className="animate-page-in px-5 py-6 max-w-2xl mx-auto space-y-3">
        <button
          onClick={() => navigate("/coach")}
          className="inline-flex items-center gap-1 text-[13px] text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="card-surface rounded-2xl border border-border p-6 text-center">
          <p className="text-[13px] font-semibold mb-1">Athlete not available</p>
          <p className="text-[12px] text-muted-foreground leading-snug">
            {error || "They may have left your gym or paused sharing."}
          </p>
        </div>
      </div>
    );
  }

  const { profile: ath, weight_7d, strain_7d, today_macros, recent_sessions, membership } = data;
  const strainTotal = (strain_7d ?? []).reduce((s, v) => s + (v || 0), 0);
  const target = ath.fight_week_target_kg ?? ath.goal_weight_kg ?? null;
  const delta = target != null && ath.current_weight_kg != null
    ? +(ath.current_weight_kg - target).toFixed(1)
    : null;

  const handleRemove = async () => {
    if (!userId || !athleteId) return;
    setRemoving(true);
    globalLoading.show("Removing athlete…");
    try {
      const { error: rmErr } = await supabase
        .from("gym_members")
        .update({ status: "removed" })
        .eq("user_id", athleteId);
      if (rmErr) throw rmErr;
      // Invalidate caches so the dashboard refetches fresh
      localCache.remove(userId, "coach_athletes");
      localCache.remove(userId, `coach_athlete_${athleteId}`);
      triggerHaptic(ImpactStyle.Medium);
      setRemoveDialogOpen(false);
      toast({ title: "Athlete removed from gym" });
      navigate("/coach", { replace: true });
      globalLoading.hideAfterPaint();
    } catch (err: any) {
      logger.error("AthleteDetail: remove failed", err);
      globalLoading.hide();
      toast({ title: "Could not remove athlete", description: err?.message, variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ErrorBoundary>
      <div
        className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 w-full max-w-2xl mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/coach")}
            className="-ml-2 p-2 rounded-lg active:bg-muted/50 transition-colors"
            aria-label="Back to coach dashboard"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <AthleteAvatar avatarUrl={ath.avatar_url} name={ath.display_name} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate">{ath.display_name || "Athlete"}</p>
            {membership && (
              <p className="text-[11px] text-muted-foreground truncate">{membership.gym_name}</p>
            )}
          </div>
        </div>

        {/* Weight summary + 7d chart */}
        <div className="card-surface rounded-2xl border border-border p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Weight</span>
            <div className="text-right">
              <p className="text-[18px] font-semibold tabular-nums leading-none">
                {ath.current_weight_kg != null ? `${ath.current_weight_kg.toFixed(1)} kg` : "—"}
              </p>
              {target != null && delta != null && (
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} to {target.toFixed(1)} kg
                </p>
              )}
            </div>
          </div>
          <div className="h-24">
            {weight_7d && weight_7d.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weight_7d} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
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
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                No weight data this week
              </div>
            )}
          </div>
        </div>

        {/* Fight target — date + target weight + on-track status. Only
            renders when the athlete has set a target_date. */}
        {ath.target_date && (
          <FightTargetBadge
            targetDate={ath.target_date}
            fightWeekTargetKg={ath.fight_week_target_kg}
            goalWeightKg={ath.goal_weight_kg}
            currentWeightKg={ath.current_weight_kg}
            goalType={ath.goal_type}
            variant="card"
          />
        )}

        {/* 7-day training strain — RPE-hours per day */}
        <div className="card-surface rounded-2xl border border-border p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Strain · 7 days
            </span>
            <div className="text-right">
              <p className="text-[18px] font-semibold tabular-nums leading-none">
                {strainTotal.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                RPE-hours
              </p>
            </div>
          </div>
          <StrainSparkline values={strain_7d ?? []} width={280} height={48} className="w-full" />
        </div>

        {/* Today's macros */}
        {today_macros && (
          <div className="card-surface rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Today</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {Math.round(today_macros.calories)}
                {ath.ai_recommended_calories ? ` / ${ath.ai_recommended_calories}` : ""} kcal
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Protein", val: today_macros.protein_g, goal: ath.ai_recommended_protein_g, color: "text-blue-500" },
                { label: "Carbs", val: today_macros.carbs_g, goal: ath.ai_recommended_carbs_g, color: "text-orange-500" },
                { label: "Fats", val: today_macros.fats_g, goal: ath.ai_recommended_fats_g, color: "text-purple-500" },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className={`text-[14px] font-semibold tabular-nums ${m.color}`}>
                    {Math.round(m.val)}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground/70 tabular-nums">
                    {fmtPct(m.val, m.goal)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent training */}
        <div className="card-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border/40">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Recent training</span>
          </div>
          {recent_sessions && recent_sessions.length > 0 ? (
            <div className="divide-y divide-border/40">
              {recent_sessions.map((s, i) => (
                <div
                  key={`${s.date}-${i}`}
                  className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] border-l-[3px]"
                  style={{ borderLeftColor: getSessionColor(s.session_type) }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate capitalize">{s.session_type}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}{s.duration_minutes}min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold tabular-nums">RPE {s.rpe}</p>
                    {s.soreness_level != null && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">Sore {s.soreness_level}/10</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center px-3 py-4">No sessions logged yet</p>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled
            className="flex-1 h-10 rounded-xl bg-muted/40 text-muted-foreground/60 text-[12px] font-medium cursor-not-allowed"
          >
            Send check-in · soon
          </button>
          <button
            onClick={() => setRemoveDialogOpen(true)}
            className="h-10 px-3 rounded-xl text-[12px] font-medium text-destructive active:bg-destructive/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">Remove athlete from gym?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              They'll lose access to your coaching feedback. They can rejoin with the invite code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-center sm:justify-center gap-2">
            <AlertDialogCancel disabled={removing} className="mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removing} className="bg-destructive hover:bg-destructive/90">
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ErrorBoundary>
  );
}
