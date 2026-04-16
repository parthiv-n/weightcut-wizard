import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

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

    // Check AI usage limits (free: 1/day, premium: unlimited)
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    const { sessions } = await req.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sessions with notes provided" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const sessionsText = sessions
      .map((s: any) => `${s.date} | ${s.session_type} | ${s.duration_minutes}min | Notes: ${s.notes}`)
      .join('\n');

    const systemPrompt = `You are a combat sports training analyst. Organize weekly session notes by sport.

For each technique/problem in notes:
- 3-5 step execution guide
- 1 sparring tip
- "drillFlow": ALWAYS include a 3-4 step improvement progression from solo/bag → partner/positional → live sparring

Group by the EXACT session_type provided in the data. Valid types: BJJ, Muay Thai, Boxing, Wrestling, Sparring, Strength, Conditioning, Run.
IMPORTANT: Keep each sport SEPARATE. Boxing is NOT Muay Thai — do not merge or remap combat sports. Use the session_type value exactly as given.

Return ONLY valid JSON:
{
  "sportSections": [
    {
      "sport": "BJJ",
      "sessions_count": 2,
      "techniques": [
        {
          "name": "Kimura from Side Control",
          "steps": ["Step 1", "Step 2", "Step 3"],
          "sparringTip": "Set up from failed americana...",
          "drillFlow": ["Solo: hip escape reps 3x10", "Partner: positional start from side control", "Live: 3min rounds from side control only"]
        }
      ]
    }
  ],
  "weekOverview": "1-2 sentence summary"
}`;

    const userPrompt = `Here are my training sessions from this week. Organize the techniques and drills I worked on:\n\n${sessionsText}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      edgeLogger.error("Groq API error", undefined, { functionName: "training-summary", status: response.status, errorText });
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    edgeLogger.info("Groq training-summary response received", { responseKeys: Object.keys(data) });

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered. Please try again.");
      throw new Error("No response from Groq API");
    }

    const summary = parseJSON(content);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("training-summary error", error, { functionName: "training-summary" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
