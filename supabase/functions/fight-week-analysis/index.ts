import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

// Sanitize every string field recursively so no em/en dashes reach the client.
function stripDashes(v: unknown): unknown {
  if (typeof v === "string") {
    return v
      .replace(/[\u2014\u2013]/g, ", ")
      .replace(/--/g, ", ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (Array.isArray(v)) return v.map(stripDashes);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = stripDashes(val);
    }
    return out;
  }
  return v;
}

async function callGroqWithRetry(body: unknown, apiKey: string, maxAttempts = 3): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 && response.status !== 503) return response;
    lastResponse = response;
    if (attempt < maxAttempts - 1) {
      const backoff = 800 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return lastResponse as Response;
}

serve(async (req) => {
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

    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    const body = await req.json();
    const {
      currentWeight,
      targetWeight,
      daysUntilWeighIn,
      normalDailyCarbs,
      profile = {},
    } = body ?? {};

    if (
      typeof currentWeight !== "number" || typeof targetWeight !== "number" ||
      typeof daysUntilWeighIn !== "number" || currentWeight <= targetWeight ||
      daysUntilWeighIn < 1 || daysUntilWeighIn > 14
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid inputs" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const totalCut = +(currentWeight - targetWeight).toFixed(2);
    const percentBW = +(totalCut / currentWeight * 100).toFixed(2);
    const sex = profile.sex ?? "male";
    const age = profile.age ?? null;
    const heightCm = profile.height_cm ?? null;
    const tdee = profile.tdee ?? null;
    const bmr = profile.bmr ?? null;
    const activity = profile.activity_level ?? null;
    const trainingFreq = profile.training_frequency ?? null;
    const baselineCarbs = typeof normalDailyCarbs === "number" && normalDailyCarbs > 0
      ? normalDailyCarbs
      : (profile.ai_recommended_carbs_g ?? profile.normal_daily_carbs_g ?? null);

    const systemPrompt = `You are the FightCamp Wizard, a science-based combat-sports weight-cutting expert writing for an experienced fighter. You produce one structured fight-week protocol per request using evidence from ISSN 2025 Position Stand (Ricci et al.), Reale 2017/2018 (Reid Reale SSE 183), and Sawyer 2013.

TONE RULES (critical, non-negotiable):
- Write in natural flowing prose, the way a coach speaks.
- Never use em dashes, en dashes, or double hyphens. Use commas, periods, or split sentences.
- Use "and", "but", "so", contractions. Avoid "furthermore", "in conclusion", "it is important to note".
- Do not use headings, bullet prefixes, or markdown inside narrative strings. Plain prose only.
- All rationale text should sound human, confident, and concise.

EVIDENCE BASE (use specific numbers, cite no sources):
GLYCOGEN AND WATER
- Glycogen stores: 350 to 700 g muscle, 80 to 100 g liver. Each gram binds 2.7 g water.
- Low carb below 50 g per day for 3 to 7 days yields ~2% BM and preserves strength (Sawyer 2013).
- Protein must stay 2.0 to 2.5 g per kg throughout the cut. Fat fills the remaining calories.
- Low fibre below 10 g per day yields 0.4 to 0.7% BM over 4 days, up to 1% over 7 days.

SODIUM AND WATER LOADING
- Use the breakdown sodiumLoss (0.5 to 1% BM) and waterLoadingLoss (~0.8% BM) numbers as inputs to the totalToCut math. The dosing strategy itself is computed and rendered client-side, so do NOT include sodiumStrategy, fibreStrategy, or waterLoading objects in your output.

SWEATING METHODS
- Dry sauna: 4 rounds of 10 min at 90 C with 5-min cool-down breaks. Yields 0.5 to 0.9% BM per session. Men average 0.7%, women 0.6%.
- Hot-water immersion: 20 min at 39 to 40 C, then 40 min wrapped in towels. Yields ~2% BM per session. Double protocol (two sessions with a rest) can reach 4.5% BM. Epsom salt gives no benefit over plain water.
- Active sweat: up to 2 L per hour. Do active BEFORE passive to reduce cardiac strain. Depletes peripheral glycogen so combine strategically.
- Safety: core temp must NOT reach 40 C. Stop on dizziness, syncope, dark urine, confusion. Women 18 to 35 have 5x higher orthostatic risk.

SAFE ACUTE WEIGHT LOSS
- 72+ h recovery window: up to 6.7% BM safe.
- 48 h window: up to 5.7% BM.
- 24 h window: up to 4.4% BM.
- By sport: BJJ/wrestling (<4 h recovery) max 3%. Amateur boxing (4 to 12 h) max 4%. Pro MMA (24 to 36 h) max 6%.

CALORIE RULES
- Use TDEE as baseline when provided. Days 7 to 4 out: TDEE minus 300 to 500 kcal.
- Days 3 to 0: minimum-adequate intake at 25 to 28 kcal per kg fat-free mass, never below 1500 kcal.
- Protein 2.0 to 2.5 g per kg throughout. Fat fills what remains.

CARB DEPLETION (ISSN 2025, Reale SSE 183, Sawyer 2013 - NO soft taper)
- Day -7 to -6: transition only. Drop to 2 to 3 g per kg BW (roughly half of baseline) to prime the switch. Keep protein high.
- Day -5 onward: HARD DROP to below 50 g per day and HOLD until weigh-in. This is the depletion window that empties muscle and liver glycogen. Do not taper gradually, go straight to under 50 g.
- Day 0 (weigh-in): below 30 g, low-fibre carbs only, matched with minimal fluid intake.
- Minimum effective depletion window: 72 h at <50 g. Optimal: 3 to 7 days. If the athlete has fewer than 3 days available, glycogen will not fully deplete and expected yield drops to about 30% of potential.
- Training during depletion: continue skills work or low-intensity cardio at 40 to 50% max HR for 30 to 45 min per session. High-intensity skills training with low carbs will fully deplete glycogen within hours, so combine carefully.
- Expected yield at <50 g with training: 1 to 2% BM (glycogen plus 2.7 g bound water per gram of glycogen).
- Protein must stay 2.0 to 2.5 g per kg BW throughout. Fat fills remaining calories. Never drop protein to cut carbs further.

REHYDRATION POST WEIGH-IN
- Replace 125 to 150% of fluid lost. Bolus 300 to 500 ml, then 240 to 350 ml every 30 min, max 1000 ml per hour.
- Greater than 3% loss: ORS with 50 to 90 mmol per L sodium. Less than 3%: sports drinks.
- Carbs: significant depletion 8 to 12 g per kg, moderate 6 to 8 g per kg, minimal 4 to 5 g per kg. Use glucose plus fructose for over 60 g per hour.
- Caffeine 3 to 6 mg per kg, 60 min pre-competition, if tolerated.
- Target regain: at least 10% of lost BM.

MEDICAL RED FLAGS (stop the cut)
Core temp approaching 40 C. Persistent dizziness or syncope. Resting HR over 120. Confusion. Muscle cramps that do not resolve. Dark brown or cola-coloured urine. Over 8% total BM lost. Energy availability under 30 kcal per kg FFM.

OUTPUT FORMAT
Respond with valid JSON only. No prose outside the JSON. Every string field must obey the tone rules (no em dashes, no en dashes). Numbers must be consistent: breakdown.dietTotal must equal glycogenLoss + fibreLoss + sodiumLoss + waterLoadingLoss. breakdown.totalToCut must equal breakdown.dietTotal + breakdown.dehydrationNeeded within 0.1 kg.

The "timeline" array MUST contain exactly "daysUntilWeighIn" objects, one per day, in ascending order from day = -(daysUntilWeighIn - 1) through day = 0. Producing fewer or more is a critical error that will break the UI. Never collapse the timeline into a single summary entry.

Schema:
{
  "summary": "string, 2 to 3 sentences of prose",
  "riskLevel": "green" | "orange" | "red",
  "safetyWarning": "string or null (null only when green)",
  "breakdown": {
    "totalToCut": number,
    "percentBW": number,
    "glycogenLoss": number,
    "fibreLoss": number,
    "sodiumLoss": number,
    "waterLoadingLoss": number,
    "dietTotal": number,
    "dehydrationNeeded": number
  },
  "dehydration": {
    "percentBW": number,
    "safety": "green" | "orange" | "red",
    "saunaSessions": number
  },
  "timeline": [
    { "day": -6, "label": "6 Days Out", "projectedWeight": 77.0, "carbTarget_g": 154, "fibreTarget_g": 15, "sodiumTarget_mg": 2500, "fluidTarget_ml": 7700, "calorieTarget": 2200, "actions": ["short imperative", "second imperative"] },
    { "day": -5, "label": "5 Days Out", "projectedWeight": 76.6, "carbTarget_g": 154, "fibreTarget_g": 15, "sodiumTarget_mg": 2500, "fluidTarget_ml": 7700, "calorieTarget": 2200, "actions": ["..."] },
    { "day": -4, "label": "4 Days Out", "projectedWeight": 76.1, "carbTarget_g": 100, "fibreTarget_g": 10, "sodiumTarget_mg": 2300, "fluidTarget_ml": 7700, "calorieTarget": 2000, "actions": ["..."] },
    { "day": 0,  "label": "Weigh-In Day", "projectedWeight": 70.3, "carbTarget_g": 0, "fibreTarget_g": 0, "sodiumTarget_mg": 1500, "fluidTarget_ml": 400, "calorieTarget": 1500, "actions": ["..."] }
  ],
  "dehydrationTactics": [
    {
      "method": "dry_sauna" | "hot_bath" | "active_sweat" | "sauna_suit",
      "session": "string like '4 rounds of 10 min at 90 C, 5 min rest'",
      "expectedLossKg": number,
      "daysOut": number,
      "safetyNote": "string of prose"
    }
  ],
  "postWeighIn": {
    "targetRegainKg": number,
    "fluidPlan": "string of prose",
    "carbPlan": "string of prose",
    "sodiumPlan": "string of prose",
    "caffeineNote": "string of prose or null"
  },
  "medicalRedFlags": ["short plain sentence", "..."]
}`;

    const userPrompt = `ATHLETE PROFILE
Sex: ${sex}
Age: ${age ?? "unknown"}
Height: ${heightCm ? `${heightCm} cm` : "unknown"}
TDEE: ${tdee ? `${tdee} kcal` : "unknown"}
BMR: ${bmr ? `${bmr} kcal` : "unknown"}
Activity level: ${activity ?? "unknown"}
Training frequency: ${trainingFreq ? `${trainingFreq} sessions/week` : "unknown"}
Goal type: ${profile.goal_type ?? "cutting"}
Normal daily carbs baseline: ${baselineCarbs ? `${baselineCarbs} g` : "unknown"}
AI macro targets: ${profile.ai_recommended_calories ? `${profile.ai_recommended_calories} kcal, ${profile.ai_recommended_protein_g ?? "?"}P / ${profile.ai_recommended_carbs_g ?? "?"}C / ${profile.ai_recommended_fats_g ?? "?"}F` : "not set"}

FIGHT WEEK INPUTS
Current weight: ${currentWeight} kg
Weigh-in target: ${targetWeight} kg
Days until weigh-in: ${daysUntilWeighIn}
Total to cut: ${totalCut} kg (${percentBW}% body weight)

Build the complete protocol. Use the athlete's baseline carbs (${baselineCarbs ?? "estimate at 4 g per kg BW"}) to plan the taper. Tailor sauna or hot-bath dosing to the total dehydration need.

The timeline MUST contain exactly ${daysUntilWeighIn} entries, one per day. The \`day\` values, in order, must be: ${Array.from({ length: daysUntilWeighIn }, (_, i) => -(daysUntilWeighIn - 1 - i)).join(", ")}. Do not omit any day. Do not add extra days. Label convention: day -N is "N Days Out" (or "1 Day Out" when N=1), day 0 is "Weigh-In Day".

Every narrative string must flow like a coach speaking, with no em dashes or en dashes.`;

    edgeLogger.info("Calling Grok API for fight week protocol");

    const response = await callGroqWithRetry(
      {
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.15,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      },
      GROQ_API_KEY,
    );

    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
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
      const errorData = await response.json().catch(() => ({}));
      edgeLogger.error("Groq API error", undefined, { functionName: "fight-week-analysis", status: response.status, errorData });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const { content, filtered } = extractContent(data);

    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety.");
      throw new Error("No response from Groq API");
    }

    let plan: any;
    try {
      plan = parseJSON(content);
    } catch {
      edgeLogger.error("Failed to parse Grok response as JSON", undefined, { functionName: "fight-week-analysis", contentPreview: content.substring(0, 200) });
      return new Response(
        JSON.stringify({ error: "AI returned invalid response format. Please try again." }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate the AI respected the math. Reject plans whose totalToCut
    // drifts more than 5% from the actual (currentWeight - targetWeight).
    const aiTotal = Number(plan?.breakdown?.totalToCut);
    if (!Number.isFinite(aiTotal) || Math.abs(aiTotal - totalCut) / Math.max(totalCut, 0.1) > 0.05) {
      edgeLogger.warn("AI projection mismatch", { functionName: "fight-week-analysis", aiTotal, totalCut });
      // Force the correct total so the client UI stays coherent.
      if (plan?.breakdown) plan.breakdown.totalToCut = totalCut;
      if (plan?.breakdown) plan.breakdown.percentBW = percentBW;
    }

    const sanitized = stripDashes(plan);

    return new Response(JSON.stringify({ plan: sanitized }), {
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
