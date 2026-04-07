import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Clock,
  Gem,
} from "lucide-react";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";
import { useAITask } from "@/contexts/AITaskContext";
import { AICompactOverlay } from "@/components/AICompactOverlay";
import { useRehydrationProtocol } from "@/hooks/hydration/useRehydrationProtocol";
import { useGems } from "@/hooks/useGems";
import {
  DEFAULT_WARNINGS, SUGGESTED_FOODS, SUGGESTED_DRINKS, DEFAULT_EDUCATION,
  getSodium, getPotassium, getCarbs, getMealFoods, getPhaseBadge,
} from "@/pages/hydration/types";

export default function Hydration() {
  const {
    weightLost, setWeightLost,
    weighInDate, setWeighInDate,
    weighInTime, setWeighInTime,
    fightDate, setFightDate,
    fightTime, setFightTime,
    glycogenDepletion,
    normalCarbs, setNormalCarbs,
    fightWeekCarbs, setFightWeekCarbs,
    availableHours,
    protocol, loading,
    currentWeight, profileParts,
    handleGenerateProtocol, handleAICancel,
  } = useRehydrationProtocol();
  const { gems, isPremium: gemsIsPremium } = useGems();

  const [activeTab, setActiveTab] = useState<"fluid" | "carbs">("fluid");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [scienceOpen, setScienceOpen] = useState(false);
  const [caffeineOpen, setCaffeineOpen] = useState(false);
  const [mouthRinseOpen, setMouthRinseOpen] = useState(false);
  const [electrolyteGuideOpen, setElectrolyteGuideOpen] = useState(false);

  const toggleStep = (idx: number) => setExpandedStep((prev) => (prev === idx ? null : idx));
  const toggleMeal = (idx: number) => setExpandedMeal((prev) => (prev === idx ? null : idx));

  const getWeightLossColor = () => {
    if (!currentWeight || !weightLost) return { ring: "text-blue-500 border-blue-500/20", shadow: "" };
    const pct = (parseFloat(weightLost) / currentWeight) * 100;
    if (pct <= 5) return { ring: "text-emerald-500 border-emerald-500/20", shadow: "0 0 15px rgba(16,185,129,0.3)" };
    if (pct <= 8) return { ring: "text-amber-500 border-amber-500/20", shadow: "0 0 15px rgba(245,158,11,0.3)" };
    return { ring: "text-red-500 border-red-500/20", shadow: "0 0 15px rgba(239,68,68,0.3)" };
  };
  const { ring: ringColorClasses, shadow: ringShadow } = getWeightLossColor();

  const formatTime = (startStr: string, hourIndex: number) => {
    if (!startStr) return `H${hourIndex}`;
    const [h, m] = startStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return `H${hourIndex}`;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setHours(d.getHours() + (hourIndex - 1));
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const cumulativeFluidByStep = useMemo(() => {
    if (!protocol) return [];
    let sum = 0;
    return protocol.hourlyProtocol.map((step) => { sum += step.fluidML; return sum; });
  }, [protocol]);

  const getCumulativeFluid = (upToIndex: number) => cumulativeFluidByStep[upToIndex] ?? 0;

  const cumulativeCarbs = useMemo(() => {
    if (!protocol) return 0;
    return protocol.carbRefuelPlan.meals.reduce((s, m) => s + m.carbsG, 0);
  }, [protocol]);

  const getCumulativeCarbs = () => cumulativeCarbs;

  const totals = protocol?.totals;
  const education = protocol?.education;
  const educationItems = education?.howItWorks ?? DEFAULT_EDUCATION;

  const allWarnings = [
    ...(protocol?.warnings ?? []),
    ...DEFAULT_WARNINGS.filter(
      (dw) => !(protocol?.warnings ?? []).some((w) => w.toLowerCase().includes(dw.slice(0, 30).toLowerCase()))
    ),
  ];

  const REHYDRATION_STEPS = [
    { icon: Activity, label: "Analysing weight loss", color: "text-red-400" },
    { icon: Droplets, label: "Calculating fluid requirements", color: "text-blue-500" },
    { icon: Zap, label: "Optimising electrolyte ratios", color: "text-yellow-400" },
    { icon: Beaker, label: "Formulating recovery plan", color: "text-green-400" },
  ];

  const { tasks: aiTasks, dismissTask: aiDismiss } = useAITask();
  const aiTask = aiTasks.find(t => t.status === "running" && t.type === "rehydration");

  return (
    <>
      {aiTask && (
        <div className="px-3 sm:px-5 md:px-6 pt-3 max-w-7xl mx-auto">
          <AICompactOverlay
            isOpen={true}
            isGenerating={true}
            steps={aiTask.steps}
            title={aiTask.label}
            onCancel={() => aiDismiss(aiTask.id)}
          />
        </div>
      )}
      <div className="space-y-2.5 p-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-lg font-semibold tracking-tight">Post-Weigh-In Rehydration</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Science-based recovery protocol</p>
        </div>

        {/* Disclaimer Banner */}
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

        {/* Safety Banner */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-300 leading-snug">
            For athletes who have safely completed their weight cut. Never rehydrate without guidance.
          </p>
        </div>

        {/* Input Form */}
        <div className="rounded-2xl border border-white/[0.06] p-4 mb-4 shadow-2xl relative overflow-hidden bg-white/[0.02]">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-blue-500/20 opacity-40 blur-[80px] rounded-full"></div>
          </div>

          <form onSubmit={handleGenerateProtocol} className="space-y-4 relative z-10">
            <div className="flex items-center justify-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">{profileParts.join(" · ")}</p>
            </div>

            {!currentWeight && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-400">Set your current weight in your profile to generate a protocol.</p>
              </div>
            )}

            {/* Weight Lost Ring */}
            <div className="flex flex-col items-center justify-center space-y-3">
              <p className="text-[11px] text-blue-400 font-bold uppercase tracking-[0.2em]">Weight Lost (kg)</p>
              <div className={`relative w-22 h-22 rounded-full border-[5px] transition-colors duration-500 flex flex-col items-center justify-center bg-background ring-1 ring-border/30 ${ringColorClasses.split(" ")[1]}`} style={{ width: 88, height: 88, boxShadow: ringShadow || undefined }}>
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" className={`transition-colors duration-500 ${ringColorClasses.split(" ")[0]}`} strokeWidth="5" strokeDasharray="289" strokeDashoffset="40" strokeLinecap="round" />
                </svg>
                <Input type="number" inputMode="decimal" step="0.1" placeholder="0.0" value={weightLost} onChange={(e) => setWeightLost(e.target.value)} required className="w-20 text-center text-3xl font-black bg-transparent border-none text-foreground focus-visible:ring-0 placeholder:text-muted-foreground/30 p-0 h-auto min-h-0 relative z-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center text-center py-3">
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-[0.15em] mb-1.5">Weigh-In</p>
                <input type="time" value={weighInTime} onChange={(e) => setWeighInTime(e.target.value)} required className="bg-transparent border-none text-center text-2xl font-black text-foreground focus:outline-none w-auto mx-auto block relative" />
                <input type="date" value={weighInDate} onChange={(e) => setWeighInDate(e.target.value)} required className="bg-transparent border-none text-center text-[11px] font-medium text-muted-foreground/60 focus:outline-none w-auto mx-auto block mt-1 relative" />
              </div>
              <div className="flex flex-col items-center text-center py-3">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.15em] mb-1.5">Fight</p>
                <input type="time" value={fightTime} onChange={(e) => setFightTime(e.target.value)} required className="bg-transparent border-none text-center text-2xl font-black text-foreground focus:outline-none w-auto mx-auto block relative" />
                <input type="date" value={fightDate} onChange={(e) => setFightDate(e.target.value)} required className="bg-transparent border-none text-center text-[11px] font-medium text-muted-foreground/60 focus:outline-none w-auto mx-auto block mt-1 relative" />
              </div>
            </div>

            {/* Rehydration Window Badge */}
            <div className="flex items-center justify-center">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${availableHours <= 5 ? "bg-red-500/10 border-red-500/30 text-red-400" : availableHours <= 10 ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
                <Clock className="w-3 h-3" />
                {availableHours}h rehydration window
              </div>
            </div>

            {/* Glycogen Depletion Calculator */}
            <div className="pt-2">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.15em] text-center mb-3">Glycogen Depletion</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center text-center">
                  <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-1">Normal (g/day)</label>
                  <input type="number" inputMode="numeric" placeholder="300" value={normalCarbs} onChange={(e) => setNormalCarbs(e.target.value)} className="bg-transparent border-none text-center text-xl font-black text-foreground focus:outline-none w-20 mx-auto relative" />
                </div>
                <div className="flex flex-col items-center text-center">
                  <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-1">Fight Week (g/day)</label>
                  <input type="number" inputMode="numeric" placeholder="50" value={fightWeekCarbs} onChange={(e) => setFightWeekCarbs(e.target.value)} className="bg-transparent border-none text-center text-xl font-black text-foreground focus:outline-none w-20 mx-auto relative" />
                </div>
              </div>
              {(() => {
                const normal = parseFloat(normalCarbs);
                const fightWeek = parseFloat(fightWeekCarbs);
                const hasInputs = normal > 0 && fightWeek >= 0;
                const reduction = hasInputs ? Math.round(((normal - fightWeek) / normal) * 100) : 0;
                const level = glycogenDepletion;
                const config = {
                  significant: { color: "text-red-400", label: "Significant", target: "8-12 g/kg" },
                  moderate: { color: "text-amber-400", label: "Moderate", target: "6-8 g/kg" },
                  none: { color: "text-emerald-400", label: "None", target: "4-5 g/kg" },
                }[level] ?? { color: "text-amber-400", label: "Moderate", target: "6-8 g/kg" };

                return (
                  <div className="mt-3 text-center">
                    <div className={`flex items-center justify-center gap-2 ${config.color}`}>
                      <span className="text-xs font-bold">{config.label}</span>
                      <span className="text-[10px] font-semibold opacity-70">· Replenish: {config.target}</span>
                    </div>
                    {hasInputs ? (
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {fightWeek < 50 ? `< 50g/day during fight week` : `${reduction}% reduction`}
                        {" — "}reduced from {normal}g to {fightWeek}g/day
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40 mt-1">Enter carb intake to detect depletion level</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <Button type="submit" className="w-full h-10 mt-1 font-bold text-sm rounded-2xl transition-all active:scale-[0.98] bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90" disabled={loading || !currentWeight}>
              {loading ? "Generating Protocol..." : <>Generate Protocol{!gemsIsPremium && <span className="inline-flex items-center gap-0.5 ml-1.5 text-amber-500"><Gem className="h-3 w-3" /><span className="text-[10px] font-bold tabular-nums">{gems}</span></span>}</>}
            </Button>
          </form>
        </div>

        {/* PROTOCOL RESULTS */}
        {protocol && (
          <div className="space-y-2.5">
            {/* Summary */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{protocol.summary}</p>
                <button onClick={() => handleGenerateProtocol(new Event("submit") as any)} disabled={loading} className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" aria-label="Regenerate">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Totals Dashboard */}
            {totals && (
              <div className="rounded-2xl bg-card border border-border/50 p-3">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2 text-center font-bold">Rehydration Totals</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-2 text-center">
                    <p className="text-base font-bold tabular-nums text-blue-400">{totals.totalFluidLitres}L</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Total Fluid</p>
                  </div>
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-2 text-center">
                    <p className="text-base font-bold tabular-nums text-amber-400">{(totals.totalSodiumMg / 1000).toFixed(1)}g</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Sodium</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-2 text-center">
                    <p className="text-base font-bold tabular-nums text-emerald-400">{totals.totalCarbsG}g</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Carbs</p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.rehydrationWindowHours}h</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Window</p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.totalPotassiumMg}mg</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Potassium</p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border/50 p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.totalMagnesiumMg}mg</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Magnesium</p>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings Section */}
            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-amber-500/10 transition-colors" onClick={() => setWarningsOpen((o) => !o)}>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-sm font-medium text-amber-400">Safety Warnings ({allWarnings.length})</span>
                <span className="ml-auto text-amber-400">{warningsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {warningsOpen && (
                <div className="px-4 pb-4 space-y-2 border-t border-amber-500/20">
                  {allWarnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2 pt-2">
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-300 leading-relaxed">{warning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How This Protocol Works */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setScienceOpen((o) => !o)}>
                <BookOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">How This Protocol Works</span>
                <span className="ml-auto text-muted-foreground">{scienceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {scienceOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3 space-y-3">
                    {educationItems.map((item, idx) => (
                      <div key={idx}>
                        <p className="text-xs font-semibold text-foreground/80 mb-1">{item.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Why Electrolytes Matter */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setElectrolyteGuideOpen((o) => !o)}>
                <Beaker className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">Why Electrolytes Matter</span>
                <span className="ml-auto text-muted-foreground">{electrolyteGuideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {electrolyteGuideOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3 space-y-3">
                    {[
                      { symbol: "Na", name: "Sodium", desc: "The #1 electrolyte for rehydration. Sodium creates the osmotic gradient that pulls water into your cells and bloodstream. After a weight cut, your sodium stores are severely depleted. Without adequate sodium, you'll urinate out most of the water you drink. Target: 50-90 mmol/L in rehydration fluid (ISSN 2025)." },
                      { symbol: "K", name: "Potassium", desc: "Essential for intracellular hydration and muscle function. Potassium works with sodium to maintain fluid balance across cell membranes. Low potassium leads to muscle cramps, weakness, and impaired reflexes — critical for fight performance." },
                      { symbol: "Mg", name: "Magnesium", desc: "Supports neuromuscular function, energy production, and reduces cramping risk. Magnesium is lost through sweat during the cut and is critical for maintaining reaction time and power output during competition." },
                    ].map(({ symbol, name, desc }) => (
                      <div key={symbol} className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">{symbol}</span>
                        <div>
                          <p className="text-xs font-semibold text-foreground/80">{name}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Caffeine Strategy */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setCaffeineOpen((o) => !o)}>
                <Coffee className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-sm font-medium">Caffeine Strategy</span>
                <span className="ml-auto text-muted-foreground">{caffeineOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {caffeineOpen && (
                <div className="px-4 pb-4 border-t border-border/30">
                  <div className="pt-3 space-y-2">
                    {totals && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5">Your dose: {totals.caffeineLowMg}-{totals.caffeineHighMg}mg</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {education?.caffeineGuidance ?? `Consume 3-6 mg/kg of caffeine approximately 60 minutes before competition. Mild-to-moderate doses improve reaction time, reduce perceived effort, and enhance fine motor control. Higher doses may cause overstimulation, anxiety, and potential decrements in performance (Reale SSE #183). Become familiar with your individual response to caffeine before competition day.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Carb Mouth Rinse */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setMouthRinseOpen((o) => !o)}>
                <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">GI Distress? Carb Mouth Rinse</span>
                <span className="ml-auto text-muted-foreground">{mouthRinseOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {mouthRinseOpen && (
                <div className="px-4 pb-4 border-t border-border/30">
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {education?.carbMouthRinse ?? `If GI distress prevents you from eating or drinking close to competition, rinsing your mouth for ~10 seconds with a sports drink or carbohydrate solution may enhance performance. This activates regions in the central nervous system that increase drive and reduce perceived effort — a low-risk strategy when swallowing fluids feels impossible (Burke & Maughan 2015).`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Segmented Tab Control (Fluid / Carbs) */}
            <div className="rounded-2xl bg-muted/50 border border-border/50 overflow-hidden">
              <div className="p-2">
                <div className="flex bg-muted rounded-full p-0.5">
                  <button onClick={() => setActiveTab("fluid")} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === "fluid" ? "bg-blue-500 text-white shadow-sm" : "text-muted-foreground"}`}>
                    <Droplets className="h-3 w-3" /> Fluid
                  </button>
                  <button onClick={() => setActiveTab("carbs")} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === "carbs" ? "bg-blue-500 text-white shadow-sm" : "text-muted-foreground"}`}>
                    <Zap className="h-3 w-3" /> Carbs
                  </button>
                </div>
              </div>

              {/* Fluid Tab */}
              {activeTab === "fluid" && (
                <div>
                  {totals && (
                    <div className="px-4 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Fluid Schedule</span>
                        <span className="text-[10px] text-blue-400 font-medium">{totals.totalFluidLitres}L total</span>
                      </div>
                    </div>
                  )}
                  <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/20">
                    <Droplets className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-300 leading-snug">
                      <span className="font-semibold">Sip, don't chug.</span> Spread each hour's fluids into small sips over the full 60 minutes for better absorption and less GI distress.
                    </p>
                  </div>
                  {protocol.hourlyProtocol.map((step, idx) => {
                    const cumulativeML = getCumulativeFluid(idx);
                    const totalML = totals?.totalFluidLitres ? totals.totalFluidLitres * 1000 : protocol.hourlyProtocol.reduce((s, st) => s + st.fluidML, 0);
                    const progressPct = Math.min(100, Math.round((cumulativeML / totalML) * 100));
                    const phaseBadge = getPhaseBadge(step.phase);

                    return (
                      <div key={idx}>
                        {idx > 0 && <div className="h-px bg-border/50 mx-4" />}
                        <button className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleStep(idx)}>
                          <div className="flex flex-col items-center justify-center bg-muted border border-border/50 rounded-xl px-2 py-1.5 shrink-0 min-w-[64px] shadow-sm">
                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Hour {step.hour}</span>
                            <span className="text-xs font-bold text-foreground">{formatTime(weighInTime, step.hour)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold tabular-nums text-foreground">{step.fluidML}ml</span>
                              <span className="text-[10px] text-muted-foreground">Na {getSodium(step)}mg</span>
                              <span className="text-[10px] text-muted-foreground">K {getPotassium(step)}mg</span>
                              {getCarbs(step) > 0 && <span className="text-[10px] text-emerald-400 font-medium">{getCarbs(step)}g carbs</span>}
                            </div>
                            {phaseBadge && <span className={`inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${phaseBadge.bg} ${phaseBadge.text}`}>{step.phase}</span>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[9px] text-muted-foreground tabular-nums">{progressPct}%</span>
                            <span className="text-muted-foreground">{expandedStep === idx ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
                          </div>
                        </button>
                        {expandedStep === idx && (
                          <div className="px-4 pb-3 space-y-2">
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                            </div>
                            {step.drinkRecipe && (
                              <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2">
                                <Beaker className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-400 font-medium">{step.drinkRecipe}</p>
                              </div>
                            )}
                            {step.foods && step.foods.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {step.foods.map((food, fIdx) => (
                                  <span key={fIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{food}</span>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground leading-relaxed">{step.notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Carbs Tab */}
              {activeTab === "carbs" && (
                <div>
                  <div className="px-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Target {totals?.totalCarbsG ?? protocol.carbRefuelPlan.targetCarbs ?? "—"}g ({totals?.carbTargetPerKg ?? "6-8"} g/kg)</span>
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5">Max {totals?.maxCarbsPerHour ?? 60}g/h</span>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((getCumulativeCarbs() / (totals?.totalCarbsG ?? (getCumulativeCarbs() || 1))) * 100))}%` }} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-emerald-400 tabular-nums font-medium">{getCumulativeCarbs()}g planned</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{totals?.totalCarbsG ?? "—"}g target</span>
                      </div>
                    </div>
                    {protocol.carbRefuelPlan.strategy && <p className="text-[11px] text-muted-foreground leading-snug italic">{protocol.carbRefuelPlan.strategy}</p>}
                  </div>

                  {protocol.carbRefuelPlan.meals.map((meal, idx) => (
                    <div key={idx}>
                      {idx > 0 && <div className="h-px bg-border/50 mx-4" />}
                      <button className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleMeal(idx)}>
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 shrink-0 max-w-[80px] truncate">{meal.timing}</span>
                        <span className="text-sm font-semibold tabular-nums text-emerald-400">{meal.carbsG}g</span>
                        <span className="ml-auto text-muted-foreground">{expandedMeal === idx ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
                      </button>
                      {expandedMeal === idx && (
                        <div className="px-4 pb-3 space-y-2">
                          {getMealFoods(meal).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {getMealFoods(meal).map((food, foodIdx) => (
                                <span key={foodIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{food}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground italic leading-relaxed">{meal.rationale}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Suggested Foods Grid */}
                  <div className="mx-4 mt-4 mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">Suggested Foods (Research-Backed)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUGGESTED_FOODS.map((food, idx) => (
                        <div key={idx} className="rounded-lg bg-card border border-border/50 p-2 space-y-1">
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="text-[11px] font-medium text-foreground/90 leading-tight min-w-0">{food.name}</p>
                            <span className="text-[10px] text-emerald-400 font-bold tabular-nums shrink-0">{food.carbsG}g</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground leading-snug">{food.notes}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Drinks */}
                  <div className="mx-4 mt-3 mb-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">Suggested Drinks</p>
                    <div className="space-y-1.5">
                      {SUGGESTED_DRINKS.map((drink, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2">
                          <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-foreground/90">{drink.name}</p>
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
