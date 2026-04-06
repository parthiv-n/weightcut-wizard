import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "motion/react";
import {
  Dumbbell, Zap, Flame, Target, Sparkles,
  ChevronRight, ChevronLeft, Save, Loader2, Clock, Calendar,
} from "lucide-react";
import type {
  RoutineGenerationParams, RoutineExercise, TrainingGoal,
  CombatSport, Equipment,
} from "@/pages/gym/types";

interface RoutineGeneratorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (params: RoutineGenerationParams) => Promise<any>;
  onSave: (name: string, goal: TrainingGoal, exercises: RoutineExercise[], sport: CombatSport, trainingDays: number, isAiGenerated: boolean) => Promise<void>;
  generating: boolean;
}

const GOALS: { value: TrainingGoal; label: string; icon: typeof Dumbbell; description: string }[] = [
  { value: "hypertrophy", label: "Hypertrophy", icon: Dumbbell, description: "Build muscle size & volume" },
  { value: "strength", label: "Strength", icon: Target, description: "Maximize force output" },
  { value: "explosiveness", label: "Explosiveness", icon: Zap, description: "Power & athleticism" },
  { value: "conditioning", label: "Conditioning", icon: Flame, description: "Endurance & fight cardio" },
];

const SPORTS: { value: CombatSport; label: string }[] = [
  { value: "mma", label: "MMA" },
  { value: "bjj", label: "BJJ" },
  { value: "boxing", label: "Boxing" },
  { value: "muay_thai", label: "Muay Thai" },
  { value: "wrestling", label: "Wrestling" },
  { value: "general", label: "General" },
];

const GOAL_COLORS: Record<TrainingGoal, string> = {
  hypertrophy: "from-white/[0.04] to-transparent",
  strength: "from-white/[0.04] to-transparent",
  explosiveness: "from-white/[0.04] to-transparent",
  conditioning: "from-white/[0.04] to-transparent",
};

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-blue-500/15 text-blue-400",
  back: "bg-purple-500/15 text-purple-400",
  shoulders: "bg-orange-500/15 text-orange-400",
  biceps: "bg-cyan-500/15 text-cyan-400",
  triceps: "bg-pink-500/15 text-pink-400",
  quads: "bg-green-500/15 text-green-400",
  hamstrings: "bg-emerald-500/15 text-emerald-400",
  glutes: "bg-rose-500/15 text-rose-400",
  calves: "bg-teal-500/15 text-teal-400",
  abs: "bg-primary/15 text-primary",
  core: "bg-primary/15 text-primary",
  full_body: "bg-indigo-500/15 text-indigo-400",
  cardio: "bg-red-500/15 text-red-400",
};

type Step = "goal" | "sport" | "schedule" | "generate" | "result";
const STEPS: Step[] = ["goal", "sport", "schedule", "generate", "result"];

