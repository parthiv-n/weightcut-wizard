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
    const { mealDescription } = await req.json();
    
    if (!mealDescription) {
      return new Response(
        JSON.stringify({ error: "Meal description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing meal:", mealDescription);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a nutrition analysis expert. Analyze meal descriptions and return accurate nutritional information.

CRITICAL RULES:
1. If the user explicitly mentions calorie amounts, protein, carbs, or fats - USE THOSE EXACT VALUES
2. If the user says "500 calories" - the meal must be exactly 500 calories, not an estimate
3. Only estimate nutritional values when the user doesn't provide specific numbers
4. Always respect user-provided nutritional data over your own calculations

Be realistic and precise with portion sizes.`
          },
          {
            role: "user",
            content: `Analyze this meal and provide nutritional information: "${mealDescription}"`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_meal",
              description: "Return nutritional analysis for the meal",
              parameters: {
                type: "object",
                properties: {
                  meal_name: {
                    type: "string",
                    description: "Clean, properly formatted name of the meal"
                  },
                  calories: {
                    type: "number",
                    description: "Total calories in kcal"
                  },
                  protein_g: {
                    type: "number",
                    description: "Protein content in grams"
                  },
                  carbs_g: {
                    type: "number",
                    description: "Carbohydrate content in grams"
                  },
                  fats_g: {
                    type: "number",
                    description: "Fat content in grams"
                  },
                  portion_size: {
                    type: "string",
                    description: "Estimated portion size (e.g., '250g', '1 plate', '2 servings')"
                  },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        grams: { type: "number" }
                      },
                      required: ["name", "grams"]
                    },
                    description: "List of ingredients with weights in grams"
                  }
                },
                required: ["meal_name", "calories", "protein_g", "carbs_g", "fats_g", "portion_size", "ingredients"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_meal" } }
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
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const nutritionData = JSON.parse(toolCall.function.arguments);
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