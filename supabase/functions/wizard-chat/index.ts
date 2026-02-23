import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent } from "../_shared/parseResponse.ts";
import { RESEARCH_SUMMARY } from "../_shared/researchSummary.ts";

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

    // Fetch user data from database instead of trusting client
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('current_weight_kg, goal_weight_kg, target_date')
      .eq('id', user.id)
      .single();

    const userData = profile ? {
      currentWeight: profile.current_weight_kg,
      goalWeight: profile.goal_weight_kg,
      daysToWeighIn: Math.ceil(
        (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    } : null;

    const { messages } = await req.json();
    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");

    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    // Cap conversation history to last 20 messages to prevent token explosion
    const cappedMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const systemPrompt = `You are the "Weight Cut Wizard" — expert, science-backed combat sports nutritionist and coach. Talking directly to a fighter. Modern, conversational, concise (under 200 words unless explaining a complex protocol).

${userData ? `ATHLETE: ${userData.currentWeight}kg → ${userData.goalWeight}kg | ${userData.daysToWeighIn} days` : "No profile data yet."}

<research>
${RESEARCH_SUMMARY}
</research>

RULES:
- Base advice strictly on the research above. Do not hallucinate statistics.
- Safety first. If dangerous, firmly decline and give the safe alternative.
- Calculate exact deficits when asked, based on timeline.
- Focus on performance — making weight with no energy = losing the fight.
- Format: short paragraphs, bullet points for lists, bold key terms. No walls of text.`;

    console.log("Calling Minimax API with memory footprint...");

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
          ...cappedMessages
        ],
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Minimax API error:", response.status, errorData);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
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

      return new Response(
        JSON.stringify({ error: `Minimax API error: ${errorData.error?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Wizard chat Minimax response:", JSON.stringify(data, null, 2));

    let { content: generatedText, filtered } = extractContent(data);

    if (!generatedText) {
      if (filtered) {
        generatedText = "I can't provide that specific advice for safety reasons. Let me help you with a safer approach to your weight cut goals.";
      } else {
        throw new Error("No response from Minimax API");
      }
    }

    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: generatedText,
            role: "assistant"
          }
        }]
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("wizard-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
