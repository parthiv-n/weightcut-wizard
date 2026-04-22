import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeUserText, PROMPT_INJECTION_GUARD_INSTRUCTION } from "../_shared/sanitizeUserText.ts";

interface SessionInput {
  date?: string;
  notes?: string;
  rpe?: number;
  intensity?: string;
  duration_minutes?: number;
}

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

    // Hard premium gate — this widget is premium-only, gems do not unlock it
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: profile } = await adminClient
      .from("profiles")
      .select("subscription_tier, subscription_expires_at")
      .eq("id", user.id)
      .single();

    const isPremium =
      !!profile?.subscription_tier &&
      profile.subscription_tier !== "free" &&
      (!profile.subscription_expires_at ||
        new Date(profile.subscription_expires_at) > new Date());

    if (!isPremium) {
      return new Response(
        JSON.stringify({ error: "Premium required", code: "PREMIUM_REQUIRED" }),
        {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const rawSessionType = typeof body?.session_type === "string" ? body.session_type : "";
    const rawSessions: SessionInput[] = Array.isArray(body?.sessions) ? body.sessions : [];

    const sessionType = sanitizeUserText(rawSessionType, { maxLength: 60, raw: true });
    if (!sessionType) {
      return new Response(JSON.stringify({ error: "session_type is required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (rawSessions.length === 0) {
      return new Response(JSON.stringify({ error: "sessions[] cannot be empty" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Cap to the 3 most-recent sessions; sanitise each notes field
    const sessions = rawSessions.slice(0, 3).map((s) => ({
      date: typeof s?.date === "string" ? s.date.slice(0, 10) : "",
      notes: sanitizeUserText(s?.notes, { maxLength: 600, raw: true }),
      rpe: Number.isFinite(Number(s?.rpe)) ? Number(s.rpe) : null,
      intensity: typeof s?.intensity === "string" ? s.intensity.slice(0, 20) : null,
      duration_minutes: Number.isFinite(Number(s?.duration_minutes))
        ? Number(s.duration_minutes)
        : null,
    }));

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    edgeLogger.info("Generating training insight", {
      sessionType,
      sessionCount: sessions.length,
    });

    const callGroq = async (payload: Record<string, unknown>, stage: string) => {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        edgeLogger.error("Groq API error", undefined, {
          functionName: "training-insights",
          stage,
          status: resp.status,
          errorData,
        });

        if (resp.status === 429) {
          return {
            errorResponse: new Response(
              JSON.stringify({
                error: "AI service is busy. Please try again in a moment.",
                code: "AI_BUSY",
              }),
              {
                status: 503,
                headers: { ...corsHeaders(req), "Content-Type": "application/json" },
              }
            ),
          };
        }
        if (resp.status === 401 || resp.status === 403) {
          return {
            errorResponse: new Response(
              JSON.stringify({ error: "API key invalid or quota exceeded." }),
              {
                status: resp.status,
                headers: { ...corsHeaders(req), "Content-Type": "application/json" },
              }
            ),
          };
        }

        throw new Error(
          `Groq API error (${stage}): ${errorData?.error?.message || "Unknown error"}`
        );
      }

      const data = await resp.json();
      const { content, filtered } = extractContent(data);
      if (!content) {
        if (filtered) {
          throw new Error("Content was filtered for safety. Please try again.");
        }
        throw new Error(`No response from Groq API (${stage})`);
      }
      return { content };
    };

    const systemPrompt = `You are a JSON API. Your FIRST output character MUST be "{". No preamble, markdown, or explanation — only the raw JSON object.
You are an expert combat-sports coach. You receive ONE training discipline and a small list of the athlete's most-recent logged sessions in that discipline (latest first). Produce a tightly-scoped, actionable next-focus block that quotes specific details the athlete logged.

${PROMPT_INJECTION_GUARD_INSTRUCTION}

Rules:
- Only comment on the supplied discipline. Never invent sessions or details not present in the input.
- "what_you_did": 1-2 sentences recapping the LATEST session, paraphrasing or directly referencing the athlete's notes.
- "next_focus": 1-2 sentences with SPECIFIC drills or corrections that build on what they logged. If they mentioned a combo, position, or mistake, weave it in by name. Avoid generic advice ("train harder", "improve cardio").
- If the latest notes are empty or trivial, still produce a focused suggestion based on RPE/intensity trend, but flag low information density implicitly through generality.
- Keep total output under 90 words.

Output schema (return ONLY this JSON object):
{
  "session_type": "string (echo input)",
  "last_logged": "YYYY-MM-DD (date of latest session)",
  "what_you_did": "string",
  "next_focus": "string"
}`;

    const userText = `Discipline: <user_input>${sessionType}</user_input>

Recent sessions (latest first):
${sessions
  .map(
    (s, i) =>
      `[${i + 1}] date=${s.date} rpe=${s.rpe ?? "n/a"} intensity=${s.intensity ?? "n/a"} duration_min=${s.duration_minutes ?? "n/a"}
notes: <user_input>${s.notes || "(none)"}</user_input>`
  )
  .join("\n\n")}

Return ONLY the JSON object described in the schema. First character must be "{".`;

    const reasoningPayload = {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
      max_tokens: 600,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    };

    let result = await callGroq(reasoningPayload, "reasoning");

    // Same Harmony-leak fallback as analyze-meal: retry without response_format
    if ("errorResponse" in result) {
      edgeLogger.warn(
        "Reasoning stage json_object rejected, retrying without response_format"
      );
      const { response_format: _omit, ...fallbackPayload } = reasoningPayload;
      result = await callGroq(fallbackPayload, "reasoning-fallback");
      if ("errorResponse" in result) return result.errorResponse;
    }

    const insight = parseJSON(result.content);
    edgeLogger.info("Training insight generated", { sessionType });

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    edgeLogger.error("Error in training-insights function", error, {
      functionName: "training-insights",
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
