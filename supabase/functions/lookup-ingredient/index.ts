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

    const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") || "AIzaSyBlmYlZE8yk369foFvuYnzjay3O5oBR8rw";
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
    }

    console.log("Looking up nutrition for ingredient:", ingredientName);

    const systemPrompt = `You are an expert combat sports nutritionist looking up nutrition data for fighter meal planning. You specialize in finding accurate nutrition information that helps fighters meet their weight cutting and performance goals. Look up accurate nutrition information per 100g for food ingredients using authoritative nutrition databases.

CRITICAL RULES:
1. Use web search to find reliable nutrition databases (USDA, nutrition websites, food databases)
2. Return nutrition values per 100g (standard measurement)
3. Be precise and use real nutrition data from authoritative sources, not estimates
4. If the ingredient is ambiguous (e.g., "chicken"), specify the most common preparation (e.g., "chicken breast, raw")
5. Return values as numbers (calories as integer, macros as decimals with 1 decimal place)
6. Always indicate the data source (e.g., "USDA Food Database", "Nutrition Database", "Standard Nutrition Values", "Food Composition Database")
7. Use authoritative sources like USDA, nutrition databases, or established food composition tables
8. If you cannot find reliable data, indicate this clearly`;

    const userPrompt = `Look up the nutrition information per 100g for: "${ingredientName}"

Search the web for accurate nutrition data from reliable sources (USDA, nutrition databases, etc.) and provide:
- Calories per 100g (kcal, as integer)
- Protein per 100g (grams, 1 decimal place)
- Carbohydrates per 100g (grams, 1 decimal place)
- Fats per 100g (grams, 1 decimal place)

If the ingredient name is ambiguous, specify what you're looking up (e.g., if "chicken" is given, specify "chicken breast, raw" or similar common preparation).`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "lookup_ingredient_nutrition",
              description: "Return nutrition information per 100g for a food ingredient",
              parameters: {
                type: "object",
                properties: {
                  calories_per_100g: {
                    type: "number",
                    description: "Calories per 100g (kcal, as integer)"
                  },
                  protein_per_100g: {
                    type: "number",
                    description: "Protein per 100g (grams, 1 decimal place)"
                  },
                  carbs_per_100g: {
                    type: "number",
                    description: "Carbohydrates per 100g (grams, 1 decimal place)"
                  },
                  fats_per_100g: {
                    type: "number",
                    description: "Fats per 100g (grams, 1 decimal place)"
                  },
                  ingredient_specification: {
                    type: "string",
                    description: "Specific ingredient name if the original was ambiguous (e.g., 'chicken breast, raw')"
                  },
                  source: {
                    type: "string",
                    description: "Data source for nutrition information (e.g., 'USDA Food Database', 'Nutrition Database', 'Standard Nutrition Values', 'Food Composition Database')"
                  }
                },
                required: ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fats_per_100g", "source"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "lookup_ingredient_nutrition" } },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    const message = data.choices?.[0]?.message;
    
    // Check for tool call response (structured function call)
    const toolCall = message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === "lookup_ingredient_nutrition") {
      try {
        const nutritionData = JSON.parse(toolCall.function.arguments);
        console.log("Parsed nutrition data from tool call:", nutritionData);
        
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
          ingredient_specification: nutritionData.ingredient_specification || ingredientName,
          source: nutritionData.source || "Nutrition Database",
        };

        console.log("Returning nutrition data:", result);

        return new Response(
          JSON.stringify({ nutritionData: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (parseError) {
        console.error("Error parsing tool call arguments:", parseError);
        return new Response(
          JSON.stringify({ error: "Could not parse nutrition data. Please enter manually." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fallback: try to parse from content if no tool call
    let nutritionText = message?.content || "";
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = nutritionText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      nutritionText = jsonMatch[1];
    }

    // Try to parse the JSON response
    let nutritionData;
    try {
      nutritionData = JSON.parse(nutritionText);
    } catch (parseError) {
      // If JSON parsing fails, try to extract numbers from the text
      console.warn("Failed to parse JSON, attempting to extract from text");
      const caloriesMatch = nutritionText.match(/calories[:\s]+(\d+)/i);
      const proteinMatch = nutritionText.match(/protein[:\s]+([\d.]+)/i);
      const carbsMatch = nutritionText.match(/(?:carb|carbohydrate)[:\s]+([\d.]+)/i);
      const fatsMatch = nutritionText.match(/fat[:\s]+([\d.]+)/i);

      if (!caloriesMatch) {
        return new Response(
          JSON.stringify({ error: "Could not find nutrition data for this ingredient. Please enter manually." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      nutritionData = {
        calories_per_100g: parseInt(caloriesMatch[1]),
        protein_per_100g: proteinMatch ? parseFloat(proteinMatch[1]) : 0,
        carbs_per_100g: carbsMatch ? parseFloat(carbsMatch[1]) : 0,
        fats_per_100g: fatsMatch ? parseFloat(fatsMatch[1]) : 0,
      };
    }

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
      ingredient_specification: nutritionData.ingredient_specification || ingredientName,
    };

    console.log("Returning nutrition data:", result);

    return new Response(
      JSON.stringify({ nutritionData: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

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

