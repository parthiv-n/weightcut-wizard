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
    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");

    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a science-based mystical coach who prioritises fighter safety and performance. You NEVER encourage:
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

    const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;

    console.log("Calling Minimax API for hydration insights...");

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
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 512
      })
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
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    console.log("Minimax hydration response:", JSON.stringify(data, null, 2));

    let insight = data.choices?.[0]?.message?.content;
    // Strip <think> tags from Minimax response
    if (insight) {
      insight = insight.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!insight) {
      console.error("No content found in Minimax response");
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        throw new Error("Content was filtered for safety. Please try a different request.");
      }
      throw new Error("No response from Minimax API");
    }

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
