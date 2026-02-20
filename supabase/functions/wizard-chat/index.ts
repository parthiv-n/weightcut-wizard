import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import knowledgeData from "./chatbot-index.json" assert { type: "json" };

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

    const researchContext = knowledgeData.map((doc: any) => `## Source: ${doc.title}\n${doc.content}`).join('\n\n');

    const systemPrompt = `You are the "Weight Cut Wizard", a master, science-backed combat sports nutritionist and coach.
Keep your responses modern, conversational, and relatively concise (under 200 words unless explaining a complex protocol). You are talking directly to a fighter.

CRITICAL USER CONTEXT:
${userData ? `- Current Weight: ${userData.currentWeight}kg\n- Fight Target Weight: ${userData.goalWeight}kg\n- Days Until Weigh-in: ${userData.daysToWeighIn} days` : "- No profile data provided yet."}

YOUR KNOWLEDGE BASE (Scientific Research):
The following are full-text research papers and protocols on combat sports nutrition. You MUST base your advice strictly on these protocols and standards. Retrieve the most relevant scientific data from this context to answer the user's questions intelligently. Do not hallucinate statistics.

<knowledge>
${researchContext}
</knowledge>

YOUR PERSONALITY & RULES:
- Expert, authoritative, yet friendly and motivational ("Let's get this cut dialed in, champ").
- You remember the conversation history provided in the chat.
- SAFETY FIRST: Base your safety standards strictly on the research provided.
- Focus on performance. A fighter who makes weight but has no energy will lose. Recommend high-carb peri-workout nutrition as supported by the literature.
- If they ask for a plan, calculate the exact daily deficit needed based on their timeline.
- If a request is dangerous, firmly decline and provide the safe, scientific alternative.
- IMPORTANT FORMATTING: Organize your replies into easy-to-read, short paragraphs. Use bullet points when listing items, and bold key terms for readability. Never output a giant wall of text.`;

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
          ...messages // Spread the full conversation history for memory
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

    let generatedText = data.choices?.[0]?.message?.content;
    // Strip <think> tags from Minimax response
    if (generatedText) {
      generatedText = generatedText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!generatedText) {
      console.error("No content found in wizard chat response");
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        generatedText = "I can't provide that specific advice for safety reasons. Let me help you with a safer approach to your weight cut goals.";
      } else {
        throw new Error("No response from Minimax API");
      }
    }

    // Return the response as JSON (not streaming like Lovable)
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
