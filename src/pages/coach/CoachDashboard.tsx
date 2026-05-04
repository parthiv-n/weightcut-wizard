import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Copy, Check, Share2, Megaphone, RefreshCw } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useCoachData, type AthleteOverviewRow, type GymRow } from "@/hooks/coach/useCoachData";
import { useCoachRealtimeSync } from "@/hooks/coach/useCoachRealtimeSync";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { shareGymInvite } from "@/lib/shareInvite";
import { CoachSettingsSheet } from "@/components/coach/CoachSettingsSheet";
import { GymLogoUpload } from "@/components/coach/GymLogoUpload";
import { GymLogoAvatar } from "@/components/coach/GymLogoAvatar";
import { AthleteAvatar } from "@/components/coach/AthleteAvatar";
import { StrainSparkline } from "@/components/coach/StrainSparkline";
import { FightTargetBadge } from "@/components/coach/FightTargetBadge";
import { AnnouncementComposeSheet } from "@/components/coach/AnnouncementComposeSheet";
import { localCache } from "@/lib/localCache";
import ErrorBoundary from "@/components/ErrorBoundary";
import { registerPullRefresh } from "@/lib/pullRefreshRegistry";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

function relativeWeight(a: AthleteOverviewRow): { delta: number | null; target: number | null } {
  const target = a.fight_week_target_kg ?? a.goal_weight_kg ?? null;
  if (a.current_weight_kg == null || target == null) return { delta: null, target };
  return { delta: +(a.current_weight_kg - target).toFixed(1), target };
}

function flagSeverity(a: AthleteOverviewRow): "ok" | "warn" | "alert" {
  const wDays = daysSince(a.last_weight_at);
  if (wDays != null && wDays >= 3) return "alert";
  const cals = a.todays_calories || 0;
  const goal = a.daily_calorie_goal || 0;
  if (goal > 0 && cals > goal * 1.15) return "warn";
  if (wDays != null && wDays >= 2) return "warn";
  return "ok";
}

const flagDot: Record<"ok" | "warn" | "alert", string> = {
  ok: "bg-emerald-500/70",
  warn: "bg-amber-500/80",
  alert: "bg-red-500/80",
};

