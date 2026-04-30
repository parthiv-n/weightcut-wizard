import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useMyGyms, type MyGymRow } from "@/hooks/coach/useMyGyms";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { localCache } from "@/lib/localCache";
import { globalLoading } from "@/lib/globalLoading";
import { logger } from "@/lib/logger";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
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
import { GymLogoAvatar } from "@/components/coach/GymLogoAvatar";
import { AnnouncementsSection } from "@/components/coach/AnnouncementsSection";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function MyGym() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { gyms, loading, refresh } = useMyGyms(userId);
  const [pendingShareToggle, setPendingShareToggle] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<MyGymRow | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (loading && gyms.length === 0) return <DashboardSkeleton />;

  const handleToggleShare = async (gym: MyGymRow, next: boolean) => {
    if (!userId) return;
    setPendingShareToggle(gym.member_id);
    triggerHaptic(ImpactStyle.Light);
    try {
      const { error } = await supabase
        .from("gym_members")
        .update({ share_data: next })
        .eq("id", gym.member_id);
      if (error) throw error;
      localCache.remove(userId, "my_gyms");
      await refresh();
      toast({
        title: next ? "Sharing enabled" : "Sharing paused",
        description: next ? "Your coach can see your data again." : "Your coach can't see your data until re-enabled.",
      });
    } catch (err: any) {
      logger.error("MyGym: toggle share failed", err);
      toast({ title: "Could not update sharing", variant: "destructive" });
    } finally {
      setPendingShareToggle(null);
    }
  };

  const handleLeave = async () => {
    if (!userId || !leaveTarget) return;
    setLeaving(true);
    const target = leaveTarget;
    // Optimistic remove from UI immediately
    const prevGyms = gyms;
    const filtered = gyms.filter(g => g.member_id !== target.member_id);
    try { localCache.set(userId, "my_gyms", filtered); } catch {}
    globalLoading.show(`Leaving ${target.gym_name}…`);
    try {
      const { error } = await supabase
        .from("gym_members")
        .update({ status: "removed" })
        .eq("id", target.member_id);
      if (error) throw error;
      triggerHaptic(ImpactStyle.Medium);
      setLeaveTarget(null);
      await refresh();
      globalLoading.hide();
      toast({ title: `Left ${target.gym_name}` });
    } catch (err: any) {
      logger.error("MyGym: leave failed", err);
      // Rollback optimistic write
      try { localCache.set(userId, "my_gyms", prevGyms); } catch {}
      await refresh();
      globalLoading.hide();
      toast({ title: "Could not leave gym", description: err?.message, variant: "destructive" });
    } finally {
      setLeaving(false);
    }
  };

  return (
    <ErrorBoundary>
      <div
        className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 w-full max-w-2xl mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
      >
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">My gyms</p>
          <h1 className="text-[17px] font-semibold leading-tight">
            {gyms.length === 0 ? "Not in a gym yet" : `${gyms.length} ${gyms.length === 1 ? "gym" : "gyms"}`}
          </h1>
        </div>

        {/* Live announcements from coach (broadcast + targeted) */}
        {gyms.length > 0 && (
          <AnnouncementsSection gymIds={gyms.map((g) => g.gym_id)} />
        )}

        {gyms.length === 0 ? (
          <div className="card-surface rounded-2xl border border-border p-6 text-center">
            <p className="text-[13px] font-semibold mb-1">Join your coach's gym</p>
            <p className="text-[12px] text-muted-foreground leading-snug mb-3">
              Enter the 6-character invite code from your coach.
            </p>
            <button
              onClick={() => navigate("/join")}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.98] transition-transform"
            >
              Enter invite code
            </button>
          </div>
        ) : (
          gyms.map((gym) => (
            <div key={gym.member_id} className="card-surface rounded-2xl border border-border p-3 space-y-3">
              <div className="flex items-start gap-3">
                <GymLogoAvatar logoUrl={gym.gym_logo_url} name={gym.gym_name} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold leading-tight">{gym.gym_name}</p>
                  {gym.gym_location && (
                    <p className="text-[11px] text-muted-foreground">{gym.gym_location}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Coach: {gym.coach_name ?? "—"}
                    <span className="ml-1.5">
                      · joined {new Date(gym.joined_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 py-1 border-t border-border/30 pt-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium">Share data with coach</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Pause this to hide your weight, meals, and training from your coach.
                  </p>
                </div>
                <Switch
                  checked={gym.share_data}
                  onCheckedChange={(v) => handleToggleShare(gym, v)}
                  disabled={pendingShareToggle === gym.member_id}
                  aria-label="Share data with coach"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setLeaveTarget(gym)}
                  className="h-8 px-3 text-[12px] font-medium text-destructive active:bg-destructive/10 rounded-lg transition-colors"
                >
                  Leave gym
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={!!leaveTarget} onOpenChange={(o) => !o && setLeaveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">Leave {leaveTarget?.gym_name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Your coach will lose access to your data. You can rejoin later with a new invite code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-center sm:justify-center gap-2">
            <AlertDialogCancel disabled={leaving} className="mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} disabled={leaving} className="bg-destructive hover:bg-destructive/90">
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ErrorBoundary>
  );
}
