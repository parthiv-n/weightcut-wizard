import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const {
      currentWeight,
      goalWeight,
      targetDate,
      activityLevel,
      age,
      sex,
      heightCm,
      tdee,
      weighInDayWeight,
      weightHistory: clientWeightHistory
    } = await req.json();

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");

    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    // Use client-provided weight history if available (saves a DB round-trip)
    let weightHistory = clientWeightHistory;
    if (!weightHistory || !Array.isArray(weightHistory) || weightHistory.length === 0) {
      const { data: fetchedHistory } = await supabaseClient
        .from("weight_logs")
        .select("date, weight_kg")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(60);
      weightHistory = fetchedHistory;
    }

    // Fetch stored insights
    const { data: storedInsights } = await supabaseClient
      .from("user_insights")
      .select("*")
      .eq("user_id", user.id);

    // Calculate body adaptation patterns
    const calculatePatterns = (history: any[]) => {
      if (!history || history.length < 2) return null;

      const sorted = [...history].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const firstWeight = parseFloat(sorted[0].weight_kg);
      const lastWeight = parseFloat(sorted[sorted.length - 1].weight_kg);
      const daysDiff = (new Date(sorted[sorted.length - 1].date).getTime() -
        new Date(sorted[0].date).getTime()) / (1000 * 60 * 60 * 24);
      const weeksDiff = daysDiff / 7;
      const avgWeeklyLoss = weeksDiff > 0 ? (firstWeight - lastWeight) / weeksDiff : 0;

      let plateauDetected = false;
      if (sorted.length >= 7) {
        const recent = sorted.slice(-7);
        const weights = recent.map(w => parseFloat(w.weight_kg));
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        if (max - min < 0.3) plateauDetected = true;
      }

      const recent = sorted.slice(-14);
      let trend = "stable";
      if (recent.length >= 2) {
        const first = parseFloat(recent[0].weight_kg);
        const last = parseFloat(recent[recent.length - 1].weight_kg);
        const change = first - last;
        if (change > 0.5) trend = "declining";
        else if (change < -0.5) trend = "increasing";
      }

      return {
        avgWeeklyLoss: avgWeeklyLoss.toFixed(2),
        plateauDetected,
        trend,
        dataPoints: sorted.length,
        weightRange: `${lastWeight.toFixed(1)}-${firstWeight.toFixed(1)}kg`
      };
    };

    const patterns = calculatePatterns(weightHistory || []);

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);

    const weightDifference = goalWeight - currentWeight;
    const isMaintenanceMode = currentWeight <= goalWeight;
    const weightToGain = isMaintenanceMode && weightDifference > 0 ? weightDifference : 0;
    const weightToLose = !isMaintenanceMode && weightDifference < 0 ? Math.abs(weightDifference) : 0;
    const requiredWeeklyLoss = weightToLose > 0 ? weightToLose / weeksRemaining : 0;
    const requiredWeeklyGain = weightToGain > 0 ? weightToGain / weeksRemaining : 0;

    const systemPrompt = `You are a JSON API. Respond with ONLY the JSON object.
You are the Weight Cut Wizard — evidence-based sports nutrition specialist for combat athletes.

RULES:
- fightWeekTarget = diet-only target (fat loss). weighInWeight = final scale weight (water cut). These are DIFFERENT.
- IF currentWeight ≤ fightWeekTarget: calorieDeficit MUST be 0, recommendedCalories = TDEE (maintenance)
- IF currentWeight > fightWeekTarget: deficit 500-750 kcal/d (safe) or 750-1000 (aggressive), NEVER >1000
- Minimum calories: Males 1500, Females 1200
- RED-S risk: energy availability <30 kcal/kg FFM
- Weekly loss: GREEN ≤1.0 kg/wk, YELLOW 1.0-1.5, RED >1.5
- Protein: 2.0-2.5 g/kg | Carbs: scale with training | Fats: 20-30% total kcal
- ALWAYS generate a full plan regardless of how aggressive the goal is
- If requiredWeeklyLoss > 1.5: set riskLevel="red", include strong medical warning in riskExplanation urging consultation with a doctor/sports nutritionist, but still provide complete calorie/macro recommendations

STYLE — be brutally concise, every word must earn its place:
- riskExplanation: 1 sentence max. State risk level + the single most important reason.
- strategicGuidance: 2 sentences max. One actionable strategy, one specific tactic.
- nutritionTips: 3 short tips, each ≤8 words. Name specific foods/actions (e.g. "Greek yoghurt before bed for casein"), not generic advice.
- trainingConsiderations: 2 sentences max. Concrete adjustments only (e.g. "Drop sparring to 70% final week").
- timeline: 1-2 sentences max. Key milestones and dates only.
- weeklyPlan: each week value ≤15 words. Action-focused, no filler.

OUTPUT:
{
  "riskLevel": "green|yellow|red",
  "requiredWeeklyLoss": 0.8,
  "recommendedCalories": 2200,
  "calorieDeficit": 500,
  "proteinGrams": 160,
  "carbsGrams": 200,
  "fatsGrams": 70,
  "riskExplanation": "string",
  "strategicGuidance": "string",
  "nutritionTips": ["tip1", "tip2", "tip3"],
  "trainingConsiderations": "string",
  "timeline": "string",
  "weeklyPlan": { "week1": "string", "week2": "string", "ongoing": "string" }
}`;

    // Build compact user prompt
    const weightStatus = weightToGain > 0
      ? `GAIN ${weightToGain.toFixed(1)}kg (below target) | Required: +${requiredWeeklyGain.toFixed(2)} kg/wk`
      : weightToLose > 0
        ? `LOSE ${weightToLose.toFixed(1)}kg | Required: -${requiredWeeklyLoss.toFixed(2)} kg/wk`
        : `At target (maintenance)`;

    let userPrompt = `Weight strategy:
- Current: ${currentWeight}kg | Goal (fight week target): ${goalWeight}kg${weighInDayWeight ? ` | Weigh-in day: ${weighInDayWeight}kg (ref only)` : ''}
- Status: ${weightStatus}
- Timeline: ${daysRemaining}d (${weeksRemaining.toFixed(1)} weeks)
- TDEE: ${tdee} kcal | Activity: ${activityLevel} | ${sex}, ${age}y, ${heightCm}cm`;

    if (patterns) {
      userPrompt += `\n\nWEIGHT PATTERNS (${patterns.dataPoints} entries):
- Avg weekly loss: ${patterns.avgWeeklyLoss} kg/wk | Trend: ${patterns.trend} | Range: ${patterns.weightRange}
- Plateau: ${patterns.plateauDetected ? 'Yes (7+ days stable)' : 'No'}`;
    }

    if (storedInsights && storedInsights.length > 0) {
      const insightLines = storedInsights.map((insight: any) => {
        const d = insight.insight_data;
        const c = `${(insight.confidence_score * 100).toFixed(0)}%`;
        if (insight.insight_type === 'metabolism_rate') return `Metabolism: ${d.estimatedRate || 'N/A'} (${c})`;
        if (insight.insight_type === 'deficit_response') return `Deficit response: ${d.response || 'N/A'} (${c})`;
        if (insight.insight_type === 'weekly_loss_rate') return `Weekly rate: ${d.rate || 'N/A'} kg/wk (${c})`;
        return null;
      }).filter(Boolean);
      if (insightLines.length > 0) userPrompt += `\n\nSTORED INSIGHTS:\n- ${insightLines.join('\n- ')}`;
    }

    if (isMaintenanceMode) {
      userPrompt += `\n\nMAINTENANCE MODE: At/below target. calorieDeficit=0, recommendedCalories=TDEE(${tdee}).${weightToGain > 0 ? ` Gain ${weightToGain.toFixed(1)}kg via maintenance calories, not surplus.` : ''}`;
    }

    // Call Grok API
    console.log("Calling Grok API for weight tracker analysis...");
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 1000
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key and billing." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Grok API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Grok weight tracker response:", JSON.stringify(data, null, 2));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different request.");
      throw new Error("No response from Grok API");
    }

    const analysis = parseJSON(content);

    // Calculate and store insights
    const insightsToStore: Array<{
      user_id: string;
      insight_type: string;
      insight_data: Record<string, any>;
      confidence_score: number;
      updated_at: string;
    }> = [];

    const now = new Date().toISOString();

    if (patterns && parseFloat(patterns.avgWeeklyLoss) !== 0) {
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'weekly_loss_rate',
        insight_data: { rate: parseFloat(patterns.avgWeeklyLoss), dataPoints: patterns.dataPoints, trend: patterns.trend },
        confidence_score: Math.min(0.9, 0.5 + (patterns.dataPoints / 60) * 0.4),
        updated_at: now
      });
    }

    if (analysis.recommendedCalories && analysis.calorieDeficit !== undefined) {
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'metabolism_rate',
        insight_data: { estimatedRate: analysis.recommendedCalories + analysis.calorieDeficit, recommendedCalories: analysis.recommendedCalories, deficit: analysis.calorieDeficit },
        confidence_score: 0.6,
        updated_at: now
      });

      if (analysis.calorieDeficit > 0) {
        insightsToStore.push({
          user_id: user.id,
          insight_type: 'deficit_response',
          insight_data: { deficit: analysis.calorieDeficit, weeklyLoss: analysis.requiredWeeklyLoss || 0, response: patterns ? `Historical: ${patterns.avgWeeklyLoss} kg/week` : 'No historical data' },
          confidence_score: 0.5,
          updated_at: now
        });
      }
    }

    if (patterns) {
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'body_adaptation',
        insight_data: { avgWeeklyLoss: parseFloat(patterns.avgWeeklyLoss), plateauDetected: patterns.plateauDetected, trend: patterns.trend, weightRange: patterns.weightRange },
        confidence_score: Math.min(0.8, 0.4 + (patterns.dataPoints / 60) * 0.4),
        updated_at: now
      });
    }

    // Batch upsert all insights at once
    if (insightsToStore.length > 0) {
      await supabaseClient
        .from("user_insights")
        .upsert(insightsToStore, { onConflict: 'user_id,insight_type' });
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in weight-tracker-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
