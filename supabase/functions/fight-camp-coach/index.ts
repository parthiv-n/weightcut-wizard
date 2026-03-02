import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { corsHeaders } from "../_shared/cors.ts";

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
      checkInScore,
      checkInSignal,
      athleteProfile,
      // Enhanced fields
      readinessScore,
      readinessLabel,
      readinessBreakdown,
      trendAlerts,
      athleteTier,
      personalRpeCeiling,
      personalNormalSessions,
      sleepScore,
      avgSleepLast3,
      // Wellness / deficit fields
      hooperIndex,
      hooperComponents,
      deficitImpactScore,
      avgDeficit7d,
      balanceMetrics,
      enhancedReadinessScore,
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

    const feelLabel = checkInSignal === 'green' ? 'good' : checkInSignal === 'yellow' ? 'mixed' : 'rough';
    const checkInText = checkIn
      ? `\nFighter's self-assessment right now (CHECK-IN SIGNAL: ${checkInSignal?.toUpperCase() ?? 'UNKNOWN'}, score ${checkInScore ?? '?'}/12):
- Energy: ${checkIn.energy}
- Body soreness: ${checkIn.soreness}
- Sleep last night: ${checkIn.sleep}
- Mental state: ${checkIn.mental}

→ This fighter is feeling ${feelLabel}. Adjust session intensity accordingly.`
      : '\nNo subjective check-in provided. Base recommendations on metrics alone. Be more conservative without subjective data.';

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

    // Build Hooper Index text
    const hooperText = hooperIndex != null
      ? `\nHooper Index: ${hooperIndex}/28 (Sleep: ${hooperComponents?.sleep ?? '?'}/7, Stress: ${hooperComponents?.stress ?? '?'}/7, Fatigue: ${hooperComponents?.fatigue ?? '?'}/7, Soreness: ${hooperComponents?.soreness ?? '?'}/7)`
      : '';

    // Build caloric deficit text
    const deficitText = avgDeficit7d != null
      ? `\nCaloric Balance: ${avgDeficit7d > 0 ? 'deficit' : 'surplus'} of ${Math.abs(avgDeficit7d).toFixed(0)}kcal/day (7d avg). Impact Score: ${deficitImpactScore ?? 'N/A'}/100`
      : '';

    // Build balance metrics text
    const balanceText = Array.isArray(balanceMetrics) && balanceMetrics.length > 0
      ? `\nBalance Metrics (14d vs 60d):\n${balanceMetrics.map((m: any) => `- ${m.metric}: ${m.direction} (${m.zScore >= 0 ? '+' : ''}${m.zScore.toFixed(1)} SD) — ${m.severity}`).join('\n')}`
      : '';

    const systemPrompt = `You are an elite combat sports recovery coach. You've cornered world-class fighters and managed their training loads through full fight camps — from grueling 3-a-days in peak camp down to taper week. You speak like someone who's been in the trenches, not a textbook. Fighters trust you because your advice is practical, specific, and keeps them healthy enough to perform when it counts.

Respond with ONLY valid JSON. No markdown, no explanation outside the JSON object.

RULES:
- You CANNOT override deterministic values (strain, overtraining score, load ratio, readiness score) — interpret only.
- Always provide 2 alternatives: one for feeling better than the primary recommendation, one for feeling worse.
- Conservative approach: when in doubt, recommend less intensity. A missed session costs nothing; an injury costs everything.
- NEVER just list numbers — always explain what each metric means for THIS fighter in plain language.
- Every recommendation must be specific to combat sports — no generic gym advice.

CHECK-IN SIGNAL:
The fighter's subjective check-in is scored 0-12 and mapped to a signal. Use this to drive session intensity:

GREEN (score 9-12): Fighter is feeling good across the board. Recommend a full-intensity session — hard sparring, competition-pace rounds, strength & conditioning. Push the pace. Mention specific drills (e.g., "5x3min hard rounds with fresh partners", "explosive pad work finishing with power shots", "competition-simulation rounds").

YELLOW (score 5-8): Fighter has some wear. Recommend a technical/moderate session — drilling at 60-70%, positional sparring, skill refinement. Avoid live sparring and max-effort conditioning. Cap RPE at 6-7. Examples: "Positional rounds from guard — work escapes at 60%", "Technical standup with a partner, no takedown finishes", "Light pad work focusing on timing and accuracy, not power".

RED (score 0-4): Fighter is beat up. Recommend active recovery or full rest — light movement, yoga/mobility, film study, or complete rest day. If score ≤ 2, set rest_day_override to true. Examples: "Shadow boxing at 50% — focus on head movement and footwork", "Foam roll and contrast showers, watch tape of your last sparring", "Full rest — your body is telling you something, listen to it".

When no check-in is provided, base recommendations on metrics alone and be more conservative without subjective data.

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

HOOPER INDEX (Wellness Check-In):
When Hooper Index data is provided, use it as the primary subjective indicator:
- 22-28 (Green): Fighter feels great across the board. Full intensity session appropriate.
- 16-21 (Moderate): Some wear — adjust intensity. Focus on the lowest-scoring dimension.
- 10-15 (Beat up): Significant fatigue/soreness/stress. Reduce training substantially. Cap RPE at 5-6.
- 4-9 (Critical): Fighter needs rest. Set rest_day_override to true for scores below 8. Address the most critical dimension directly.
Reference specific Hooper components (e.g., "Your fatigue is at 6/7 — your CNS needs a break").

CALORIC DEFICIT AWARENESS:
When caloric balance data is provided, factor the deficit into recovery recommendations:
- Deficit ≤200kcal: No adjustment needed. Normal training.
- 200-500kcal: Moderate deficit. Cap RPE at 7, prioritize protein intake in recovery focus.
- 500-800kcal: Significant recovery suppression. Cap RPE at 6, reduce session volume by 20-30%. Mention nutrition in coaching_summary.
- 800+kcal: Severe deficit. Recommend active recovery or rest. Explicitly call out that the caloric deficit is limiting recovery capacity.
For weight-cutting fighters, acknowledge the deficit as intentional but still adjust training intensity accordingly.

BALANCE METRICS:
When 14-day vs 60-day balance metrics are provided, address the most declined metric specifically. If a metric shows "alert" severity, flag it prominently. If multiple metrics are declining, prioritize the one most impactful for fight readiness.

TREND ALERTS:
When active trend alerts are provided, factor them into risk assessment and recommendations. Trends indicate emerging patterns that may not yet be reflected in single-day metrics. Address them proactively in coaching_summary.

OUTPUT:
{
  "readiness_state": "push|maintain|reduce|recover",
  "coaching_summary": "3-5 sentences. Start by addressing how the fighter is feeling based on their check-in. Then explain the key metrics IN PLAIN LANGUAGE — don't just say 'strain is 12.5', say 'your training intensity today was moderate — you pushed hard but didn't redline'. Explain what the readiness score means for them today. End with clear, actionable guidance. Speak like a corner coach, not a data dashboard.",
  "metrics_breakdown": [
    {
      "metric": "Readiness|Strain|Training Load|Overtraining Risk|Sleep|Soreness",
      "status": "good|caution|warning|critical",
      "explanation": "1-2 sentences in plain language explaining what this metric means RIGHT NOW for this fighter. E.g., 'Your readiness is at 72 — you're recovered enough for a normal session but don't go looking for wars today.' or 'Your training load is spiking — you've done significantly more this week than your body is used to, which raises injury risk.'"
    }
  ],
  "recommended_session": {
    "type": "e.g. Hard Sparring, Technical Drilling, Active Recovery, Rest Day",
    "duration_minutes": 60,
    "max_rpe": 7,
    "notes": "Be specific to combat sports. Instead of 'light cardio', say 'shadow boxing at 50%, focus on head movement and footwork'. Instead of 'rest', say 'foam roll, contrast showers, watch tape of your last sparring'."
  },
  "next_session_suggestion": "A forward-looking suggestion for what tomorrow or the next session should look like based on today's state. E.g., 'If today goes well, tomorrow is a good day for hard sparring — your body has had enough rest to handle it. If you feel worse after today, switch to film study and mobility.' or 'Take tomorrow completely off — you need 48 hours to recover from this training block before ramping back up.'",
  "alternatives": [
    { "condition": "If feeling better than expected", "type": "...", "duration_minutes": 75, "max_rpe": 8, "notes": "..." },
    { "condition": "If feeling worse", "type": "...", "duration_minutes": 30, "max_rpe": 4, "notes": "..." }
  ],
  "recovery_focus": [
    "5 PERSONALIZED recovery actions tailored to THIS fighter's current state. Each must be specific and actionable with timing/duration. Look at which metrics are worst and target those.",
    "If sleep is poor: 'Set your alarm 30 min later tomorrow and cut screen time 1 hour before bed — your sleep score is dragging your recovery down.'",
    "If soreness is high: 'Ice bath 10-12 min focusing on your legs, then 15 min foam rolling your hip flexors and IT bands — your soreness has been climbing for 3 days.'",
    "If caloric deficit is significant: 'Get 40g protein within 30 min of training and add a casein shake before bed — your body can't recover properly in this deficit without extra protein.'",
    "If overtraining risk is elevated: 'No training tomorrow. Contrast showers (2 min cold / 3 min hot × 3 rounds) and 20 min walk outside — your CNS needs a full reset.'",
    "If stress/fatigue is high: '10 min breathwork (box breathing: 4-4-4-4) before bed tonight and a 20 min sauna session if available — your stress levels are eating into your recovery capacity.'"
  ],
  "risk_level": "low|moderate|high|critical",
  "rest_day_override": false
}

CRITICAL — recovery_focus must be exactly 5 items, each one addressing a DIFFERENT aspect of this fighter's recovery needs based on their actual metrics. Do not give generic advice. Reference their specific numbers and trends.`;

    const userPrompt = `Fighter metrics (deterministic — do not override):
- Strain: ${strain?.toFixed(1) ?? 0}/21 | Daily Load: ${dailyLoad?.toFixed(0) ?? 0}
- Acute (7d): ${acuteLoad?.toFixed(0) ?? 0} | Chronic (28d): ${chronicLoad?.toFixed(0) ?? 0} | AC Ratio: ${loadRatio?.toFixed(2) ?? 1.0}
- Overtraining: ${overtrainingScore ?? 0}/100 (${overtrainingZone ?? 'low'})
- Avg RPE (7d): ${avgRPE7d?.toFixed(1) ?? 0} | Avg Soreness: ${avgSoreness7d?.toFixed(1) ?? 0}/10
- Sessions (7d): ${sessionsLast7d ?? weeklySessionCount ?? 0} | Consecutive high days: ${consecutiveHighDays ?? 0}
- Sleep: ${latestSleep ?? 8}h (avg ${avgSleep?.toFixed(1) ?? 0}h) | Soreness: ${latestSoreness ?? 0}/10${readinessText}${calibrationText}${hooperText}${deficitText}${balanceText}${trendAlertsText}

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
        max_completion_tokens: 2400,
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