export function RoutineGeneratorSheet({ open, onOpenChange, onGenerate, onSave, generating }: RoutineGeneratorSheetProps) {
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [sport, setSport] = useState<CombatSport | null>(null);
  const [trainingDays, setTrainingDays] = useState(4);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [generatedExercises, setGeneratedExercises] = useState<RoutineExercise[]>([]);
  const [routineName, setRoutineName] = useState("");
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const reset = useCallback(() => {
    setStep("goal");
    setGoal(null);
    setSport(null);
    setTrainingDays(4);
    setSessionDuration(60);
    setGeneratedExercises([]);
    setRoutineName("");
    setSaving(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  }, [onOpenChange, reset]);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const canProceed = (): boolean => {
    switch (step) {
      case "goal": return goal !== null;
      case "sport": return sport !== null;
      case "schedule": return true;
      case "generate": return !generating;
      case "result": return routineName.trim().length > 0 && generatedExercises.length > 0;
      default: return false;
    }
  };

  const handleGenerate = async () => {
    if (!goal || !sport) return;
    const params: RoutineGenerationParams = {
      goal,
      sport,
      trainingDays,
      availableEquipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"] as Equipment[],
      sessionDurationMinutes: sessionDuration,
    };
    try {
      const result = await onGenerate(params);
      if (result?.exercises) {
        setGeneratedExercises(result.exercises);
        setRoutineName(result.name || `${goal.charAt(0).toUpperCase() + goal.slice(1)} Routine`);
      }
      setStep("result");
    } catch {
      // Error is handled upstream
    }
  };

  const handleSave = async () => {
    if (!goal || !sport || !routineName.trim()) return;
    setSaving(true);
    try {
      await onSave(routineName.trim(), goal, generatedExercises, sport, trainingDays, true);
      handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const stepTitle = (): string => {
    switch (step) {
      case "goal": return "Training Goal";
      case "sport": return "Combat Sport";
      case "schedule": return "Schedule";
      case "generate": return "Generate";
      case "result": return "Your Routine";
      default: return "";
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl flex flex-col !pb-0">
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            {stepIndex > 0 && step !== "result" ? (
              <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div />
            )}
            <SheetTitle className="text-lg font-bold tracking-tight">{stepTitle()}</SheetTitle>
            <div className="w-12" />
          </div>
          {/* Step indicator */}
          <div className="flex gap-1.5 justify-center pt-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i <= stepIndex ? "bg-primary w-6" : "bg-muted/40 w-4"
                }`}
              />
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-4 pb-4 px-1">
          <AnimatePresence mode="wait">
            {step === "goal" && (
              <motion.div
                key="goal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  {GOALS.map(g => {
                    const Icon = g.icon;
                    const selected = goal === g.value;
                    return (
                      <button
                        key={g.value}
                        onClick={() => { setGoal(g.value); }}
                        className={`glass-card rounded-2xl border p-4 text-left transition-all active:scale-[0.97] ${
                          selected
                            ? "border-primary/50 ring-1 ring-primary/30"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${GOAL_COLORS[g.value]} pointer-events-none`} />
                        <div className="relative">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
                            selected ? "bg-primary/20" : "bg-muted/40"
                          }`}>
                            <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="text-sm font-semibold">{g.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{g.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Button onClick={goNext} disabled={!goal} className="w-full h-12 rounded-2xl text-[15px] font-semibold">
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}

            {step === "sport" && (
              <motion.div
                key="sport"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap gap-2">
                  {SPORTS.map(s => {
                    const selected = sport === s.value;
                    return (
                      <button
                        key={s.value}
                        onClick={() => setSport(s.value)}
                        className={`px-5 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] ${
                          selected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "glass-card border border-border/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <Button onClick={goNext} disabled={!sport} className="w-full h-12 rounded-2xl text-[15px] font-semibold">
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}

            {step === "schedule" && (
              <motion.div
                key="schedule"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary/70" />
                      <span className="text-sm font-medium">Training Days</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-primary">{trainingDays} days/week</span>
                  </div>
                  <Slider
                    value={[trainingDays]}
                    onValueChange={([v]) => setTrainingDays(v)}
                    min={2}
                    max={6}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1.5 px-0.5">
                    <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary/70" />
                      <span className="text-sm font-medium">Session Duration</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-primary">{sessionDuration} min</span>
                  </div>
                  <Slider
                    value={[sessionDuration]}
                    onValueChange={([v]) => setSessionDuration(v)}
                    min={30}
                    max={90}
                    step={15}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1.5 px-0.5">
                    <span>30m</span><span>45m</span><span>60m</span><span>75m</span><span>90m</span>
                  </div>
                </div>
                <Button onClick={goNext} className="w-full h-12 rounded-2xl text-[15px] font-semibold">
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}

            {step === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center py-8"
              >
                {/* Summary */}
                <div className="glass-card rounded-2xl border border-border/50 p-5 w-full mb-8">
                  <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest mb-3">Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Goal</span>
                      <span className="font-medium capitalize">{goal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sport</span>
                      <span className="font-medium capitalize">{sport?.replace("_", " ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Schedule</span>
                      <span className="font-medium">{trainingDays} days/week</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{sessionDuration} min</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full h-14 rounded-2xl text-[15px] font-semibold bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20"
                  size="lg"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2" />
                      Generate Routine
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {step === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Input
                  placeholder="Routine name..."
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  className="h-12 text-base font-semibold bg-muted/30 border-border/30 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/30"
                />

                <div className="space-y-2">
                  {generatedExercises.map((ex, i) => (
                    <div key={i} className="glass-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary/70">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{ex.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground tabular-nums">{ex.sets}&times;{ex.reps}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${MUSCLE_COLORS[ex.muscle_group] || "bg-muted/50 text-muted-foreground"}`}>
                            {ex.muscle_group.replace("_", " ")}
                          </span>
                          {ex.rest_seconds > 0 && (
                            <span className="text-[10px] text-muted-foreground/60">{ex.rest_seconds}s rest</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {generatedExercises.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No exercises generated. Try again.
                  </div>
                )}

                <Button
                  onClick={handleSave}
                  disabled={saving || !routineName.trim() || generatedExercises.length === 0}
                  className="w-full h-12 rounded-2xl text-[15px] font-semibold mt-4"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save to Library
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
