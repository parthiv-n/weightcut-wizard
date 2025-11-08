import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, addDays } from "date-fns";
import { Calendar, Droplets, TrendingDown, AlertTriangle, CheckCircle, Activity, Sparkles } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import wizardLogo from "@/assets/wizard-logo.png";

interface FightWeekPlan {
  id: string;
  fight_date: string;
  starting_weight_kg: number;
  target_weight_kg: number;
}

interface DailyLog {
  id?: string;
  log_date: string;
  weight_kg?: number;
  carbs_g?: number;
  fluid_intake_ml?: number;
  sweat_session_min?: number;
  supplements?: string;
  notes?: string;
}

interface AIAnalysis {
  riskLevel: "green" | "yellow" | "red";
  riskPercentage: number;
  weightRemaining: number;
  dehydrationRequired: number;
  carbDepletionEstimate: number;
  isOnTrack: boolean;
  progressStatus: string;
  dailyAnalysis: string;
  adaptations: string[];
  riskExplanation: string;
  recommendation: string;
}

export default function FightWeek() {
  const [plan, setPlan] = useState<FightWeekPlan | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [newPlan, setNewPlan] = useState({ fight_date: "", starting_weight_kg: "", target_weight_kg: "", is_waterloading: false });
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isWaterloading, setIsWaterloading] = useState(false);
  const [dailyLog, setDailyLog] = useState<DailyLog>({
    log_date: "",
    weight_kg: undefined,
    carbs_g: undefined,
    fluid_intake_ml: undefined,
    sweat_session_min: undefined,
    supplements: "",
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    fetchPlanAndLogs();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile(data);
      // Pre-populate the form with profile data
      setNewPlan(prev => ({
        ...prev,
        starting_weight_kg: prev.starting_weight_kg || data.current_weight_kg?.toString() || "",
        target_weight_kg: prev.target_weight_kg || data.goal_weight_kg?.toString() || ""
      }));
    }
  };

  const fetchPlanAndLogs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: planData } = await supabase
      .from("fight_week_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (planData) {
      setPlan(planData);
      
      const { data: logsData } = await supabase
        .from("fight_week_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("log_date", { ascending: true });
      
      setLogs(logsData || []);
    }
  };

  const createPlan = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    setIsWaterloading(newPlan.is_waterloading);
    
    const { error } = await supabase.from("fight_week_plans").insert({
      user_id: user.id,
      fight_date: newPlan.fight_date,
      starting_weight_kg: parseFloat(newPlan.starting_weight_kg),
      target_weight_kg: parseFloat(newPlan.target_weight_kg)
    });

    if (error) {
      toast({ title: "Error creating plan", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fight week plan created!", description: "Your countdown has started." });
      fetchPlanAndLogs();
      setNewPlan({ fight_date: "", starting_weight_kg: "", target_weight_kg: "", is_waterloading: false });
    }
    setLoading(false);
  };

  const saveDailyLog = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !dailyLog.log_date) return;

    setLoading(true);
    const logData = {
      user_id: user.id,
      log_date: dailyLog.log_date,
      weight_kg: dailyLog.weight_kg || null,
      carbs_g: dailyLog.carbs_g || null,
      fluid_intake_ml: dailyLog.fluid_intake_ml || null,
      sweat_session_min: dailyLog.sweat_session_min || null,
      supplements: dailyLog.supplements || null,
      notes: dailyLog.notes || null
    };

    const { error } = await supabase
      .from("fight_week_logs")
      .upsert(logData, { onConflict: "user_id,log_date" });

    if (error) {
      toast({ title: "Error saving log", description: error.message, variant: "destructive" });
      setLoading(false);
    } else {
      toast({ title: "Daily log saved!", description: "Your progress has been tracked." });
      
      // First refresh the logs display
      await fetchPlanAndLogs();
      
      // Then trigger AI analysis with fresh data if weight was logged
      if (dailyLog.weight_kg && plan) {
        await getAIAnalysis();
      }
      
      setDailyLog({
        log_date: "",
        weight_kg: undefined,
        carbs_g: undefined,
        fluid_intake_ml: undefined,
        sweat_session_min: undefined,
        supplements: "",
        notes: ""
      });
      setLoading(false);
    }
  };

  const getAIAnalysis = async () => {
    if (!plan) return;

    setLoading(true);
    
    // Fetch fresh logs from database to ensure we have the latest weight
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: freshLogs } = await supabase
      .from("fight_week_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("log_date", { ascending: true });

    if (!freshLogs || freshLogs.length === 0) {
      setLoading(false);
      return;
    }

    // Get the latest log entry (most recent date with weight)
    const logsWithWeight = freshLogs.filter(log => log.weight_kg !== null);
    const latestLog = logsWithWeight[logsWithWeight.length - 1];
    const currentWeight = latestLog?.weight_kg || plan.starting_weight_kg;

    console.log("AI Analysis - Using current weight:", currentWeight, "from date:", latestLog?.log_date);

    const { data, error } = await supabase.functions.invoke("fight-week-analysis", {
      body: {
        currentWeight,
        targetWeight: plan.target_weight_kg,
        daysUntilFight: getDaysUntilFight(),
        dailyLogs: freshLogs,
        startingWeight: plan.starting_weight_kg,
        isWaterloading
      }
    });

    if (error) {
      console.error("AI analysis error:", error);
      toast({ title: "AI analysis unavailable", description: error.message, variant: "destructive" });
    } else if (data?.analysis) {
      console.log("AI Analysis received:", data.analysis);
      setAiAnalysis(data.analysis);
    }
    setLoading(false);
  };

  const getDaysUntilFight = () => {
    if (!plan) return 0;
    return differenceInDays(new Date(plan.fight_date), new Date());
  };

  const getWeightProgress = () => {
    if (!plan) return 0;
    const latestLog = logs[logs.length - 1];
    const currentWeight = latestLog?.weight_kg || plan.starting_weight_kg;
    const totalLoss = plan.starting_weight_kg - plan.target_weight_kg;
    const currentLoss = plan.starting_weight_kg - currentWeight;
    return (currentLoss / totalLoss) * 100;
  };

  const getWeightCutBreakdown = () => {
    if (!plan) return null;
    
    const latestLog = logs[logs.length - 1];
    const currentWeight = latestLog?.weight_kg || plan.starting_weight_kg;
    const totalWeightToCut = currentWeight - plan.target_weight_kg;
    
    // Scientific calculations
    const glycogenWaterWeight = 2.0; // ~2kg from glycogen depletion + water
    const safeDehydration = currentWeight * 0.03; // 3% max safe dehydration
    const maxSafeCut = glycogenWaterWeight + safeDehydration;
    
    const isSafe = totalWeightToCut <= maxSafeCut;
    const percentBodyweight = (totalWeightToCut / currentWeight) * 100;
    
    let status: "safe" | "warning" | "danger";
    let message: string;
    let wizardAdvice: string;
    
    if (percentBodyweight <= 5) {
      status = "safe";
      message = "Safe and manageable weight cut";
      wizardAdvice = "Your weight cut is well within safe limits. Focus on gradual carb reduction starting 5 days out, maintain hydration until 24h before weigh-in, then implement controlled water loading/cutting protocol.";
    } else if (percentBodyweight <= 8) {
      status = "warning";
      message = "Aggressive but doable with proper protocol";
      wizardAdvice = "This is an aggressive cut that requires precise execution. You'll need to maximize glycogen depletion through carb restriction and strategic dehydration. Monitor your energy levels closely and consider extending your cut timeline if possible.";
    } else {
      status = "danger";
      message = "DANGEROUS - Exceeds safe limits";
      wizardAdvice = "⚠️ WARNING: This weight cut exceeds safe physiological limits and poses serious health risks including cognitive impairment, reduced performance, and potential medical complications. Strongly recommend reconsidering your target weight or fight timeline.";
    }
    
    return {
      totalWeightToCut,
      glycogenWaterWeight,
      safeDehydration,
      maxSafeCut,
      isSafe,
      status,
      message,
      percentBodyweight,
      wizardAdvice,
      currentWeight
    };
  };

  const getChartData = () => {
    return logs.map(log => ({
      date: format(new Date(log.log_date), "MMM dd"),
      weight: log.weight_kg
    }));
  };

  const daysUntilFight = getDaysUntilFight();
  const weightCutInfo = getWeightCutBreakdown();

  if (!plan) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-title font-bold">Fight Week Schedule</h1>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Create Your Fight Week Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fight_date">Fight Date</Label>
              <Input
                id="fight_date"
                type="date"
                value={newPlan.fight_date}
                onChange={(e) => setNewPlan({ ...newPlan, fight_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="starting_weight">Current Weight (kg)</Label>
              <Input
                id="starting_weight"
                type="number"
                step="0.1"
                value={newPlan.starting_weight_kg}
                onChange={(e) => setNewPlan({ ...newPlan, starting_weight_kg: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_weight">Target Weigh-in Weight (kg)</Label>
              <Input
                id="target_weight"
                type="number"
                step="0.1"
                value={newPlan.target_weight_kg}
                onChange={(e) => setNewPlan({ ...newPlan, target_weight_kg: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="waterloading"
                checked={newPlan.is_waterloading}
                onChange={(e) => setNewPlan({ ...newPlan, is_waterloading: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="waterloading" className="cursor-pointer">
                I will be water loading (increases safe cut capacity by 2-3kg)
              </Label>
            </div>
            <Button onClick={createPlan} disabled={loading} className="w-full">
              {loading ? "Creating..." : "Start Fight Week"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-title font-bold">Fight Week</h1>
            <p className="text-muted-foreground">
              {daysUntilFight} days until {format(new Date(plan.fight_date), "MMMM dd, yyyy")}
            </p>
          </div>
        </div>
      </div>

      {/* AI-Powered Adaptive Analysis */}
      {aiAnalysis && (
        <Card className={`border-2 ${
          aiAnalysis.riskLevel === 'green' ? 'border-green-500/50 bg-green-500/5' :
          aiAnalysis.riskLevel === 'yellow' ? 'border-yellow-500/50 bg-yellow-500/5' :
          'border-red-500/50 bg-red-500/5'
        }`}>
          <CardHeader>
            <div className="flex items-start gap-4">
              <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Weight Cut Analysis
                </CardTitle>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-2xl font-bold uppercase ${
                    aiAnalysis.riskLevel === 'green' ? 'text-green-600 dark:text-green-400' :
                    aiAnalysis.riskLevel === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {aiAnalysis.riskLevel === 'green' ? 'SAFE' : 
                     aiAnalysis.riskLevel === 'yellow' ? 'MODERATE RISK' : 'HIGH RISK'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({aiAnalysis.riskPercentage.toFixed(1)}% of body weight)
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Weight Remaining:</span>
                  <span className="font-semibold">{aiAnalysis.weightRemaining.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Via Carb Depletion:</span>
                  <span className="font-semibold">~{aiAnalysis.carbDepletionEstimate.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Via Dehydration:</span>
                  <span className="font-semibold">~{aiAnalysis.dehydrationRequired.toFixed(1)} kg</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress Status:</span>
                  <span className={`font-semibold ${
                    aiAnalysis.isOnTrack ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {aiAnalysis.progressStatus}
                  </span>
                </div>
                {isWaterloading && (
                  <div className="flex items-center gap-2 text-sm">
                    <Droplets className="h-4 w-4 text-blue-500" />
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">Water Loading Active</span>
                  </div>
                )}
              </div>
            </div>

            <Alert className={
              aiAnalysis.riskLevel === 'green' ? 'border-green-500/50' :
              aiAnalysis.riskLevel === 'yellow' ? 'border-yellow-500/50' :
              'border-red-500/50'
            }>
              <Sparkles className="h-4 w-4" />
              <AlertDescription className="text-sm space-y-2">
                <p><strong>Risk Assessment:</strong> {aiAnalysis.riskExplanation}</p>
                <p><strong>Daily Analysis:</strong> {aiAnalysis.dailyAnalysis}</p>
              </AlertDescription>
            </Alert>

            {aiAnalysis.adaptations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Recommended Adaptations:</h4>
                <ul className="space-y-1">
                  {aiAnalysis.adaptations.map((adaptation, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                      <span>{adaptation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Strategic Recommendation:</strong> {aiAnalysis.recommendation}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {!aiAnalysis && logs.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={getAIAnalysis} disabled={loading} className="w-full">
              {loading ? "Analyzing..." : "Get AI Analysis"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Weight</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs[logs.length - 1]?.weight_kg || plan.starting_weight_kg}kg</div>
            <Progress value={getWeightProgress()} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Target: {plan.target_weight_kg}kg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Hydration</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logs.find(l => l.log_date === format(new Date(), "yyyy-MM-dd"))?.fluid_intake_ml || 0}ml
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Recommended: 2000-3000ml/day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Safety Status</CardTitle>
            {weightCutInfo && (
              weightCutInfo.status === "safe" ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : weightCutInfo.status === "warning" ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold capitalize ${
              weightCutInfo?.status === 'safe' ? 'text-green-600 dark:text-green-400' :
              weightCutInfo?.status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {weightCutInfo?.status}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {weightCutInfo?.isSafe ? 'Within safe limits' : 'Exceeds safe guidelines'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weight Trend Chart */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={getChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip />
                <ReferenceLine y={plan.target_weight_kg} stroke="hsl(var(--primary))" strokeDasharray="3 3" label="Target" />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Daily Log Entry */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Log Daily Progress</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="log_date">Date</Label>
              <Input
                id="log_date"
                type="date"
                value={dailyLog.log_date}
                onChange={(e) => setDailyLog({ ...dailyLog, log_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                value={dailyLog.weight_kg || ""}
                onChange={(e) => setDailyLog({ ...dailyLog, weight_kg: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carbs">Carbs (g)</Label>
              <Input
                id="carbs"
                type="number"
                value={dailyLog.carbs_g || ""}
                onChange={(e) => setDailyLog({ ...dailyLog, carbs_g: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fluid">Fluid Intake (ml)</Label>
              <Input
                id="fluid"
                type="number"
                value={dailyLog.fluid_intake_ml || ""}
                onChange={(e) => setDailyLog({ ...dailyLog, fluid_intake_ml: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sweat">Sweat Session (min)</Label>
              <Input
                id="sweat"
                type="number"
                value={dailyLog.sweat_session_min || ""}
                onChange={(e) => setDailyLog({ ...dailyLog, sweat_session_min: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplements">Supplements</Label>
              <Input
                id="supplements"
                value={dailyLog.supplements || ""}
                onChange={(e) => setDailyLog({ ...dailyLog, supplements: e.target.value })}
                placeholder="Electrolytes, vitamins, etc."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={dailyLog.notes || ""}
              onChange={(e) => setDailyLog({ ...dailyLog, notes: e.target.value })}
              placeholder="How are you feeling? Energy levels, hunger, training notes..."
              rows={3}
            />
          </div>
          <Button onClick={saveDailyLog} disabled={loading || !dailyLog.log_date} className="w-full">
            {loading ? "Saving..." : "Save Daily Log"}
          </Button>
        </CardContent>
      </Card>

      {/* Waterload Protocol Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Water Loading Protocol</CardTitle>
            <Droplets className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="waterload-toggle"
              checked={isWaterloading}
              onChange={(e) => {
                setIsWaterloading(e.target.checked);
                toast({ 
                  title: e.target.checked ? "Water loading enabled" : "Water loading disabled",
                  description: e.target.checked 
                    ? "This increases safe dehydration capacity by 2-3kg. Update AI analysis to reflect changes." 
                    : "Standard carb depletion + 3% dehydration protocol."
                });
              }}
              className="rounded"
            />
            <Label htmlFor="waterload-toggle" className="cursor-pointer">
              I am water loading (increases safe cut by 2-3kg)
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Water loading involves drinking increased amounts of water in the days before cutting to enhance natural diuresis. When enabled, this adjusts your AI analysis to account for the additional 2-3kg safe dehydration capacity.
          </p>
        </CardContent>
      </Card>

      {/* Safety Guidelines */}
      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Safety Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>• Maximum safe weight loss: 1kg/week or 1.5% bodyweight/week</p>
          <p>• Dehydration limits: &lt;2% in training, &lt;3% in single sweat session</p>
          <p>• Post weigh-in: Replace 150% fluid lost, electrolytes essential</p>
          <p>• Carb refeeding: 5-10g/kg/day, small frequent meals</p>
          <p>• Never use diuretics, plastics, or extreme caloric restriction</p>
          <p>• Stop immediately if experiencing: dizziness, extreme fatigue, confusion</p>
        </CardContent>
      </Card>
    </div>
  );
}