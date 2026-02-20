import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import knowledgeData from "./chatbot-index.json" assert { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { weightLostKg, weighInTiming, currentWeightKg } = await req.json();
    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");

    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const researchContext = knowledgeData.map((doc: any) => `## Source: ${doc.title}\n${doc.content}`).join('\n\n');

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports rehydration expert. You PRIORITIZE fighter safety and performance.

CRITICAL SAFETY PRINCIPLES:
- Never recommend rapid rehydration that could cause hyponatremia
- Gradual, controlled rehydration is essential
- Electrolyte balance is as important as fluid volume
- Carbohydrate reintroduction must be gradual and strategic
- Target 5-10g carbs per kg body weight post weigh-in
- Avoid high fiber, high fat foods that slow digestion

YOUR KNOWLEDGE BASE (Scientific Research):
The following are full-text research papers and protocols on combat sports nutrition and rehydration. You MUST base your fluid schedules, electrolyte ratios, and carbohydrate protocols STRICTLY on the data provided in these papers. Do not hallucinate statistics or generalize internet advice. Retrieve exact scientific protocols from this context.

<knowledge>
${researchContext}
</knowledge>

You provide evidence-based rehydration protocols based on:
- Weight lost via dehydration
- The specific weigh-in schedule chosen (Same Day vs Day Before)
- Body weight
- The scientific literature provided in your knowledge base

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
- Weigh-in timing: ${weighInTiming} (THIS IS CRITICAL FOR YOUR TIMELINE)
- Current weight: ${currentWeightKg}kg

CRITICAL TIMELINE INSTRUCTIONS:
If Weigh-in timing is "same-day":
- You MUST generate an aggressive, fast-absorbing protocol.
- The \`hourlyProtocol\` array MUST cover exactly 4 to 6 hours total. Do not generate 24 hours of data.
- Prioritize liquid carbs and fast gastric emptying.

If Weigh-in timing is "day-before":
- You MUST generate a prolonged, massive carbohydrate super-compensation protocol.
- The \`hourlyProtocol\` array MUST cover at least 12 and up to 24 hours.
- Transition from liquids to solid, high-carb low-fiber meals after the first 3 hours.

Provide:
1. Hour-by-hour rehydration protocol with specific fluid volumes and electrolyte content
2. Detailed carb refuel plan targeting 6-8g per kg body weight (for ${currentWeightKg}kg = ${(currentWeightKg * 6).toFixed(0)}-${(currentWeightKg * 8).toFixed(0)}g total carbs)
3. Specific meal suggestions with carb amounts for each time window
4. Calculate and show total carb intake across all meals`;

    const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;

    console.log("Calling Minimax API for rehydration protocol...");

    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 3072
      })
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
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorData = await response.json();
      console.error("Minimax API error:", response.status, errorData);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Minimax rehydration response:", JSON.stringify(data, null, 2));

    let protocolText = data.choices?.[0]?.message?.content;
    // Strip <think> tags from Minimax response
    if (protocolText) {
      protocolText = protocolText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!protocolText) {
      console.error("No content found in Minimax response");
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        throw new Error("Content was filtered for safety. Please try a different request.");
      }
      throw new Error("No response from Minimax API");
    }

    // Parse the protocol text (may need JSON extraction)
    let protocol;
    try {
      // Try parsing as direct JSON first
      protocol = JSON.parse(protocolText);
    } catch (parseError) {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = protocolText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        protocol = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Could not parse protocol data from AI response");
      }
    }

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
