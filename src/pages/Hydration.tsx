import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIPersistence } from "@/lib/aiPersistence";
import { Droplets, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Info, BookOpen, Beaker } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";

interface HourlyStep {
  hour: number;
  fluidML: number;
  sodium: number;
  potassium: number;
  carbs: number;
  notes: string;
}

interface MealPlan {
  timing: string;
  carbsG: number;
  mealIdeas: string[];
  rationale: string;
}

interface CarbRefuelPlan {
  targetCarbs: string;
  meals: MealPlan[];
  totalCarbs: string;
}

interface RehydrationProtocol {
  hourlyProtocol: HourlyStep[];
  electrolyteRatio: {
    sodium: string;
    potassium: string;
    magnesium: string;
  };
  carbRefuelPlan: CarbRefuelPlan;
  summary: string;
  warnings: string[];
}

interface Profile {
  current_weight_kg: number;
}

export default function Hydration() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weightLost, setWeightLost] = useState("");
  const [weighInTiming, setWeighInTiming] = useState<string>("same-day");
  const [fightTimeHours, setFightTimeHours] = useState("");
  const [protocol, setProtocol] = useState<RehydrationProtocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"fluid" | "carbs">("fluid");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [scienceOpen, setScienceOpen] = useState(false);
  const [electrolyteGuideOpen, setElectrolyteGuideOpen] = useState(false);
  const { toast } = useToast();
  const { userId, profile: contextProfile } = useUser();

  // Sync profile from context
  useEffect(() => {
    if (contextProfile) {
      setProfile({ current_weight_kg: contextProfile.current_weight_kg ?? 0 });
    }
  }, [contextProfile]);

  useEffect(() => {
    loadPersistedProtocol();
  }, [userId]);

  const loadPersistedProtocol = () => {
    if (!userId || protocol) return;
    try {
      const persistedData = AIPersistence.load(userId, 'rehydration_protocol');
      if (persistedData) {
        setProtocol(persistedData.protocol);
        if (persistedData.inputs) {
          setWeightLost(persistedData.inputs.weightLost || "");
          setWeighInTiming(persistedData.inputs.weighInTiming || "same-day");
          setFightTimeHours(persistedData.inputs.fightTimeHours || "");
        }
      }
    } catch (error) {
      console.error("Error loading persisted protocol:", error);
    }
  };

  const handleGenerateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("rehydration-protocol", {
        body: {
          weightLostKg: parseFloat(weightLost),
          weighInTiming,
          currentWeightKg: profile.current_weight_kg,
          fightTimeHours: parseInt(fightTimeHours),
        },
      });

      if (error) throw error;

      if (data?.protocol) {
        setProtocol(data.protocol);

        if (userId) {
          AIPersistence.save(userId, 'rehydration_protocol', {
            protocol: data.protocol,
            inputs: {
              weightLost,
              weighInTiming,
              fightTimeHours
            }
          }, 168);
        }

        toast({
          title: "Protocol Generated",
          description: "Your personalized rehydration plan is ready",
        });
      }
    } catch (error) {
      console.error("Error generating protocol:", error);
      toast({
        title: "Error",
        description: "Failed to generate rehydration protocol",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const toggleStep = (idx: number) => setExpandedStep(prev => prev === idx ? null : idx);
  const toggleMeal = (idx: number) => setExpandedMeal(prev => prev === idx ? null : idx);

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-24 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Post-Weigh-In Rehydration</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Science-based recovery protocol</p>
      </div>

      {/* Safety Banner — slim amber strip */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <p className="text-[11px] text-amber-300 leading-snug">
          For athletes who have safely completed their weight cut. Never rehydrate without guidance.
        </p>
      </div>

      {/* Input Form — glass card */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4">
        <form onSubmit={handleGenerateProtocol} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight Lost (kg)</p>
              <Input
                type="number"
                step="0.1"
                placeholder="2.5"
                value={weightLost}
                onChange={(e) => setWeightLost(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hours Until Fight</p>
              <Input
                type="number"
                placeholder="6"
                value={fightTimeHours}
                onChange={(e) => setFightTimeHours(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weigh-In Timing</p>
            <Select value={weighInTiming} onValueChange={setWeighInTiming}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same-day">Same Day (4–6 hrs before fight)</SelectItem>
                <SelectItem value="day-before">Day Before (24+ hrs before fight)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm rounded-xl"
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate Protocol"}
          </Button>
        </form>
      </div>

      {/* Protocol Results */}
      {protocol && (
        <div className="space-y-4">

          {/* Summary strip */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground/90 leading-snug">{protocol.summary}</p>
              <button
                onClick={() => handleGenerateProtocol(new Event('submit') as any)}
                disabled={loading}
                className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Regenerate"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Warnings */}
            {protocol.warnings && protocol.warnings.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {protocol.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-amber-300 leading-none">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How This Protocol Works — Collapsible */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
              onClick={() => setScienceOpen(o => !o)}
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium">How This Protocol Works</span>
              <span className="ml-auto text-muted-foreground">
                {scienceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
            {scienceOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5">
                <div className="pt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground/80 mb-1">Gastric Emptying</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Your stomach can process ~800–1000ml of fluid per hour. Drinking beyond this rate causes bloating and impairs absorption. This protocol spaces intake to maximize absorption efficiency.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/80 mb-1">Electrolyte-Driven Absorption</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Sodium is the primary driver of water absorption in the gut. Adding sodium to your fluids activates the sodium-glucose co-transporter (SGLT1), pulling water into cells 2–3× faster than plain water alone.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/80 mb-1">Carb-Loading Rationale</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Each gram of glycogen stored in muscles binds ~3g of water. Carb loading after weigh-in restores energy AND accelerates rehydration — a dual benefit for fight performance.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/80 mb-1">Phased Recovery</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">The first 2 hours focus on rapid cellular rehydration with higher sodium. Hours 3–4 shift to glycogen restoration with carbs. The final phase before competition maintains equilibrium without overloading the gut.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Electrolyte cells */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Electrolyte Ratio · per 500ml water
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Na", value: protocol.electrolyteRatio.sodium },
                { label: "K", value: protocol.electrolyteRatio.potassium },
                { label: "Mg", value: protocol.electrolyteRatio.magnesium },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white/5 border border-white/10 border-t-2 border-t-blue-500/60 p-3 text-center"
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-semibold tabular-nums text-blue-400">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Electrolyte Guide — Collapsible */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
              onClick={() => setElectrolyteGuideOpen(o => !o)}
            >
              <Beaker className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium">Why These Ratios Matter</span>
              <span className="ml-auto text-muted-foreground">
                {electrolyteGuideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
            {electrolyteGuideOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5">
                <div className="pt-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">Na</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground/80">Sodium</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">The #1 electrolyte for rehydration. Sodium creates the osmotic gradient that pulls water into your cells and bloodstream. After a weight cut, your sodium stores are severely depleted. Without adequate sodium, you'll urinate out most of the water you drink.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">K</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground/80">Potassium</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">Essential for intracellular hydration and muscle function. Potassium works with sodium to maintain fluid balance across cell membranes. Low potassium leads to muscle cramps, weakness, and impaired reflexes — critical for fight performance.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">Mg</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground/80">Magnesium</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">Supports neuromuscular function, energy production, and reduces cramping risk. Magnesium is lost through sweat during the cut and is critical for maintaining reaction time and power output during competition.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Segmented Tab Control */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">

            {/* Pill switcher */}
            <div className="p-2">
              <div className="flex bg-muted rounded-full p-0.5">
                <button
                  onClick={() => setActiveTab("fluid")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === "fluid"
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-muted-foreground"
                    }`}
                >
                  <Droplets className="h-3 w-3" />
                  Fluid
                </button>
                <button
                  onClick={() => setActiveTab("carbs")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === "carbs"
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-muted-foreground"
                    }`}
                >
                  🍚 Carbs
                </button>
              </div>
            </div>

            {/* Fluid tab */}
            {activeTab === "fluid" && (
              <div>
                {protocol.hourlyProtocol.map((step, idx) => (
                  <div key={idx}>
                    {idx > 0 && <div className="h-px bg-white/5 mx-4" />}
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                      onClick={() => toggleStep(idx)}
                    >
                      <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0">
                        H{step.hour}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {step.fluidML}ml
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Na {step.sodium}mg
                      </span>
                      <span className="text-xs text-muted-foreground">
                        K {step.potassium}mg
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {expandedStep === idx
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />
                        }
                      </span>
                    </button>
                    {expandedStep === idx && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">{step.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Carbs tab */}
            {activeTab === "carbs" && (
              <div>
                <div className="px-4 pb-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Target {protocol.carbRefuelPlan.targetCarbs}
                  </span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">
                    Total {protocol.carbRefuelPlan.totalCarbs}
                  </span>
                </div>
                {protocol.carbRefuelPlan.meals.map((meal, idx) => (
                  <div key={idx}>
                    {idx > 0 && <div className="h-px bg-white/5 mx-4" />}
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                      onClick={() => toggleMeal(idx)}
                    >
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 shrink-0 max-w-[80px] truncate">
                        {meal.timing}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-emerald-400">
                        {meal.carbsG}g
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {expandedMeal === idx
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />
                        }
                      </span>
                    </button>
                    {expandedMeal === idx && (
                      <div className="px-4 pb-3 space-y-2">
                        {meal.mealIdeas && meal.mealIdeas.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {meal.mealIdeas.map((food, foodIdx) => (
                              <span
                                key={foodIdx}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                              >
                                {food}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground italic leading-relaxed">{meal.rationale}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Critical Reminders — collapsed by default */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
              onClick={() => setRemindersOpen(o => !o)}
            >
              <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium">Critical Reminders</span>
              <span className="ml-auto text-muted-foreground">
                {remindersOpen
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </span>
            </button>
            {remindersOpen && (
              <div className="px-4 pb-4 space-y-2">
                {[
                  "Monitor urine colour — aim for light yellow, not clear",
                  "Sip fluids gradually; never chug large volumes at once",
                  "Listen to your body — adjust if you feel nausea or bloating",
                  "Avoid high-fibre, high-fat foods until after competition",
                  "Keep electrolyte packets or sports drinks readily available",
                ].map((reminder, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-blue-400 text-xs mt-0.5">•</span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{reminder}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
