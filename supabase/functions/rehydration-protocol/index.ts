import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { weightLostKg, weighInTiming, currentWeightKg, fightTimeHours } = await req.json();
    const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") || "AIzaSyBlmYlZE8yk369foFvuYnzjay3O5oBR8rw";

    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert combat sports nutritionist specializing in post-weigh-in rehydration protocols for fighters. You have deep knowledge of combat sports physiology, electrolyte balance, carbohydrate refueling, and the critical timing between weigh-in and competition. You PRIORITIZE fighter safety and performance.

CRITICAL SAFETY PRINCIPLES:
- Never recommend rapid rehydration that could cause hyponatremia
- Gradual, controlled rehydration is essential
- Electrolyte balance is as important as fluid volume
- Carbohydrate reintroduction must be gradual and strategic
- Target 5-10g carbs per kg body weight post weigh-in
- Avoid high fiber, high fat foods that slow digestion

You provide evidence-based rehydration protocols based on:
- Weight lost via dehydration
- Time between weigh-in and fight
- Body weight
- Scientific literature on combat sports rehydration

OUTPUT FORMAT - You must respond with valid JSON only:
{
  "hourlyProtocol": [
    {
      "hour": 1,
      "fluidML": 500,
      "sodium": 460,
      "potassium": 120,
      "notes": "Start slow - isotonic solution"
    }
  ],
  "electrolyteRatio": {
    "sodium": "460mg per 500ml",
    "potassium": "120mg per 500ml",
    "magnesium": "24mg per 500ml"
  },
  "carbRefuelPlan": {
    "targetCarbs": "calculate based on fighter weight (6-8g per kg)",
    "meals": [
      {
        "timing": "Hour 1",
        "carbsG": 0,
        "mealIdeas": ["Focus on fluids only"],
        "rationale": "Prioritize rehydration first"
      }
    ],
    "totalCarbs": "sum of all meal carbs"
  },
  "summary": "Brief overview of the protocol",
  "warnings": ["Important safety warnings"]
}

Use these evidence-based guidelines:
- Replace 150% of weight lost over available hours
- Start with isotonic solutions (similar to plasma osmolality)
- Sodium: 400-500mg per 500ml initially
- Carbs: Target 6-8g per kg body weight total, distributed across meals
- Start carbs Hour 2-3, gradually increase
- Suggest specific low-fiber, easily digestible foods (white rice, white bread, bananas, honey, sports drinks, rice cakes, chicken breast)
- Same-day weigh-in: aggressive but safe protocol (4-6 hours)
- Day-before weigh-in: slower, more comfortable protocol (12-24 hours)
- Calculate total carb intake and show progression toward goal`;

    const userPrompt = `Create a rehydration protocol for:
- Weight lost via dehydration: ${weightLostKg}kg
- Weigh-in timing: ${weighInTiming}
- Current weight: ${currentWeightKg}kg
- Time until fight: ${fightTimeHours} hours

Provide:
1. Hour-by-hour rehydration protocol with specific fluid volumes and electrolyte content
2. Detailed carb refuel plan targeting 6-8g per kg body weight (for ${currentWeightKg}kg = ${(currentWeightKg * 6).toFixed(0)}-${(currentWeightKg * 8).toFixed(0)}g total carbs)
3. Specific meal suggestions with carb amounts for each time window
4. Calculate and show total carb intake across all meals`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let protocolText = data.choices[0].message.content;

    // Extract JSON from markdown code blocks if present
    const jsonMatch = protocolText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      protocolText = jsonMatch[1];
    }

    // Parse the JSON protocol
    const protocol = JSON.parse(protocolText);

    return new Response(JSON.stringify({ protocol }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in rehydration-protocol:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
