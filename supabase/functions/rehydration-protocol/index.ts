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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports rehydration expert. You PRIORITIZE fighter safety and performance.

CRITICAL SAFETY PRINCIPLES:
- Never recommend rapid rehydration that could cause hyponatremia
- Gradual, controlled rehydration is essential
- Electrolyte balance is as important as fluid volume
- Carbohydrate reintroduction must be gradual and strategic

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
      "carbs": 0,
      "notes": "Start slow - isotonic solution"
    }
  ],
  "electrolyteRatio": {
    "sodium": "460mg per 500ml",
    "potassium": "120mg per 500ml",
    "magnesium": "24mg per 500ml"
  },
  "carbReintroduction": [
    {
      "timing": "Hour 1-2",
      "amount": "0g",
      "foods": [],
      "rationale": "Focus on rehydration first"
    }
  ],
  "summary": "Brief overview of the protocol",
  "warnings": ["Important safety warnings"]
}

Use these evidence-based guidelines:
- Replace 150% of weight lost over available hours
- Start with isotonic solutions (similar to plasma osmolality)
- Sodium: 400-500mg per 500ml initially
- Carbs: delay until Hour 2-3, then gradual introduction
- Same-day weigh-in: aggressive but safe protocol (4-6 hours)
- Day-before weigh-in: slower, more comfortable protocol (12-24 hours)`;

    const userPrompt = `Create a rehydration protocol for:
- Weight lost via dehydration: ${weightLostKg}kg
- Weigh-in timing: ${weighInTiming}
- Current weight: ${currentWeightKg}kg
- Time until fight: ${fightTimeHours} hours

Provide hour-by-hour rehydration protocol with specific fluid volumes, electrolyte content, and carbohydrate reintroduction strategy.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
