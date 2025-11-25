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

    const { mealDescription } = await req.json();
    
    // Validate input length
    if (!mealDescription || typeof mealDescription !== 'string') {
      return new Response(
        JSON.stringify({ error: "Meal description must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (mealDescription.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Meal description too long (max 1000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!mealDescription) {
      return new Response(
        JSON.stringify({ error: "Meal description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    console.log("Analyzing meal:", mealDescription);

    const systemPrompt = `You are a nutrition analysis expert. Analyze meal descriptions and return accurate nutritional information.

CRITICAL RULES:
1. If the user explicitly mentions calorie amounts, protein, carbs, or fats - USE THOSE EXACT VALUES
2. If the user says "500 calories" - the meal must be exactly 500 calories, not an estimate
3. Only estimate nutritional values when the user doesn't provide specific numbers
4. Always respect user-provided nutritional data over your own calculations
5. Always indicate the data source for nutrition information (e.g., "USDA Food Database", "Nutrition Database", "Standard Nutrition Values", "Food Composition Database")
6. Use authoritative sources like USDA, nutrition databases, or established food composition tables

Be realistic and precise with portion sizes.

Analyze this meal and provide nutritional information: "${mealDescription}"

Respond with a JSON object in this exact format:
{
  "meal_name": "Clean, properly formatted name of the meal",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fats_g": number,
  "portion_size": "Estimated portion size (e.g., '250g', '1 plate', '2 servings')",
  "ingredients": [
    {
      "name": "ingredient name",
      "grams": number,
      "source": "Data source for nutrition information"
    }
  ],
  "data_source": "Primary data source for the nutrition information"
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API error:", response.status, errorData);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log("Gemini response:", JSON.stringify(data));

    // Parse Gemini response
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error("No response from Gemini API");
    }

    // Extract JSON from the response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse nutrition data from AI response");
    }

    const nutritionData = JSON.parse(jsonMatch[0]);
    console.log("Parsed nutrition data:", nutritionData);

    return new Response(
      JSON.stringify({ nutritionData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-meal function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});