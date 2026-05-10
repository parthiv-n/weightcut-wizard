import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUser } from "@/contexts/UserContext";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, celebrateSuccess } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { globalLoading } from "@/lib/globalLoading";
import { logger } from "@/lib/logger";
import { Loader2 } from "lucide-react";

export default function CoachSetup() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const createGym = useMutation(api.gyms.create);

  // Pre-warm the CoachDashboard chunk on mount so the post-create navigation
  // doesn't stall on a chunk download.
  useEffect(() => { void import("@/pages/coach/CoachDashboard"); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !name.trim()) return;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    globalLoading.show("Creating gym…", "Setting up your invite code");
    try {
      // Single atomic mutation: promotes profile.role to "coach", creates
      // the gym with a unique invite code (server-side retry on collision),
      // and inserts the coach as a member of their own gym.
      const gym = await createGym({
        name: name.trim(),
        location: location.trim() || undefined,
      });
      if (!gym) throw new Error("Gym creation returned no result");

      celebrateSuccess();
      toast({ title: "Gym created", description: `Invite code: ${gym.invite_code}` });
      navigate("/coach", { replace: true });
      globalLoading.hideAfterPaint();
    } catch (err: any) {
      logger.error("CoachSetup: create gym failed", err);
      globalLoading.hide();
      toast({ title: "Could not create gym", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div
        className="flex items-center px-4 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)", paddingBottom: "8px" }}
      >
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Coach setup</p>
      </div>
      <div className="flex-1 flex flex-col items-center px-6">
        <div className="w-full max-w-[420px] pt-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Create your gym</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              Athletes join with a 6-character invite code.
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              placeholder="Gym name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="h-[50px] rounded-2xl bg-muted/40 dark:bg-white/[0.06] border-border/40 px-4 text-[16px]"
            />
            <Input
              placeholder="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-[50px] rounded-2xl bg-muted/40 dark:bg-white/[0.06] border-border/40 px-4 text-[16px]"
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              onClick={() => triggerHaptic(ImpactStyle.Light)}
              className="w-full h-[50px] rounded-2xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create gym"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="block w-full text-center mt-6 text-[13px] text-muted-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
