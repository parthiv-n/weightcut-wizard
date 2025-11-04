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
    const { hydrationData, profileData, recentLogs } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a science-based mystical coach who prioritises fighter safety and performance. You NEVER encourage:
- Extreme dehydration (>3% body weight loss)
- Diuretics or dangerous supplements
- Plastic suits or excessive sauna use without supervision
- Eliminating sodium completely
- Cutting water too early before weigh-in

You provide:
- Evidence-based hydration strategies
- Safe sodium manipulation advice
- Performance-focused guidance
- Gradual, controlled adjustments
- Recovery protocols that prioritize health

Keep responses concise (2-3 sentences max) and actionable. Use fighter-appropriate language.`;

    const userPrompt = `Current hydration status:
- Daily target: ${hydrationData.dailyTarget}L
- Current intake: ${hydrationData.currentIntake}L
- Sodium today: ${hydrationData.sodiumToday || 0}mg
- Recent sweat loss: ${hydrationData.sweatLoss || "none logged"}%
- Days to weigh-in: ${profileData.daysToWeighIn || "unknown"}
- Activity level: ${profileData.activityLevel || "moderate"}

Recent patterns: ${recentLogs || "No recent logs"}

Provide a brief insight on their hydration status and one actionable recommendation.`;

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
    const insight = data.choices[0].message.content;

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in hydration-insights:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
