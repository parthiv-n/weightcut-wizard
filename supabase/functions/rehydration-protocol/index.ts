import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { RESEARCH_SUMMARY } from "../_shared/researchSummary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
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

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports rehydration expert. Safety first.

<research>
${RESEARCH_SUMMARY}
</research>

ATHLETE: ${profileLines}

TARGETS (HARD CONSTRAINTS — do not deviate):
- Fluid: ${targets.totalFluidLitres}L (${targets.totalFluidML}ml) — 150% of ${weightLostKg}kg lost
- Max hourly: ${targets.hourlyFluidML}ml/h | Window: ${availableHours}h
- Sodium: ${targets.totalSodiumMg}mg | Potassium: ${targets.totalPotassiumMg}mg | Magnesium: ${targets.totalMagnesiumMg}mg
- Carbs: ${targets.totalCarbsG}g (${targets.carbTargetLabel} g/kg) | Max ${targets.maxCarbsPerHour}g/h
- Glycogen depletion: ${glycogenDepletion}
- Caffeine: ${targets.caffeineLowMg}-${targets.caffeineHighMg}mg, 60 min pre-competition

Distribute fluid & electrolyte totals across hourly protocol. Sum of fluidML ≈ ${targets.totalFluidML}ml. Sum of carbsG ≈ ${targets.totalCarbsG}g. Never exceed ${targets.maxCarbsPerHour}g carbs/h or ~1000ml/h.

Respond with valid JSON only:
{
  "summary": "Brief protocol overview",
  "hourlyProtocol": [{ "hour": 1, "timeLabel": "str", "phase": "str", "fluidML": 0, "sodiumMg": 0, "potassiumMg": 0, "magnesiumMg": 0, "carbsG": 0, "drinkRecipe": "str", "notes": "str", "foods": [] }],
  "carbRefuelPlan": { "strategy": "str", "meals": [{ "timing": "str", "carbsG": 0, "foods": [], "rationale": "str" }] },
  "warnings": ["str"],
  "education": { "howItWorks": [{ "title": "str", "content": "str" }], "caffeineGuidance": "str", "carbMouthRinse": "str" }
}

Foods: white rice, white bread, bananas, honey, rice cakes, sports drinks, ORS, sweetened milk, chicken breast, sports gels/chews, candy, diluted juice+salt.
Phases: Rapid Rehydration, Active Rehydration, Glycogen Loading, Sustained Recovery, Pre-Competition, Maintenance.
Education: 5 items covering Gastric Emptying, SGLT1 Co-Transport, Glycogen-Water Binding, 150% Rule, Phased Recovery.`;

    const userPrompt = `Rehydration protocol:
- Lost: ${weightLostKg}kg (${((weightLostKg / currentWeightKg) * 100).toFixed(1)}% BM) | Window: ${availableHours}h | Depletion: ${glycogenDepletion}

${availableHours <= 6
  ? `Short window (${availableHours}h): aggressive fast-absorbing protocol. Prioritize liquid carbs. First hour: 600-900ml ORS bolus.`
  : `Extended window (${availableHours}h): Transition liquid→solid high-carb low-fiber after 3h. First hour: 600-900ml ORS bolus.`}

Constraints: total fluid ≈${targets.totalFluidML}ml, total carbs ≈${targets.totalCarbsG}g, no hour >${targets.hourlyFluidML}ml or >${targets.maxCarbsPerHour}g carbs. Include drink recipes every hour, food suggestions, 3-5 safety warnings.`;

    console.log("Calling Grok API for rehydration protocol...");

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
    console.log("Grok rehydration response received");

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
