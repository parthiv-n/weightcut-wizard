import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import knowledgeData from "./chatbot-index.json" assert { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Deterministic calculations (not LLM-generated) ─────────────────────────
function computeTargets(
  weightLostKg: number,
  currentWeightKg: number,
  weighInTiming: string,
  glycogenDepletion: string
) {
  // 1. Recovery window
  const availableHours = weighInTiming === "same-day" ? 5 : 16;

  // 2. Total fluid = 150% of weight lost (Shirreffs & Maughan 1998; Reale SSE #183)
  const totalFluidML = weightLostKg * 1.5 * 1000;
  const totalFluidLitres = parseFloat((totalFluidML / 1000).toFixed(1));

  // 3. Hourly fluid rate capped at gastric emptying max (~1000ml/h)
  const hourlyFluidML = Math.min(1000, Math.round(totalFluidML / availableHours));

  // 4. Sodium target: 50-90 mmol/L = ~1150-2070 mg/L → use 1500 mg/L midpoint
  const sodiumPerLitre = 1500; // mg
  const totalSodiumMg = Math.round(sodiumPerLitre * totalFluidLitres);

  // 5. Potassium: ~240 mg per litre (120 mg per 500ml)
  const potassiumPerLitre = 240;
  const totalPotassiumMg = Math.round(potassiumPerLitre * totalFluidLitres);

  // 6. Magnesium: ~48 mg per litre (24 mg per 500ml)
  const magnesiumPerLitre = 48;
  const totalMagnesiumMg = Math.round(magnesiumPerLitre * totalFluidLitres);

  // 7. Carb targets based on glycogen depletion level (ISSN 2025; Reale SSE #183)
  let carbMultiplierLow: number;
  let carbMultiplierHigh: number;
  let carbTargetLabel: string;
  switch (glycogenDepletion) {
    case "significant":
      carbMultiplierLow = 8;
      carbMultiplierHigh = 12;
      carbTargetLabel = "8-12";
      break;
    case "moderate":
      carbMultiplierLow = 6;
      carbMultiplierHigh = 8;
      carbTargetLabel = "6-8";
      break;
    default: // "none"
      carbMultiplierLow = 4;
      carbMultiplierHigh = 5;
      carbTargetLabel = "4-5";
  }

  const carbMultiplierMid = (carbMultiplierLow + carbMultiplierHigh) / 2;
  const totalCarbsG = Math.round(currentWeightKg * carbMultiplierMid);
  const maxCarbsPerHour = 60; // ISSN 2025 point 13

  // 8. Caffeine: 3-6 mg/kg (Reale SSE #183)
  const caffeineLowMg = Math.round(currentWeightKg * 3);
  const caffeineHighMg = Math.round(currentWeightKg * 6);

  return {
    totalFluidLitres,
    totalFluidML,
    hourlyFluidML,
    totalSodiumMg,
    totalPotassiumMg,
    totalMagnesiumMg,
    sodiumPerLitre,
    potassiumPerLitre,
    magnesiumPerLitre,
    totalCarbsG,
    maxCarbsPerHour,
    carbTargetLabel,
    carbMultiplierLow,
    carbMultiplierHigh,
    availableHours,
    caffeineLowMg,
    caffeineHighMg,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Support warmup GET pings
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      weightLostKg,
      weighInTiming,
      currentWeightKg,
      glycogenDepletion = "moderate",
      sex,
      age,
      heightCm,
      activityLevel,
      trainingFrequency,
      tdee,
      goalWeightKg,
      fightWeekTargetKg,
    } = await req.json();

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    // ── Compute deterministic targets ──────────────────────────────────────
    const targets = computeTargets(weightLostKg, currentWeightKg, weighInTiming, glycogenDepletion);

    const researchContext = knowledgeData
      .map((doc: any) => `## Source: ${doc.title}\n${doc.content}`)
      .join("\n\n");

    // ── Build athlete profile context ──────────────────────────────────────
    const profileLines = [
      `Body weight: ${currentWeightKg}kg`,
      sex ? `Sex: ${sex}` : null,
      age ? `Age: ${age}` : null,
      heightCm ? `Height: ${heightCm}cm` : null,
      activityLevel ? `Activity level: ${activityLevel}` : null,
      trainingFrequency ? `Training frequency: ${trainingFrequency} sessions/week` : null,
      tdee ? `TDEE: ${tdee} kcal/day` : null,
      goalWeightKg ? `Goal weight: ${goalWeightKg}kg` : null,
      fightWeekTargetKg ? `Fight week target: ${fightWeekTargetKg}kg` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports rehydration expert. You PRIORITIZE fighter safety and performance.

CRITICAL SAFETY PRINCIPLES:
- Never recommend rapid rehydration that could cause hyponatremia
- Gradual, controlled rehydration is essential
- Electrolyte balance is as important as fluid volume
- Carbohydrate reintroduction must be gradual and strategic
- Avoid high fiber, high fat foods that slow digestion
- Maximum fluid intake: ~1000ml per hour (gastric emptying limit)
- Maximum carb delivery rate: ≤60g per hour (ISSN 2025)

YOUR KNOWLEDGE BASE (Scientific Research):
The following are full-text research papers and protocols on combat sports nutrition and rehydration. You MUST base your protocols STRICTLY on these papers. Do not hallucinate statistics.

<knowledge>
${researchContext}
</knowledge>

ATHLETE PROFILE:
${profileLines}

PRE-CALCULATED TARGETS (use these as HARD CONSTRAINTS — do not deviate):
<targets>
- Total fluid: ${targets.totalFluidLitres}L (${targets.totalFluidML}ml) — 150% of ${weightLostKg}kg lost
- Max hourly fluid: ${targets.hourlyFluidML}ml/h
- Recovery window: ${targets.availableHours} hours (${weighInTiming})
- Total sodium: ${targets.totalSodiumMg}mg (${targets.sodiumPerLitre}mg/L)
- Total potassium: ${targets.totalPotassiumMg}mg (${targets.potassiumPerLitre}mg/L)
- Total magnesium: ${targets.totalMagnesiumMg}mg (${targets.magnesiumPerLitre}mg/L)
- Total carbs target: ${targets.totalCarbsG}g (${targets.carbTargetLabel} g/kg × ${currentWeightKg}kg)
- Glycogen depletion level: ${glycogenDepletion}
- Max carbs per hour: ${targets.maxCarbsPerHour}g/h
- Caffeine window: ${targets.caffeineLowMg}-${targets.caffeineHighMg}mg, 60 min pre-competition
</targets>

You MUST distribute the pre-calculated fluid and electrolyte totals across the hourly protocol. The sum of all hourly fluidML values must approximate ${targets.totalFluidML}ml. The sum of all hourly carbsG must approximate ${targets.totalCarbsG}g. Do NOT exceed ${targets.maxCarbsPerHour}g carbs in any single hour.

OUTPUT FORMAT — respond with valid JSON only, no markdown:
{
  "summary": "Brief protocol overview tailored to this athlete",
  "hourlyProtocol": [
    {
      "hour": 1,
      "timeLabel": "Hour 1 (Post Weigh-In)",
      "phase": "Rapid Rehydration",
      "fluidML": 900,
      "sodiumMg": 1035,
      "potassiumMg": 240,
      "magnesiumMg": 48,
      "carbsG": 0,
      "drinkRecipe": "ORS: 900ml water + 1/2 tsp salt + electrolyte packet",
      "notes": "Large bolus to maximize gastric emptying. No solid food yet.",
      "foods": []
    }
  ],
  "carbRefuelPlan": {
    "strategy": "Overall carb strategy description referencing research",
    "meals": [
      {
        "timing": "Hour 2",
        "carbsG": 60,
        "foods": ["2 bananas", "500ml sports drink"],
        "rationale": "Begin glycogen restoration with high-GI sources (Reale SSE #183)"
      }
    ]
  },
  "warnings": ["Safety warnings specific to this athlete's protocol"],
  "education": {
    "howItWorks": [
      {
        "title": "Section title",
        "content": "Explanation referencing specific research"
      }
    ],
    "caffeineGuidance": "Caffeine dosing advice for this athlete (${targets.caffeineLowMg}-${targets.caffeineHighMg}mg)",
    "carbMouthRinse": "Carb mouth rinse guidance for GI-sensitive athletes (Burke & Maughan 2015)"
  }
}

FOOD SUGGESTIONS — use ONLY foods mentioned in the research papers:
White rice, white bread, bananas, honey, rice cakes, sports drinks (Gatorade/Powerade), ORS, sweetened milk, chicken breast, sports gels, sports chews, candy, diluted fruit juice with salt.

PHASE LABELS — use one of: "Rapid Rehydration", "Active Rehydration", "Glycogen Loading", "Sustained Recovery", "Pre-Competition", "Maintenance"

EDUCATION — include exactly 5 items in howItWorks covering: Gastric Emptying, SGLT1 Co-Transport, Glycogen-Water Binding, 150% Replacement Rule, Phased Recovery. Reference specific papers.`;

    const userPrompt = `Create a personalized rehydration protocol for this fighter:
- Weight lost: ${weightLostKg}kg (${((weightLostKg / currentWeightKg) * 100).toFixed(1)}% of body mass)
- Weigh-in timing: ${weighInTiming}
- Current weight: ${currentWeightKg}kg
- Glycogen depletion: ${glycogenDepletion}

CRITICAL TIMELINE INSTRUCTIONS:
${
      weighInTiming === "same-day"
        ? `- Generate an aggressive, fast-absorbing protocol.
- hourlyProtocol MUST cover exactly 4 to 6 hours. Do NOT generate more.
- Prioritize liquid carbs and fast gastric emptying.
- First hour: 600-900ml ORS bolus (Reale SSE #183).`
        : `- Generate a prolonged carbohydrate super-compensation protocol.
- hourlyProtocol MUST cover 12 to 16 hours.
- Transition from liquids to solid high-carb low-fiber meals after first 3 hours.
- First hour: 600-900ml ORS bolus (Reale SSE #183).`
    }

HARD CONSTRAINTS:
- Total fluid across all hours ≈ ${targets.totalFluidML}ml
- Total carbs across all hours ≈ ${targets.totalCarbsG}g
- No hour exceeds ${targets.hourlyFluidML}ml fluid or ${targets.maxCarbsPerHour}g carbs
- Include drink recipes in every hour
- Include specific food suggestions from the research papers
- Generate 3-5 safety warnings specific to this protocol`;

    console.log("Calling Minimax API for rehydration protocol...");

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
        max_tokens: 4096,
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
    console.log("Minimax rehydration response received");

    let protocolText = data.choices?.[0]?.message?.content;
    if (protocolText) {
      protocolText = protocolText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }

    if (!protocolText) {
      console.error("No content found in Minimax response");
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === "content_filter") {
        throw new Error("Content was filtered for safety. Please try a different request.");
      }
      throw new Error("No response from Minimax API");
    }

    // Parse the protocol JSON
    let protocol;
    try {
      protocol = JSON.parse(protocolText);
    } catch (_parseError) {
      const jsonMatch = protocolText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        protocol = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find raw JSON object
        const rawMatch = protocolText.match(/\{[\s\S]*\}/);
        if (rawMatch) {
          protocol = JSON.parse(rawMatch[0]);
        } else {
          throw new Error("Could not parse protocol data from AI response");
        }
      }
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
