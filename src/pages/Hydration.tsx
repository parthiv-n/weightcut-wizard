import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Droplets, Clock, Zap, AlertTriangle, Info, Heart } from "lucide-react";
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

interface CarbStep {
  timing: string;
  amount: string;
  foods: string[];
  rationale: string;
}

interface RehydrationProtocol {
  hourlyProtocol: HourlyStep[];
  electrolyteRatio: {
    sodium: string;
    potassium: string;
    magnesium: string;
  };
  carbReintroduction: CarbStep[];
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
  }, []);

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
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Wizard Protocol Summary
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="h-5 w-5 text-primary" />
                  Electrolyte Solution Formula
                </CardTitle>
                <CardDescription>Mix these ratios per 500ml of water</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-sm text-muted-foreground mb-1">Sodium</p>
                    <p className="text-2xl font-bold">{protocol.electrolyteRatio.sodium}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-sm text-muted-foreground mb-1">Potassium</p>
                    <p className="text-2xl font-bold">{protocol.electrolyteRatio.potassium}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-sm text-muted-foreground mb-1">Magnesium</p>
                    <p className="text-2xl font-bold">{protocol.electrolyteRatio.magnesium}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hourly Timeline */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Hour-by-Hour Rehydration Timeline
                </CardTitle>
                <CardDescription>Follow this protocol precisely for optimal recovery</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {protocol.hourlyProtocol.map((step, idx) => (
                    <div key={idx} className="relative pl-8 pb-6 border-l-2 border-primary/30 last:border-transparent">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-0 -translate-x-[9px] w-4 h-4 rounded-full bg-primary border-4 border-background" />
                      
                      <div className="bg-card border border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="outline" className="text-sm">
                            Hour {step.hour}
                          </Badge>
                          <span className="text-2xl font-bold text-primary">{step.fluidML}ml</span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Sodium</p>
                            <p className="font-semibold">{step.sodium}mg</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Potassium</p>
                            <p className="font-semibold">{step.potassium}mg</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Carbs</p>
                            <p className="font-semibold">{step.carbs}g</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {step.carbs > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                + Food
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground border-t border-border/50 pt-3">
                          {step.notes}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Carbohydrate Reintroduction */}
            <Card className="border-border/50 bg-gradient-to-br from-success/5 to-success/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-success" />
                  Carbohydrate Reintroduction Strategy
                </CardTitle>
                <CardDescription>Gradual fuel restoration for performance without GI distress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {protocol.carbReintroduction.map((step, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-card border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{step.timing}</h4>
                        <Badge variant="outline">{step.amount}</Badge>
                      </div>
                      
                      {step.foods && step.foods.length > 0 && (
                        <div className="mb-2">
                          <p className="text-sm font-medium text-muted-foreground mb-1">Recommended Foods:</p>
                          <div className="flex flex-wrap gap-2">
                            {step.foods.map((food, foodIdx) => (
                              <Badge key={foodIdx} variant="secondary" className="text-xs">
                                {food}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <p className="text-sm text-muted-foreground italic">{step.rationale}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

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
