import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

const VALID_GOALS = ["hypertrophy", "strength", "explosiveness", "conditioning"] as const;
const VALID_SPORTS = ["mma", "bjj", "boxing", "muay_thai", "wrestling", "general"] as const;

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

    const { goal, sport, trainingDays, availableEquipment, sessionDurationMinutes } = await req.json();

    // Validate inputs
    if (!goal || !VALID_GOALS.includes(goal)) {
      return new Response(
        JSON.stringify({ error: `goal must be one of: ${VALID_GOALS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!sport || !VALID_SPORTS.includes(sport)) {
      return new Response(
        JSON.stringify({ error: `sport must be one of: ${VALID_SPORTS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (typeof trainingDays !== "number" || trainingDays < 2 || trainingDays > 6) {
      return new Response(
        JSON.stringify({ error: "trainingDays must be a number between 2 and 6" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(availableEquipment) || availableEquipment.length === 0) {
      return new Response(
        JSON.stringify({ error: "availableEquipment must be a non-empty array of strings" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (typeof sessionDurationMinutes !== "number" || sessionDurationMinutes < 30 || sessionDurationMinutes > 90) {
      return new Response(
        JSON.stringify({ error: "sessionDurationMinutes must be a number between 30 and 90" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    edgeLogger.info("Generating workout routine", { goal, sport, trainingDays });

    const systemPrompt = `You are an expert strength & conditioning coach for combat sports athletes. Generate a workout routine that complements their martial arts training without causing overtraining. Focus on the specified goal while respecting recovery needs.

Exercise database categories available:
- push: chest, shoulders, triceps
- pull: back, biceps
- legs: quads, hamstrings, glutes, calves
- core: abs
- full_body

Return ONLY valid JSON in this exact format:
{
  "routine_name": "string",
  "exercises": [
    {
      "name": "Exercise Name",
      "muscle_group": "chest|back|shoulders|triceps|biceps|quads|hamstrings|glutes|calves|abs|full_body",
      "sets": 3,
      "reps": "8-12",
      "rpe": 7,
      "rest_seconds": 90,
      "notes": "optional technique cue"
    }
  ],
  "notes": "Brief explanation of why this routine suits their goals"
}`;

    const userPrompt = `Generate a workout routine with:
- Goal: ${goal}
- Sport: ${sport}
- Training days per week: ${trainingDays}
- Available equipment: ${availableEquipment.join(", ")}
- Session duration: ${sessionDurationMinutes} minutes`;

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
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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
