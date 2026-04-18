import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractContent } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";
import { computeLoadMetrics, type SessionRow } from "../_shared/loadMetrics.ts";
import { buildRecoveryContext } from "../_shared/recoveryContext.ts";
import { RECOVERY_RESEARCH_MD } from "./research.ts";

const TONE_RULE = `CRITICAL TONE RULE: You must write in full, natural, conversational English — the way a real coach talks to their fighter face-to-face. Use complete sentences with proper grammar. Never write in shorthand, abbreviations, or clipped fragments. Never drop articles like "the", "a", "your". Never use slash-separated alternatives like "ice/heat". Instead write "ice or heat". Your writing should flow naturally and be pleasant to read aloud.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  let step = "init";
  try {
    step = "auth-header";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    step = "create-client";
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    step = "get-user";
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    step = "check-ai-usage";
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    step = "parse-body";
    const { messages, userName } = (await req.json()) as {
      messages?: { role: "user" | "assistant"; content: string }[];
      userName?: string;
    };

    const cappedMessages = Array.isArray(messages) ? messages.slice(-16) : [];

    const today = new Date().toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    step = "fetch-data";
    const [profileRes, sessionsRes, wellnessRes, baselineRes, campRes, todayWellnessRes] = await Promise.allSettled([
      supabaseClient
        .from("profiles")
        .select("athlete_type, experience_level, training_frequency, tdee, current_weight_kg, goal_weight_kg, sex, age")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseClient
        .from("fight_camp_calendar")
        .select(
          "date, session_type, duration_minutes, rpe, intensity, intensity_level, soreness_level, sleep_hours, fatigue_level, sleep_quality, mobility_done, notes",
        )
        .eq("user_id", user.id)
        .gte("date", fourteenDaysAgo)
        .order("date", { ascending: false })
        .limit(60),
      supabaseClient
        .from("daily_wellness_checkins")
        .select(
          "date, hooper_index, readiness_score, sleep_quality, sleep_hours, stress_level, fatigue_level, soreness_level, energy_level, motivation_level",
        )
        .eq("user_id", user.id)
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: false })
        .limit(7),
      supabaseClient
        .from("personal_baselines")
        .select("hooper_mean_60d, sleep_hours_mean_60d, daily_load_mean_14d, hooper_cv_14d, avg_deficit_7d")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseClient
        .from("fight_camps")
        .select("name, fight_date")
        .eq("user_id", user.id)
        .gte("fight_date", today)
        .order("fight_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseClient
        .from("daily_wellness_checkins")
        .select(
          "date, hooper_index, readiness_score, sleep_quality, sleep_hours, stress_level, fatigue_level, soreness_level, energy_level, motivation_level",
        )
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle(),
    ]);

    const getData = <T,>(r: PromiseSettledResult<{ data: T | null }>): T | null =>
      r.status === "fulfilled" ? (r.value.data ?? null) : null;
    const getList = <T,>(r: PromiseSettledResult<{ data: T[] | null }>): T[] =>
      r.status === "fulfilled" ? (r.value.data ?? []) : [];

    step = "compute-load-metrics";
    const sessions = getList<SessionRow>(sessionsRes);
    const loadMetrics = computeLoadMetrics(sessions);

    step = "build-context";
    const dataContext = buildRecoveryContext({
      profile: getData(profileRes),
      loadMetrics,
      wellness7d: getList(wellnessRes),
      todayWellness: getData(todayWellnessRes),
      baseline: getData(baselineRes),
      upcomingCamp: getData(campRes),
    });

    step = "load-research";
    const RESEARCH_MD = RECOVERY_RESEARCH_MD;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const athleteName = userName || null;
    const systemPrompt = `You are the "Recovery Coach" — an elite combat sports recovery and training-load specialist.${
      athleteName ? ` The athlete's name is "${athleteName}". Use it sparingly when greeting or encouraging them.` : ""
    }

You have this athlete's real training load, wellness, and recovery data. Reference their actual numbers when giving advice — never ask for information you already have.

<athlete_data>
${dataContext}
</athlete_data>

Use this peer-reviewed and industry research to ground every recommendation. Refer to the principles in natural language ("research on DOMS suggests...", "the ACWR sweet spot is..."), not URLs or footnotes.

<research>
${RESEARCH_MD}
</research>

Behavior rules:
- If symptoms or context are ambiguous, ask one focused clarifying question before prescribing. Otherwise give concrete, specific advice.
- Always reference the athlete's actual loadRatio, zone, readiness, Hooper, soreness, recent sessions when making a call.
- Red flags — sharp pain at rest, radiating pain, rapid joint swelling, loss of range >50%, numbness/tingling/weakness, concussion signs (headache, nausea, fogginess, balance issues), inability to bear weight — recommend professional consultation and do NOT prescribe training.
- Be flexible. Suggest alternatives when the athlete's first instinct doesn't match their data.
- When recommending a session, emit this exact markdown block:

  **Suggested session**
  - Type: <sparring | technique | strength | conditioning | active recovery | mobility | rest | other>
  - Duration: <N> minutes
  - Intensity: <low | moderate | high>
  - Focus: <one short sentence>

- Markdown output. 120–300 words. Conversational, full-sentence prose. Use bullets only for lists of three or more.

${TONE_RULE}`;

    edgeLogger.info("recovery-coach: calling Groq", {
      messages: cappedMessages.length,
      researchLen: RESEARCH_MD.length,
      systemLen: systemPrompt.length,
    });

    step = "groq-fetch";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: systemPrompt }, ...cappedMessages],
        temperature: 0.6,
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      edgeLogger.error("recovery-coach Groq error", undefined, {
        functionName: "recovery-coach",
        status: response.status,
        errorData,
      });
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Groq API error: ${errorData?.error?.message || "unknown"}` }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const extracted = extractContent(data);
    let generatedText = extracted.content;
    if (!generatedText) {
      generatedText = extracted.filtered
        ? "I can't give that specific advice for safety reasons. Let's find a safer approach to your recovery."
        : "I couldn't generate a response just now. Try again in a moment.";
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: generatedText, role: "assistant" } }],
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    edgeLogger.error("recovery-coach error", error as Error, { functionName: "recovery-coach", step });
    const msg = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined;
    return new Response(
      JSON.stringify({ error: `[step=${step}] ${msg}`, stack }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
