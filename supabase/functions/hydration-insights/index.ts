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

  try {
    // Verify authentication
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

    const { hydrationData, profileData, recentLogs } = await req.json();
    const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") || "***REDACTED_API_KEY***";

    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert combat sports nutritionist specializing in hydration strategies for fighters. You prioritize fighter safety and performance above all else. You have deep knowledge of hydration protocols, sodium manipulation, and fluid management specific to combat sports weight cutting. You NEVER encourage:
- Extreme dehydration (>3% body weight loss)
- Diuretics or dangerous supplements
- Plastic suits or excessive sauna use without supervision
- Eliminating sodium completely
- Cutting water too early before weigh-in

You provide:
- Evidence-based hydration strategies
- Safe sodium manipulation advice
- Performance-focused guidance
- Gradual, controlled adjustments
- Recovery protocols that prioritize health

Keep responses concise (2-3 sentences max) and actionable. Use fighter-appropriate language.`;

    const userPrompt = `Current hydration status:
- Daily target: ${hydrationData.dailyTarget}L
- Current intake: ${hydrationData.currentIntake}L
- Sodium today: ${hydrationData.sodiumToday || 0}mg
- Recent sweat loss: ${hydrationData.sweatLoss || "none logged"}%
- Days to weigh-in: ${profileData.daysToWeighIn || "unknown"}
- Activity level: ${profileData.activityLevel || "moderate"}

Recent patterns: ${recentLogs || "No recent logs"}

Provide a brief insight on their hydration status and one actionable recommendation.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const insight = data.choices[0].message.content;

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in hydration-insights:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
