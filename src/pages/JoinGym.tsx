import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { celebrateSuccess, triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { Loader2 } from "lucide-react";
import { localCache } from "@/lib/localCache";
import { globalLoading } from "@/lib/globalLoading";

const CODE_RE = /^[A-HJ-KMNP-Z2-9]{6}$/i;

export default function JoinGym() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [gymPreview, setGymPreview] = useState<{ id: string; name: string; location: string | null } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [joining, setJoining] = useState(false);

  // Pre-warm the MyGym lazy chunk on mount so the post-join navigation
  // does not stall on a chunk download (Suspense-fallback flash → blank screen).
  useEffect(() => {
    void import("@/pages/MyGym");
  }, []);

  // Live lookup once user enters a valid code
  useEffect(() => {
    const clean = code.trim().toUpperCase();
    if (!CODE_RE.test(clean)) { setGymPreview(null); return; }
    let cancelled = false;
    setLookingUp(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("gyms")
          .select("id, name, location")
          .eq("invite_code", clean)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setGymPreview(data ?? null);
      } catch (err) {
        if (!cancelled) {
          logger.warn("JoinGym lookup failed", err);
          setGymPreview(null);
        }
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const canJoin = useMemo(() => !!gymPreview && !!userId && !joining, [gymPreview, userId, joining]);

  const handleJoin = async () => {
    if (!gymPreview || !userId) return;
    setJoining(true);
    // Dismiss the iOS keyboard immediately so the overlay reads as "instant"
    // instead of "frozen page with keyboard up."
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Show the global overlay BEFORE the network call. Survives the route
    // unmount so the user sees continuous feedback through MyGym's first paint.
    globalLoading.show(`Joining ${gymPreview.name}…`, "Setting up your coach connection");

    // Optimistic cache write so MyGym paints with the new gym row immediately
    // (skips the DashboardSkeleton branch). Reconciled by the real refetch.
    const optimisticRow = {
      member_id: `tmp_${Date.now()}`,
      gym_id: gymPreview.id,
      gym_name: gymPreview.name,
      gym_location: gymPreview.location,
      coach_user_id: "",
      coach_name: null,
      share_data: true,
      joined_at: new Date().toISOString(),
    };
    try {
      const existing = localCache.get<typeof optimisticRow[]>(userId, "my_gyms") || [];
      const merged = [...existing.filter(g => g.gym_id !== gymPreview.id), optimisticRow];
      localCache.set(userId, "my_gyms", merged);
    } catch {}

    try {
      // Single upsert — covers re-join after leaving (sets status back to active).
      const { error } = await supabase
        .from("gym_members")
        .upsert(
          {
            gym_id: gymPreview.id,
            user_id: userId,
            member_role: "athlete",
            status: "active",
            share_data: true,
          },
          { onConflict: "gym_id,user_id" }
        );
      if (error) throw error;

      // Invalidate caches that need a real refetch (the optimistic my_gyms row
      // is fine; coach_athletes belongs to the coach side and is unaffected by
      // this user's local cache, but clear in case the user is also a coach).
      try { localCache.remove(userId, "coach_athletes"); } catch {}

      celebrateSuccess();
      toast({ title: `Joined ${gymPreview.name}` });
      navigate("/my-gym", { replace: true });
      // Hide the overlay only after MyGym has painted (two RAFs).
      globalLoading.hideAfterPaint();
    } catch (err: any) {
      logger.error("JoinGym: failed to join", err);
      // Roll back optimistic write
      try {
        const existing = localCache.get<typeof optimisticRow[]>(userId, "my_gyms") || [];
        localCache.set(userId, "my_gyms", existing.filter(g => g.member_id !== optimisticRow.member_id));
      } catch {}
      globalLoading.hide();
      toast({ title: "Could not join gym", description: err?.message, variant: "destructive" });
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      {/* Loading overlay is rendered globally via <GlobalLoadingOverlay /> in
          App.tsx — survives this page's unmount on navigate(). */}
      <div className="flex-1 flex flex-col items-center px-6 pt-12">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Join a gym</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              Enter the 6-character invite code from your coach.
            </p>
          </div>

          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            className="h-[60px] text-center font-mono text-[22px] tracking-[0.4em] tabular-nums rounded-2xl bg-muted/40 dark:bg-white/[0.06] border-border/40"
            autoFocus
          />

          <div className="min-h-[64px] mt-3">
            {lookingUp && (
              <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Looking up code…
              </div>
            )}
            {!lookingUp && gymPreview && (
              <div className="card-surface rounded-2xl border border-border p-3 text-center">
                <p className="text-[13px] font-semibold">{gymPreview.name}</p>
                {gymPreview.location && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{gymPreview.location}</p>
                )}
              </div>
            )}
            {!lookingUp && !gymPreview && CODE_RE.test(code.trim()) && (
              <div className="text-center">
                <p className="text-[13px] font-medium text-foreground">Code not recognised</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Codes are 6 characters · check capitalisation with your coach
                </p>
              </div>
            )}
          </div>

          {/* Unauth users: send to signup, persist code through auth */}
          {!userId ? (
            <button
              type="button"
              onClick={() => navigate(`/auth?mode=signup&join=${encodeURIComponent(code.trim())}`)}
              disabled={!gymPreview}
              className="w-full h-[50px] mt-2 rounded-2xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Sign up to join {gymPreview ? gymPreview.name : "gym"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { triggerHaptic(ImpactStyle.Light); handleJoin(); }}
              disabled={!canJoin}
              className="w-full h-[50px] mt-2 rounded-2xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {joining ? <><Loader2 className="h-4 w-4 animate-spin" /> Joining…</> : "Join gym"}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(userId ? "/dashboard" : "/")}
            className="block w-full text-center mt-6 text-[13px] text-muted-foreground"
          >
            {userId ? "Skip" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
