import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, userData, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

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

${userData?.dietaryPreferences ? `Dietary preferences: ${userData.dietaryPreferences}` : ""}

RESPONSE FORMAT (must be valid JSON):
{
  "mealPlan": {
    "breakfast": {
      "name": "Meal name",
      "calories": 400,
      "protein": 30,
      "carbs": 40,
      "fats": 15,
      "portion": "Description",
      "recipe": "Brief preparation notes"
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

Generate meal plans that:
- Stay within daily calorie target
- Provide adequate protein (1.8-2.2g per kg body weight)
- Include nutrient-dense whole foods
- Are practical and easy to prepare
- Respect any dietary restrictions mentioned
- Support training and recovery`;

    console.log("Calling Lovable AI for meal planning...");

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
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Try to parse JSON from the response
    let mealPlanData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      mealPlanData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // If parsing fails, return the raw content
      mealPlanData = {
        rawResponse: content,
        dailyCalorieTarget: Math.round(dailyCalorieTarget),
        safetyStatus: safetyIndicator,
        safetyMessage
      };
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
