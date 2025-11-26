import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    console.error("Error in extractMealsFromText:", error);
    // Return empty array if extraction fails completely
  }
  
  return meals;
}

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

    const profileUserData = profile ? {
      currentWeight: profile.current_weight_kg,
      goalWeight: profile.goal_weight_kg,
      tdee: profile.tdee,
      daysToWeighIn: Math.ceil(
        (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    } : null;

    const { prompt, action, userData } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY environment variable is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Request data:", { prompt: prompt?.substring(0, 100), action, userData });

    // Calculate safe calorie target
    const currentWeight = profileUserData?.currentWeight || 70;
    const goalWeight = profileUserData?.goalWeight || 65;
    const tdee = profileUserData?.tdee || 2000;
    const daysToGoal = profileUserData?.daysToWeighIn || 60;
    
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

    const systemPrompt = `Nutrition AI for fighters. Create safe meal plans.

Target: ${Math.round(dailyCalorieTarget)} cal/day (${currentWeight}kg→${goalWeight}kg, ${daysToGoal} days)
Safety: ${safetyIndicator} - ${safetyMessage}

Respond ONLY with JSON:
{
  "meals": [
    {
      "name": "Breakfast - Meal name",
      "calories": 400,
      "protein": 30,
      "carbs": 40,
      "fats": 15,
      "portion": "300g",
      "recipe": "Brief prep",
      "type": "breakfast",
      "ingredients": [{"name": "Chicken breast", "grams": 200}]
    }
  ],
  "totalCalories": ${Math.round(dailyCalorieTarget)},
  "totalProtein": 120,
  "totalCarbs": 200,
  "totalFats": 60,
  "safetyStatus": "${safetyIndicator}",
  "safetyMessage": "${safetyMessage}",
  "tips": "Brief tips"
}

Rules: 3+ meals, specific ingredients with grams, no markdown, numbers not strings.`;

    console.log("Calling OpenAI API for meal planning...");

    const userPrompt = `User Request: ${prompt}`;

    // Add timeout to prevent hanging - increased for more reliable responses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 1024,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log("OpenAI API response status:", response.status);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("OpenAI API request timed out after 25 seconds");
        return new Response(
          JSON.stringify({ error: "AI request timed out after 25 seconds. The service may be busy. Please try again in a moment." }),
          { status: 408, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("OpenAI API fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to connect to AI service" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", response.status, errorData);
      
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
        JSON.stringify({ error: `OpenAI API error: ${errorData.error?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Full OpenAI response:", JSON.stringify(data, null, 2));
    
    // Extract content from OpenAI response
    const content = data.choices?.[0]?.message?.content;
    
    console.log("=== OPENAI RESPONSE DEBUG ===");
    console.log("Raw OpenAI content:", content);
    console.log("Content type:", typeof content);
    console.log("Content length:", content?.length);
    console.log("=== END DEBUG ===");

    if (!content) {
      console.error("❌ No content found in OpenAI response");
      console.error("Available fields in response:", Object.keys(data));
      if (data.choices?.[0]) {
        console.error("Available fields in first choice:", Object.keys(data.choices[0]));
        console.error("First choice content:", data.choices[0]);
      }
      
      // Check for specific finish reasons
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason) {
        console.error("Finish reason:", finishReason);
        
        if (finishReason === 'content_filter') {
          return new Response(
            JSON.stringify({ error: "Content was filtered for safety. Please try a different prompt." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else if (finishReason === 'length') {
          return new Response(
            JSON.stringify({ error: "Response was too long. Please try a shorter prompt." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      
      // Try fallback extraction from any available text
      console.log("🔄 Attempting fallback content extraction...");
      const fallbackMeals = extractMealsFromText(JSON.stringify(data));
      if (fallbackMeals.length > 0) {
        console.log("✅ Fallback extraction found", fallbackMeals.length, "meals");
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
      
      throw new Error("No content in OpenAI API response and fallback extraction failed");
    }

    // Parse JSON from OpenAI response (should be clean JSON due to response_format)
    let mealPlanData;
    try {
      console.log("=== JSON PARSING DEBUG ===");
      console.log("Parsing OpenAI JSON response...");
      
      // OpenAI with response_format: json_object should return clean JSON
      mealPlanData = JSON.parse(content);
      
      console.log("Successfully parsed OpenAI response");
      console.log("Meal plan structure:", Object.keys(mealPlanData));
      console.log("Number of meals:", mealPlanData.meals?.length || 0);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Raw content:", typeof content === 'string' ? content.substring(0, 500) : JSON.stringify(content));
      
      // Enhanced fallback: try to extract any meal information from text
      console.log("Attempting fallback meal extraction...");
      
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
        console.log("Fallback extraction successful, found", fallbackMeals.length, "meals");
      } catch (fallbackError) {
        console.error("Fallback extraction also failed:", fallbackError);
      
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
          details: "OpenAI API integration error"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
});
