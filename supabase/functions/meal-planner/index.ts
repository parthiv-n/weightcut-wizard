import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// Helper function to extract meals from plain text when JSON parsing fails
function extractMealsFromText(text: string): any[] {
  const meals: any[] = [];

  try {
    // Look for common meal patterns in text
    const mealPatterns = [
      /breakfast[:\s]*([^\n]+)/gi,
      /lunch[:\s]*([^\n]+)/gi,
      /dinner[:\s]*([^\n]+)/gi,
      /snack[:\s]*([^\n]+)/gi,
      /meal\s*\d+[:\s]*([^\n]+)/gi
    ];

    mealPatterns.forEach((pattern, index) => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].trim()) {
          meals.push({
            name: match[1].trim(),
            calories: 300 + (index * 100), // Rough estimate
            protein: 20 + (index * 5),
            carbs: 30 + (index * 10),
            fats: 10 + (index * 3),
            type: ['breakfast', 'lunch', 'dinner', 'snack', 'meal'][index] || 'meal'
          });
        }
      }
    });

    // If no meals found, create a basic fallback
    if (meals.length === 0) {
      meals.push({
        name: "Basic meal plan (parsing failed)",
        calories: 400,
        protein: 25,
        carbs: 40,
        fats: 15,
        type: "meal"
      });
    }

  } catch (error) {
    edgeLogger.error("Error in extractMealsFromText", error, { functionName: "meal-planner" });
    // Return empty array if extraction fails completely
  }

  return meals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      .select('current_weight_kg, goal_weight_kg, tdee, target_date, ai_recommended_calories, ai_recommended_protein_g, ai_recommended_carbs_g, ai_recommended_fats_g, manual_nutrition_override')
      .eq('id', user.id)
      .single();

    const profileUserData = profile ? {
      currentWeight: profile.current_weight_kg,
      goalWeight: profile.goal_weight_kg,
      tdee: profile.tdee,
      daysToWeighIn: Math.ceil(
        (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    } : null;

    const { prompt, action, userData } = await req.json();
    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");

    if (!GROK_API_KEY) {
      edgeLogger.error("GROK_API_KEY environment variable is not configured", undefined, { functionName: "meal-planner" });
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    edgeLogger.info("Request data", { prompt: prompt?.substring(0, 100), action, userData });

    // Calculate safe calorie target
    const currentWeight = profileUserData?.currentWeight || 70;
    const goalWeight = profileUserData?.goalWeight || 65;
    const tdee = profileUserData?.tdee || 2000;
    const daysToGoal = profileUserData?.daysToWeighIn || 60;

    const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
    const safeWeeklyLoss = Math.min(weeklyWeightLoss, 1); // Max 1kg/week
    const dailyDeficit = (safeWeeklyLoss * 7700) / 7; // 7700 cal = 1kg fat
    const defaultCalorieTarget = Math.max(tdee - dailyDeficit, tdee * 0.8); // Minimum 80% of TDEE

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

    // Use user's custom goals when available, otherwise fall back to TDEE-based calculation
    let dailyCalorieTarget: number;
    let targetProtein: number;
    let targetCarbs: number;
    let targetFats: number;

    if (profile?.manual_nutrition_override && profile?.ai_recommended_calories) {
      dailyCalorieTarget = profile.ai_recommended_calories;
      targetProtein = profile.ai_recommended_protein_g || Math.round(dailyCalorieTarget * 0.40 / 4);
      targetCarbs = profile.ai_recommended_carbs_g || Math.round(dailyCalorieTarget * 0.30 / 4);
      targetFats = profile.ai_recommended_fats_g || Math.round(dailyCalorieTarget * 0.30 / 9);
    } else {
      dailyCalorieTarget = defaultCalorieTarget;
      targetProtein = Math.round((dailyCalorieTarget * 0.40) / 4);
      targetCarbs = Math.round((dailyCalorieTarget * 0.30) / 4);
      // Fats absorb rounding error
      targetFats = Math.round((dailyCalorieTarget - targetProtein * 4 - targetCarbs * 4) / 9);
    }

    const systemPrompt = `Nutrition AI for fighters. Create safe meal plans.

Target: ${Math.round(dailyCalorieTarget)} cal/day (${currentWeight}kg→${goalWeight}kg, ${daysToGoal} days)
Safety: ${safetyIndicator} - ${safetyMessage}

MACRO TARGETS: ${targetProtein}g protein, ${targetCarbs}g carbs, ${targetFats}g fat

CRITICAL MATH RULES - YOU MUST FOLLOW THESE EXACTLY:
1. Each meal's calories MUST equal: (protein × 4) + (carbs × 4) + (fats × 9), within ±20 cal
2. The sum of ALL meals' protein MUST equal totalProtein (±5g)
3. The sum of ALL meals' carbs MUST equal totalCarbs (±5g)
4. The sum of ALL meals' fats MUST equal totalFats (±3g)
5. The sum of ALL meals' calories MUST equal totalCalories (±30 cal)
6. totalCalories MUST equal ${Math.round(dailyCalorieTarget)} (±30 cal)
7. totalProtein MUST equal ${targetProtein} (±5g)
8. totalCarbs MUST equal ${targetCarbs} (±5g)
9. totalFats MUST equal ${targetFats} (±3g)

VERIFICATION STEP: Before responding, verify that:
- Each meal: (protein × 4) + (carbs × 4) + (fats × 9) ≈ calories
- Sum of all meal proteins ≈ totalProtein
- Sum of all meal carbs ≈ totalCarbs
- Sum of all meal fats ≈ totalFats
- Sum of all meal calories ≈ totalCalories

FORMATTING RULES:
You must output ONLY valid, raw JSON. Do NOT wrap the JSON in markdown code blocks (\`\`\`json). Do NOT add explanatory text before or after the JSON. Provide EXACTLY the structure requested below.
You must provide AT LEAST 3 real meals per day. Meals must include an array of specific ingredients with their absolute values in grams.

Respond ONLY with this exact JSON structure:
{
  "meals": [
    {
      "name": "Breakfast - Meal name",
      "calories": 400,
      "protein": 40,
      "carbs": 30,
      "fats": 12,
      "portion": "300g",
      "recipe": "Brief prep method goes here",
      "type": "breakfast",
      "ingredients": [{"name": "Chicken breast", "grams": 200}]
    }
  ],
  "totalCalories": ${Math.round(dailyCalorieTarget)},
  "totalProtein": ${targetProtein},
  "totalCarbs": ${targetCarbs},
  "totalFats": ${targetFats},
  "safetyStatus": "${safetyIndicator}",
  "safetyMessage": "${safetyMessage}",
  "tips": "Brief tips"
}`;

    edgeLogger.info("Calling Grok API for meal planning");

    const userPrompt = `User Request: ${prompt}`;

    let response;
    try {
      response = await fetch("https://api.x.ai/v1/chat/completions", {
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
          temperature: 0.3,
          max_completion_tokens: 4096
        }),
      });

      edgeLogger.info("Grok API response status", { status: response.status });
    } catch (fetchError) {
      edgeLogger.error("Grok API fetch error", fetchError, { functionName: "meal-planner" });
      return new Response(
        JSON.stringify({ error: "Failed to connect to AI service" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, { functionName: "meal-planner", status: response.status, errorData });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
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

      return new Response(
        JSON.stringify({ error: `Grok API error: ${errorData.error?.message || 'Unknown error'}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    edgeLogger.info("Full Grok response received", { responseKeys: Object.keys(data) });

    // Extract content from Grok response and strip <think> tags
    const { content, filtered } = extractContent(data);

    edgeLogger.info("Grok response debug", { contentType: typeof content, contentLength: content?.length });

    if (!content) {
      edgeLogger.error("No content found in Grok response", undefined, {
        functionName: "meal-planner",
        availableFields: Object.keys(data),
        firstChoiceFields: data.choices?.[0] ? Object.keys(data.choices[0]) : [],
      });

      if (filtered) {
        edgeLogger.warn("Grok finish reason", { functionName: "meal-planner", finishReason: 'content_filter' });
        return new Response(
          JSON.stringify({ error: "Content was filtered for safety. Please try a different prompt." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        edgeLogger.warn("Grok finish reason", { functionName: "meal-planner", finishReason });
        return new Response(
          JSON.stringify({ error: "Response was too long. Please try a shorter prompt." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try fallback extraction from any available text
      edgeLogger.info("Attempting fallback content extraction");
      const fallbackMeals = extractMealsFromText(JSON.stringify(data));
      if (fallbackMeals.length > 0) {
        edgeLogger.info("Fallback extraction found meals", { count: fallbackMeals.length });
        const mealPlanData = {
          meals: fallbackMeals,
          totalCalories: fallbackMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0),
          totalProtein: fallbackMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0),
          totalCarbs: fallbackMeals.reduce((sum, meal) => sum + (meal.carbs || 0), 0),
          totalFats: fallbackMeals.reduce((sum, meal) => sum + (meal.fats || 0), 0),
          note: "Generated from fallback extraction due to API response parsing issue"
        };

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
      }

      throw new Error("No content in Grok API response and fallback extraction failed");
    }

    // Parse JSON from Grok response
    let mealPlanData;
    try {
      edgeLogger.info("Parsing Grok JSON response");

      mealPlanData = parseJSON(content);
      edgeLogger.info("Successfully parsed Grok response", { structure: Object.keys(mealPlanData), mealCount: mealPlanData.meals?.length || 0 });
    } catch (e) {
      edgeLogger.error("Failed to parse AI response as JSON", e, { functionName: "meal-planner", rawContentPreview: typeof content === 'string' ? content.substring(0, 500) : JSON.stringify(content) });

      // Enhanced fallback: try to extract any meal information from text
      edgeLogger.info("Attempting fallback meal extraction");

      try {
        // Try to extract meal information from plain text
        const fallbackMeals = extractMealsFromText(content);
        mealPlanData = {
          meals: fallbackMeals,
          totalCalories: fallbackMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0),
          totalProtein: fallbackMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0),
          totalCarbs: fallbackMeals.reduce((sum, meal) => sum + (meal.carbs || 0), 0),
          totalFats: fallbackMeals.reduce((sum, meal) => sum + (meal.fats || 0), 0),
          note: "Extracted from text due to JSON parsing failure"
        };
        edgeLogger.info("Fallback extraction successful", { mealCount: fallbackMeals.length });
      } catch (fallbackError) {
        edgeLogger.error("Fallback extraction also failed", fallbackError, { functionName: "meal-planner" });

        // Return error response that frontend can handle
        return new Response(
          JSON.stringify({
            error: "Failed to parse meal plan from AI response. Please try again.",
            details: e instanceof Error ? e.message : "Unknown parsing error"
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Server-side validation: recalculate each meal's calories and adjust last meal to match targets
    if (mealPlanData.meals && Array.isArray(mealPlanData.meals) && mealPlanData.meals.length > 0) {
      // Step 1: Recalculate each meal's calories from its macros
      for (const meal of mealPlanData.meals) {
        const p = meal.protein || 0;
        const c = meal.carbs || 0;
        const f = meal.fats || 0;
        meal.calories = p * 4 + c * 4 + f * 9;
      }

      // Step 2: Sum actual totals
      let totalP = mealPlanData.meals.reduce((s: number, m: any) => s + (m.protein || 0), 0);
      let totalC = mealPlanData.meals.reduce((s: number, m: any) => s + (m.carbs || 0), 0);
      let totalF = mealPlanData.meals.reduce((s: number, m: any) => s + (m.fats || 0), 0);
      let totalCal = totalP * 4 + totalC * 4 + totalF * 9;

      // Step 3: If off by more than tolerance, adjust the last meal
      const calOff = Math.abs(totalCal - Math.round(dailyCalorieTarget));
      const pOff = Math.abs(totalP - targetProtein);
      const cOff = Math.abs(totalC - targetCarbs);
      const fOff = Math.abs(totalF - targetFats);

      if (calOff > 30 || pOff > 5 || cOff > 5 || fOff > 3) {
        const lastMeal = mealPlanData.meals[mealPlanData.meals.length - 1];
        lastMeal.protein = Math.max(0, (lastMeal.protein || 0) + (targetProtein - totalP));
        lastMeal.carbs = Math.max(0, (lastMeal.carbs || 0) + (targetCarbs - totalC));
        lastMeal.fats = Math.max(0, (lastMeal.fats || 0) + (targetFats - totalF));
        lastMeal.calories = lastMeal.protein * 4 + lastMeal.carbs * 4 + lastMeal.fats * 9;
      }

      // Step 4: Recalculate totals from corrected meals
      mealPlanData.totalProtein = mealPlanData.meals.reduce((s: number, m: any) => s + (m.protein || 0), 0);
      mealPlanData.totalCarbs = mealPlanData.meals.reduce((s: number, m: any) => s + (m.carbs || 0), 0);
      mealPlanData.totalFats = mealPlanData.meals.reduce((s: number, m: any) => s + (m.fats || 0), 0);
      mealPlanData.totalCalories = mealPlanData.totalProtein * 4 + mealPlanData.totalCarbs * 4 + mealPlanData.totalFats * 9;
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
    edgeLogger.error("meal-planner error", error, { functionName: "meal-planner" });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: "Grok API integration error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
