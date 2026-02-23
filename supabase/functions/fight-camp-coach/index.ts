import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      strain,
      dailyLoad,
      acuteLoad,
      chronicLoad,
      loadRatio,
      overtrainingScore,
      overtrainingZone,
      avgRPE7d,
      avgSoreness7d,
      sessionsLast7d,
      consecutiveHighDays,
      weeklySessionCount,
      avgSleep,
      latestSleep,
      latestSoreness,
      recentSessions,
    } = await req.json();

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const sessionsText = Array.isArray(recentSessions)
      ? recentSessions.map((s: any) =>
        `${s.date}: ${s.session_type} ${s.duration_minutes}min RPE${s.rpe} intensity:${s.intensity_level ?? s.intensity}${s.soreness_level > 0 ? ` soreness:${s.soreness_level}` : ''}${s.sleep_hours > 0 ? ` sleep:${s.sleep_hours}h` : ''}`
      ).join('\n')
      : 'No recent sessions';

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON.
Elite recovery specialist for combat sports training load management. Calm, professional, conservative, evidence-informed.

You CANNOT override deterministic values (strain, overtraining score, load ratio) — interpret only.

OUTPUT:
{
  "readiness_state": "push|maintain|reduce|recover",  // push=green light, maintain=stay, reduce=scale back, recover=rest day
  "coaching_summary": "1-2 sentences referencing actual numbers",
  "next_session_advice": "Specific: session type, duration, max RPE",
  "recovery_focus": ["protocol1", "protocol2", "protocol3"],  // 2-4 actionable, fighter-specific
  "risk_level": "low|moderate|high|critical"  // must match overtraining zone
}

Conservative approach: when in doubt, recommend less intensity.`;

    const userPrompt = `Fighter metrics (deterministic — do not override):
- Strain: ${strain?.toFixed(1) ?? 0}/21 | Daily Load: ${dailyLoad?.toFixed(0) ?? 0}
- Acute (7d): ${acuteLoad?.toFixed(0) ?? 0} | Chronic (28d): ${chronicLoad?.toFixed(0) ?? 0} | AC Ratio: ${loadRatio?.toFixed(2) ?? 1.0}
- Overtraining: ${overtrainingScore ?? 0}/100 (${overtrainingZone ?? 'low'})
- Avg RPE (7d): ${avgRPE7d?.toFixed(1) ?? 0} | Avg Soreness: ${avgSoreness7d?.toFixed(1) ?? 0}/10
- Sessions (7d): ${sessionsLast7d ?? weeklySessionCount ?? 0} | Consecutive high days: ${consecutiveHighDays ?? 0}
- Sleep: ${latestSleep ?? 8}h (avg ${avgSleep?.toFixed(1) ?? 0}h) | Soreness: ${latestSoreness ?? 0}/10

Recent sessions:
${sessionsText}`;

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
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    console.log("Minimax fight-camp-coach response:", JSON.stringify(data, null, 2));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered. Please try again.");
      throw new Error("No response from Minimax API");
    }

    const coach = parseJSON(content);

    return new Response(JSON.stringify({ coach }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fight-camp-coach:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
