import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent } from "../_shared/parseResponse.ts";

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

    const systemPrompt = `You are the Weight Cut Wizard, a science-based combat sports hydration coach. Safety first.
Never encourage: extreme dehydration (>3% BW), diuretics, plastic suits unsupervised, eliminating sodium, cutting water too early.
Provide evidence-based, gradual hydration strategies. Keep responses concise (2-3 sentences) and actionable.`;

    const userPrompt = `Hydration status:
- Target: ${hydrationData.dailyTarget}L | Current: ${hydrationData.currentIntake}L
- Sodium: ${hydrationData.sodiumToday || 0}mg | Sweat loss: ${hydrationData.sweatLoss || "none"}%
- Days to weigh-in: ${profileData.daysToWeighIn || "unknown"} | Activity: ${profileData.activityLevel || "moderate"}
- Recent: ${recentLogs || "No recent logs"}

Brief insight + one actionable recommendation.`;

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
        max_tokens: 256
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

    const { content: insight, filtered } = extractContent(data);
    if (!insight) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different request.");
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
