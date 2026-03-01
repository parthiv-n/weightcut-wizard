import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { corsHeaders } from "../_shared/cors.ts";

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
    const { sessions } = await req.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sessions with notes provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const sessionsText = sessions
      .map((s: any) => `${s.date} | ${s.session_type} | ${s.duration_minutes}min | Notes: ${s.notes}`)
      .join('\n');

    const systemPrompt = `You are a combat sports training analyst. You organize weekly session notes by sport type.

For each technique mentioned in the notes:
- Provide a brief 3-5 step setup/execution guide
- Provide one practical tip for implementing it in live sparring

Group by sport: BJJ, Muay Thai, Wrestling, Sparring, Strength, Conditioning.
Only include sports that have session notes. If a session type doesn't match these exactly, map it to the closest category.

Return ONLY valid JSON in this exact format:
{
  "sportSections": [
    {
      "sport": "BJJ",
      "sessions_count": 2,
      "techniques": [
        {
          "name": "Kimura from Side Control",
          "steps": ["Step 1...", "Step 2...", "Step 3..."],
          "sparringTip": "Set up from a failed americana attempt..."
        }
      ]
    }
  ],
  "weekOverview": "Brief 1-2 sentence summary of training focus this week"
}`;

    const userPrompt = `Here are my training sessions from this week. Organize the techniques and drills I worked on:\n\n${sessionsText}`;

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
        temperature: 0.2,
        max_completion_tokens: 2000,
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
    console.log("Grok training-summary response:", JSON.stringify(data, null, 2));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered. Please try again.");
      throw new Error("No response from Grok API");
    }

    const summary = parseJSON(content);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in training-summary:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
