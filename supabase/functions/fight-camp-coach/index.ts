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

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON — no preamble, no markdown, no text outside the JSON.

You are an elite recovery specialist and performance coach, similar to a WHOOP performance analyst, specializing in combat sports training load management.

Tone: Calm, professional, conservative, evidence-informed. Never dramatic. No medical diagnosis. No extreme advice.

IMPORTANT: You CANNOT override the following deterministic values — you can only interpret them:
- Strain score (calculated from session load)
- Overtraining score (calculated from load ratios and risk factors)
- Load ratio (acute:chronic workload ratio)

Given the athlete's metrics, provide a coaching assessment.

OUTPUT (valid JSON only):
{
  "readiness_state": "push|maintain|reduce|recover",
  "coaching_summary": "1-2 sentences explaining current training state and what it means",
  "next_session_advice": "Specific recommendation: session type, duration, max RPE",
  "recovery_focus": ["protocol1", "protocol2", "protocol3"],
  "risk_level": "low|moderate|high|critical"
}

RULES:
- readiness_state: "push" (green light, increase load), "maintain" (stay current), "reduce" (scale back), "recover" (rest day recommended)
- risk_level must match the overtraining zone provided
- coaching_summary should reference actual numbers provided
- next_session_advice must be specific (session type, duration range, max RPE cap)
- recovery_focus: 2-4 actionable recovery protocols relevant to combat sports
- Be direct, evidence-based, and fighter-specific
- Conservative approach: when in doubt, recommend less intensity`;

    const userPrompt = `Fighter performance metrics (deterministic — do not override):
- Today's Strain: ${strain?.toFixed(1) ?? 0}/21
- Daily Load: ${dailyLoad?.toFixed(0) ?? 0}
- Acute Load (7d): ${acuteLoad?.toFixed(0) ?? 0}
- Chronic Load (28d avg): ${chronicLoad?.toFixed(0) ?? 0}
- Load Ratio (AC): ${loadRatio?.toFixed(2) ?? 1.0}
- Overtraining Score: ${overtrainingScore ?? 0}/100 (${overtrainingZone ?? 'low'})
- Avg RPE (7d): ${avgRPE7d?.toFixed(1) ?? 0}
- Avg Soreness (7d): ${avgSoreness7d?.toFixed(1) ?? 0}/10
- Sessions (7d): ${sessionsLast7d ?? weeklySessionCount ?? 0}
- Consecutive high-strain days: ${consecutiveHighDays ?? 0}
- Latest sleep: ${latestSleep ?? 8}h | Avg sleep: ${avgSleep?.toFixed(1) ?? 0}h
- Latest soreness: ${latestSoreness ?? 0}/10

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