export default function CoachDashboard() {
  const { userId, profile, userName } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { gyms, athletes, loading, refresh } = useCoachData(userId);

  // Real-time fanout: any athlete logs a weight/meal/training → coach dash
  // refetches within ~400ms. Debounce clusters bursts into one refetch.
  useCoachRealtimeSync(userId, refresh);

  const handleLogoUploaded = (gymId: string, newUrl: string | null) => {
    if (!userId) return;
    // Optimistically patch the cached gyms list so the UI repaints instantly
    try {
      const cached = localCache.get<GymRow[]>(userId, "coach_gyms") || [];
      const updated = cached.map((g) => (g.id === gymId ? { ...g, logo_url: newUrl } : g));
      localCache.set(userId, "coach_gyms", updated);
    } catch {}
    void refresh();
  };
  const [copied, setCopied] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composingForGym, setComposingForGym] = useState<GymRow | null>(null);

  // Clear intended-role marker once dashboard renders (prevents stale redirect loops)
  useEffect(() => {
    try { localStorage.removeItem("wcw_intended_role"); } catch {}
  }, []);

  // Wire pull-to-refresh to a soft refetch instead of window.reload — keeps
  // realtime channels alive and React state intact.
  useEffect(() => registerPullRefresh(() => refresh()), [refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, AthleteOverviewRow[]>();
    for (const a of athletes) {
      if (!map.has(a.gym_id)) map.set(a.gym_id, []);
      map.get(a.gym_id)!.push(a);
    }
    return map;
  }, [athletes]);

  const stats = useMemo(() => {
    const total = athletes.length;
    const alerts = athletes.filter((a) => flagSeverity(a) === "alert").length;
    const warns = athletes.filter((a) => flagSeverity(a) === "warn").length;
    return { total, alerts, warns };
  }, [athletes]);

  const copyCode = async (code: string) => {
    triggerHaptic(ImpactStyle.Light);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
      toast({ title: "Invite code copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const shareInvite = async (gym: GymRow) => {
    triggerHaptic(ImpactStyle.Light);
    const result = await shareGymInvite({ gymName: gym.name, code: gym.invite_code });
    if (result.via === "clipboard") {
      toast({ title: "Invite link copied", description: "Paste it anywhere" });
    } else if (result.via === "none") {
      toast({ title: "Could not share", variant: "destructive" });
    }
  };

  if (loading && athletes.length === 0) return <DashboardSkeleton />;

  if (gyms.length === 0) {
    return (
      <>
        <div className="animate-page-in space-y-3 px-5 py-4 max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Coach</p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:bg-muted/80 transition-colors"
              aria-label="Settings"
            >
              <span className="text-[12px] font-semibold text-muted-foreground">
                {(userName || "C").charAt(0).toUpperCase()}
              </span>
            </button>
          </div>
          <div className="card-surface rounded-2xl border border-border p-6 text-center space-y-3">
            <h1 className="text-base font-semibold">Set up your gym</h1>
            <p className="text-[13px] text-muted-foreground leading-snug">
              Create a gym to start inviting athletes.
            </p>
            <button
              onClick={() => navigate("/coach/setup")}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.98] transition-transform"
            >
              Create gym
            </button>
          </div>
        </div>
        <CoachSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="animate-page-in space-y-4 px-5 py-3 sm:p-5 md:p-6 w-full max-w-3xl mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Coach</p>
            <h1 className="text-[17px] font-semibold leading-tight truncate">{userName || gyms[0].name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {stats.total} {stats.total === 1 ? "athlete" : "athletes"}
            </span>
            <button
              onClick={() => { triggerHaptic(ImpactStyle.Light); void refresh(); }}
              disabled={loading}
              className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:bg-muted/80 transition-colors disabled:opacity-60"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:bg-muted/80 transition-colors"
              aria-label="Settings"
            >
              <span className="text-[12px] font-semibold text-muted-foreground">
                {(userName || "C").charAt(0).toUpperCase()}
              </span>
            </button>
          </div>
        </div>

        {/* Quick stats — minimal, no heavy iconography */}
        {stats.total > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="card-surface rounded-2xl border border-border px-3 py-2.5 text-center">
              <p className="text-[18px] font-semibold tabular-nums leading-none">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Active</p>
            </div>
            <div className="card-surface rounded-2xl border border-border px-3 py-2.5 text-center">
              <p className="text-[18px] font-semibold tabular-nums leading-none text-amber-500">{stats.warns}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Watch</p>
            </div>
            <div className="card-surface rounded-2xl border border-border px-3 py-2.5 text-center">
              <p className="text-[18px] font-semibold tabular-nums leading-none text-red-500">{stats.alerts}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Alerts</p>
            </div>
          </div>
        )}

        {/* Per-gym sections — supports multiple gyms per coach */}
        {gyms.map((gym) => {
          const gymAthletes = grouped.get(gym.id) ?? [];
          return (
            <section key={gym.id} className="space-y-2">
              {/* Gym header + share/copy controls */}
              <div className="card-surface rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <GymLogoUpload
                    gymId={gym.id}
                    gymName={gym.name}
                    currentLogoUrl={gym.logo_url}
                    size={44}
                    onUploaded={(url) => handleLogoUploaded(gym.id, url)}
                    hideRemove
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">{gym.name}</p>
                    {gym.location && (
                      <p className="text-[11px] text-muted-foreground truncate">{gym.location}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => copyCode(gym.invite_code)}
                      className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg bg-muted/40 active:bg-muted/60 transition-colors"
                      aria-label="Copy invite code"
                    >
                      <span className="font-mono text-[12px] font-semibold tracking-widest tabular-nums">
                        {gym.invite_code}
                      </span>
                      {copied === gym.invite_code ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => shareInvite(gym)}
                      className="flex items-center justify-center min-h-[36px] min-w-[36px] rounded-lg bg-muted/40 active:bg-muted/60 transition-colors text-muted-foreground"
                      aria-label="Share invite link"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Prominent announcement CTA — full width so it's unmissable */}
              <button
                onClick={() => setComposingForGym(gym)}
                className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2"
                aria-label="New announcement"
              >
                <Megaphone className="h-4 w-4" /> New announcement
              </button>

              {/* Athletes for this gym */}
              {gymAthletes.length === 0 ? (
                <div className="card-surface rounded-2xl border border-border p-5 text-center">
                  <p className="text-[13px] font-semibold mb-1">No athletes yet</p>
                  <p className="text-[12px] text-muted-foreground leading-snug mb-3">
                    Share the invite link to get fighters logged in.
                  </p>
                  <button
                    onClick={() => shareInvite(gym)}
                    className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.98] transition-transform inline-flex items-center gap-1.5"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share invite
                  </button>
                </div>
              ) : (
                <div className="card-surface rounded-2xl border border-border overflow-hidden divide-y divide-border/40">
                  {gymAthletes.map((a) => {
                    const sev = flagSeverity(a);
                    const { delta, target } = relativeWeight(a);
                    const wDays = daysSince(a.last_weight_at);
                    return (
                      <button
                        key={a.user_id}
                        onClick={() => navigate(`/coach/athletes/${a.user_id}`)}
                        className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] active:bg-muted/30 transition-colors text-left"
                      >
                        <AthleteAvatar avatarUrl={a.avatar_url} name={a.display_name} size={36} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${flagDot[sev]} flex-shrink-0`} aria-hidden />
                            <p className="text-[13px] font-medium truncate">{a.display_name}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 tabular-nums">
                            <span className="text-[12px] font-semibold text-foreground/90">
                              {a.current_weight_kg != null ? `${a.current_weight_kg.toFixed(1)}` : "—"}
                              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">kg</span>
                            </span>
                            {target != null && delta != null && (
                              <>
                                <span
                                  className={`px-1 py-px rounded text-[10px] font-semibold leading-none ${
                                    Math.abs(delta) < 0.1
                                      ? "bg-emerald-500/10 text-emerald-400"
                                      : delta > 0
                                      ? "bg-amber-500/10 text-amber-500"
                                      : "bg-emerald-500/10 text-emerald-400"
                                  }`}
                                >
                                  {Math.abs(delta) < 0.1
                                    ? "0.0"
                                    : delta > 0
                                    ? `−${delta.toFixed(1)}`
                                    : `+${Math.abs(delta).toFixed(1)}`}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70">
                                  to {target.toFixed(1)}
                                </span>
                              </>
                            )}
                            {wDays != null && wDays >= 2 && (
                              <span className="text-[10px] text-muted-foreground/60 ml-auto">
                                {wDays}d ago
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 7-day training strain — sparkline updates in
                            realtime via the existing fight_camp_calendar
                            fanout trigger + useCoachRealtimeSync. */}
                        <StrainSparkline
                          values={a.strain_7d ?? []}
                          width={56}
                          height={22}
                          className="flex-shrink-0 hidden sm:block"
                        />
                        <StrainSparkline
                          values={a.strain_7d ?? []}
                          width={44}
                          height={20}
                          className="flex-shrink-0 sm:hidden"
                        />

                        {/* Fight date + target — visible whenever the
                            athlete has set a target_date in Goals. Updates
                            in real time via the profiles_coach_fanout
                            trigger when they change either field. */}
                        {a.target_date ? (
                          <FightTargetBadge
                            targetDate={a.target_date}
                            fightWeekTargetKg={a.fight_week_target_kg}
                            goalWeightKg={a.goal_weight_kg}
                            currentWeightKg={a.current_weight_kg}
                            goalType={a.goal_type}
                            variant="row"
                            className="flex-shrink-0"
                          />
                        ) : (
                          <div className="text-right flex-shrink-0">
                            <p className="text-[11px] font-medium tabular-nums">
                              {Math.round(a.todays_calories || 0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">kcal today</p>
                          </div>
                        )}

                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <CoachSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      {composingForGym && (
        <AnnouncementComposeSheet
          open={!!composingForGym}
          onOpenChange={(o) => { if (!o) setComposingForGym(null); }}
          gymId={composingForGym.id}
          gymName={composingForGym.name}
          athletes={grouped.get(composingForGym.id) ?? []}
        />
      )}
    </ErrorBoundary>
  );
}
