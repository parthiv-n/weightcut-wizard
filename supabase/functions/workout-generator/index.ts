import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

const VALID_GOALS = ["hypertrophy", "strength", "explosiveness", "conditioning"];
const VALID_SPORTS = ["mma", "bjj", "boxing", "muay_thai", "wrestling", "general"];
const VALID_SPLITS = ["upper_lower", "push_pull_legs", "full_body", "bro_split", "ai_recommended"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
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

    const { goals, sport, sportTrainingDays, availableEquipment, sessionDurationMinutes, focusAreas, preferredSplit } = await req.json();

    // Validate inputs
    if (!Array.isArray(goals) || goals.length === 0 || !goals.every((g: string) => VALID_GOALS.includes(g))) {
      return new Response(
        JSON.stringify({ error: `goals must be a non-empty array from: ${VALID_GOALS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!sport || !VALID_SPORTS.includes(sport)) {
      return new Response(
        JSON.stringify({ error: `sport must be one of: ${VALID_SPORTS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (typeof sportTrainingDays !== "number" || sportTrainingDays < 2 || sportTrainingDays > 7) {
      return new Response(
        JSON.stringify({ error: "sportTrainingDays must be a number between 2 and 7" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(availableEquipment) || availableEquipment.length === 0) {
      return new Response(
        JSON.stringify({ error: "availableEquipment must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (typeof sessionDurationMinutes !== "number" || sessionDurationMinutes < 30 || sessionDurationMinutes > 90) {
      return new Response(
        JSON.stringify({ error: "sessionDurationMinutes must be between 30 and 90" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (preferredSplit && !VALID_SPLITS.includes(preferredSplit)) {
      return new Response(
        JSON.stringify({ error: `preferredSplit must be one of: ${VALID_SPLITS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const goalsStr = goals.join(", ");
    const focusStr = Array.isArray(focusAreas) && focusAreas.length > 0 ? focusAreas.join(", ") : "no specific focus — balanced program";
    const splitStr = preferredSplit === "ai_recommended" ? "choose the best split for their goals and schedule" : preferredSplit.replace("_", "/");

    edgeLogger.info("Generating workout routine", { goals, sport, sportTrainingDays });

    const systemPrompt = `You are an expert strength & conditioning coach for combat sports athletes. Your job is to design a gym program that COMPLEMENTS their martial arts training without causing overtraining.

The athlete trains their combat sport ${sportTrainingDays} days per week. Based on this, you MUST first determine how many gym sessions per week they should do and include it as "recommended_gym_days" in your response. Guidelines:
- 6-7 sport days → 2 gym sessions max
- 4-5 sport days → 2-3 gym sessions
- 2-3 sport days → 3-4 gym sessions

Their training goals: ${goalsStr}
Preferred workout split: ${splitStr}
Areas to focus on: ${focusStr}
Session duration: ${sessionDurationMinutes} minutes
Available equipment: ${availableEquipment.join(", ")}

If multiple goals are selected, blend them intelligently. For example, hypertrophy + explosiveness means moderate rep ranges with some power movements. Strength + conditioning means heavy compounds with metabolic finishers.

MANDATORY MOVEMENT PATTERNS — every routine MUST include at least one exercise from each of these categories, distributed across the split:
1. HINGE (posterior chain/hamstrings) — e.g. deadlift, Romanian deadlift, hip thrust, good morning, kettlebell swing
2. SQUAT (quads/glutes) — e.g. back squat, front squat, goblet squat, split squat, Bulgarian split squat, leg press
3. PUSH (chest/shoulders/triceps) — e.g. bench press, overhead press, dumbbell press, push-ups, dips
4. PULL (back/biceps) — e.g. pull-ups, chin-ups, barbell row, dumbbell row, cable row, lat pulldown
These four patterns are non-negotiable. Additional isolation or accessory work can be added after these are covered.

CRITICAL: Total weekly volume (sport + gym) must not risk overtraining. Keep gym volume moderate and prioritise compound movements that transfer to combat sports. Explain your programming decisions in the notes.

Return ONLY valid JSON. IMPORTANT: Each exercise MUST include a "day" field that groups it into the correct session of the split (e.g. "Day 1: Push", "Day 2: Pull", "Day 3: Legs" for PPL, or "Day 1: Upper", "Day 2: Lower" for upper/lower). For full body, use "Day 1: Full Body", "Day 2: Full Body", etc. Exercises must be ordered by day.

{
  "routine_name": "string",
  "recommended_gym_days": number,
  "split_used": "string (e.g. Upper/Lower, Full Body, Push/Pull/Legs)",
  "exercises": [
    {
      "day": "Day 1: Push",
      "name": "Exercise Name",
      "muscle_group": "chest|back|shoulders|triceps|biceps|quads|hamstrings|glutes|calves|abs|full_body",
      "sets": 3,
      "reps": "8-12",
      "rpe": 7,
      "rest_seconds": 90,
      "notes": "technique cue or why this exercise"
    }
  ],
  "notes": "Explain programming decisions, how this avoids overtraining, and how it complements their ${sport} training ${sportTrainingDays}x/week"
}`;

    const userPrompt = `Generate a gym workout routine for a ${sport.replace("_", " ")} athlete who trains their sport ${sportTrainingDays} days per week. Goals: ${goalsStr}. Focus areas: ${focusStr}. Split preference: ${splitStr}. Session length: ${sessionDurationMinutes} minutes. Equipment: ${availableEquipment.join(", ")}.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.4,
        max_completion_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, { functionName: "workout-generator", status: response.status, errorData });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Grok API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    edgeLogger.info("Grok response received");

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try different parameters.");
      throw new Error("No response from Grok API");
    }

    const routineData = parseJSON(content);
    edgeLogger.info("Parsed workout routine data");

    return new Response(
      JSON.stringify({ routineData }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in workout-generator function:", error);
    edgeLogger.error("Error in workout-generator function", error, { functionName: "workout-generator" });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
