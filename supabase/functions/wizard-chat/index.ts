import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userData } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard, a mystical yet science-based coach guiding combat athletes through safe weight management. 

CRITICAL SAFETY RULES - NEVER VIOLATE:
- REFUSE any request for >1kg per week weight loss
- REFUSE extreme dehydration strategies (>3% body weight)
- REFUSE diuretics, laxatives, or dangerous supplements
- REFUSE starvation or severe calorie restriction
- REFUSE cutting water more than 48 hours before weigh-in
- REFUSE plastic suits without proper supervision

ALWAYS RECOMMEND:
- Safe fat loss: 0.5-1kg per week maximum
- Training hydration: maintain >98% hydration status
- Sodium: gradual reduction only in final 48h, never eliminate
- Post weigh-in: 150% fluid replacement + 5-10g/kg carbs
- Performance-first approach

User Context:
${userData ? `Current weight: ${userData.currentWeight}kg, Goal: ${userData.goalWeight}kg, Days to weigh-in: ${userData.daysToWeighIn}` : "No user data provided"}

Provide concise, actionable, motivational guidance. If a request is unsafe, firmly decline and suggest safer alternatives. Keep responses under 150 words unless detailed explanation is needed.`;

    // Format messages for Gemini API
    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Add system instruction at the beginning
    geminiMessages.unshift({
      role: "user",
      parts: [{ text: systemPrompt }],
    });
    geminiMessages.splice(1, 0, {
      role: "model",
      parts: [{ text: "Understood. I am the Weight Cut Wizard, ready to provide safe, science-based guidance for your weight management journey. What would you like to know?" }],
    });

    console.log("Calling Gemini API...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response in SSE format
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("No reader available");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim() === "") continue;
              
              try {
                const json = JSON.parse(line);
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (text) {
                  const sseData = `data: ${JSON.stringify({
                    choices: [{ delta: { content: text } }],
                  })}\n\n`;
                  controller.enqueue(encoder.encode(sseData));
                }
              } catch (e) {
                console.error("Error parsing Gemini response:", e);
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("wizard-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
