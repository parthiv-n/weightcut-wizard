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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check AI usage limits (free: 1/day, premium: unlimited)
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    const { techniqueName, sport, existingTechniques } = await req.json();

    if (!techniqueName || typeof techniqueName !== "string") {
      return new Response(
        JSON.stringify({ error: "techniqueName must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!sport || typeof sport !== "string") {
      return new Response(
        JSON.stringify({ error: "sport must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    edgeLogger.info("Generating technique chains", { techniqueName, sport });

    const existingList = Array.isArray(existingTechniques) && existingTechniques.length > 0
      ? `\n\nExisting techniques in the user's graph (try to connect to these when realistic): ${existingTechniques.join(", ")}`
      : "";

    const systemPrompt = `You are a martial arts technique chain expert. Given a technique name and sport, generate realistic technique chains (sequences of setups → transitions → finishes) that lead into or flow from the given technique.

Rules:
- Return 3-5 chains, each with 2-4 techniques in sequence
- Each chain should be a realistic progression that a practitioner would train
- Include setups (entries), transitions, and finishes
- Be sport-specific: BJJ chains differ from Muay Thai combos
- Use standard technique names recognized in the martial arts community
- The given technique MUST appear in at least one chain
- If existing techniques are provided, try to create connections to them when realistic${existingList}

Return ONLY valid JSON in this exact format:
{
  "chains": [
    ["Setup Technique", "Transition", "Finish Technique"],
    ["Entry Move", "Target Technique"]
  ],
  "technique_metadata": {
    "position": "Guard/Mount/Standing/etc or null",
    "category": "Submission/Takedown/Sweep/Strike/Pass/Escape/etc"
  }
}`;

    const userPrompt = `Generate technique chains for "${techniqueName}" in ${sport}.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_completion_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, {
        functionName: "generate-technique-chains",
        status: response.status,
        errorData,
      });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: response.status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Grok API error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    edgeLogger.info("Grok response received for technique chains");

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety.");
      throw new Error("No response from Grok API");
    }

    const chainData = parseJSON(content);
    edgeLogger.info("Parsed technique chain data", { chainCount: chainData.chains?.length });

    return new Response(JSON.stringify(chainData), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("Error in generate-technique-chains", error, {
      functionName: "generate-technique-chains",
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
