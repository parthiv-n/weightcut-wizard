import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports weight cutting expert. You INTERPRET pre-computed projection data — you do NOT recalculate values.

RESEARCH-BACKED KNOWLEDGE BASE:

Source: ISSN 2025 Position Stand (Ricci et al.)
- Glycogen stores: 350-700g muscle + 80-100g liver
- Glycogen:water ratio = 1:2.7 (Bergström & Hultman 1972)
- <50g carbs/day for 3-7 days = ~2% BM loss (maintains strength/power)
- Low-fibre (<10g/day) for 4 days = 0.4-0.7% BM loss; 7 days = up to 1% BM
- Sodium <2300mg/day = 0.5-1% BM loss over 3-5 days
- Water loading: 100ml/kg/day × 3 days, then 15ml/kg/day = 3.2% BM loss
- Safe AWL by timeline: 6.7% at 72h+, 5.7% at 48h, 4.4% at 24h
- Dry sauna: 0.5-0.9% BM per session (4×10min at 90°C)
- Hot bath + wrap: up to 4.5% BM (aggressive protocol)

Source: Reale et al. (2017) — Acute Weight-Loss Strategies
- Dehydration of 2.8% BM is reversible after 3h aggressive recovery
- Dehydration of 6% BM NOT fully reversed even after 15h
- Gut transit time: 10-96 hours (individual variation)

Source: Reale (2018) — Gatorade SSE #183
- Post weigh-in: replace 125-150% of fluid deficit
- ORS sodium: 50-90 mmol/L for >3% dehydration
- Carbs post weigh-in: 8-12 g/kg over recovery period

DEHYDRATION SAFETY ZONES:
- GREEN (≤2% BW): minimal performance impact
- ORANGE (2-4% BW): needs ≥12h recovery + aggressive rehydration
- RED (>4% BW): significant performance decrement, may NOT fully recover

OUTPUT FORMAT — respond with valid JSON only:
{
  "summary": "2-3 sentence narrative assessment",
  "dayByDayTips": ["tip1", "tip2", ...],
  "safetyWarning": "string or null",
  "recoveryProtocol": "post weigh-in recovery protocol text",
  "riskLevel": "green | orange | red"
}`;

    const userPrompt = `Analyze this fighter's weight cut projection and provide protocol advice:

Fighter: ${sex}, ${age ? `age ${age}` : "age unknown"}
Current Weight: ${currentWeight}kg
Target Weight: ${targetWeight}kg
Days Until Weigh-In: ${daysUntilWeighIn}

PRE-COMPUTED PROJECTION (deterministic — do not override these values):
- Total to Cut: ${projection.totalToCut}kg (${projection.percentBW}% BW)
- Glycogen + Water: ${projection.glycogenLoss}kg
- Fibre / Gut: ${projection.fibreLoss}kg
- Sodium / Water: ${projection.sodiumLoss}kg
- Water Loading: ${projection.waterLoadingLoss}kg
- Diet Total: ${projection.dietTotal}kg
- Dehydration Needed: ${projection.dehydrationNeeded}kg (${projection.dehydrationPercentBW}% BW)
- Dehydration Safety: ${projection.dehydrationSafety}
- Overall Safety: ${projection.overallSafety}
- Sauna Sessions Estimated: ${projection.saunaSessions}

Provide:
1. A 2-3 sentence summary narrative
2. 5-8 practical day-by-day tips (specific to this fighter's timeline and cut size)
3. Safety warning if dehydration is orange or red zone (null if green/no dehydration)
4. Post weigh-in recovery protocol (always include — specific ORS, carb, fluid targets)
5. Overall risk level`;

    console.log("Calling Minimax API for fight week advice...");

    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
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
      console.error("Minimax API error:", response.status, errorData);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let adviceText = data.choices?.[0]?.message?.content;

    // Strip <think> tags from Minimax response
    if (adviceText) {
      adviceText = adviceText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }

    if (!adviceText) {
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === "content_filter") {
        throw new Error("Content was filtered for safety.");
      }
      throw new Error("No response from Minimax API");
    }

    // Parse JSON
    let advice;
    try {
      advice = JSON.parse(adviceText);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = adviceText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          advice = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error("Failed to parse extracted JSON:", jsonMatch[1]);
        }
      }
      if (!advice) {
        console.error("Failed to parse Minimax response as JSON:", adviceText);
        return new Response(
          JSON.stringify({
            error: "AI returned invalid response format. Please try again.",
            details: adviceText.substring(0, 200),
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
