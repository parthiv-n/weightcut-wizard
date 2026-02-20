import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const {
      currentWeight,
      goalWeight,
      fightWeekTarget,
      targetDate,
      tdee,
      bmr,
      activityLevel,
      age,
      sex,
      heightCm,
      aiRecommendedCalories,
      todayCalories,
      dailyCalorieGoal,
      weightHistory,
    } = await req.json();

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(0.14, daysRemaining / 7);

    const dietTarget = fightWeekTarget ?? goalWeight;
    const weightToLose = Math.max(0, currentWeight - dietTarget);
    const requiredWeeklyKg = weightToLose > 0 ? weightToLose / weeksRemaining : 0;

    const calorieGoal = aiRecommendedCalories ?? dailyCalorieGoal;
    const caloriePercentage = calorieGoal > 0 ? (todayCalories / calorieGoal) * 100 : 0;

    // Summarise weight history for prompt
    const last7 = Array.isArray(weightHistory) ? weightHistory.slice(-7) : [];
    const historyText = last7.length > 0
      ? last7.map((l: any) => `${l.date}: ${l.weight_kg}kg`).join(', ')
      : 'No recent logs';

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON — no preamble, no markdown, no text outside the JSON.

You are the Weight Cut Wizard — an evidence-based fight sports nutritionist and weight-cutting specialist for combat athletes.

Given today's snapshot of an athlete's data, produce a concise, personalised daily wisdom update.

RULES:
- Reference actual numbers (kg, kcal, days) in your advice.
- Flag risk as "orange" if requiredWeeklyKg > 1.0.
- Otherwise "green".
- Keep summary ≤ 15 words.
- adviceParagraph: 2-3 sentences of direct, personalised guidance.
- actionItems: exactly 3 short, actionable items for today.

OUTPUT (valid JSON only):
{
  "summary": "One-line card preview max 15 words",
  "riskLevel": "green|orange",
  "riskReason": "Brief scientific justification",
  "daysToFight": 0,
  "weeklyPaceKg": 0.0,
  "requiredWeeklyKg": 0.0,
  "paceStatus": "on_track|ahead|behind|at_target",
  "adviceParagraph": "2-3 personalised sentences",
  "actionItems": ["item1", "item2", "item3"],
  "nutritionStatus": "Short nutrition assessment"
}`;

    const userPrompt = `Athlete daily snapshot:
- Current weight: ${currentWeight}kg
- Diet target (fight-week): ${dietTarget}kg
- Final weigh-in target: ${goalWeight}kg
- Days until fight: ${daysRemaining}
- Required weekly loss: ${requiredWeeklyKg.toFixed(2)} kg/week
- TDEE: ${tdee ?? 'unknown'} kcal${bmr ? ` | BMR: ${bmr} kcal` : ''}
- Activity: ${activityLevel ?? 'unknown'} | Age: ${age ?? 'unknown'} | Sex: ${sex ?? 'unknown'} | Height: ${heightCm ?? 'unknown'}cm
- Today calories consumed: ${todayCalories} kcal / goal ${calorieGoal} kcal (${caloriePercentage.toFixed(0)}%)
- Last 7 weight logs: ${historyText}

Compute weeklyPaceKg from last 7 logs if possible (loss per week). Set daysToFight = ${daysRemaining}. Set requiredWeeklyKg = ${requiredWeeklyKg.toFixed(2)}. Determine paceStatus vs required pace.`;

    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key and billing." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Minimax API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Minimax daily-wisdom response:", JSON.stringify(data, null, 2));

    let wisdomText = data.choices?.[0]?.message?.content;
    // Strip <think> tags
    if (wisdomText) {
      wisdomText = wisdomText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!wisdomText) {
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        throw new Error("Content was filtered. Please try again.");
      }
      throw new Error("No response from Minimax API");
    }

    let wisdom;
    try {
      wisdom = JSON.parse(wisdomText);
    } catch {
      const jsonMatch = wisdomText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          wisdom = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error("Failed to parse extracted JSON:", jsonMatch[1]);
        }
      }
      if (!wisdom) {
        // Try extracting bare JSON object
        const objMatch = wisdomText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            wisdom = JSON.parse(objMatch[0]);
          } catch {
            console.error("Failed to parse bare JSON from response:", wisdomText);
          }
        }
      }
      if (!wisdom) {
        console.error("Failed to parse Minimax response as JSON:", wisdomText);
        throw new Error("Could not parse wisdom from AI response");
      }
    }

    return new Response(JSON.stringify({ wisdom }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in daily-wisdom:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
