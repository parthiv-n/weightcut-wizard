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

    const { ingredientName } = await req.json();
    
    if (!ingredientName || typeof ingredientName !== 'string') {
      return new Response(
        JSON.stringify({ error: "Ingredient name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (ingredientName.length > 200) {
      return new Response(
        JSON.stringify({ error: "Ingredient name too long (max 200 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    console.log("Looking up nutrition for ingredient:", ingredientName);

    const systemPrompt = `You are a nutrition database expert. Look up accurate nutrition information per 100g for food ingredients.

CRITICAL RULES:
1. Use reliable nutrition databases (USDA, nutrition websites, food databases)
2. Return nutrition values per 100g (standard measurement)
3. Be precise and use real nutrition data from authoritative sources, not estimates
4. If the ingredient is ambiguous (e.g., "chicken"), specify the most common preparation (e.g., "chicken breast, raw")
5. Return values as numbers (calories as integer, macros as decimals with 1 decimal place)
6. Always indicate the data source (e.g., "USDA Food Database", "Nutrition Database", "Standard Nutrition Values", "Food Composition Database")
7. Use authoritative sources like USDA, nutrition databases, or established food composition tables
8. If you cannot find reliable data, indicate this clearly

Look up the nutrition information per 100g for: "${ingredientName}"

Provide accurate nutrition data from reliable sources (USDA, nutrition databases, etc.) and provide:
- Calories per 100g (kcal, as integer)
- Protein per 100g (grams, 1 decimal place)
- Carbohydrates per 100g (grams, 1 decimal place)
- Fats per 100g (grams, 1 decimal place)

If the ingredient name is ambiguous, specify what you're looking up (e.g., if "chicken" is given, specify "chicken breast, raw" or similar common preparation).

Respond with a JSON object in this exact format:
{
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fats_per_100g": number,
  "ingredient_clarification": "clarified ingredient name if needed",
  "data_source": "source of nutrition data"
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
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
          maxOutputTokens: 1024,
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
      return new Response(
        JSON.stringify({ error: "Could not parse nutrition data. Please enter manually." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const nutritionData = JSON.parse(jsonMatch[0]);
      console.log("Parsed nutrition data:", nutritionData);
      
      // Validate the nutrition data
      if (!nutritionData.calories_per_100g || nutritionData.calories_per_100g < 0) {
        return new Response(
          JSON.stringify({ error: "Invalid nutrition data found. Please enter manually." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Ensure all values are present and valid
      const result = {
        calories_per_100g: Math.round(nutritionData.calories_per_100g || 0),
        protein_per_100g: Math.round((nutritionData.protein_per_100g || 0) * 10) / 10,
        carbs_per_100g: Math.round((nutritionData.carbs_per_100g || 0) * 10) / 10,
        fats_per_100g: Math.round((nutritionData.fats_per_100g || 0) * 10) / 10,
        ingredient_specification: nutritionData.ingredient_clarification || ingredientName,
        source: nutritionData.data_source || "Nutrition Database",
      };

      console.log("Returning nutrition data:", result);

      return new Response(
        JSON.stringify({ nutritionData: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (parseError) {
      console.error("Error parsing nutrition data:", parseError);
      return new Response(
        JSON.stringify({ error: "Could not parse nutrition data. Please enter manually." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in lookup-ingredient function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

