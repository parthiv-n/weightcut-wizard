import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getExperienceTier(freq: number | null, level: string | null): string {
  const f = freq ?? 0;
  if (f >= 6 || level === 'extra_active') return 'advanced (high-volume athlete)';
  if (f >= 4 || level === 'very_active') return 'intermediate (regular competitor)';
  if (f >= 2 || level === 'moderately_active') return 'developing (building base)';
  return 'beginner (low training history)';
}

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
      checkIn,
      athleteProfile,
      // New enhanced fields
      readinessScore,
      readinessLabel,
      readinessBreakdown,
      trendAlerts,
      athleteTier,
      personalRpeCeiling,
      personalNormalSessions,
      sleepScore,
      avgSleepLast3,
    } = await req.json();

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const sessionsText = Array.isArray(recentSessions)
      ? recentSessions.map((s: any) =>
        `${s.date}: ${s.session_type} ${s.duration_minutes}min RPE${s.rpe} intensity:${s.intensity_level ?? s.intensity}${s.soreness_level > 0 ? ` soreness:${s.soreness_level}` : ''}${s.sleep_hours > 0 ? ` sleep:${s.sleep_hours}h` : ''}`
      ).join('\n')
      : 'No recent sessions';

    const checkInText = checkIn
      ? `\nSubjective check-in (fighter's self-report right now):
- Energy: ${checkIn.energy}
- Body soreness: ${checkIn.soreness}
- Last night's sleep: ${checkIn.sleep}
- Mental state: ${checkIn.mental}`
      : '';

    const athleteBaselineText = athleteProfile
      ? `\nAthlete baseline (from onboarding profile):
- Declared training frequency: ${athleteProfile.trainingFrequency ?? 'unknown'} sessions/week
- Activity level: ${athleteProfile.activityLevel?.replace(/_/g, ' ') ?? 'unknown'}
- Experience tier: ${getExperienceTier(athleteProfile.trainingFrequency, athleteProfile.activityLevel)}`
      : '';

    // Build readiness text if available
    const readinessText = readinessScore != null
      ? `\nReadiness Score: ${readinessScore}/100 (${readinessLabel ?? 'unknown'})${
          readinessBreakdown
            ? `\n  - Sleep: ${readinessBreakdown.sleepScore}/100 | Soreness: ${readinessBreakdown.sorenessScore}/100 | Load Balance: ${readinessBreakdown.loadBalanceScore}/100 | Recovery: ${readinessBreakdown.recoveryScore}/100 | Consistency: ${readinessBreakdown.consistencyScore}/100`
            : ''
        }`
      : '';

    // Build calibration text if available
    const calibrationText = athleteTier
      ? `\nPersonal Calibration:
- Tier: ${athleteTier}
- RPE Ceiling: ${personalRpeCeiling ?? 'default'}
- Normal Sessions/wk: ${personalNormalSessions ?? 'default'}
- Sleep Score: ${sleepScore ?? 'N/A'}/100
- 3-Night Avg Sleep: ${avgSleepLast3 ? avgSleepLast3.toFixed(1) + 'h' : 'N/A'}`
      : '';

    // Build trend alerts text
    const trendAlertsText = Array.isArray(trendAlerts) && trendAlerts.length > 0
      ? `\nActive Trend Alerts:\n${trendAlerts.map((a: string) => `- ${a}`).join('\n')}`
      : '';

    const systemPrompt = `You are a JSON API. Respond with ONLY valid JSON.
Elite recovery specialist for combat sports training load management. Calm, professional, conservative, evidence-informed.

You CANNOT override deterministic values (strain, overtraining score, load ratio, readiness score) — interpret only.
Incorporate the fighter's subjective check-in alongside deterministic metrics when provided.
If check-in reports severe soreness + empty energy + terrible sleep + burnt_out, strongly recommend rest (set rest_day_override: true).
Always provide 2 alternatives: one for feeling better than the primary recommendation, one for feeling worse.
If no subjective check-in is provided, base recommendations on metrics alone.

ATHLETE CALIBRATION:
When athlete baseline is provided, adjust your interpretation of metrics to their experience level:
- Advanced (6+ sessions/week baseline): Load ratio up to 1.4 is tolerable. 5-7 sessions/week is normal. RPE 7-8 is sustainable working range. Maintain volume unless overtraining score exceeds 60.
- Intermediate (4-5 sessions/week baseline): Load ratio 1.2-1.3 is the sweet spot. RPE 7 is a sustainable ceiling. 4-5 sessions/week is normal, flag 6+ as a spike.
- Developing (2-3 sessions/week baseline): Load ratio above 1.2 warrants caution. RPE 6-7 should be the ceiling. 3+ sessions/week is significant.
- Beginner (0-1 sessions/week baseline): Load ratio above 1.1 is a spike. Keep RPE at 5-6. Even 2-3 sessions/week may need extra recovery.
If no athlete baseline is provided, default to conservative interpretation (assume developing level).
The deterministic thresholds remain unchanged — calibrate RECOMMENDATIONS, not scores.

READINESS SCORE INTERPRETATION:
- 80+ (Peaked): Fighter is fully recovered, all systems green. Can push harder, increase volume or intensity.
- 55-79 (Ready): Normal training day. Follow standard programming.
- 35-54 (Recovering): Reduce intensity/volume. Focus on technique, light drilling, or active recovery.
- Below 35 (Strained): Strongly consider rest day. If training, keep it very light (mobility, stretching only).
Factor the readiness breakdown components (sleep, soreness, load balance, recovery, consistency) into specific advice.

TREND ALERTS:
When active trend alerts are provided, factor them into risk assessment and recommendations. Trends indicate emerging patterns that may not yet be reflected in single-day metrics. Address them proactively in coaching_summary.

OUTPUT:
{
  "readiness_state": "push|maintain|reduce|recover",
  "coaching_summary": "2-3 sentences referencing numbers AND how fighter feels",
  "recommended_session": {
    "type": "e.g. BJJ, Conditioning, Active Recovery",
    "duration_minutes": 60,
    "max_rpe": 7,
    "notes": "Specific guidance for this session"
  },
  "alternatives": [
    { "condition": "If feeling better than expected", "type": "...", "duration_minutes": 75, "max_rpe": 8, "notes": "..." },
    { "condition": "If feeling worse", "type": "...", "duration_minutes": 30, "max_rpe": 4, "notes": "..." }
  ],
  "recovery_focus": ["protocol1", "protocol2", "protocol3"],
  "risk_level": "low|moderate|high|critical",
  "rest_day_override": false
}

Conservative approach: when in doubt, recommend less intensity.`;

    const userPrompt = `Fighter metrics (deterministic — do not override):
- Strain: ${strain?.toFixed(1) ?? 0}/21 | Daily Load: ${dailyLoad?.toFixed(0) ?? 0}
- Acute (7d): ${acuteLoad?.toFixed(0) ?? 0} | Chronic (28d): ${chronicLoad?.toFixed(0) ?? 0} | AC Ratio: ${loadRatio?.toFixed(2) ?? 1.0}
- Overtraining: ${overtrainingScore ?? 0}/100 (${overtrainingZone ?? 'low'})
- Avg RPE (7d): ${avgRPE7d?.toFixed(1) ?? 0} | Avg Soreness: ${avgSoreness7d?.toFixed(1) ?? 0}/10
- Sessions (7d): ${sessionsLast7d ?? weeklySessionCount ?? 0} | Consecutive high days: ${consecutiveHighDays ?? 0}
- Sleep: ${latestSleep ?? 8}h (avg ${avgSleep?.toFixed(1) ?? 0}h) | Soreness: ${latestSoreness ?? 0}/10${readinessText}${calibrationText}${trendAlertsText}

Recent sessions:
${sessionsText}${checkInText}${athleteBaselineText}`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_completion_tokens: 1200,
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
      console.error("Grok API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Grok fight-camp-coach response:", JSON.stringify(data, null, 2));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered. Please try again.");
      throw new Error("No response from Grok API");
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
