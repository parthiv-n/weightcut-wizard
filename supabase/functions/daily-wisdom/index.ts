import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
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
      fightWeekTarget,
      targetDate,
      tdee,
      bmr,
      activityLevel,
      age,
      sex,
      heightCm,
      aiRecommendedCalories,
      todayCalories,
      dailyCalorieGoal,
      weightHistory,
    } = await req.json();

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(0.14, daysRemaining / 7);

    const dietTarget = fightWeekTarget ?? goalWeight;
    const weightToLose = Math.max(0, currentWeight - dietTarget);
    const requiredWeeklyKg = weightToLose > 0 ? weightToLose / weeksRemaining : 0;

    const calorieGoal = aiRecommendedCalories ?? dailyCalorieGoal;
    const caloriePercentage = calorieGoal > 0 ? (todayCalories / calorieGoal) * 100 : 0;

    // Pre-compute weeklyPaceKg from weight history
    const last7 = Array.isArray(weightHistory) ? weightHistory.slice(-7) : [];
    const historyText = last7.length > 0
      ? last7.map((l: any) => `${l.date}: ${l.weight_kg}kg`).join(', ')
      : 'No recent logs';

    let weeklyPaceKg = 0;
    if (last7.length >= 2) {
      const sorted = [...last7].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const firstW = parseFloat(sorted[0].weight_kg);
      const lastW = parseFloat(sorted[sorted.length - 1].weight_kg);
      const days = (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / (1000 * 60 * 60 * 24);
      if (days > 0) weeklyPaceKg = ((firstW - lastW) / days) * 7;
    }

    // Pre-compute paceStatus
    let paceStatus = "at_target";
    if (requiredWeeklyKg > 0) {
      if (weeklyPaceKg >= requiredWeeklyKg * 1.1) paceStatus = "ahead";
      else if (weeklyPaceKg >= requiredWeeklyKg * 0.9) paceStatus = "on_track";
      else paceStatus = "behind";
    }

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON.
You are the Weight Cut Wizard — evidence-based fight sports nutritionist.

RULES:
- Reference actual numbers (kg, kcal, days) in advice
- riskLevel: "orange" if requiredWeeklyKg > 1.0, else "green"
- summary: ≤15 words
- adviceParagraph: 2-3 sentences, personalised
- actionItems: exactly 3 short actionable items

OUTPUT:
{
  "summary": "string",
  "riskLevel": "green|orange",
  "riskReason": "string",
  "adviceParagraph": "string",
  "actionItems": ["item1", "item2", "item3"],
  "nutritionStatus": "string"
}`;

    const userPrompt = `Athlete snapshot:
- Weight: ${currentWeight}kg → Diet target: ${dietTarget}kg → Weigh-in: ${goalWeight}kg
- Days left: ${daysRemaining} | Required: ${requiredWeeklyKg.toFixed(2)} kg/wk | Pace: ${weeklyPaceKg.toFixed(2)} kg/wk (${paceStatus})
- TDEE: ${tdee ?? 'unknown'}${bmr ? ` | BMR: ${bmr}` : ''} | Activity: ${activityLevel ?? 'unknown'}
- ${sex ?? 'unknown'}, ${age ?? 'unknown'}y, ${heightCm ?? 'unknown'}cm
- Today: ${todayCalories} / ${calorieGoal} kcal (${caloriePercentage.toFixed(0)}%)
- Last 7 logs: ${historyText}`;

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
        temperature: 0.3,
        max_completion_tokens: 500,
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
    console.log("Grok daily-wisdom response:", JSON.stringify(data, null, 2));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered. Please try again.");
      throw new Error("No response from Grok API");
    }

    const wisdom = parseJSON(content);

    // Override with pre-computed deterministic values
    wisdom.daysToFight = daysRemaining;
    wisdom.requiredWeeklyKg = parseFloat(requiredWeeklyKg.toFixed(2));
    wisdom.weeklyPaceKg = parseFloat(weeklyPaceKg.toFixed(2));
    wisdom.paceStatus = paceStatus;

    return new Response(JSON.stringify({ wisdom }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in daily-wisdom:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
