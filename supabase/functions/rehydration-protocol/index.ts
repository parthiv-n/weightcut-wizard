import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

// ── Deterministic calculations (not LLM-generated) ─────────────────────────
function computeTargets(
  weightLostKg: number,
  currentWeightKg: number,
  availableHours: number,
  glycogenDepletion: string
) {
  const totalFluidML = weightLostKg * 1.5 * 1000;
  const totalFluidLitres = parseFloat((totalFluidML / 1000).toFixed(1));
  const hourlyFluidML = Math.min(1000, Math.round(totalFluidML / availableHours));

  const sodiumPerLitre = 1500;
  const totalSodiumMg = Math.round(sodiumPerLitre * totalFluidLitres);
  const potassiumPerLitre = 240;
  const totalPotassiumMg = Math.round(potassiumPerLitre * totalFluidLitres);
  const magnesiumPerLitre = 48;
  const totalMagnesiumMg = Math.round(magnesiumPerLitre * totalFluidLitres);

  let carbMultiplierLow: number;
  let carbMultiplierHigh: number;
  let carbTargetLabel: string;
  switch (glycogenDepletion) {
    case "significant":
      carbMultiplierLow = 8; carbMultiplierHigh = 12; carbTargetLabel = "8-12"; break;
    case "moderate":
      carbMultiplierLow = 6; carbMultiplierHigh = 8; carbTargetLabel = "6-8"; break;
    default:
      carbMultiplierLow = 4; carbMultiplierHigh = 5; carbTargetLabel = "4-5";
  }

  const totalCarbsG = Math.round(currentWeightKg * (carbMultiplierLow + carbMultiplierHigh) / 2);
  const maxCarbsPerHour = 60;
  const caffeineLowMg = Math.round(currentWeightKg * 3);
  const caffeineHighMg = Math.round(currentWeightKg * 6);

  return {
    totalFluidLitres, totalFluidML, hourlyFluidML,
    totalSodiumMg, totalPotassiumMg, totalMagnesiumMg,
    sodiumPerLitre, potassiumPerLitre, magnesiumPerLitre,
    totalCarbsG, maxCarbsPerHour, carbTargetLabel,
    carbMultiplierLow, carbMultiplierHigh,
    availableHours, caffeineLowMg, caffeineHighMg,
  };
}

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

    const {
      weightLostKg, weighInTiming, availableHours: rawAvailableHours, currentWeightKg,
      glycogenDepletion = "moderate",
      sex, age, heightCm, activityLevel, trainingFrequency,
      tdee, goalWeightKg, fightWeekTargetKg,
    } = await req.json();

    const availableHours = rawAvailableHours ?? (weighInTiming === "same-day" ? 5 : 16);

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const targets = computeTargets(weightLostKg, currentWeightKg, availableHours, glycogenDepletion);

    const profileLines = [
      `Body weight: ${currentWeightKg}kg`,
      sex ? `Sex: ${sex}` : null,
      age ? `Age: ${age}` : null,
      heightCm ? `Height: ${heightCm}cm` : null,
      activityLevel ? `Activity: ${activityLevel}` : null,
      trainingFrequency ? `Training: ${trainingFrequency} sessions/wk` : null,
      tdee ? `TDEE: ${tdee} kcal` : null,
      goalWeightKg ? `Goal: ${goalWeightKg}kg` : null,
      fightWeekTargetKg ? `Fight week target: ${fightWeekTargetKg}kg` : null,
    ].filter(Boolean).join(" | ");

    const systemPrompt = `You are a combat sports rehydration expert. Output valid JSON only, no markdown.

ATHLETE: ${profileLines}

TARGETS (use exactly):
Fluid: ${targets.totalFluidLitres}L (${targets.totalFluidML}ml) | Max/h: ${targets.hourlyFluidML}ml | Window: ${availableHours}h
Na: ${targets.totalSodiumMg}mg | K: ${targets.totalPotassiumMg}mg | Mg: ${targets.totalMagnesiumMg}mg
Carbs: ${targets.totalCarbsG}g (${targets.carbTargetLabel}g/kg) max ${targets.maxCarbsPerHour}g/h | Depletion: ${glycogenDepletion}
Caffeine: ${targets.caffeineLowMg}-${targets.caffeineHighMg}mg 60min pre-comp

JSON schema:
{"summary":"2-3 line overview","hourlyProtocol":[{"hour":1,"timeLabel":"","phase":"","fluidML":0,"sodiumMg":0,"potassiumMg":0,"magnesiumMg":0,"carbsG":0,"drinkRecipe":"","notes":"","foods":[]}],"carbRefuelPlan":{"strategy":"","meals":[{"timing":"","carbsG":0,"foods":[],"rationale":""}]},"warnings":[""],"education":{"howItWorks":[{"title":"","content":""}],"caffeineGuidance":"","carbMouthRinse":""}}`;

    const userPrompt = `Generate rehydration protocol. Lost ${weightLostKg}kg (${((weightLostKg / currentWeightKg) * 100).toFixed(1)}% BM), ${availableHours}h window, ${glycogenDepletion} depletion. ${availableHours <= 6 ? "Short window: aggressive liquid-first protocol." : "Extended: liquid→solid after 3h."} Include drink recipes, foods, 3 warnings, 3 education items.`;

    edgeLogger.info("Calling Grok API for rehydration protocol");

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
        max_completion_tokens: 5000,
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
      edgeLogger.error("Grok API error", undefined, { functionName: "rehydration-protocol", status: response.status, errorData });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    edgeLogger.info("Grok rehydration response received");

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different request.");
      throw new Error("No response from Grok API");
    }

    const protocol = parseJSON(content);

    // ── Attach deterministic totals (overrides any LLM-computed values) ────
    protocol.totals = {
      totalFluidLitres: targets.totalFluidLitres,
      totalSodiumMg: targets.totalSodiumMg,
      totalPotassiumMg: targets.totalPotassiumMg,
      totalMagnesiumMg: targets.totalMagnesiumMg,
      totalCarbsG: targets.totalCarbsG,
      carbTargetPerKg: targets.carbTargetLabel,
      maxCarbsPerHour: targets.maxCarbsPerHour,
      rehydrationWindowHours: targets.availableHours,
      bodyWeightKg: currentWeightKg,
      caffeineLowMg: targets.caffeineLowMg,
      caffeineHighMg: targets.caffeineHighMg,
    };

    return new Response(JSON.stringify({ protocol }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("rehydration-protocol error", error, { functionName: "rehydration-protocol" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
