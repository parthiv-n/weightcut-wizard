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

    const systemPrompt = `You are the Weight Cut Wizard's nutrition AI. Generate safe, nutritious meal plans that help fighters reach their weight goals safely.

CRITICAL SAFETY RULES:
• NEVER suggest daily calories below ${Math.round(dailyCalorieTarget)}
• NEVER recommend starvation, extreme restriction, or unsafe diets
• Current safe calorie target: ${Math.round(dailyCalorieTarget)} cal/day
• Weekly weight loss target: ${safeWeeklyLoss.toFixed(2)} kg (${weeklyLossPercent.toFixed(1)}% body weight)
• Safety status: ${safetyIndicator.toUpperCase()} ${safetyMessage}

User Context:
Current weight: ${currentWeight}kg
Goal weight: ${goalWeight}kg
TDEE: ${tdee} cal/day
Days to goal: ${daysToGoal}

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanations, no code blocks.

RESPONSE FORMAT (EXACT JSON STRUCTURE REQUIRED):
{
  "meals": [
    {
      "name": "Breakfast - Meal name",
      "calories": 400,
      "protein": 30,
      "carbs": 40,
      "fats": 15,
      "portion": "Total weight in grams",
      "recipe": "Brief preparation notes",
      "type": "breakfast",
      "ingredients": [
        {"name": "Chicken breast", "grams": 200},
        {"name": "Brown rice", "grams": 150},
        {"name": "Olive oil", "grams": 10}
      ]
    },
    {
      "name": "Lunch - Meal name",
      "calories": 500,
      "protein": 35,
      "carbs": 50,
      "fats": 20,
      "portion": "Total weight in grams",
      "recipe": "Brief preparation notes",
      "type": "lunch",
      "ingredients": []
    },
    {
      "name": "Dinner - Meal name",
      "calories": 600,
      "protein": 40,
      "carbs": 60,
      "fats": 25,
      "portion": "Total weight in grams",
      "recipe": "Brief preparation notes",
      "type": "dinner",
      "ingredients": []
    }
  ],
  "totalCalories": ${Math.round(dailyCalorieTarget)},
  "totalProtein": 120,
  "totalCarbs": 200,
  "totalFats": 60,
  "safetyStatus": "${safetyIndicator}",
  "safetyMessage": "${safetyMessage}",
  "tips": "Motivational and practical tips for the day"
}

IMPORTANT RULES:
• Respond with ONLY the JSON object above
• NO markdown formatting (no backticks)
• NO explanatory text before or after
• Ensure all numeric values are numbers, not strings
• Include at least 3 meals (breakfast, lunch, dinner)
• Each meal must have all required fields

CRITICAL: For each meal, you MUST include:
• An ingredients array with specific foods and their weights in GRAMS
• Each ingredient must have name and grams properties
• Ingredient weights should be realistic and add up to a reasonable total meal weight
• Be specific (e.g. Chicken breast not just Chicken, Brown rice not just Rice)

Generate meal plans that:
• Stay within daily calorie target
• Provide adequate protein (1.8-2.2g per kg body weight)
• Include nutrient-dense whole foods
• Are practical and easy to prepare
• Respect any dietary restrictions mentioned
• Support training and recovery`;

    console.log("Calling Google Gemini API for meal planning...");

    const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;

    // Add timeout to prevent hanging - reduced for faster responses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
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
          maxOutputTokens: 2048,
          topK: 40,
          topP: 0.95,
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
    console.log("Full Gemini response:", JSON.stringify(data, null, 2));
    console.log("Candidates:", data.candidates);
    console.log("Content parts:", data.candidates?.[0]?.content?.parts);
    
    // Try multiple ways to extract content
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      // Try alternative structure
      content = data.candidates?.[0]?.text;
    }
    if (!content) {
      // Try another alternative
      content = data.text;
    }
    if (!content) {
      // Try direct content field
      content = data.candidates?.[0]?.content;
    }
    
    // Ensure content is a string
    if (content && typeof content !== 'string') {
      content = JSON.stringify(content);
    }

    console.log("Extracted content:", content ? (typeof content === 'string' ? content.substring(0, 200) + "..." : JSON.stringify(content).substring(0, 200) + "...") : "NO CONTENT FOUND");
    
    // DETAILED DEBUGGING: Log the complete content for analysis
    console.log("=== DETAILED GEMINI RESPONSE DEBUG ===");
    console.log("Raw Gemini content:", content);
    console.log("Content type:", typeof content);
    console.log("Content length:", content?.length);
    console.log("Is string?", typeof content === 'string');
    if (typeof content === 'string') {
      console.log("First 500 chars:", content.substring(0, 500));
      console.log("Last 200 chars:", content.substring(Math.max(0, content.length - 200)));
      console.log("Contains JSON markers?", content.includes('{') && content.includes('}'));
      console.log("Contains markdown?", content.includes('```'));
    }
    console.log("=== END DEBUG ===");

    if (!content) {
      console.error("No content found in any expected field");
      console.error("Available fields in response:", Object.keys(data));
      if (data.candidates?.[0]) {
        console.error("Available fields in first candidate:", Object.keys(data.candidates[0]));
      }
      
      // Check for safety filter
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        return new Response(
          JSON.stringify({ error: "Content was filtered for safety. Please try a different request." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("No content in Gemini API response");
    }

    // Try to parse JSON from the response with improved logic
    let mealPlanData;
    try {
      console.log("=== JSON PARSING DEBUG ===");
      
      // Clean the content by removing markdown code blocks and extracting JSON
      let cleanContent = content.trim();
      console.log("Initial clean content length:", cleanContent.length);
      
      // Remove all markdown code block markers (more comprehensive)
      cleanContent = cleanContent.replace(/```json\s*/gi, '');
      cleanContent = cleanContent.replace(/```javascript\s*/gi, '');
      cleanContent = cleanContent.replace(/```\s*/g, '');
      cleanContent = cleanContent.replace(/^```/gm, '');
      cleanContent = cleanContent.replace(/```$/gm, '');
      
      console.log("After markdown removal:", cleanContent.length);
      
      // Try multiple JSON extraction methods
      let jsonStr = '';
      
      // Method 1: Find complete JSON object
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = cleanContent.substring(firstBrace, lastBrace + 1);
        console.log("Method 1 - JSON extraction successful, length:", jsonStr.length);
      } else {
        console.log("Method 1 failed - no valid braces found");
        
        // Method 2: Try to find JSON in different patterns
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
          console.log("Method 2 - Regex extraction successful, length:", jsonStr.length);
        } else {
          console.log("Method 2 failed - no JSON pattern found");
          
          // Method 3: Try parsing the entire cleaned content
          jsonStr = cleanContent;
          console.log("Method 3 - Using entire content, length:", jsonStr.length);
        }
      }
      
      console.log("Final JSON string preview:", jsonStr.substring(0, 200));
      console.log("=== END JSON PARSING DEBUG ===");
      
      mealPlanData = JSON.parse(jsonStr);
      
      console.log("Successfully parsed AI response");
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
        details: error instanceof Error ? error.stack : "No additional details"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
