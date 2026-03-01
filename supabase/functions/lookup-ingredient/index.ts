import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { corsHeaders } from "../_shared/cors.ts";

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

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    console.log("Looking up nutrition for ingredient:", ingredientName);

    const systemPrompt = `Nutrition database expert. Return ONLY valid JSON — no markdown, no text.
Use USDA/authoritative food databases. Values per 100g. Calories as integer, macros 1 decimal.
If ambiguous, specify most common preparation (e.g., "chicken" → "chicken breast, raw").

{
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fats_per_100g": number,
  "ingredient_clarification": "clarified name if needed",
  "data_source": "source"
}`;

    const userPrompt = `Nutrition per 100g for: "${ingredientName}"`;

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
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_completion_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Grok API error:", response.status, errorData);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Grok API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log("Grok response:", JSON.stringify(data));

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different ingredient.");
      throw new Error("No response from Grok API");
    }

    try {
      const nutritionData = parseJSON(content);
      console.log("Parsed nutrition data:", nutritionData);

      // Validate the nutrition data
      if (!nutritionData.calories_per_100g || nutritionData.calories_per_100g < 0) {
        return new Response(
          JSON.stringify({ error: "Invalid nutrition data found. Please enter manually." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
