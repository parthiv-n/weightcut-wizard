import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { RESEARCH_SUMMARY } from "../_shared/researchSummary.ts";
import { normaliseWeeklyPlan } from "../_shared/normalizeWeeklyPlan.ts";

// FREE for all users — generated during onboarding, no gem cost

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

    const body = await req.json();
    const {
      currentWeight, goalWeight, fightWeekTarget, targetDate,
      age, sex, heightCm, activityLevel, trainingFrequency,
      bmr, tdee,
    } = body;

    // Pre-compute deterministic values
    const now = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));
    const totalToLose = Math.max(0, currentWeight - fightWeekTarget);
    const weeklyLossRate = Math.min(totalToLose / weeksRemaining, 1.0);
    const dailyDeficit = Math.round((weeklyLossRate * 7700) / 7);
    const targetCalories = Math.max(sex === 'female' ? 1200 : 1500, Math.round(tdee - dailyDeficit));
    const proteinTarget = Math.round(fightWeekTarget * 2.2);
    const fatTarget = Math.round((targetCalories * 0.25) / 9);
    const carbTarget = Math.round((targetCalories - (proteinTarget * 4) - (fatTarget * 9)) / 4);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    // Fight week macros: near maintenance but <50g carbs, rest high fat + high protein
    const fightWeekProtein = Math.round(fightWeekTarget * 2.3);
    const fightWeekCarbs = 40;
    const fightWeekFat = Math.round((tdee - (fightWeekProtein * 4) - (fightWeekCarbs * 4)) / 9);

    const systemPrompt = `You are FightCamp Wizard — a professional weight cut coach. Write in a professional, informative tone using full sentences. Keep explanations clear and accessible — no unnecessary jargon.

${RESEARCH_SUMMARY}

THIS ATHLETE:
- ${sex}, ${age} years old, ${heightCm}cm
- Current weight: ${currentWeight}kg
- Fight week target: ${fightWeekTarget}kg (before final water cut)
- Fight night weight: ${goalWeight}kg
- Fight date: ${targetDate} (${daysRemaining} days, ~${weeksRemaining} weeks)
- Total to lose through diet: ${totalToLose.toFixed(1)}kg
- Required rate: ${weeklyLossRate.toFixed(1)}kg per week

THEIR NUMBERS:
- Maintenance calories: ${tdee} kcal/day
- Daily deficit: ${dailyDeficit} kcal
- Target daily intake: ${targetCalories} kcal
- Protein: ${proteinTarget}g | Carbs: ${carbTarget}g | Fat: ${fatTarget}g

FIGHT WEEK (final week):
- Calories return to near maintenance (~${tdee} kcal) — calorie deficit is negligible during fight week
- Carbs drop below 50g to deplete glycogen and shed water weight from muscles
- Protein stays high at ${fightWeekProtein}g to protect muscle
- Fat increases to ${fightWeekFat}g to make up the calories
- Weight loss in fight week comes from water, glycogen, sodium, and fibre — not from eating less

RULES:
1. Create ${Math.min(weeksRemaining, 12)} weeks
2. Each week: targetWeight, calories, protein_g, carbs_g, fats_g. Set focus to "" (empty string) for all weeks EXCEPT the final week
3. For the FINAL WEEK ONLY: set focus to a brief 1-2 sentence explanation that calories return to near maintenance, carbs drop very low, and the deficit is negligible because weight loss now comes from water and glycogen manipulation
4. Do NOT include tips array — omit it entirely
5. Protein at 2.0-2.5g/kg bodyweight throughout
6. Max 1kg/week loss, max 750 kcal/day deficit
7. summary: 2-3 professional sentences summarising the plan, referencing their specific numbers
8. safetyNotes: 1-2 professional sentences
9. keyPrinciples: exactly 3 clear, informative bullet points
10. fightWeek: 4 sections, each written as 2-4 professional sentences:
    - lowCarb: explain what happens when carbs drop below 50g, why glycogen depletion causes water loss, and what foods to eat instead
    - sodium: explain the sodium restriction protocol (<2300mg/d during fight week). Note: sodium loading is NOT evidence-based (ISSN 2025). Only restriction is validated. Takes 2-3 days for balance to shift, yielding 0.5-1% BM.
    - waterLoading: explain the water loading protocol with specific timing
    - nutrition: explain what meals look like during fight week with examples

Return ONLY valid JSON:
{
  "weeklyPlan": [{"week":1,"targetWeight":0,"calories":0,"protein_g":0,"carbs_g":0,"fats_g":0,"focus":""}],
  "summary": "",
  "totalWeeks": ${Math.min(weeksRemaining, 12)},
  "weeklyLossTarget": "${weeklyLossRate.toFixed(1)} kg/week",
  "maintenanceCalories": ${tdee},
  "deficit": ${dailyDeficit},
  "safetyNotes": "",
  "fightWeek": {
    "lowCarb": "",
    "sodium": "",
    "waterLoading": "",
    "nutrition": ""
  },
  "keyPrinciples": ["","",""]
}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate my personalised weight cut plan." },
        ],
        temperature: 0.4,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      edgeLogger.error("Groq API error", undefined, { functionName: "generate-cut-plan", status: response.status, errText });
      throw new Error(`AI service error: ${response.status}`);
    }

    const grokData = await response.json();
    const { content, filtered } = extractContent(grokData);
    if (!content || filtered) {
      throw new Error("AI response was empty or filtered");
    }
    const plan = parseJSON(content);

    if (!plan || !plan.weeklyPlan) {
      throw new Error("Invalid plan response from AI");
    }

    // Enforce week count + final-week target weight = fight-week target.
    // The LLM occasionally drifts on either; normalise deterministically so
    // every user sees a row per week ending exactly at fight_week_target_kg.
    const cutWeekCount = Math.min(weeksRemaining, 12);
    plan.weeklyPlan = normaliseWeeklyPlan({
      weeklyPlan: plan.weeklyPlan,
      weekCount: cutWeekCount,
      startWeight: currentWeight,
      finalTarget: fightWeekTarget,
      defaultCalories: targetCalories,
      defaultProtein: proteinTarget,
      defaultCarbs: carbTarget,
      defaultFats: fatTarget,
    });

    // Override deterministic values
    plan.totalWeeks = cutWeekCount;
    plan.weeklyLossTarget = `${weeklyLossRate.toFixed(1)} kg/week`;
    plan.maintenanceCalories = tdee;
    plan.deficit = dailyDeficit;
    plan.targetCalories = targetCalories;

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    edgeLogger.error("generate-cut-plan error", err, { functionName: "generate-cut-plan" });
    return new Response(JSON.stringify({ error: err.message || "Failed to generate plan" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
