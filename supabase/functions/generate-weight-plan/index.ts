import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";

// FREE for all users — generated during onboarding, no gem cost

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }

  try {
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

    const {
      currentWeight, goalWeight, targetWeeks,
      age, sex, heightCm, activityLevel, trainingFrequency,
      bmr, tdee, foodBudget, planAggressiveness,
    } = await req.json();

    const totalToLose = Math.max(0, currentWeight - goalWeight);
    const weeks = Math.max(1, targetWeeks || Math.ceil(totalToLose / 0.5));
    const weeklyLossRate = Math.min(totalToLose / weeks, 1.5);
    const dailyDeficit = Math.round((weeklyLossRate * 7700) / 7);
    const targetCalories = Math.max(sex === 'female' ? 1200 : 1500, Math.round(tdee - dailyDeficit));
    const proteinTarget = Math.round(goalWeight * 2.0);
    const fatTarget = Math.round((targetCalories * 0.25) / 9);
    const carbTarget = Math.round((targetCalories - (proteinTarget * 4) - (fatTarget * 9)) / 4);

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) throw new Error("GROK_API_KEY not configured");

    const budgetNote = foodBudget === "budget" ? "Prioritise affordable foods: eggs, oats, rice, beans, frozen veg, canned fish, chicken thighs." : "";
    const aggressivenessNote = planAggressiveness === "aggressive" ? "User prefers an aggressive approach — push deficit to 750-1000 kcal/day if safe." :
      planAggressiveness === "conservative" ? "User prefers gentle, sustainable approach — keep deficit at 300-500 kcal/day." : "";

    const systemPrompt = `You are a professional nutrition coach. Write a personalised weight loss plan. No fight camp, no water cutting, no glycogen manipulation, no sodium protocols. This is a SIMPLE, SUSTAINABLE weight loss plan.

THIS PERSON:
- ${sex}, ${age} years old, ${heightCm}cm
- Current weight: ${currentWeight}kg → Goal: ${goalWeight}kg
- Total to lose: ${totalToLose.toFixed(1)}kg over ${weeks} weeks
- Rate: ${weeklyLossRate.toFixed(1)}kg per week
- Maintenance: ${tdee} kcal/day | Deficit: ${dailyDeficit} kcal/day
- Target intake: ${targetCalories} kcal | Protein: ${proteinTarget}g | Carbs: ${carbTarget}g | Fat: ${fatTarget}g
- Training: ${trainingFrequency}x/week, ${activityLevel}
${budgetNote ? `- Budget: ${budgetNote}` : ""}
${aggressivenessNote ? `- Style: ${aggressivenessNote}` : ""}

RULES:
1. Create ${Math.min(weeks, 12)} weeks
2. Each week: targetWeight, calories, protein_g, carbs_g, fats_g, focus (1 sentence tip for that week, e.g. "Focus on meal prep this week" or "Add an extra walk")
3. Protein at 1.8-2.2g/kg target bodyweight
4. Max 1kg/week loss
5. summary: 2-3 sentences summarising the plan with their specific numbers
6. safetyNotes: 1-2 sentences about monitoring progress
7. keyPrinciples: exactly 3 clear bullet points about sustainable fat loss
8. mealIdeas: 4 simple, practical meal ideas that fit the calorie/macro targets${foodBudget === "budget" ? " — must be budget-friendly" : ""}
9. weeklyChecklist: 3 actionable weekly habits (e.g. "Weigh yourself same time each morning", "Meal prep Sunday evening")

NO fight week protocols, NO water manipulation, NO sodium loading, NO glycogen depletion.

Return ONLY valid JSON:
{
  "weeklyPlan": [{"week":1,"targetWeight":0,"calories":0,"protein_g":0,"carbs_g":0,"fats_g":0,"focus":""}],
  "summary": "",
  "totalWeeks": ${Math.min(weeks, 12)},
  "weeklyLossTarget": "${weeklyLossRate.toFixed(1)} kg/week",
  "maintenanceCalories": ${tdee},
  "deficit": ${dailyDeficit},
  "safetyNotes": "",
  "keyPrinciples": ["","",""],
  "mealIdeas": [{"name":"","description":"","approxCalories":0}],
  "weeklyChecklist": ["","",""]
}`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${weeks}-week weight loss plan for ${currentWeight}kg → ${goalWeight}kg.` },
        ],
        temperature: 0.2,
        max_completion_tokens: 3000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI busy, try again", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
      }
      const err = await response.text();
      edgeLogger.error("Grok API error", undefined, { status: response.status, err });
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    const { content, filtered } = extractContent(data);
    if (!content) throw new Error(filtered ? "Content filtered" : "No response from AI");

    const plan = parseJSON(content);

    // Ensure deterministic values override LLM
    plan.maintenanceCalories = tdee;
    plan.deficit = dailyDeficit;
    plan.totalWeeks = Math.min(weeks, 12);
    plan.weeklyLossTarget = `${weeklyLossRate.toFixed(1)} kg/week`;

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (error) {
    edgeLogger.error("generate-weight-plan error", error, { functionName: "generate-weight-plan" });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }
});
