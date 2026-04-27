import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, celebrateSuccess } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { globalLoading } from "@/lib/globalLoading";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";
import { Loader2 } from "lucide-react";

export default function CoachSetup() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  // No-ambiguous-chars alphabet (matches the SQL function and JoinGym regex)
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const generateCode = () => {
    let out = "";
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 6; i++) out += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return out;
  };

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
      // 1. Mark profile as coach (idempotent)
      await supabase.from("profiles").upsert({ id: userId, role: "coach" }, { onConflict: "id" });

      // 2. Insert gym with a client-generated invite code; retry on unique-collision.
      // (Avoids dependency on the generate_gym_invite_code() RPC being in the
      // schema cache. The unique constraint on gyms.invite_code is the source
      // of truth — collisions just trigger another roll.)
      let gym: { id: string; invite_code: string } | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const inviteCode = generateCode();
        const { data, error } = await supabase
          .from("gyms")
          .insert({
            name: name.trim(),
            location: location.trim() || null,
            owner_user_id: userId,
            invite_code: inviteCode,
          })
          .select("id, invite_code")
          .single();
        if (!error && data) { gym = data; break; }
        lastErr = error;
        // 23505 = unique_violation on invite_code; retry. Anything else: bail.
        if (error?.code !== "23505") throw error;
      }
      if (!gym) throw lastErr ?? new Error("Could not generate a unique invite code");

      // 3. Add coach as a 'coach' member of their own gym
      await supabase.from("gym_members").upsert(
        { gym_id: gym.id, user_id: userId, member_role: "coach", status: "active" },
        { onConflict: "gym_id,user_id" }
      );

      // Optimistic cache write so CoachDashboard paints without a skeleton flash
      try {
        localCache.set(userId, "coach_gyms", [{
          id: gym.id,
          name: name.trim(),
          location: location.trim() || null,
          invite_code: gym.invite_code,
        }]);
        localCache.set(userId, "coach_athletes", []);
      } catch {}

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
