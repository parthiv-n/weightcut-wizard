import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIPersistence } from "@/lib/aiPersistence";
import {
  Droplets,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  BookOpen,
  Beaker,
  Activity,
  Zap,
  Coffee,
  Shield,
  User,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";
import { useSafeAsync } from "@/hooks/useSafeAsync";

// ── Types ──────────────────────────────────────────────────────────────────

interface HourlyStep {
  hour: number;
  timeLabel?: string;
  phase?: string;
  fluidML: number;
  sodiumMg?: number;
  sodium?: number; // backward compat
  potassiumMg?: number;
  potassium?: number; // backward compat
  magnesiumMg?: number;
  carbsG?: number;
  carbs?: number; // backward compat
  drinkRecipe?: string;
  notes: string;
  foods?: string[];
}

interface MealPlan {
  timing: string;
  carbsG: number;
  foods?: string[];
  mealIdeas?: string[]; // backward compat
  rationale: string;
}

interface CarbRefuelPlan {
  targetCarbs?: string;
  targetCarbsG?: number;
  maxCarbsPerHour?: number;
  strategy?: string;
  meals: MealPlan[];
  totalCarbs?: string;
}

interface ProtocolTotals {
  totalFluidLitres: number;
  totalSodiumMg: number;
  totalPotassiumMg: number;
  totalMagnesiumMg: number;
  totalCarbsG: number;
  carbTargetPerKg: string;
  maxCarbsPerHour: number;
  rehydrationWindowHours: number;
  bodyWeightKg: number;
  caffeineLowMg?: number;
  caffeineHighMg?: number;
}

interface EducationItem {
  title: string;
  content: string;
}

interface ProtocolEducation {
  howItWorks?: EducationItem[];
  caffeineGuidance?: string;
  carbMouthRinse?: string;
}

interface RehydrationProtocol {
  summary: string;
  totals?: ProtocolTotals;
  hourlyProtocol: HourlyStep[];
  electrolyteRatio?: {
    sodium: string;
    potassium: string;
    magnesium: string;
  };
  carbRefuelPlan: CarbRefuelPlan;
  warnings: string[];
  education?: ProtocolEducation;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_WARNINGS = [
  "Do not exceed 1L of fluid per hour — exceeding gastric emptying rate causes bloating and impairs absorption",
  "Avoid high-fibre and high-fat foods until after competition — they slow gastric emptying and nutrient absorption",
  "Monitor urine colour — aim for pale yellow. Clear urine may indicate over-hydration risk (hyponatremia)",
  "If you feel nauseous, dizzy, or confused, stop the protocol and seek medical attention immediately",
  "This protocol assumes weight was lost via dehydration. If weight was lost via other means, fluid targets may be excessive",
];

const SUGGESTED_FOODS = [
  { name: "White rice (200g cooked)", carbsG: 56, notes: "Low fibre, fast digesting" },
  { name: "Banana", carbsG: 27, notes: "Potassium-rich, gentle on gut" },
  { name: "Honey (1 tbsp)", carbsG: 17, notes: "Rapid glucose source" },
  { name: "White bread (2 slices)", carbsG: 26, notes: "Low residue" },
  { name: "Rice cakes (2)", carbsG: 14, notes: "Light, easy to eat" },
  { name: "Sports drink (500ml)", carbsG: 30, notes: "Dual hydration + carbs" },
  { name: "Sweetened milk (500ml)", carbsG: 24, notes: "Protein + carbs" },
];

const SUGGESTED_DRINKS = [
  { name: "ORS (Oral Rehydration Solution)", usage: "Hours 1-2, priority rehydration" },
  { name: "Sports drink (Gatorade/Powerade)", usage: "Hours 2+, moderate Na + carbs" },
  { name: "Diluted fruit juice + salt", usage: "Alternative carb + electrolyte source" },
  { name: "Sweetened milk", usage: "Hour 3+, protein + carb + fluid" },
];

const DEFAULT_EDUCATION: EducationItem[] = [
  {
    title: "Gastric Emptying",
    content:
      "Your stomach can process ~800-1000ml of fluid per hour. Drinking beyond this rate causes bloating and impairs absorption. This protocol spaces intake to maximise absorption efficiency.",
  },
  {
    title: "Sodium-Glucose Co-Transport (SGLT1)",
    content:
      "Sodium is the primary driver of water absorption in the gut. Adding sodium to your fluids activates the sodium-glucose co-transporter (SGLT1), pulling water into cells 2-3x faster than plain water alone.",
  },
  {
    title: "Glycogen-Water Binding",
    content:
      "Each gram of glycogen stored in muscles binds ~2.7g of water (Bergstrom & Hultman 1972). Carb-loading after weigh-in restores energy AND accelerates rehydration — a dual benefit for fight performance.",
  },
  {
    title: "150% Fluid Replacement Rule",
    content:
      "You must drink 150% of weight lost to account for continued urine losses during rehydration (Shirreffs & Maughan 1998; Reale SSE #183).",
  },
  {
    title: "Phased Recovery",
    content:
      "Hours 1-2 focus on rapid cellular rehydration with higher sodium. Hours 3+ shift to glycogen restoration with carbs. The final phase before competition maintains equilibrium without overloading the gut.",
  },
];

// ── Helper functions ───────────────────────────────────────────────────────

function getSodium(step: HourlyStep): number {
  return step.sodiumMg ?? step.sodium ?? 0;
}
function getPotassium(step: HourlyStep): number {
  return step.potassiumMg ?? step.potassium ?? 0;
}
function getCarbs(step: HourlyStep): number {
  return step.carbsG ?? step.carbs ?? 0;
}
function getMealFoods(meal: MealPlan): string[] {
  return meal.foods ?? meal.mealIdeas ?? [];
}

// ── Phase badge colors ─────────────────────────────────────────────────────

function getPhaseBadge(phase?: string) {
  if (!phase) return null;
  const lower = phase.toLowerCase();
  if (lower.includes("rapid"))
    return { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" };
  if (lower.includes("active"))
    return { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" };
  if (lower.includes("glycogen") || lower.includes("loading"))
    return { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" };
  if (lower.includes("pre-comp"))
    return { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" };
  return { bg: "bg-muted border-border/50", text: "text-muted-foreground" };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Hydration() {
  const [weightLost, setWeightLost] = useState("");
  const [weighInTiming, setWeighInTiming] = useState<string>("same-day");
  const [startTime, setStartTime] = useState<string>("16:00");
  const [glycogenDepletion, setGlycogenDepletion] = useState<string>("moderate");
  const [normalCarbs, setNormalCarbs] = useState<string>("");
  const [fightWeekCarbs, setFightWeekCarbs] = useState<string>("");
  const [protocol, setProtocol] = useState<RehydrationProtocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"fluid" | "carbs">("fluid");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [scienceOpen, setScienceOpen] = useState(false);
  const [caffeineOpen, setCaffeineOpen] = useState(false);
  const [mouthRinseOpen, setMouthRinseOpen] = useState(false);
  const [electrolyteGuideOpen, setElectrolyteGuideOpen] = useState(false);
  const { toast } = useToast();
  const { userId, profile: contextProfile, userName } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();

  const currentWeight = contextProfile?.current_weight_kg ?? 0;

  // Auto-derive glycogen depletion from carb inputs
  useEffect(() => {
    const normal = parseFloat(normalCarbs);
    const fightWeek = parseFloat(fightWeekCarbs);
    if (!normal || !fightWeek || normal <= 0) return;
    if (fightWeek < 50) {
      setGlycogenDepletion("significant");
    } else {
      const reduction = ((normal - fightWeek) / normal) * 100;
      setGlycogenDepletion(reduction >= 50 ? "moderate" : "none");
    }
  }, [normalCarbs, fightWeekCarbs]);

  useEffect(() => {
    loadPersistedProtocol();
  }, [userId]);

  const loadPersistedProtocol = () => {
    if (!userId || protocol) return;
    try {
      const persistedData = AIPersistence.load(userId, "rehydration_protocol");
      if (persistedData) {
        setProtocol(persistedData.protocol);
        if (persistedData.inputs) {
          setWeightLost(persistedData.inputs.weightLost || "");
          setWeighInTiming(persistedData.inputs.weighInTiming || "same-day");
          setStartTime(persistedData.inputs.startTime || "16:00");
          setGlycogenDepletion(persistedData.inputs.glycogenDepletion || "moderate");
          setNormalCarbs(persistedData.inputs.normalCarbs || "");
          setFightWeekCarbs(persistedData.inputs.fightWeekCarbs || "");
        }
      }
    } catch (error) {
      console.error("Error loading persisted protocol:", error);
    }
  };

  const handleGenerateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeight) return;

    safeAsync(setLoading)(true);

    try {
      const { data, error } = await supabase.functions.invoke("rehydration-protocol", {
        body: {
          weightLostKg: parseFloat(weightLost),
          weighInTiming,
          currentWeightKg: currentWeight,
          glycogenDepletion,
          sex: contextProfile?.sex,
          age: contextProfile?.age,
          heightCm: contextProfile?.height_cm,
          activityLevel: contextProfile?.activity_level,
          trainingFrequency: contextProfile?.training_frequency,
          tdee: contextProfile?.tdee,
          goalWeightKg: contextProfile?.goal_weight_kg,
          fightWeekTargetKg: contextProfile?.fight_week_target_kg,
        },
      });

      if (!isMounted()) return;
      if (error) throw error;

      if (data?.protocol) {
        setProtocol(data.protocol);

        if (userId) {
          AIPersistence.save(
            userId,
            "rehydration_protocol",
            {
              protocol: data.protocol,
              inputs: { weightLost, weighInTiming, startTime, glycogenDepletion, normalCarbs, fightWeekCarbs },
            },
            168
          );
        }

        toast({
          title: "Protocol Generated",
          description: "Your personalised rehydration plan is ready",
        });
      }
    } catch (error) {
      if (!isMounted()) return;
      console.error("Error generating protocol:", error);
      toast({
        title: "Error",
        description: "Failed to generate rehydration protocol",
        variant: "destructive",
      });
    }

    safeAsync(setLoading)(false);
  };

  const toggleStep = (idx: number) => setExpandedStep((prev) => (prev === idx ? null : idx));
  const toggleMeal = (idx: number) => setExpandedMeal((prev) => (prev === idx ? null : idx));

  // Ring color based on % body weight lost
  const getWeightLossColor = () => {
    if (!currentWeight || !weightLost) return "text-blue-500 border-blue-500/20";
    const pct = (parseFloat(weightLost) / currentWeight) * 100;
    if (pct <= 5)
      return "text-emerald-500 border-emerald-500/20 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]";
    if (pct <= 8)
      return "text-amber-500 border-amber-500/20 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]";
    return "text-red-500 border-red-500/20 drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]";
  };
  const ringColorClasses = getWeightLossColor();

  const formatTime = (startStr: string, hourIndex: number) => {
    if (!startStr) return `H${hourIndex}`;
    const [h, m] = startStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return `H${hourIndex}`;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setHours(d.getHours() + (hourIndex - 1));
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  // Cumulative fluid for progress
  const getCumulativeFluid = (upToIndex: number) => {
    if (!protocol) return 0;
    return protocol.hourlyProtocol.slice(0, upToIndex + 1).reduce((s, step) => s + step.fluidML, 0);
  };

  // Cumulative carbs from meals
  const getCumulativeCarbs = () => {
    if (!protocol) return 0;
    return protocol.carbRefuelPlan.meals.reduce((s, m) => s + m.carbsG, 0);
  };

  const totals = protocol?.totals;
  const education = protocol?.education;
  const educationItems = education?.howItWorks ?? DEFAULT_EDUCATION;

  // Merged warnings: LLM + defaults (deduplicated)
  const allWarnings = [
    ...(protocol?.warnings ?? []),
    ...DEFAULT_WARNINGS.filter(
      (dw) => !(protocol?.warnings ?? []).some((w) => w.toLowerCase().includes(dw.slice(0, 30).toLowerCase()))
    ),
  ];


  // Profile summary
  const profileParts = [
    userName || "Athlete",
    currentWeight ? `${currentWeight}kg` : null,
    contextProfile?.sex ? (contextProfile.sex === "male" ? "Male" : "Female") : null,
    contextProfile?.age ? `${contextProfile.age}y` : null,
  ].filter(Boolean);

  const REHYDRATION_STEPS = [
    { icon: Activity, label: "Analysing weight loss", color: "text-red-400" },
    { icon: Droplets, label: "Calculating fluid requirements", color: "text-blue-500" },
    { icon: Zap, label: "Optimising electrolyte ratios", color: "text-yellow-400" },
    { icon: Beaker, label: "Formulating recovery plan", color: "text-green-400" },
  ];

  return (
    <>
      <AIGeneratingOverlay
        isOpen={loading}
        isGenerating={loading}
        steps={REHYDRATION_STEPS}
        title="Generating Protocol"
        subtitle="Designing your optimal recovery strategy"
        onCompletion={() => {}}
      />
      <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">Post-Weigh-In Rehydration</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Science-based recovery protocol</p>
        </div>

        {/* ── Disclaimer Banner ─────────────────────────────────────────── */}
        <div className="rounded-2xl bg-muted/50 border border-border/50 p-3 mb-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground/80">Not medical advice.</span> This
                protocol is an educational guideline based on sports science research. Always consult
                a qualified sports dietitian or physician before implementing any rehydration
                protocol, especially after significant weight cuts. Individual responses vary. Stop
                and seek medical attention if you experience dizziness, confusion, nausea, or chest
                pain.
              </p>
            </div>
          </div>
        </div>

        {/* ── Safety Banner ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-300 leading-snug">
            For athletes who have safely completed their weight cut. Never rehydrate without
            guidance.
          </p>
        </div>

        {/* ── Input Form ────────────────────────────────────────────────── */}
        <div className="rounded-3xl border border-white/[0.06] p-6 mb-6 shadow-2xl relative overflow-hidden bg-white/[0.02] backdrop-blur-xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-blue-500/20 opacity-40 blur-[80px] rounded-full pointer-events-none"></div>

          <form onSubmit={handleGenerateProtocol} className="space-y-6 relative z-10">
            {/* Profile Summary Strip */}
            <div className="flex items-center justify-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                {profileParts.join(" · ")}
              </p>
            </div>

            {!currentWeight && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-400">
                  Set your current weight in your profile to generate a protocol.
                </p>
              </div>
            )}

            {/* Weight Lost Ring */}
            <div className="flex flex-col items-center justify-center space-y-3">
              <p className="text-[11px] text-blue-400 font-bold uppercase tracking-[0.2em]">
                Weight Lost (kg)
              </p>
              <div
                className={`relative w-36 h-36 rounded-full border-[6px] transition-colors duration-500 flex flex-col items-center justify-center bg-background ring-1 ring-border/30 ${ringColorClasses.split(" ")[1]} ${ringColorClasses.split(" ")[2] || ""}`}
              >
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    className={`transition-colors duration-500 ${ringColorClasses.split(" ")[0]}`}
                    strokeWidth="6"
                    strokeDasharray="289"
                    strokeDashoffset="40"
                    strokeLinecap="round"
                  />
                </svg>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={weightLost}
                  onChange={(e) => setWeightLost(e.target.value)}
                  required
                  className="w-24 text-center text-4xl font-black bg-transparent border-none text-foreground focus-visible:ring-0 placeholder:text-muted-foreground/30 p-0 h-auto z-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Weigh-in Type Toggle */}
              <div className="flex flex-col justify-center space-y-2 rounded-2xl p-4 col-span-1 bg-white/[0.04] border border-white/[0.08] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_20px_rgba(0,0,0,0.2)]">
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest text-center">
                  Weigh-In
                </p>
                <div className="w-full h-full flex flex-col gap-1.5 justify-center">
                  <button
                    type="button"
                    onClick={() => setWeighInTiming("same-day")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${weighInTiming === "same-day" ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
                  >
                    Same Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeighInTiming("day-before")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${weighInTiming === "day-before" ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
                  >
                    Day Before
                  </button>
                </div>
              </div>

              {/* Start Time */}
              <div className="flex flex-col items-center justify-center space-y-2 rounded-2xl p-4 col-span-1 bg-white/[0.04] border border-white/[0.08] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_20px_rgba(0,0,0,0.2)]">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest text-center">
                  Time
                </p>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="text-center text-2xl font-black bg-transparent border-none text-foreground focus-visible:ring-0 p-0 h-auto [&::-webkit-calendar-picker-indicator]:opacity-50 mt-2"
                  title="Weigh-in time"
                />
              </div>
            </div>

            {/* Glycogen Depletion Calculator */}
            <div className="rounded-2xl p-3 bg-white/[0.04] border border-white/[0.08] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_20px_rgba(0,0,0,0.2)]">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest text-center mb-2">
                Glycogen Depletion
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-1 text-center">
                    Normal (g/day)
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="300"
                    value={normalCarbs}
                    onChange={(e) => setNormalCarbs(e.target.value)}
                    className="text-center text-base font-bold bg-white/5 border-white/10 rounded-xl h-9"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-1 text-center">
                    Fight Week (g/day)
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="50"
                    value={fightWeekCarbs}
                    onChange={(e) => setFightWeekCarbs(e.target.value)}
                    className="text-center text-base font-bold bg-white/5 border-white/10 rounded-xl h-9"
                  />
                </div>
              </div>
              {/* Result strip */}
              {(() => {
                const normal = parseFloat(normalCarbs);
                const fightWeek = parseFloat(fightWeekCarbs);
                const hasInputs = normal > 0 && fightWeek >= 0;
                const reduction = hasInputs ? Math.round(((normal - fightWeek) / normal) * 100) : 0;
                const level = glycogenDepletion;
                const config = {
                  significant: { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Significant", target: "8-12 g/kg" },
                  moderate: { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Moderate", target: "6-8 g/kg" },
                  none: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "None", target: "4-5 g/kg" },
                }[level] ?? { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Moderate", target: "6-8 g/kg" };

                return (
                  <div className={`mt-3 rounded-xl border p-2.5 ${config.color} transition-all`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{config.label}</span>
                      <span className="text-[10px] font-semibold opacity-80">Replenish: {config.target}</span>
                    </div>
                    {hasInputs && (
                      <p className="text-[10px] opacity-70 mt-0.5">
                        {fightWeek < 50 ? `< 50g/day during fight week` : `${reduction}% reduction`}
                        {" — "}reduced from {normal}g to {fightWeek}g/day
                      </p>
                    )}
                    {!hasInputs && (
                      <p className="text-[10px] opacity-70 mt-0.5">
                        Enter your carb intake to auto-detect depletion level
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            <Button
              type="submit"
              className="w-full h-12 mt-2 font-bold text-base rounded-2xl transition-all active:scale-[0.98]"
              disabled={loading || !currentWeight}
            >
              {loading ? "Generating Protocol..." : "Generate Protocol"}
            </Button>
          </form>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PROTOCOL RESULTS
        ══════════════════════════════════════════════════════════════════ */}
        {protocol && (
          <div className="space-y-4">
            {/* ── Summary ───────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground/90 leading-snug">{protocol.summary}</p>
                <button
                  onClick={() => handleGenerateProtocol(new Event("submit") as any)}
                  disabled={loading}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Regenerate"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* ── Totals Dashboard ──────────────────────────────────────── */}
            {totals && (
              <div className="rounded-2xl bg-card border border-border/50 p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 text-center font-bold">
                  Rehydration Totals
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-blue-400">
                      {totals.totalFluidLitres}L
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Total Fluid
                    </p>
                  </div>
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-amber-400">
                      {(totals.totalSodiumMg / 1000).toFixed(1)}g
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Sodium
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-400">
                      {totals.totalCarbsG}g
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Carbs
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">
                      {totals.rehydrationWindowHours}h
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Window
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">
                      {totals.totalPotassiumMg}mg
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Potassium
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">
                      {totals.totalMagnesiumMg}mg
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Magnesium
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Warnings Section ──────────────────────────────────────── */}
            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-amber-500/10 transition-colors"
                onClick={() => setWarningsOpen((o) => !o)}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-sm font-medium text-amber-400">
                  Safety Warnings ({allWarnings.length})
                </span>
                <span className="ml-auto text-amber-400">
                  {warningsOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {warningsOpen && (
                <div className="px-4 pb-4 space-y-2 border-t border-amber-500/20">
                  {allWarnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2 pt-2">
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-300 leading-relaxed">
                        {warning}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── How This Protocol Works ───────────────────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setScienceOpen((o) => !o)}
              >
                <BookOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">How This Protocol Works</span>
                <span className="ml-auto text-muted-foreground">
                  {scienceOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {scienceOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3 space-y-3">
                    {educationItems.map((item, idx) => (
                      <div key={idx}>
                        <p className="text-xs font-semibold text-foreground/80 mb-1">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Why Electrolytes Matter ───────────────────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setElectrolyteGuideOpen((o) => !o)}
              >
                <Beaker className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">Why Electrolytes Matter</span>
                <span className="ml-auto text-muted-foreground">
                  {electrolyteGuideOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {electrolyteGuideOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">
                        Na
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground/80">Sodium</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The #1 electrolyte for rehydration. Sodium creates the osmotic gradient
                          that pulls water into your cells and bloodstream. After a weight cut, your
                          sodium stores are severely depleted. Without adequate sodium, you'll urinate
                          out most of the water you drink. Target: 50-90 mmol/L in rehydration fluid
                          (ISSN 2025).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">
                        K
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground/80">Potassium</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Essential for intracellular hydration and muscle function. Potassium works
                          with sodium to maintain fluid balance across cell membranes. Low potassium
                          leads to muscle cramps, weakness, and impaired reflexes — critical for fight
                          performance.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">
                        Mg
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground/80">Magnesium</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Supports neuromuscular function, energy production, and reduces cramping
                          risk. Magnesium is lost through sweat during the cut and is critical for
                          maintaining reaction time and power output during competition.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Caffeine Strategy ────────────────────────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setCaffeineOpen((o) => !o)}
              >
                <Coffee className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-sm font-medium">Caffeine Strategy</span>
                <span className="ml-auto text-muted-foreground">
                  {caffeineOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {caffeineOpen && (
                <div className="px-4 pb-4 border-t border-border/30">
                  <div className="pt-3 space-y-2">
                    {totals && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5">
                          Your dose: {totals.caffeineLowMg}-{totals.caffeineHighMg}mg
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {education?.caffeineGuidance ??
                        `Consume 3-6 mg/kg of caffeine approximately 60 minutes before competition. Mild-to-moderate doses improve reaction time, reduce perceived effort, and enhance fine motor control. Higher doses may cause overstimulation, anxiety, and potential decrements in performance (Reale SSE #183). Become familiar with your individual response to caffeine before competition day.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Carb Mouth Rinse ─────────────────────────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setMouthRinseOpen((o) => !o)}
              >
                <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">GI Distress? Carb Mouth Rinse</span>
                <span className="ml-auto text-muted-foreground">
                  {mouthRinseOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {mouthRinseOpen && (
                <div className="px-4 pb-4 border-t border-border/30">
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {education?.carbMouthRinse ??
                        `If GI distress prevents you from eating or drinking close to competition, rinsing your mouth for ~10 seconds with a sports drink or carbohydrate solution may enhance performance. This activates regions in the central nervous system that increase drive and reduce perceived effort — a low-risk strategy when swallowing fluids feels impossible (Burke & Maughan 2015).`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Segmented Tab Control (Fluid / Carbs) ────────────────── */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              {/* Pill switcher */}
              <div className="p-2">
                <div className="flex bg-muted rounded-full p-0.5">
                  <button
                    onClick={() => setActiveTab("fluid")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                      activeTab === "fluid"
                        ? "bg-blue-500 text-white shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Droplets className="h-3 w-3" />
                    Fluid
                  </button>
                  <button
                    onClick={() => setActiveTab("carbs")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                      activeTab === "carbs"
                        ? "bg-blue-500 text-white shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    Carbs
                  </button>
                </div>
              </div>

              {/* ── Fluid Tab ──────────────────────────────────────────── */}
              {activeTab === "fluid" && (
                <div>
                  {/* Fluid progress bar */}
                  {totals && (
                    <div className="px-4 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Fluid Schedule</span>
                        <span className="text-[10px] text-blue-400 font-medium">
                          {totals.totalFluidLitres}L total
                        </span>
                      </div>
                    </div>
                  )}
                  {protocol.hourlyProtocol.map((step, idx) => {
                    const cumulativeML = getCumulativeFluid(idx);
                    const totalML = totals?.totalFluidLitres
                      ? totals.totalFluidLitres * 1000
                      : protocol.hourlyProtocol.reduce((s, st) => s + st.fluidML, 0);
                    const progressPct = Math.min(100, Math.round((cumulativeML / totalML) * 100));
                    const phaseBadge = getPhaseBadge(step.phase);

                    return (
                      <div key={idx}>
                        {idx > 0 && <div className="h-px bg-border/50 mx-4" />}
                        <button
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => toggleStep(idx)}
                        >
                          <div className="flex flex-col items-center justify-center bg-muted border border-border/50 rounded-xl px-2 py-1.5 shrink-0 min-w-[64px] shadow-sm">
                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">
                              Hour {step.hour}
                            </span>
                            <span className="text-xs font-bold text-foreground">
                              {formatTime(startTime, step.hour)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold tabular-nums text-foreground">
                                {step.fluidML}ml
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Na {getSodium(step)}mg
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                K {getPotassium(step)}mg
                              </span>
                              {getCarbs(step) > 0 && (
                                <span className="text-[10px] text-emerald-400 font-medium">
                                  {getCarbs(step)}g carbs
                                </span>
                              )}
                            </div>
                            {phaseBadge && (
                              <span
                                className={`inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${phaseBadge.bg} ${phaseBadge.text}`}
                              >
                                {step.phase}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {progressPct}%
                            </span>
                            <span className="text-muted-foreground">
                              {expandedStep === idx ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </div>
                        </button>
                        {expandedStep === idx && (
                          <div className="px-4 pb-3 space-y-2">
                            {/* Cumulative progress bar */}
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            {step.drinkRecipe && (
                              <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2">
                                <Beaker className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-400 font-medium">
                                  {step.drinkRecipe}
                                </p>
                              </div>
                            )}
                            {step.foods && step.foods.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {step.foods.map((food, fIdx) => (
                                  <span
                                    key={fIdx}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                  >
                                    {food}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {step.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Carbs Tab ──────────────────────────────────────────── */}
              {activeTab === "carbs" && (
                <div>
                  {/* Carbs progress header */}
                  <div className="px-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Target {totals?.totalCarbsG ?? protocol.carbRefuelPlan.targetCarbs ?? "—"}g (
                        {totals?.carbTargetPerKg ?? "6-8"} g/kg)
                      </span>
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5">
                        Max {totals?.maxCarbsPerHour ?? 60}g/h
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((getCumulativeCarbs() / (totals?.totalCarbsG ?? (getCumulativeCarbs() || 1))) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-emerald-400 tabular-nums font-medium">
                          {getCumulativeCarbs()}g planned
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {totals?.totalCarbsG ?? "—"}g target
                        </span>
                      </div>
                    </div>
                    {protocol.carbRefuelPlan.strategy && (
                      <p className="text-[11px] text-muted-foreground leading-snug italic">
                        {protocol.carbRefuelPlan.strategy}
                      </p>
                    )}
                  </div>

                  {/* Meal rows */}
                  {protocol.carbRefuelPlan.meals.map((meal, idx) => (
                    <div key={idx}>
                      {idx > 0 && <div className="h-px bg-border/50 mx-4" />}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => toggleMeal(idx)}
                      >
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 shrink-0 max-w-[80px] truncate">
                          {meal.timing}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-emerald-400">
                          {meal.carbsG}g
                        </span>
                        <span className="ml-auto text-muted-foreground">
                          {expandedMeal === idx ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </button>
                      {expandedMeal === idx && (
                        <div className="px-4 pb-3 space-y-2">
                          {getMealFoods(meal).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {getMealFoods(meal).map((food, foodIdx) => (
                                <span
                                  key={foodIdx}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                >
                                  {food}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground italic leading-relaxed">
                            {meal.rationale}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ── Suggested Foods Grid ───────────────────────────── */}
                  <div className="mx-4 mt-4 mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">
                      Suggested Foods (Research-Backed)
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUGGESTED_FOODS.map((food, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-card border border-border/50 p-2"
                        >
                          <p className="text-[11px] font-medium text-foreground/90 leading-tight">
                            {food.name}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                              {food.carbsG}g
                            </span>
                            <span className="text-[9px] text-muted-foreground">{food.notes}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Suggested Drinks ────────────────────────────────── */}
                  <div className="mx-4 mt-3 mb-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">
                      Suggested Drinks
                    </p>
                    <div className="space-y-1.5">
                      {SUGGESTED_DRINKS.map((drink, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2"
                        >
                          <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-foreground/90">
                              {drink.name}
                            </p>
                            <p className="text-[9px] text-muted-foreground">{drink.usage}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
