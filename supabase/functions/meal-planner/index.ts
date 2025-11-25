import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
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
      .select('current_weight_kg, goal_weight_kg, tdee, target_date')
      .eq('id', user.id)
      .single();

    const userData = profile ? {
      currentWeight: profile.current_weight_kg,
      goalWeight: profile.goal_weight_kg,
      tdee: profile.tdee,
      daysToWeighIn: Math.ceil(
        (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    } : null;

    const { prompt, action, userData } = await req.json();
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

    if (!GOOGLE_AI_API_KEY) {
      console.error("GOOGLE_AI_API_KEY environment variable is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Request data:", { prompt: prompt?.substring(0, 100), action, userData });

    // Calculate safe calorie target
    const currentWeight = userData?.currentWeight || 70;
    const goalWeight = userData?.goalWeight || 65;
    const tdee = userData?.tdee || 2000;
    const daysToGoal = userData?.daysToWeighIn || 60;
    
    const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
    const safeWeeklyLoss = Math.min(weeklyWeightLoss, 1); // Max 1kg/week
    const dailyDeficit = (safeWeeklyLoss * 7700) / 7; // 7700 cal = 1kg fat
    const dailyCalorieTarget = Math.max(tdee - dailyDeficit, tdee * 0.8); // Minimum 80% of TDEE
    
    const weeklyLossPercent = (weeklyWeightLoss / currentWeight) * 100;
    let safetyIndicator = "green";
    let safetyMessage = "Safe and sustainable weight loss pace";
    
    if (weeklyLossPercent > 1.5 || weeklyWeightLoss > 1) {
      safetyIndicator = "red";
      safetyMessage = "⚠️ WARNING: Weight loss rate exceeds safe limits! Reduce calorie deficit.";
    } else if (weeklyLossPercent > 1 || weeklyWeightLoss > 0.75) {
      safetyIndicator = "yellow";
      safetyMessage = "⚠️ CAUTION: Approaching maximum safe weight loss rate";
    }

    const systemPrompt = `You are the Weight Cut Wizard's nutrition AI. Generate safe, nutritious meal plans that help fighters reach their weight goals safely.

CRITICAL SAFETY RULES:
- NEVER suggest daily calories below ${Math.round(dailyCalorieTarget)}
- NEVER recommend starvation, extreme restriction, or unsafe diets
- Current safe calorie target: ${Math.round(dailyCalorieTarget)} cal/day
- Weekly weight loss target: ${safeWeeklyLoss.toFixed(2)} kg (${weeklyLossPercent.toFixed(1)}% body weight)
- Safety status: ${safetyIndicator.toUpperCase()} - ${safetyMessage}

User Context:
Current weight: ${currentWeight}kg
Goal weight: ${goalWeight}kg
TDEE: ${tdee} cal/day
Days to goal: ${daysToGoal}

RESPONSE FORMAT (must be valid JSON):
{
  "mealPlan": {
    "breakfast": {
      "name": "Meal name",
      "calories": 400,
      "protein": 30,
      "carbs": 40,
      "fats": 15,
      "portion": "Total weight in grams",
      "recipe": "Brief preparation notes",
      "ingredients": [
        {"name": "Chicken breast", "grams": 200},
        {"name": "Brown rice", "grams": 150},
        {"name": "Olive oil", "grams": 10}
      ]
    },
    "lunch": { ... },
    "dinner": { ... },
    "snacks": [{ ... }]
  },
  "dailyTotals": {
    "calories": ${Math.round(dailyCalorieTarget)},
    "protein": 120,
    "carbs": 200,
    "fats": 60
  },
  "safetyStatus": "${safetyIndicator}",
  "safetyMessage": "${safetyMessage}",
  "tips": "Motivational and practical tips for the day"
}

CRITICAL: For each meal, you MUST include:
- An "ingredients" array with specific foods and their weights in GRAMS
- Each ingredient must have "name" and "grams" properties
- Ingredient weights should be realistic and add up to a reasonable total meal weight
- Be specific (e.g., "Chicken breast" not just "Chicken", "Brown rice" not just "Rice")

Generate meal plans that:
- Stay within daily calorie target
- Provide adequate protein (1.8-2.2g per kg body weight)
- Include nutrient-dense whole foods
- Are practical and easy to prepare
- Respect any dietary restrictions mentioned
- Support training and recovery`;

    console.log("Calling Google Gemini API for meal planning...");

    const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
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
            temperature: 0.7,
            maxOutputTokens: 4096,
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log("Gemini API response status:", response.status);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("Gemini API request timed out");
        return new Response(
          JSON.stringify({ error: "AI request timed out. Please try again." }),
          { status: 408, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("Gemini API fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to connect to AI service" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No content in Gemini API response");
    }

    // Try to parse JSON from the response
    let mealPlanData;
    try {
      // Clean the content by removing markdown code blocks and extracting JSON
      let cleanContent = content.trim();
      
      // Remove all markdown code block markers
      cleanContent = cleanContent.replace(/```json\s*/g, '');
      cleanContent = cleanContent.replace(/```\s*/g, '');
      
      // Find the first { and last } to extract the complete JSON object
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No valid JSON object found in response");
      }
      
      const jsonStr = cleanContent.substring(firstBrace, lastBrace + 1);
      mealPlanData = JSON.parse(jsonStr);
      
      console.log("Successfully parsed AI response");
      console.log("Meal plan structure:", Object.keys(mealPlanData));
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Raw content:", content.substring(0, 500));
      
      // Return error response that frontend can handle
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse meal plan from AI response. Please try again.",
          details: e instanceof Error ? e.message : "Unknown parsing error"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        mealPlan: mealPlanData,
        dailyCalorieTarget: Math.round(dailyCalorieTarget),
        safetyStatus: safetyIndicator,
        safetyMessage
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );
  } catch (error) {
    console.error("meal-planner error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : "No additional details"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
