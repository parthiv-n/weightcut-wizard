import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // Check AI usage limits (free: 1/day, premium: unlimited)
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
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

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
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
      .select("insight_type, insight_data, confidence_score")
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
You are the FightCamp Wizard — evidence-based sports nutrition specialist for combat athletes.

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

STYLE — you are a sports nutritionist writing a personalised protocol. Be specific with numbers. No filler.
- riskExplanation: 3-4 sentences. State the risk level and why. List 2-3 specific warning signs to watch for (e.g., strength dropping >10% on compounds, persistent dizziness during training, mood/sleep disruption, menstrual irregularity for females). State when the athlete should stop the cut and consult a sports doctor.
- strategicGuidance: 4-5 sentences. Explain the calorie strategy with training-day vs rest-day cycling (e.g., "Eat X kcal on training days, Y kcal on rest days"). Explain how to structure the deficit — front-load or back-load carbs around training, keep protein steady. Mention when to schedule a refeed day (every 7-10 days if deficit >500 kcal) and what that looks like (+300-500 kcal from carbs). Include hydration target (e.g., 40ml/kg bodyweight minimum).
- weeklyWorkflow: 3-4 steps for the weekly check-in process:
  Step 1: When/how to weigh — same day, morning, post-bathroom, pre-food. Take 3-day average to smooth out fluctuations.
  Step 2: Compare 3-day average to target. If ABOVE by >0.3kg, reduce daily intake by 100-200 kcal from carbs. If BELOW target or losing >1% bodyweight/week, increase by 100-150 kcal.
  Step 3: If weight stalls for 2+ weeks despite adherence, add 1-2 low-intensity cardio sessions (30 min walk/cycle) before reducing calories further.
  Step 4: If the cut exceeds 4 weeks, schedule a 2-day diet break at maintenance calories to restore leptin and training performance.
  Each step 2-3 sentences with specific numbers.
- trainingConsiderations: 4-5 sentences. Prioritise preserving compound lift strength (squat, deadlift, bench, overhead press) — keep intensity (% 1RM) high but reduce volume by 20-30%. Drop accessory/isolation volume first. Limit HIIT; prefer steady-state cardio (heart rate 120-140 bpm) to avoid CNS fatigue. If sparring or fight-specific training, schedule it on higher-calorie days. Consider a deload week every 3-4 weeks during an extended cut.
- timeline: 3-4 sentences. Break the cut into named phases (Aggressive Phase, Moderate Phase, Maintenance/Peak Week) with specific target weights per phase and calorie levels. Include expected rate of loss per phase. Mention when to transition between phases.
- weeklyPlan: each week value should be 30-50 words. Include training-day and rest-day calorie targets, protein target, recommended cardio, hydration note, and the target weight for the end of that week. Week 1 should be a slightly gentler start; Week 2 full deficit; Ongoing should describe the steady-state approach with adjustment triggers.

DO NOT include specific food recommendations (no meal suggestions, no food names). Focus on calorie/macro numbers, training adjustments, hydration, and the weekly monitoring workflow.

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
  "weeklyWorkflow": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
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
    edgeLogger.info("Calling Grok API for weight tracker analysis");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key and billing." }),
          { status: 402, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      edgeLogger.error("Groq API error", undefined, { functionName: "weight-tracker-analysis", status: response.status, errorText });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    edgeLogger.info("Groq weight tracker response received", { responseKeys: Object.keys(data) });

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different request.");
      throw new Error("No response from Groq API");
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
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("weight-tracker-analysis error", error, { functionName: "weight-tracker-analysis" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
