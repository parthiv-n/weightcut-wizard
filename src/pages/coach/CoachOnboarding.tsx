/**
 * Coach onboarding — replaces the bare-bones CoachSetup gym-name-only form.
 *
 * Two short steps so the field count never feels overwhelming:
 *   1. Identity   — coach name, gym name, location  (creates the gym)
 *   2. Profile    — logo, disciplines, roster size, about  (patches the gym)
 *
 * The gym is created at the end of step 1 so step 2 can use the existing
 * `GymLogoUpload` component (which needs a `gymId`). Step 2 is fully
 * optional — the "Done" button completes onboarding regardless of which
 * fields are filled. This keeps friction low while still inviting the
 * coach to add the polish.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Check } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { triggerHaptic, celebrateSuccess } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { globalLoading } from "@/lib/globalLoading";
import { logger } from "@/lib/logger";
import { GymLogoUpload } from "@/components/coach/GymLogoUpload";

const inputClass =
  "h-[50px] rounded-2xl bg-muted/40 dark:bg-white/[0.06] border-border/40 px-4 text-[16px]";

const DISCIPLINES = [
  "MMA",
  "BJJ",
  "Boxing",
  "Muay Thai",
  "Wrestling",
  "Kickboxing",
  "Judo",
  "Strength",
] as const;

type Step = "identity" | "profile";

export default function CoachOnboarding() {
  const { userId, userName, profile } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("identity");
  const [coachName, setCoachName] = useState(userName || profile?.display_name || "");
  const [gymName, setGymName] = useState("");
  const [location, setLocation] = useState("");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [fighterCount, setFighterCount] = useState<string>("");
  const [about, setAbout] = useState("");
  const [gymId, setGymId] = useState<Id<"gyms"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const createGym = useMutation(api.gyms.create);
  const updateGym = useMutation(api.gyms.update);

  // Reactive subscription to the gym row once it's created. We rely on this
  // (not local state) for the logo URL because `GymLogoUpload` signals
  // success by calling `onUploaded(null)` and expects the parent to surface
  // the fresh URL via a Convex query — without this subscription the new
  // logo would never appear on the onboarding screen even after a
  // successful upload.
  const gymRow = useQuery(api.gyms.getById, gymId ? { gymId } : "skip");
  const logoUrl = gymRow?.logo_url ?? null;

  // Pre-warm CoachDashboard so the post-finish navigation is instant.
  useEffect(() => {
    void import("@/pages/coach/CoachDashboard");
  }, []);

  const toggleDiscipline = (d: string) => {
    triggerHaptic(ImpactStyle.Light);
    setDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !gymName.trim()) return;
    setCreating(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    globalLoading.show("Creating your gym…", "Generating an invite code");
    try {
      const gym = await createGym({
        name: gymName.trim(),
        location: location.trim() || undefined,
        coachDisplayName: coachName.trim() || undefined,
      });
      if (!gym) throw new Error("Gym creation returned no result");
      setGymId(gym.id as Id<"gyms">);
      celebrateSuccess();
      toast({
        title: "Gym created",
        description: `Invite code ${gym.invite_code}`,
      });
      setStep("profile");
      globalLoading.hideAfterPaint();
    } catch (err: any) {
      logger.error("CoachOnboarding: create gym failed", err);
      globalLoading.hide();
      toast({
        title: "Could not create gym",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleFinish = async () => {
    if (!gymId) {
      navigate("/coach", { replace: true });
      return;
    }
    setFinishing(true);
    triggerHaptic(ImpactStyle.Medium);
    const parsedCount = fighterCount.trim() ? Number(fighterCount.trim()) : NaN;
    try {
      await updateGym({
        gymId,
        disciplines: disciplines.length > 0 ? disciplines : null,
        fighterCount: Number.isFinite(parsedCount) && parsedCount >= 0
          ? parsedCount
          : null,
        about: about.trim() ? about.trim() : null,
      });
    } catch (err: any) {
      // Non-blocking — these are optional polish fields.
      logger.warn("CoachOnboarding: update gym failed", { err });
      toast({
        title: "Saved partial details",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setFinishing(false);
      navigate("/coach", { replace: true });
    }
  };

  const handleSkipProfile = () => {
    triggerHaptic(ImpactStyle.Light);
    navigate("/coach", { replace: true });
  };

  const stepTitle = step === "identity" ? "About you & your gym" : "Make it yours";
  const stepHint =
    step === "identity"
      ? "Two quick steps. We'll generate an invite code at the end."
      : "Optional — you can update any of these later in Settings.";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: 8,
        }}
      >
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Coach Setup
        </p>
        <StepDots step={step} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 overflow-y-auto">
        <div className="w-full max-w-[420px] pt-6 pb-12 animate-page-in">
          <div className="text-center mb-6">
            <h1 className="text-[26px] font-bold tracking-tight">{stepTitle}</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5 leading-snug">
              {stepHint}
            </p>
          </div>

          {step === "identity" ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <FieldLabel>Your name</FieldLabel>
              <Input
                placeholder="Coach Alex"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                autoFocus
                className={inputClass}
              />
              <FieldLabel>Gym name</FieldLabel>
              <Input
                placeholder="Iron Wolf MMA"
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                required
                className={inputClass}
              />
              <FieldLabel>Location</FieldLabel>
              <Input
                placeholder="London, UK"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputClass}
              />

              <button
                type="submit"
                disabled={creating || !gymName.trim()}
                className="mt-4 w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Logo */}
              <div className="card-surface rounded-2xl border border-border p-4">
                <FieldLabel className="mb-3">Gym logo</FieldLabel>
                <div className="flex items-center gap-3">
                  {gymId && (
                    <GymLogoUpload
                      gymId={gymId}
                      gymName={gymName.trim() || "Gym"}
                      currentLogoUrl={logoUrl}
                      size={64}
                      // The component calls onUploaded(null) on success — by
                      // design, it expects the parent to read the new URL
                      // from a reactive Convex query (we do that above via
                      // `useQuery(api.gyms.getById)`). No-op here.
                      onUploaded={() => { /* reactive — see gymRow */ }}
                      hideRemove
                    />
                  )}
                  <p className="text-[12px] text-muted-foreground leading-snug flex-1">
                    Shows on the dashboard, athlete invites, and settings.
                  </p>
                </div>
              </div>

              {/* Disciplines */}
              <div>
                <FieldLabel className="mb-2">What styles do you teach?</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {DISCIPLINES.map((d) => {
                    const active = disciplines.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDiscipline(d)}
                        className={`min-h-[40px] px-3.5 rounded-2xl border text-[13px] font-medium transition-all active:scale-[0.97] flex items-center gap-1.5 ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-muted/30 text-foreground border-border/40"
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fighter count */}
              <div>
                <FieldLabel className="mb-2">Roughly how many fighters?</FieldLabel>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 12"
                  value={fighterCount}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, "");
                    setFighterCount(cleaned);
                  }}
                  className={inputClass}
                />
              </div>

              {/* About */}
              <div>
                <FieldLabel className="mb-2">About your gym (optional)</FieldLabel>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="One line on what makes your gym yours."
                  rows={3}
                  maxLength={200}
                  className="w-full resize-none rounded-2xl bg-muted/40 dark:bg-white/[0.06] border border-border/40 p-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={finishing}
                  className="w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {finishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Open dashboard"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSkipProfile}
                  disabled={finishing}
                  className="w-full text-center text-[13px] text-muted-foreground py-2"
                >
                  Skip — I'll do this later
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold ${className}`}
    >
      {children}
    </p>
  );
}

function StepDots({ step }: { step: Step }) {
  const dots: Step[] = useMemo(() => ["identity", "profile"], []);
  return (
    <div className="flex items-center gap-1.5">
      {dots.map((d) => (
        <span
          key={d}
          className={`h-1.5 rounded-full transition-all ${
            d === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}
