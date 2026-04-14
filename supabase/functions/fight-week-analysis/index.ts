import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

serve(async (req) => {
  // Warmup GET
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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

    // Check AI usage limits (free: 1/day, premium: unlimited)
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    const { currentWeight, targetWeight, daysUntilWeighIn, sex, age, projection } =
      await req.json();

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const systemPrompt = `You are the FightCamp Wizard, a science-based combat sports weight cutting expert. You INTERPRET pre-computed projection data — do NOT recalculate. All advice must be evidence-based (ISSN 2025 Position Stand, Reale 2017/2018).

EVIDENCE BASE:
=== GLYCOGEN & WATER ===
- Glycogen stores: 350-700g muscle + 80-100g liver. Ratio 1:2.7 water.
- Low-carb (<50g/d) for 3-7 days = ~2% BM. Maintains strength/power (Sawyer 2013).
- Protein MUST stay 2.0-2.5 g/kg throughout. Fat fills remaining calories.
- Low-fibre (<10g/d): 4d = 0.4-0.7% BM; 7d = up to 1% BM.

=== SODIUM — RESTRICTION ONLY (NOT load-then-cut) ===
The ISSN 2025 paper does NOT validate sodium loading protocols. Only restriction is evidence-based.
- Restrict to <2300mg/d during fight week. Do NOT drop significantly below 2300mg (athletes lose Na in sweat).
- Yield: 0.5-1% BM over 3-5 days. Takes 2-3 days for balance to shift.

=== WATER LOADING ===
- Days 1-3: 100 ml/kg/d (80kg = 8L). Day 4: 15 ml/kg (1.2L). Day 5+: sips only (5 ml/kg).
- Extra yield vs normal: 0.8% BM (3.2% vs 2.4% in Reid et al. study).
- Requires minimum 4 days. Suppresses ADH/aldosterone.

=== SWEATING METHODS ===
Dry Sauna (preferred): 4×10min at 90°C, 5-min breaks. Loss: 0.5-0.9% BM/session (males 0.7%, females 0.6%).
Hot Bath + Wrap: 20min at 39-40°C + 40min wrap. Loss: ~2% BM/session, up to 4.5% BM double protocol. Epsom salt = NO benefit vs freshwater.
Active Sweating: Up to 2L/hr. Do active BEFORE passive (less cardiac strain). Depletes peripheral glycogen.
SAFETY: Core temp must NOT reach 40°C. Stop on dizziness/syncope. Women 5x higher orthostatic risk ages 18-35.

=== SAFE ACUTE WEIGHT LOSS THRESHOLDS ===
>=72h: up to 6.7% BM. 48h: up to 5.7% BM. 24h: up to 4.4% BM.

=== DEHYDRATION ZONES ===
GREEN <=2% BM: minimal impact, reversible in 3h.
ORANGE 2-4% BM: needs >=12h recovery + aggressive rehydration.
RED >4% BM: significant decrement, NOT fully reversed after 15h.
By recovery window: <4h (BJJ/wrestling) max 3%. 4-12h (amateur boxing) max 4%. 12-24h max 5%. 24-36h (pro MMA) max 6%.

=== REHYDRATION ===
- Replace 125-150% of fluid lost. Initial bolus 300-500ml. Then 240-350ml every 30min. Max 1000ml/hr.
- >3% loss: ORS 50-90 mmol/L sodium. <3%: sports drinks adequate.
- Carbs: significant depletion 8-12 g/kg, moderate 6-8 g/kg, minimal 4-5 g/kg. Max 60g/hr (dual-transport with glucose+fructose for more).
- Caffeine 3-6 mg/kg, 60 min pre-competition. Target: regain >=10% BM.
- AVOID: fibre, coffee, citrus, carbonation, fatty/spicy/fried food. GOOD: white rice, bread, bananas, honey, ORS, sports drinks.

=== MEDICAL RED FLAGS — STOP THE CUT ===
Core temp approaching 40°C. Persistent dizziness or syncope. Resting HR >120. Confusion. Muscle cramps not resolving. Dark brown/cola urine. >8% BM total cut. Energy availability <30 kcal/kg FFM.

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

    edgeLogger.info("Calling Grok API for fight week advice");

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
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: response.status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, { functionName: "fight-week-analysis", status: response.status, errorData });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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
      edgeLogger.error("Failed to parse Grok response as JSON", undefined, { functionName: "fight-week-analysis", contentPreview: content.substring(0, 200) });
      return new Response(
        JSON.stringify({
          error: "AI returned invalid response format. Please try again.",
          details: content.substring(0, 200),
        }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("Error in fight-week-analysis", error, { functionName: "fight-week-analysis" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
