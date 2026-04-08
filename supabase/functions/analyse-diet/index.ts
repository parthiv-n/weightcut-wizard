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
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
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

    const { meals, profile, macroGoals, date } = await req.json();

    if (!meals || !Array.isArray(meals) || meals.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one meal is required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    edgeLogger.info("Analysing diet", { date, mealCount: meals.length });

    const systemPrompt = `You are a professional combat sports nutritionist. Analyse the athlete's full day of eating and estimate micronutrient intake based on known food composition profiles.

Return ONLY valid JSON with this exact structure:
{
  "summary": "1 punchy sentence: what's good and what's missing. No fluff.",
  "mealBreakdown": [
    { "mealType": "breakfast", "mealName": "meal name", "keyNutrients": [{ "name": "Iron", "amount": "3.2mg" }, { "name": "Vitamin C", "amount": "45mg" }] }
  ],
  "micronutrients": [
    { "name": "Vitamin A", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Vitamin C", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Vitamin D", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Iron", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Calcium", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Magnesium", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Zinc", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" },
    { "name": "Fiber", "percentRDA": number, "amount": "string with unit", "rdaTarget": "string with unit" }
  ],
  "gaps": [
    { "nutrient": "name", "percentRDA": number, "severity": "critical"|"moderate"|"low", "reason": "brief explanation" }
  ],
  "suggestions": [
    { "food": "specific food or simple meal", "reason": "why it helps", "nutrients": ["nutrient names it addresses"] }
  ]
}

Rules:
- mealBreakdown: one entry per meal, list the top 3-4 micronutrients each meal contributes (highest amounts). Use the same meal_type from the input.
- Estimate micronutrients from USDA food composition data for the foods listed
- RDA targets should be adjusted for an active combat sport athlete (${profile?.sex === 'female' ? 'female' : 'male'}, ${profile?.age || 25} years)
- Only include gaps where percentRDA < 70
- Severity: critical < 30%, moderate 30-50%, low 50-70%
- Suggestions should be practical, whole-food-based, and optimised for combat sport recovery/performance
- Keep suggestions to 2-4 items, prioritising the most critical gaps
- percentRDA values should be integers, capped at 100`;

    const mealSummary = meals.map((m: any) =>
      `${m.meal_type || "meal"}: ${m.meal_name} (${m.calories} kcal, ${m.protein_g}g P, ${m.carbs_g}g C, ${m.fats_g}g F)${m.ingredients?.length ? ` — ingredients: ${m.ingredients.map((i: any) => `${i.name} ${i.grams}g`).join(", ")}` : ""}`
    ).join("\n");

    const userPrompt = `Analyse this athlete's full day of eating for ${date}:

${mealSummary}

Daily totals: ${meals.reduce((s: number, m: any) => s + m.calories, 0)} kcal, ${meals.reduce((s: number, m: any) => s + (m.protein_g || 0), 0)}g protein, ${meals.reduce((s: number, m: any) => s + (m.carbs_g || 0), 0)}g carbs, ${meals.reduce((s: number, m: any) => s + (m.fats_g || 0), 0)}g fats

Macro targets: ${macroGoals?.calorieTarget || "not set"} kcal, ${macroGoals?.proteinGrams || "?"} P, ${macroGoals?.carbsGrams || "?"} C, ${macroGoals?.fatsGrams || "?"} F

Athlete profile: ${profile?.age || "?"} years, ${profile?.sex || "?"}, ${profile?.current_weight_kg || "?"}kg, training ${profile?.training_frequency || "?"}/week`;

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
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 2500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, { functionName: "analyse-diet", status: response.status, errorData });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: response.status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Grok API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    edgeLogger.info("Grok diet analysis response received");

    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      edgeLogger.warn("Grok response truncated", { functionName: "analyse-diet", finishReason });
    }

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety.");
      throw new Error("No response from Grok API");
    }

    const analysisData = parseJSON(content);
    edgeLogger.info("Parsed diet analysis data");

    return new Response(
      JSON.stringify({ analysisData }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    edgeLogger.error("Error in analyse-diet function", error, { functionName: "analyse-diet" });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
