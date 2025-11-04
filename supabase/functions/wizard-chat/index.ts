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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are the Weight Cut Wizard - a mystical coach who texts with fighters about their weight cut journey. Keep your messages casual, friendly, and conversational like you're texting a friend.

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

Text Style: Keep it short (2-4 sentences max), friendly, and motivational. Use casual language like you're texting. Add some personality! If a request is unsafe, firmly but kindly decline and suggest safer alternatives.`;

    console.log("Calling Lovable AI...");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the stream directly
    return new Response(response.body, {
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
