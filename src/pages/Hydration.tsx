import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Droplets, AlertTriangle, CheckCircle, Zap, Heart, Info, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HydrationLog {
  id: string;
  date: string;
  amount_ml: number;
  sodium_mg?: number;
  sweat_loss_percent?: number;
  training_weight_pre?: number;
  training_weight_post?: number;
  notes?: string;
}

interface Profile {
  current_weight_kg: number;
  target_date: string;
  activity_level: string;
}

export default function Hydration() {
  const [logs, setLogs] = useState<HydrationLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayIntake, setTodayIntake] = useState(0);
  const [todaySodium, setTodaySodium] = useState(0);
  const [aiInsight, setAiInsight] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Form state
  const [amountMl, setAmountMl] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [weightPre, setWeightPre] = useState("");
  const [weightPost, setWeightPost] = useState("");
  const [notes, setNotes] = useState("");
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    // Fetch hydration logs
    const { data: logsData } = await supabase
      .from("hydration_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(30);

    if (logsData) {
      setLogs(logsData);
      
      // Calculate today's totals
      const today = format(new Date(), "yyyy-MM-dd");
      const todayLogs = logsData.filter((log) => log.date === today);
      const totalMl = todayLogs.reduce((sum, log) => sum + log.amount_ml, 0);
      const totalSodium = todayLogs.reduce((sum, log) => sum + (log.sodium_mg || 0), 0);
      
      setTodayIntake(totalMl);
      setTodaySodium(totalSodium);
    }

    // Fetch AI insights
    fetchAIInsights();
  };

  const fetchAIInsights = async () => {
    if (!profile) return;

    const daysToWeighIn = Math.ceil(
      (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    const recentLogs = logs.slice(0, 7).map(log => 
      `${log.date}: ${(log.amount_ml / 1000).toFixed(1)}L, ${log.sodium_mg || 0}mg sodium${
        log.sweat_loss_percent ? `, ${log.sweat_loss_percent.toFixed(1)}% sweat loss` : ""
      }`
    ).join("; ");

    try {
      const { data, error } = await supabase.functions.invoke("hydration-insights", {
        body: {
          hydrationData: {
            dailyTarget: getDailyTarget(),
            currentIntake: (todayIntake / 1000).toFixed(1),
            sodiumToday: todaySodium,
            sweatLoss: logs[0]?.sweat_loss_percent,
          },
          profileData: {
            daysToWeighIn,
            activityLevel: profile.activity_level,
          },
          recentLogs,
        },
      });

      if (error) throw error;
      if (data?.insight) {
        setAiInsight(data.insight);
      }
    } catch (error) {
      console.error("Error fetching AI insights:", error);
    }
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Calculate sweat loss if weights provided
    let sweatLossPercent = null;
    if (weightPre && weightPost) {
      const pre = parseFloat(weightPre);
      const post = parseFloat(weightPost);
      sweatLossPercent = ((pre - post) / pre) * 100;

      // Safety check
      if (sweatLossPercent > 3) {
        toast({
          title: "⚠️ Dangerous Dehydration Detected",
          description: "Sweat loss exceeds 3% - high risk to performance and safety. Rehydrate immediately!",
          variant: "destructive",
        });
      } else if (sweatLossPercent > 2) {
        toast({
          title: "Caution: Elevated Sweat Loss",
          description: "Sweat loss exceeds 2%. Monitor hydration closely and increase fluid intake.",
          variant: "default",
        });
      }
    }

    const { error } = await supabase.from("hydration_logs").insert({
      user_id: user.id,
      date: logDate,
      amount_ml: parseInt(amountMl),
      sodium_mg: sodiumMg ? parseInt(sodiumMg) : null,
      training_weight_pre: weightPre ? parseFloat(weightPre) : null,
      training_weight_post: weightPost ? parseFloat(weightPost) : null,
      sweat_loss_percent: sweatLossPercent,
      notes: notes || null,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to log hydration data",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Logged",
        description: "Hydration entry recorded",
      });
      
      // Reset form
      setAmountMl("");
      setSodiumMg("");
      setWeightPre("");
      setWeightPost("");
      setNotes("");
      
      fetchData();
    }

    setLoading(false);
  };

  const getDailyTarget = () => {
    if (!profile) return "3.0";
    // 35ml/kg baseline, adjusted by activity
    const activityMultiplier = {
      "Sedentary": 0.9,
      "Lightly Active": 1.0,
      "Moderately Active": 1.1,
      "Very Active": 1.2,
      "Extra Active": 1.3,
    }[profile.activity_level] || 1.0;

    return ((profile.current_weight_kg * 35 * activityMultiplier) / 1000).toFixed(1);
  };

  const getHydrationProgress = () => {
    const target = parseFloat(getDailyTarget()) * 1000;
    return Math.min(100, (todayIntake / target) * 100);
  };

  const getHydrationStatus = () => {
    const progress = getHydrationProgress();
    if (progress >= 90) return { color: "text-success", label: "Optimal", icon: CheckCircle };
    if (progress >= 70) return { color: "text-primary", label: "Good", icon: Droplets };
    if (progress >= 50) return { color: "text-warning", label: "Below Target", icon: AlertTriangle };
    return { color: "text-danger", label: "Dehydrated", icon: AlertTriangle };
  };

  const getSodiumGuidance = () => {
    if (!profile) return { min: 1500, max: 3500 };
    const daysToWeighIn = Math.ceil(
      (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysToWeighIn <= 3) {
      return { min: 1000, max: 2500, phase: "Fight Week Taper" };
    }
    return { min: 1500, max: 3500, phase: "Training Phase" };
  };

  const status = getHydrationStatus();
  const StatusIcon = status.icon;
  const sodiumGuidance = getSodiumGuidance();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Hydration & Sodium</h1>
          <p className="text-muted-foreground mt-2">Safe, science-based hydration management for peak performance</p>
        </div>

        {/* Critical Warnings */}
        {logs[0]?.sweat_loss_percent && logs[0].sweat_loss_percent > 3 && (
          <Alert variant="destructive" className="border-danger">
            <AlertTriangle className="h-5 w-5" />
            <AlertDescription className="font-medium">
              <strong>Critical Alert:</strong> Recent training session showed {logs[0].sweat_loss_percent.toFixed(1)}% dehydration. 
              This is dangerous territory. Rehydrate immediately with electrolytes and reduce training intensity until recovered.
            </AlertDescription>
          </Alert>
        )}

        {/* Daily Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50 bg-gradient-to-br from-card to-card/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Daily Target</p>
                  <p className="text-3xl font-bold">{getDailyTarget()}L</p>
                </div>
                <Droplets className="h-10 w-10 text-primary opacity-70 flex-shrink-0" />
              </div>
              <Progress value={getHydrationProgress()} className="h-3 mb-2" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-sm text-muted-foreground truncate">
                  {(todayIntake / 1000).toFixed(2)}L consumed
                </span>
                <Badge variant={status.color === "text-success" ? "default" : "secondary"} className="gap-1 w-fit flex-shrink-0">
                  <StatusIcon className={`h-3 w-3 ${status.color}`} />
                  <span className="whitespace-nowrap">{status.label}</span>
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sodium Today</p>
                  <p className="text-3xl font-bold">{todaySodium}mg</p>
                </div>
                <Zap className="h-10 w-10 text-warning opacity-70" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{sodiumGuidance.phase}</p>
                <p className="text-sm font-medium">
                  Target: {sodiumGuidance.min}–{sodiumGuidance.max}mg
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground inline" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Sodium is essential for performance. Never eliminate it completely. Gradual adjustments only.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Hydration Streak</p>
                  <p className="text-3xl font-bold">{logs.length > 0 ? logs.length : 0}</p>
                </div>
                <Heart className="h-10 w-10 text-success opacity-70" />
              </div>
              <p className="text-sm text-muted-foreground">Days logged this month</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Insight */}
        {aiInsight && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                Wizard Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground/90">{aiInsight}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Log Entry Form */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Log Hydration</CardTitle>
              <CardDescription>Track fluids, electrolytes, and training sweat loss</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddLog} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (ml)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="500"
                      value={amountMl}
                      onChange={(e) => setAmountMl(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sodium">Sodium (mg)</Label>
                    <Input
                      id="sodium"
                      type="number"
                      placeholder="Optional"
                      value={sodiumMg}
                      onChange={(e) => setSodiumMg(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    required
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Sweat Loss Tracking (Optional)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weightPre">Pre-Training (kg)</Label>
                      <Input
                        id="weightPre"
                        type="number"
                        step="0.1"
                        placeholder="75.5"
                        value={weightPre}
                        onChange={(e) => setWeightPre(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weightPost">Post-Training (kg)</Label>
                      <Input
                        id="weightPost"
                        type="number"
                        step="0.1"
                        placeholder="74.8"
                        value={weightPost}
                        onChange={(e) => setWeightPost(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Training type, how you felt, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Logging..." : "Log Entry"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Post-Weigh-In Recovery */}
          <Card className="border-border/50 bg-gradient-to-br from-success/5 to-success/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Post-Weigh-In Recovery
              </CardTitle>
              <CardDescription>Scientific rehydration and refueling protocol</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-success mt-2" />
                  <div>
                    <p className="font-medium">Fluids: Replace 150% of weight lost</p>
                    <p className="text-sm text-muted-foreground">
                      If you cut 2kg, drink 3L over 4-6 hours
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-success mt-2" />
                  <div>
                    <p className="font-medium">Electrolytes + Sodium</p>
                    <p className="text-sm text-muted-foreground">
                      Sports drinks, electrolyte packets, or coconut water
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-success mt-2" />
                  <div>
                    <p className="font-medium">Carbs: 5-10g/kg body weight</p>
                    <p className="text-sm text-muted-foreground">
                      Rice, pasta, bananas, energy drinks
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-success mt-2" />
                  <div>
                    <p className="font-medium">Small, frequent meals</p>
                    <p className="text-sm text-muted-foreground">
                      Easy to digest, avoid heavy fats initially
                    </p>
                  </div>
                </div>
              </div>

              <Alert className="bg-success/10 border-success/30">
                <CheckCircle className="h-4 w-4 text-success" />
                <AlertDescription className="text-sm">
                  Start immediately after weigh-in. Your body needs 4-6 hours to fully recover performance capacity.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        {/* Educational Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                Safe Water Manipulation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Gradual water reduction only in final 24-48h. Never cut water early. Maintain hydration during training phases.</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Dehydration Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Training dehydration &gt;2% impairs performance. &gt;3% is dangerous. Monitor pre/post training weights.</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                Sodium Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Never eliminate sodium completely. Gradual reduction in fight week only. Essential for muscle function.</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Logs */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Recent Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Droplets className="h-4 w-4 text-primary" />
                      <div>
                        <p className="font-medium text-sm">{format(new Date(log.date), "MMM dd, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">
                          {(log.amount_ml / 1000).toFixed(2)}L
                          {log.sodium_mg && ` • ${log.sodium_mg}mg sodium`}
                          {log.sweat_loss_percent && (
                            <span className={log.sweat_loss_percent > 2 ? "text-warning font-medium" : ""}>
                              {` • ${log.sweat_loss_percent.toFixed(1)}% sweat loss`}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    {log.sweat_loss_percent && log.sweat_loss_percent > 3 && (
                      <AlertTriangle className="h-5 w-5 text-danger" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No hydration logs yet. Start tracking to get personalized insights!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}