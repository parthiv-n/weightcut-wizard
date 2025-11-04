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

export default function FightWeek() {
  const [plan, setPlan] = useState<FightWeekPlan | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [newPlan, setNewPlan] = useState({ fight_date: "", starting_weight_kg: "", target_weight_kg: "" });
  const [selectedDate, setSelectedDate] = useState<string>("");
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
  const [aiGuidance, setAiGuidance] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    fetchPlanAndLogs();
  }, []);

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
      setNewPlan({ fight_date: "", starting_weight_kg: "", target_weight_kg: "" });
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
    } else {
      toast({ title: "Daily log saved!", description: "Your progress has been tracked." });
      fetchPlanAndLogs();
      setDailyLog({
        log_date: "",
        weight_kg: undefined,
        carbs_g: undefined,
        fluid_intake_ml: undefined,
        sweat_session_min: undefined,
        supplements: "",
        notes: ""
      });
    }
    setLoading(false);
  };

  const getAIGuidance = async (day: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !plan) return;

    setLoading(true);
    const currentLog = logs.find(l => l.log_date === format(addDays(new Date(plan.fight_date), -day), "yyyy-MM-dd"));
    
    const prompt = `Day ${day} of fight week. Target weight: ${plan.target_weight_kg}kg. Current weight: ${currentLog?.weight_kg || plan.starting_weight_kg}kg. Provide safe guidance for carb intake, hydration, and training.`;

    const { data, error } = await supabase.functions.invoke("wizard-chat", {
      body: { messages: [{ role: "user", content: prompt }] }
    });

    if (error) {
      toast({ title: "AI guidance unavailable", variant: "destructive" });
    } else {
      setAiGuidance(data?.response || "Focus on gradual carb reduction and maintaining hydration.");
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

  const getSafetyStatus = () => {
    if (!plan) return { status: "safe", message: "" };
    const latestLog = logs[logs.length - 1];
    if (!latestLog?.weight_kg) return { status: "safe", message: "Log your weight to get safety guidance" };

    const weeklyLoss = plan.starting_weight_kg - latestLog.weight_kg;
    const percentLoss = (weeklyLoss / plan.starting_weight_kg) * 100;

    if (percentLoss > 1.5) {
      return { status: "danger", message: "⚠️ Weight loss exceeds 1.5% weekly safe limit!" };
    } else if (percentLoss > 1.0) {
      return { status: "warning", message: "⚠️ Approaching safe weight loss limit" };
    }
    return { status: "safe", message: "✓ Weight loss is within safe limits" };
  };

  const getChartData = () => {
    return logs.map(log => ({
      date: format(new Date(log.log_date), "MMM dd"),
      weight: log.weight_kg
    }));
  };

  const daysUntilFight = getDaysUntilFight();
  const safetyStatus = getSafetyStatus();

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

      {/* Safety Alert */}
      {safetyStatus.status !== "safe" && (
        <Alert variant={safetyStatus.status === "danger" ? "destructive" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{safetyStatus.message}</AlertDescription>
        </Alert>
      )}

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weight Progress</CardTitle>
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
            {safetyStatus.status === "safe" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{safetyStatus.status}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Weekly loss within limits
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

      {/* AI Guidance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>AI Wizard Guidance</CardTitle>
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Get personalized daily guidance for safe weight cutting
          </p>
          {aiGuidance && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>{aiGuidance}</AlertDescription>
            </Alert>
          )}
          <Button onClick={() => getAIGuidance(daysUntilFight)} disabled={loading} variant="outline" className="w-full">
            {loading ? "Loading..." : "Get Today's Guidance"}
          </Button>
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