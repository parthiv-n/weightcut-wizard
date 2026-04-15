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
    availableHours, awakeHours,
    protocol, loading,
    currentWeight, profileParts,
    handleGenerateProtocol, handleAICancel,
  } = useRehydrationProtocol();
  const { gems, isPremium: gemsIsPremium } = useGems();

  const [activeTab, setActiveTab] = useState<"fluid" | "carbs">("fluid");
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [scienceOpen, setScienceOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);


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
      <div className="space-y-2.5">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-lg font-semibold tracking-tight">Post-Weigh-In Rehydration</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Science-based recovery protocol</p>
        </div>

        {/* Input Form */}
        <div className="rounded-xl border border-border p-4 mb-4 relative overflow-hidden bg-card">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
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

            {/* Weight Lost */}
            <div className="flex flex-col items-center pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Weight Lost</p>
              <div className="flex items-baseline gap-1">
                <Input type="number" inputMode="decimal" step="0.1" placeholder="0.0" value={weightLost} onChange={(e) => setWeightLost(e.target.value)} required
                  className="w-24 text-center text-4xl font-black bg-transparent border-none text-foreground focus-visible:ring-0 placeholder:text-muted-foreground/20 p-0 h-auto" />
                <span className="text-lg text-muted-foreground font-medium">kg</span>
              </div>
              {currentWeight && weightLost && parseFloat(weightLost) > 0 && (
                <p className={`text-[11px] mt-1 font-medium ${
                  (parseFloat(weightLost) / currentWeight) * 100 <= 5 ? 'text-emerald-400' :
                  (parseFloat(weightLost) / currentWeight) * 100 <= 8 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {((parseFloat(weightLost) / currentWeight) * 100).toFixed(1)}% body mass
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3 space-y-2">
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider text-center">Weigh-In</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-xl bg-background/60 border border-border/30 px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <input type="time" value={weighInTime} onChange={(e) => setWeighInTime(e.target.value)} required
                      className="flex-1 bg-transparent border-none text-sm font-bold text-foreground focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-background/60 border border-border/30 px-3 py-2">
                    <input type="date" value={weighInDate} onChange={(e) => setWeighInDate(e.target.value)} required
                      className="flex-1 bg-transparent border-none text-sm font-medium text-foreground focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-3 space-y-2">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider text-center">Fight</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-xl bg-background/60 border border-border/30 px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <input type="time" value={fightTime} onChange={(e) => setFightTime(e.target.value)} required
                      className="flex-1 bg-transparent border-none text-sm font-bold text-foreground focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-background/60 border border-border/30 px-3 py-2">
                    <input type="date" value={fightDate} onChange={(e) => setFightDate(e.target.value)} required
                      className="flex-1 bg-transparent border-none text-sm font-medium text-foreground focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Rehydration Window Badge */}
            <div className="flex items-center justify-center">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${availableHours <= 5 ? "bg-red-500/10 border-red-500/30 text-red-400" : availableHours <= 10 ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
                <Clock className="w-3 h-3" />
                {availableHours}h to rehydrate
              </div>
            </div>

            {/* Advanced: Glycogen Depletion */}
            <div className="rounded-xl border border-border/30 overflow-hidden">
              <button type="button" className="w-full px-3 py-2.5 flex items-center gap-2 text-left" onClick={() => setAdvancedOpen(o => !o)}>
                <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">Advanced: Glycogen Depletion</span>
                <span className="ml-auto text-muted-foreground">{advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
              </button>
              {advancedOpen && (
                <div className="px-3 pb-3 border-t border-border/20">
                  <div className="pt-2">
                    <p className="text-[11px] text-muted-foreground leading-snug mb-3 text-center">
                      How many grams of carbs do you eat on a <strong className="text-foreground/70">normal training day</strong> vs during <strong className="text-foreground/70">fight week</strong>? This helps us calculate how depleted your glycogen stores are and how aggressively to refuel.
                    </p>
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
                </div>
              )}
            </div>

            {/* Safety & Disclaimer */}
            <div className="rounded-xl border border-border/30 overflow-hidden">
              <button type="button" className="w-full px-3 py-2.5 flex items-center gap-2 text-left" onClick={() => setDisclaimerOpen(o => !o)}>
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">Safety & Disclaimer</span>
                <span className="ml-auto text-muted-foreground">{disclaimerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
              </button>
              {disclaimerOpen && (
                <div className="px-3 pb-3 border-t border-border/20 space-y-2 pt-2">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    <span className="font-semibold text-foreground/80">Not medical advice.</span> This protocol is an educational guideline based on sports science research. Consult a qualified sports dietitian before implementing. Stop and seek medical attention if you experience dizziness, confusion, nausea, or chest pain.
                  </p>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-400 leading-snug">For athletes who have safely completed their weight cut. Never rehydrate without guidance.</p>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full h-11 mt-1 font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]" disabled={loading || !currentWeight || !weightLost || parseFloat(weightLost) <= 0}>
              {loading ? "Generating Protocol..." : <>Generate Protocol{!gemsIsPremium && <span className="inline-flex items-center gap-0.5 ml-1.5 text-primary-foreground/60"><Gem className="h-3 w-3" /><span className="text-[10px] font-medium tabular-nums">{gems}</span></span>}</>}
            </Button>
          </form>
        </div>

        {/* PROTOCOL RESULTS */}
        {protocol && (
          <div className="space-y-2.5">
            {/* Summary */}
            <div className="rounded-xl bg-muted/50 border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{protocol.summary}</p>
                <button onClick={() => handleGenerateProtocol(new Event("submit") as any)} disabled={loading} className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" aria-label="Regenerate">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Totals Dashboard */}
            {totals && (
              <div className="rounded-xl bg-card border border-border p-3">
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
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.rehydrationWindowHours}h</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Window</p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.totalPotassiumMg}mg</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Potassium</p>
                  </div>
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-sm font-bold tabular-nums text-foreground/80">{totals.totalMagnesiumMg}mg</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Magnesium</p>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings Section */}
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 overflow-hidden">
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

            {/* Learn More */}
            <div className="rounded-xl bg-muted/50 border border-border overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setScienceOpen((o) => !o)}>
                <BookOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium">Learn More</span>
                <span className="ml-auto text-muted-foreground">{scienceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
              </button>
              {scienceOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
                  {/* How It Works */}
                  <div>
                    <p className="text-xs font-bold text-foreground/80 mb-2">How This Protocol Works</p>
                    <div className="space-y-2">
                      {educationItems.map((item, idx) => (
                        <div key={idx}>
                          <p className="text-[11px] font-semibold text-foreground/70">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{item.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Electrolytes */}
                  <div>
                    <p className="text-xs font-bold text-foreground/80 mb-2">Why Electrolytes Matter</p>
                    <div className="space-y-2">
                      {[
                        { symbol: "Na", name: "Sodium", desc: "Creates osmotic gradient for cell absorption. Target: 50-90 mmol/L in fluid." },
                        { symbol: "K", name: "Potassium", desc: "Intracellular hydration + muscle function. Prevents cramps and impaired reflexes." },
                        { symbol: "Mg", name: "Magnesium", desc: "Neuromuscular function, energy production. Critical for reaction time." },
                      ].map(({ symbol, name, desc }) => (
                        <div key={symbol} className="flex items-start gap-2">
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">{symbol}</span>
                          <div>
                            <span className="text-[11px] font-semibold text-foreground/70">{name}: </span>
                            <span className="text-[11px] text-muted-foreground leading-relaxed">{desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Caffeine */}
                  <div>
                    <p className="text-xs font-bold text-foreground/80 mb-1">Caffeine Strategy</p>
                    {totals && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5 inline-block mb-1.5">Your dose: {totals.caffeineLowMg}-{totals.caffeineHighMg}mg</span>}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{education?.caffeineGuidance ?? "Consume 3-6 mg/kg caffeine ~60 min before competition. Improves reaction time and reduces perceived effort."}</p>
                  </div>
                  {/* Mouth Rinse */}
                  <div>
                    <p className="text-xs font-bold text-foreground/80 mb-1">GI Distress? Carb Mouth Rinse</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{education?.carbMouthRinse ?? "Rinse mouth ~10s with sports drink to activate CNS drive when swallowing feels impossible."}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Segmented Tab Control (Fluid / Carbs) */}
            <div className="rounded-xl bg-muted/50 border border-border overflow-hidden">
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
                    const phaseBadge = getPhaseBadge(step.phase);
                    return (
                      <div key={idx} className="flex gap-3 px-4 py-3">
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background shadow-sm" />
                          {idx < protocol.hourlyProtocol.length - 1 && <div className="w-0.5 flex-1 bg-border/40 mt-1" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-blue-500 uppercase">H{step.hour}</span>
                            <span className="text-xs font-bold text-foreground">{formatTime(weighInTime, step.hour)}</span>
                            <span className="text-sm font-bold tabular-nums text-foreground ml-auto">{step.fluidML}ml</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-[10px] text-muted-foreground">Na {getSodium(step)}mg</span>
                            <span className="text-[10px] text-muted-foreground">K {getPotassium(step)}mg</span>
                            {getCarbs(step) > 0 && <span className="text-[10px] text-emerald-400 font-medium">{getCarbs(step)}g carbs</span>}
                            {phaseBadge && <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${phaseBadge.bg} ${phaseBadge.text}`}>{step.phase}</span>}
                          </div>
                          {step.drinkRecipe && (
                            <div className="flex items-start gap-1.5 bg-blue-500/5 border border-blue-500/20 rounded-lg px-2.5 py-1.5 mb-1.5">
                              <Beaker className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-blue-400 font-medium leading-snug">{step.drinkRecipe}</p>
                            </div>
                          )}
                          {Array.isArray(step.foods) && step.foods.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {step.foods.map((food, fIdx) => (
                                <span key={fIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{food}</span>
                              ))}
                            </div>
                          )}
                          {step.notes && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{step.notes}</p>}
                        </div>
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
                    <div key={idx} className="flex gap-3 px-4 py-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background shadow-sm" />
                        {idx < protocol.carbRefuelPlan.meals.length - 1 && <div className="w-0.5 flex-1 bg-border/40 mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0 pb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-medium text-emerald-400">{meal.timing}</span>
                          <span className="text-sm font-bold tabular-nums text-emerald-400 ml-auto">{meal.carbsG}g</span>
                        </div>
                        {getMealFoods(meal).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {getMealFoods(meal).map((food, foodIdx) => (
                              <span key={foodIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{food}</span>
                            ))}
                          </div>
                        )}
                        {meal.rationale && <p className="text-[11px] text-muted-foreground leading-relaxed">{meal.rationale}</p>}
                      </div>
                    </div>
                  ))}

                  {/* Suggested Foods Grid */}
                  <div className="mx-4 mt-4 mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-bold">Suggested Foods (Research-Backed)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUGGESTED_FOODS.map((food, idx) => (
                        <div key={idx} className="rounded-lg bg-card border border-border p-2 space-y-1">
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
                        <div key={idx} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2">
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
