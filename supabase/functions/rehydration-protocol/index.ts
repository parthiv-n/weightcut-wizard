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
      weightLostKg, weighInTiming, availableHours: rawAvailableHours, awakeHours: rawAwakeHours, currentWeightKg,
      glycogenDepletion = "moderate",
      sex, age, heightCm, activityLevel, trainingFrequency,
      tdee, goalWeightKg, fightWeekTargetKg,
    } = await req.json();

    const availableHours = rawAvailableHours ?? (weighInTiming === "same-day" ? 5 : 16);
    // Awake hours: protocol steps are only generated for awake time
    const awakeHours = Math.max(4, rawAwakeHours ?? (availableHours > 10 ? Math.round(availableHours - 8) : availableHours));

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const targets = computeTargets(weightLostKg, currentWeightKg, availableHours, glycogenDepletion);
    // Recalculate hourly rate for awake hours only (more fluid per hour to compensate for sleep)
    const awakeHourlyFluidML = Math.min(1000, Math.round(targets.totalFluidML / awakeHours));

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

    const sleepNote = awakeHours < availableHours ? ` (${availableHours}h total, ${availableHours - awakeHours}h sleep)` : '';
    const systemPrompt = `You are a JSON API. Respond with ONLY the JSON object. No preamble, no explanation, no markdown — just raw JSON.
Combat sports rehydration expert.

ATHLETE: ${profileLines}
TARGETS: Fluid ${targets.totalFluidLitres}L (${awakeHourlyFluidML}ml/h) | ${awakeHours}h awake${sleepNote} | Na ${targets.totalSodiumMg}mg | K ${targets.totalPotassiumMg}mg | Mg ${targets.totalMagnesiumMg}mg | Carbs ${targets.totalCarbsG}g (max ${targets.maxCarbsPerHour}g/h) | Depletion: ${glycogenDepletion}

Output JSON:
- summary: 1-2 sentence overview
- phases: array of 3-4 phase groups. Each phase covers a RANGE of consecutive hours with the same fluid/electrolyte per hour:
  {startHour,endHour,phase,fluidMLPerHour,sodiumMgPerHour,potassiumMgPerHour,magnesiumMgPerHour,carbsGPerHour,drinkRecipe,notes,foods:[]}
  Example: {startHour:1,endHour:4,phase:"Aggressive",fluidMLPerHour:600,sodiumMgPerHour:900,...}
  Phases must cover hours 1 to ${awakeHours} with no gaps. Front-load sodium in early phases. foods must be array of strings.
- carbRefuelPlan: {strategy:"1 sentence",meals:[{timing,carbsG,foods:[],rationale}]} 2-3 meals.
- warnings: 2 strings, athlete-specific risks`;

    const userPrompt = `Lost ${weightLostKg}kg (${((weightLostKg / currentWeightKg) * 100).toFixed(1)}% BM), ${awakeHours}h awake, ${glycogenDepletion} depletion. ${awakeHours <= 6 ? "Short window — liquid-only first 3h." : "Extended — solids after 3h."}`;

    edgeLogger.info("Calling Grok API for rehydration protocol");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: "json_object" },
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
      edgeLogger.error("Groq API error", undefined, { functionName: "rehydration-protocol", status: response.status, errorData });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    edgeLogger.info("Groq rehydration response received");

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different request.");
      throw new Error("No response from Groq API");
    }

    const protocol = parseJSON(content);

    // ── Expand phase groups into hourly steps (client expects hourlyProtocol) ────
    if (protocol.phases && Array.isArray(protocol.phases) && !protocol.hourlyProtocol) {
      const hourlyProtocol: any[] = [];
      for (const phase of protocol.phases) {
        const start = phase.startHour ?? phase.start_hour ?? 1;
        const end = phase.endHour ?? phase.end_hour ?? start;
        for (let h = start; h <= end; h++) {
          hourlyProtocol.push({
            hour: h,
            phase: phase.phase || "",
            fluidML: phase.fluidMLPerHour ?? phase.fluidML ?? 0,
            sodiumMg: phase.sodiumMgPerHour ?? phase.sodiumMg ?? 0,
            potassiumMg: phase.potassiumMgPerHour ?? phase.potassiumMg ?? 0,
            magnesiumMg: phase.magnesiumMgPerHour ?? phase.magnesiumMg ?? 0,
            carbsG: phase.carbsGPerHour ?? phase.carbsG ?? 0,
            drinkRecipe: phase.drinkRecipe || "",
            notes: phase.notes || "",
            foods: Array.isArray(phase.foods) ? phase.foods : [],
          });
        }
      }
      protocol.hourlyProtocol = hourlyProtocol;
      delete protocol.phases;
    }
    // Fallback: if AI returned hourlyProtocol directly, ensure foods are arrays
    if (protocol.hourlyProtocol) {
      for (const step of protocol.hourlyProtocol) {
        if (step.foods && !Array.isArray(step.foods)) step.foods = [];
      }
    }

    // Guard: if neither phases nor hourlyProtocol produced data, fail
    if (!protocol.hourlyProtocol?.length) {
      throw new Error("AI did not return a valid rehydration protocol. Please try again.");
    }

    // Ensure carbRefuelPlan exists
    if (!protocol.carbRefuelPlan) {
      protocol.carbRefuelPlan = { strategy: "", meals: [] };
    }

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
