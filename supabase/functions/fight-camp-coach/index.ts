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
      recoveryScore,
      recoveryStatus,
      acRatio,
      weeklySessionCount,
      overtrainingRisk,
      avgSleep,
      latestSleep,
      latestSoreness,
      consecutiveHighDays,
      recentSessions,
    } = await req.json();

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const sessionsText = Array.isArray(recentSessions)
      ? recentSessions.map((s: any) =>
        `${s.date}: ${s.session_type} ${s.duration_minutes}min RPE${s.rpe} (${s.intensity})${s.soreness_level > 0 ? ` soreness:${s.soreness_level}` : ''}${s.sleep_hours > 0 ? ` sleep:${s.sleep_hours}h` : ''}`
      ).join('\n')
      : 'No recent sessions';

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON — no preamble, no markdown, no text outside the JSON.

You are an elite combat sports performance analyst specializing in training load management and recovery optimization for fighters.

Given the athlete's training metrics and recent session data, provide a recovery coaching assessment.

OUTPUT (valid JSON only):
{
  "readiness_state": "ready_to_train|train_light|rest_recommended",
  "summary": "1-2 sentences assessing current state",
  "next_session_recommendation": "Specific: type, duration, RPE cap",
  "recovery_focus": ["protocol1", "protocol2"],
  "risk_flags": []
}

RULES:
- readiness_state must be exactly one of the three values
- summary should reference actual numbers
- next_session_recommendation must be specific (session type, duration, max RPE)
- recovery_focus: 2-4 actionable recovery protocols
- risk_flags: only include if there are genuine concerns, otherwise empty array
- Be direct, evidence-based, and fighter-specific`;

    const userPrompt = `Fighter training metrics:
- Today's strain: ${strain?.toFixed(1) ?? 0}/21
- Recovery score: ${recoveryScore ?? 0}% (${recoveryStatus ?? 'unknown'})
- Acute:Chronic ratio: ${acRatio?.toFixed(2) ?? 1.0}
- Sessions this week: ${weeklySessionCount ?? 0}
- Overtraining risk: ${overtrainingRisk?.level ?? 'low'}${overtrainingRisk?.factors?.length > 0 ? ` (${overtrainingRisk.factors.join('; ')})` : ''}
- Latest sleep: ${latestSleep ?? 8}h | Avg sleep: ${avgSleep?.toFixed(1) ?? 0}h
- Latest soreness: ${latestSoreness ?? 0}/10
- Consecutive high-strain days: ${consecutiveHighDays ?? 0}

Recent sessions (last 7 days):
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

    let coachText = data.choices?.[0]?.message?.content;
    // Strip <think> tags
    if (coachText) {
      coachText = coachText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!coachText) {
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        throw new Error("Content was filtered. Please try again.");
      }
      throw new Error("No response from Minimax API");
    }

    let coach;
    try {
      coach = JSON.parse(coachText);
    } catch {
      const jsonMatch = coachText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          coach = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error("Failed to parse extracted JSON:", jsonMatch[1]);
        }
      }
      if (!coach) {
        const objMatch = coachText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            coach = JSON.parse(objMatch[0]);
          } catch {
            console.error("Failed to parse bare JSON from response:", coachText);
          }
        }
      }
      if (!coach) {
        console.error("Failed to parse Minimax response as JSON:", coachText);
        throw new Error("Could not parse coach response from AI");
      }
    }

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
