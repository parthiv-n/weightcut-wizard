import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Warmup GET
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentWeight, targetWeight, daysUntilWeighIn, sex, age, projection } =
      await req.json();

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports weight cutting expert. You INTERPRET pre-computed projection data — do NOT recalculate.

RESEARCH: Glycogen=350-700g muscle+80-100g liver, ratio=1:2.7. Low-carb(<50g/d,3-7d)=~2%BM. Low-fibre(<10g/d)=0.4-1%BM. Na<2300mg/d=0.5-1%BM. Water-load(100ml/kg/d×3d→15ml/kg)=3.2%BM. Safe-AWL:72h+=6.7%,48h=5.7%,24h=4.4%. Sauna:0.5-0.9%/session. Dehydration-2.8%=reversible-3h, 6%=NOT-reversed-15h. Post-weigh-in:125-150%fluid, ORS-50-90mmol/L, carbs-8-12g/kg.

DEHYDRATION ZONES: GREEN≤2%, ORANGE 2-4%(needs≥12h recovery), RED>4%(significant decrement).

Respond with valid JSON only:
{
  "summary": "2-3 sentence narrative",
  "dayByDayTips": ["tip1", "tip2", ...],
  "safetyWarning": "string or null",
  "recoveryProtocol": "post weigh-in recovery text",
  "riskLevel": "green|orange|red"
}`;

    const userPrompt = `Fighter: ${sex}, ${age ? `age ${age}` : "age unknown"}
Current: ${currentWeight}kg → Target: ${targetWeight}kg | ${daysUntilWeighIn} days

PRE-COMPUTED PROJECTION (deterministic — do not override):
- Total: ${projection.totalToCut}kg (${projection.percentBW}% BW)
- Glycogen+Water: ${projection.glycogenLoss}kg | Fibre/Gut: ${projection.fibreLoss}kg
- Sodium/Water: ${projection.sodiumLoss}kg | Water Loading: ${projection.waterLoadingLoss}kg
- Diet Total: ${projection.dietTotal}kg
- Dehydration: ${projection.dehydrationNeeded}kg (${projection.dehydrationPercentBW}% BW) — ${projection.dehydrationSafety}
- Overall: ${projection.overallSafety} | Sauna sessions: ${projection.saunaSessions}

Provide: 1) 2-3 sentence summary, 2) 5-8 day-by-day tips, 3) safety warning if orange/red (null if green), 4) post weigh-in recovery protocol, 5) risk level.`;

    console.log("Calling Grok API for fight week advice...");

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 3000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorData = await response.json();
      console.error("Grok API error:", response.status, errorData);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const { content, filtered } = extractContent(data);

    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety.");
      throw new Error("No response from Grok API");
    }

    let advice;
    try {
      advice = parseJSON(content);
    } catch {
      console.error("Failed to parse Grok response as JSON:", content);
      return new Response(
        JSON.stringify({
          error: "AI returned invalid response format. Please try again.",
          details: content.substring(0, 200),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fight-week-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
