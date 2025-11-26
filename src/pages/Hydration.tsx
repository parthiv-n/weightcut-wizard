import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIPersistence } from "@/lib/aiPersistence";
import { Droplets, Clock, Zap, AlertTriangle, Info, Heart, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    loadPersistedProtocol();
  }, []);

  const loadPersistedProtocol = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || protocol) return;

      const persistedData = AIPersistence.load(user.id, 'rehydration_protocol');
      if (persistedData) {
        setProtocol(persistedData.protocol);
        // Restore input values if available
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


  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
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
        
        // Save to localStorage for persistence
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          AIPersistence.save(user.id, 'rehydration_protocol', {
            protocol: data.protocol,
            inputs: {
              weightLost,
              weighInTiming,
              fightTimeHours
            }
          }, 168); // 7 days expiration
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Post-Weigh-In Rehydration</h1>
          <p className="text-muted-foreground mt-2">Science-based recovery protocol for optimal fight-day performance</p>
        </div>

        {/* Safety Warning */}
        <Alert className="border-warning bg-warning/10">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <AlertDescription>
            <strong>Critical:</strong> This protocol is for athletes who have safely completed their weight cut. 
            Never attempt rapid rehydration without proper guidance. Excessive fluid intake can be dangerous.
          </AlertDescription>
        </Alert>

        {/* Input Form */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Weight Cut Details</CardTitle>
            <CardDescription>Enter your dehydration details to generate a personalized rehydration protocol</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerateProtocol} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weightLost">Weight Lost via Dehydration (kg)</Label>
                  <Input
                    id="weightLost"
                    type="number"
                    step="0.1"
                    placeholder="2.5"
                    value={weightLost}
                    onChange={(e) => setWeightLost(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Weight lost through sweat, sauna, bath, or other dehydration methods
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fightTime">Hours Until Fight</Label>
                  <Input
                    id="fightTime"
                    type="number"
                    placeholder="6"
                    value={fightTimeHours}
                    onChange={(e) => setFightTimeHours(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Time available for rehydration and recovery
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timing">Weigh-In Timing</Label>
                <Select value={weighInTiming} onValueChange={setWeighInTiming}>
                  <SelectTrigger id="timing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same-day">Same Day (4-6 hours before fight)</SelectItem>
                    <SelectItem value="day-before">Day Before (24+ hours before fight)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Generating Protocol..." : "Generate Rehydration Protocol"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Generated Protocol */}
        {protocol && (
          <>
            {/* Summary */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Wizard Protocol Summary
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProtocol(null);
                      handleGenerateProtocol(new Event('submit') as any);
                    }}
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/90 mb-4">{protocol.summary}</p>
                {protocol.warnings && protocol.warnings.length > 0 && (
                  <div className="space-y-2">
                    {protocol.warnings.map((warning, idx) => (
                      <Alert key={idx} className="border-warning">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">{warning}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Electrolyte Ratios */}
            <Card className="border-border/50">
              <CardHeader className="p-3 md:p-6">
                <CardTitle className="flex items-center gap-1 md:gap-2 text-sm md:text-base">
                  <Droplets className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  <span className="leading-tight">Electrolyte Solution Formula</span>
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Mix these ratios per 500ml of water</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="p-2 md:p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-[9px] md:text-xs text-muted-foreground mb-1">Sodium</p>
                    <p className="text-sm md:text-lg font-bold">{protocol.electrolyteRatio.sodium}</p>
                  </div>
                  <div className="p-2 md:p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-[9px] md:text-xs text-muted-foreground mb-1">Potassium</p>
                    <p className="text-sm md:text-lg font-bold">{protocol.electrolyteRatio.potassium}</p>
                  </div>
                  <div className="p-2 md:p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-[9px] md:text-xs text-muted-foreground mb-1">Magnesium</p>
                    <p className="text-sm md:text-lg font-bold">{protocol.electrolyteRatio.magnesium}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Two Column Layout for Rehydration and Carb Refuel */}
            <div className="grid grid-cols-2 gap-2 md:gap-6">
              {/* Oral Rehydration Timeline */}
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                <CardHeader className="p-3 md:p-6">
                  <CardTitle className="flex items-center gap-1 md:gap-2 text-sm md:text-base">
                    <Droplets className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    <span className="leading-tight">Oral Rehydration Solution Timeline</span>
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">Hour-by-hour fluid and electrolyte protocol</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 md:space-y-4">
                    {protocol.hourlyProtocol.map((step, idx) => (
                      <div key={idx} className="relative pl-6 md:pl-8 pb-2 md:pb-4 border-l-2 border-primary/30 last:border-transparent">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-0 -translate-x-[7px] md:-translate-x-[9px] w-3 h-3 md:w-4 md:h-4 rounded-full bg-primary border-2 md:border-4 border-background" />
                        
                        <div className="bg-card border border-border/50 rounded-lg p-2 md:p-4 hover:border-primary/50 transition-colors">
                          <div className="flex items-center justify-between mb-2 md:mb-3">
                            <Badge variant="outline" className="text-[10px] md:text-xs">
                              Hour {step.hour}
                            </Badge>
                            <span className="text-sm md:text-lg font-bold text-primary">{step.fluidML}ml</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 md:gap-3 mb-2 md:mb-3">
                            <div>
                              <p className="text-[9px] md:text-[10px] text-muted-foreground">Sodium</p>
                              <p className="text-xs md:text-sm font-semibold">{step.sodium}mg</p>
                            </div>
                            <div>
                              <p className="text-[9px] md:text-[10px] text-muted-foreground">Potassium</p>
                              <p className="text-xs md:text-sm font-semibold">{step.potassium}mg</p>
                            </div>
                          </div>
                          
                          <p className="text-[10px] md:text-xs text-muted-foreground border-t border-border/50 pt-2 md:pt-3">
                            {step.notes}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Carb Refuel Plan */}
              <Card className="border-success/30 bg-gradient-to-br from-success/5 to-success/10">
                <CardHeader className="p-3 md:p-6">
                  <CardTitle className="flex items-center gap-1 md:gap-2 text-sm md:text-base">
                    <Heart className="h-4 w-4 md:h-5 md:w-5 text-success" />
                    <span className="leading-tight">Carbohydrate Refuel Strategy</span>
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Target: {protocol.carbRefuelPlan.targetCarbs} | Total: {protocol.carbRefuelPlan.totalCarbs}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 md:space-y-4">
                    {protocol.carbRefuelPlan.meals.map((meal, idx) => (
                      <div key={idx} className="relative pl-6 md:pl-8 pb-2 md:pb-4 border-l-2 border-success/30 last:border-transparent">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-0 -translate-x-[7px] md:-translate-x-[9px] w-3 h-3 md:w-4 md:h-4 rounded-full bg-success border-2 md:border-4 border-background" />
                        
                        <div className="bg-card border border-border/50 rounded-lg p-2 md:p-4 hover:border-success/50 transition-colors">
                          <div className="flex items-center justify-between mb-2 md:mb-3">
                            <Badge variant="outline" className="text-[10px] md:text-xs border-success text-success">
                              {meal.timing}
                            </Badge>
                            <span className="text-sm md:text-lg font-bold text-success">{meal.carbsG}g</span>
                          </div>
                          
                          {meal.mealIdeas && meal.mealIdeas.length > 0 && (
                            <div className="mb-2 md:mb-3">
                              <p className="text-[9px] md:text-[10px] font-medium text-muted-foreground mb-1 md:mb-2">Meal Ideas:</p>
                              <div className="flex flex-wrap gap-1 md:gap-2">
                                {meal.mealIdeas.map((food, foodIdx) => (
                                  <Badge key={foodIdx} variant="secondary" className="text-[9px] md:text-[10px]">
                                    {food}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <p className="text-[10px] md:text-xs text-muted-foreground border-t border-border/50 pt-2 md:pt-3 italic">
                            {meal.rationale}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Important Notes */}
            <Card className="border-info bg-info/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4" />
                  Critical Reminders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>• Monitor urine color - aim for light yellow, not clear</p>
                <p>• Sip fluids gradually, don't chug large volumes</p>
                <p>• Listen to your body - adjust if experiencing nausea or bloating</p>
                <p>• Avoid high-fiber, high-fat foods until after competition</p>
                <p>• Keep electrolyte packets or sports drinks readily available</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
