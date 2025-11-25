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

  try {
    // Verify authentication
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

    // Fetch user data from database instead of trusting client
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('current_weight_kg, goal_weight_kg, target_date')
      .eq('id', user.id)
      .single();

    const userData = profile ? {
      currentWeight: profile.current_weight_kg,
      goalWeight: profile.goal_weight_kg,
      daysToWeighIn: Math.ceil(
        (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    } : null;

    const { messages } = await req.json();
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
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

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content || "";
    const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}`;

    console.log("Calling Google Gemini API...");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 512,
          topK: 40,
          topP: 0.95,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API error:", response.status, errorData);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errorData.error?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Wizard chat Gemini response:", JSON.stringify(data, null, 2));
    
    let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      // Try alternative structures
      generatedText = data.candidates?.[0]?.text || data.text;
    }
    
    if (!generatedText) {
      console.error("No content found in wizard chat response");
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        generatedText = "I can't provide that specific advice for safety reasons. Let me help you with a safer approach to your weight cut goals.";
      } else {
        throw new Error("No response from Gemini API");
      }
    }

    // Return the response as JSON (not streaming like Lovable)
    return new Response(
      JSON.stringify({ 
        choices: [{ 
          message: { 
            content: generatedText,
            role: "assistant" 
          } 
        }] 
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("wizard-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
