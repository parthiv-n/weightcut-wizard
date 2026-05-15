import { useEffect, useMemo, useState } from "react";
import { Utensils, Weight, Dumbbell, Loader2, ChevronLeft, Activity, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { triggerHaptic, celebrateSuccess, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogFood: () => void;
  onLogWeight: () => void;
  onLogTraining: () => void;
  onLogGym: () => void;
}

type Mode = "menu" | "weight" | "training";

const SESSION_TYPES = ["BJJ", "Muay Thai", "Boxing", "Wrestling", "Sparring", "Strength", "Run"] as const;
const DURATION_PRESETS = [30, 60, 90] as const;

// Maps a "feel" label → intensityLevel (1-5) and a sensible RPE (1-10).
// Used for the quick-log intensity strip; for the full editor users can
// fine-tune both numbers independently.
const INTENSITY_PRESETS = [
  { label: "Easy", level: 1, intensity: "low", rpe: 3 },
  { label: "Steady", level: 2, intensity: "low", rpe: 5 },
  { label: "Hard", level: 3, intensity: "moderate", rpe: 7 },
  { label: "Battle", level: 4, intensity: "high", rpe: 8 },
  { label: "Max", level: 5, intensity: "high", rpe: 10 },
] as const;

const RECENT_SESSION_KEY = "wcw_quicklog_recent_session";

export function QuickLogDialog({ open, onOpenChange, onLogFood, onLogWeight, onLogTraining, onLogGym }: QuickLogDialogProps) {
  const { userId, refreshProfile } = useUser();
  const { toast } = useToast();
  const logWeightMut = useMutation(api.weight_logs.logWeight);
  const updateCurrentWeightMut = useMutation(api.profiles.updateCurrentWeight);
  const createTrainingMut = useMutation(api.fight_camp.createCalendarEntry);

  const [mode, setMode] = useState<Mode>("menu");
  // Weight panel state
  const [quickWeight, setQuickWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [unit, setUnit] = useState<"kg" | "lb">(
    () => (localStorage.getItem("wcw_weight_unit") as "kg" | "lb") || "kg"
  );

  // Training panel state — defaults follow the brief: 60min + Steady intensity
  // give a sensible Fight-Form signal with zero extra taps required.
  const [selectedSessionType, setSelectedSessionType] = useState<string>(() => {
    try { return localStorage.getItem(RECENT_SESSION_KEY) || SESSION_TYPES[0]; } catch { return SESSION_TYPES[0]; }
  });
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [selectedIntensityIdx, setSelectedIntensityIdx] = useState<number>(1); // Steady
  const [savingTraining, setSavingTraining] = useState(false);

  // Reset to menu whenever the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setMode("menu");
      setQuickWeight("");
    }
  }, [open]);

  // Promote the user's most-recently-logged session type to the top of the
  // chip grid so it's the natural one-tap default after first use.
  const orderedSessionTypes = useMemo(() => {
    let recent = SESSION_TYPES[0] as string;
    try { recent = localStorage.getItem(RECENT_SESSION_KEY) || SESSION_TYPES[0]; } catch { /* swallow */ }
    if (!SESSION_TYPES.includes(recent as any)) return [...SESSION_TYPES];
    return [recent, ...SESSION_TYPES.filter((t) => t !== recent)];
  }, [open]); // re-read on each open

  const handleQuickWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const raw = parseFloat(quickWeight);
    if (isNaN(raw) || raw <= 0) {
      toast({ title: "Enter a valid weight", variant: "destructive" });
      return;
    }
    const weight_kg = unit === "lb" ? raw / 2.20462 : raw;
    const today = new Date().toISOString().split("T")[0];
    setSavingWeight(true);
    try {
      await logWeightMut({ date: today, weightKg: weight_kg });
      await updateCurrentWeightMut({ weightKg: weight_kg });
      celebrateSuccess();
      refreshProfile?.();
      toast({ title: "Weight logged", description: `${raw.toFixed(1)} ${unit}` });
      setQuickWeight("");
      onOpenChange(false);
    } catch (err) {
      logger.error("QuickLog weight save failed", err);
      toast({ title: "Failed to log weight", variant: "destructive" });
    } finally {
      setSavingWeight(false);
    }
  };

  const handleQuickTraining = async () => {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    const intensityPreset = INTENSITY_PRESETS[selectedIntensityIdx];
    setSavingTraining(true);
    try {
      await createTrainingMut({
        date: today,
        sessionType: selectedSessionType,
        intensity: intensityPreset.intensity,
        intensityLevel: intensityPreset.level,
        durationMinutes: selectedDuration,
        rpe: intensityPreset.rpe,
      });
      try { localStorage.setItem(RECENT_SESSION_KEY, selectedSessionType); } catch { /* swallow */ }
      celebrateSuccess();
      toast({
        title: "Session logged",
        description: `${selectedSessionType} · ${selectedDuration}min · ${intensityPreset.label}`,
      });
      onOpenChange(false);
    } catch (err) {
      logger.error("QuickLog training save failed", err);
      toast({ title: "Failed to log session", variant: "destructive" });
    } finally {
      setSavingTraining(false);
    }
  };

  const sheetTitle = mode === "weight" ? "Log weight" : mode === "training" ? "Log session" : "Quick Log";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] [&>button]:hidden">
        <div className="flex justify-center pt-1 pb-3">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        <SheetHeader className="px-1 pb-3 flex-row items-center gap-2 space-y-0">
          {mode !== "menu" && (
            <button
              type="button"
              onClick={() => { setMode("menu"); triggerHapticSelection(); }}
              aria-label="Back"
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/80 active:text-foreground active:bg-muted/40 transition-colors -ml-1"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
            </button>
          )}
          <SheetTitle className="text-[16px] font-semibold tracking-tight">{sheetTitle}</SheetTitle>
        </SheetHeader>

        {/* ── Menu ───────────────────────────────────────────────── */}
        {mode === "menu" && (
          <div className="grid grid-cols-4 gap-3 px-1">
            <button
              onClick={() => { triggerHaptic(ImpactStyle.Light); onLogFood(); }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
            >
              <Utensils className="h-8 w-8 text-health" />
              <span className="text-sm font-medium">Food</span>
            </button>
            <button
              onClick={() => { triggerHaptic(ImpactStyle.Light); setMode("weight"); }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
            >
              <Weight className="h-8 w-8 text-hydration" />
              <span className="text-sm font-medium">Weight</span>
            </button>
            <button
              onClick={() => { triggerHaptic(ImpactStyle.Light); setMode("training"); }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
            >
              <Activity className="h-8 w-8 text-energy" />
              <span className="text-sm font-medium">Training</span>
            </button>
            <button
              onClick={() => { triggerHaptic(ImpactStyle.Light); onLogGym(); }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
            >
              <Dumbbell className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">Gym</span>
            </button>
          </div>
        )}

        {/* ── Weight panel ───────────────────────────────────────── */}
        {mode === "weight" && (
          <form onSubmit={handleQuickWeight} className="px-1 pb-2 space-y-3">
            <p className="text-[12px] text-muted-foreground/80 px-1">
              Saves to today and updates your current weight.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="Today's weight"
                value={quickWeight}
                onChange={(e) => setQuickWeight(e.target.value)}
                autoFocus
                className="flex-1 h-12 rounded-2xl text-[16px] font-semibold tabular-nums text-center bg-muted/40 dark:bg-white/[0.06] border-border/30"
              />
              <div className="flex gap-0.5 bg-muted/40 dark:bg-white/[0.06] border border-border/30 rounded-full p-0.5 h-12 items-center">
                <button
                  type="button"
                  onClick={() => { setUnit("kg"); triggerHaptic(ImpactStyle.Light); }}
                  className={`px-3 h-10 rounded-full text-[13px] font-semibold transition-colors ${unit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >kg</button>
                <button
                  type="button"
                  onClick={() => { setUnit("lb"); triggerHaptic(ImpactStyle.Light); }}
                  className={`px-3 h-10 rounded-full text-[13px] font-semibold transition-colors ${unit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >lb</button>
              </div>
            </div>
            <button
              type="submit"
              disabled={savingWeight || !quickWeight}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {savingWeight && <Loader2 className="h-4 w-4 animate-spin" />}
              {savingWeight ? "Saving…" : "Log weight"}
            </button>
            <button
              type="button"
              onClick={() => { onOpenChange(false); onLogWeight(); }}
              className="w-full text-center text-[12px] text-muted-foreground/70 py-1 active:text-foreground transition-colors"
            >
              Need more detail? Open weight tracker
            </button>
          </form>
        )}

        {/* ── Training panel ─────────────────────────────────────── */}
        {mode === "training" && (
          <div className="px-1 pb-2 space-y-3">
            <p className="text-[12px] text-muted-foreground/80 px-1">
              Pick what you did — duration and intensity have smart defaults you can tweak.
            </p>

            {/* Session-type chip grid */}
            <div className="grid grid-cols-2 gap-2">
              {orderedSessionTypes.map((t) => {
                const active = selectedSessionType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setSelectedSessionType(t); triggerHapticSelection(); }}
                    aria-pressed={active}
                    className={`h-12 rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/40 dark:bg-white/[0.06] border border-border/30 text-foreground/85"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Duration row */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-1.5 px-1">
                Duration
              </p>
              <div className="flex gap-2">
                {DURATION_PRESETS.map((d) => {
                  const active = selectedDuration === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setSelectedDuration(d); triggerHapticSelection(); }}
                      aria-pressed={active}
                      className={`flex-1 h-11 rounded-2xl text-[14px] font-semibold tabular-nums active:scale-[0.97] transition-all ${
                        active
                          ? "bg-foreground text-background"
                          : "bg-muted/40 dark:bg-white/[0.06] border border-border/30 text-foreground/80"
                      }`}
                    >
                      {d}<span className="text-[11px] font-medium opacity-70 ml-0.5">min</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Intensity strip */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-1.5 px-1">
                How'd it feel?
              </p>
              <div className="flex gap-1">
                {INTENSITY_PRESETS.map((p, i) => {
                  const active = selectedIntensityIdx === i;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setSelectedIntensityIdx(i); triggerHapticSelection(); }}
                      aria-pressed={active}
                      className={`flex-1 h-10 rounded-xl text-[11.5px] font-semibold active:scale-[0.97] transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/40 dark:bg-white/[0.06] border border-border/30 text-muted-foreground/85"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleQuickTraining}
              disabled={savingTraining}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
            >
              {savingTraining ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" strokeWidth={2.6} fill="currentColor" />
                  Log {selectedSessionType.toLowerCase()}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => { onOpenChange(false); onLogTraining(); }}
              className="w-full text-center text-[12px] text-muted-foreground/70 py-1 active:text-foreground transition-colors"
            >
              Need more detail? Open training calendar
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
