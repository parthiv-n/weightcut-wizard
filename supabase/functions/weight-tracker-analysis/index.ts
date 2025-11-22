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
    const { 
      currentWeight, 
      goalWeight, 
      targetDate,
      activityLevel,
      age,
      sex,
      heightCm,
      tdee,
      fightNightWeight
    } = await req.json();
    
    const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") || "***REDACTED_API_KEY***";

    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
    }

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7); // Prevent division by zero
    
    // Detect maintenance mode: when current weight equals or exceeds fight week target
    const isMaintenanceMode = currentWeight >= goalWeight;
    const weightToLose = isMaintenanceMode ? 0 : currentWeight - goalWeight;
    const requiredWeeklyLoss = isMaintenanceMode ? 0 : weightToLose / weeksRemaining;

    const systemPrompt = `You are an expert combat sports nutritionist specializing in weight management and nutrition strategies for fighters. You have deep knowledge of combat sports physiology, training demands, performance optimization, and safe weight cutting protocols.

CRITICAL: UNDERSTANDING THE TARGET WEIGHTS
- The "goalWeight" parameter is the FIGHT WEEK TARGET (diet goal before dehydration), NOT the final weigh-in weight
- The fight week target is achieved through diet and fat loss over time
- The fight night weight (final weigh-in) is achieved through dehydration in the final days, NOT through diet
- When current weight equals or exceeds fight week target, recommend MAINTENANCE calories (TDEE) to maintain weight
- No calorie deficit is needed when already at or below fight week target

CRITICAL SAFETY FRAMEWORK FOR WEEKLY WEIGHT LOSS:
- GREEN (Safe): ≤0.5-1.0kg per week (optimal fat loss, preserves performance)
- YELLOW (Moderate): 1.0-1.5kg per week (aggressive but manageable, slight performance impact)
- RED (Dangerous): >1.5kg per week (excessive, severe performance degradation, health risks)

CALORIE CALCULATION PRINCIPLES:
1. Use TDEE (Total Daily Energy Expenditure) as baseline
2. When at or below fight week target: Recommend MAINTENANCE calories (TDEE) with no deficit
3. Safe deficit: 500-750 kcal/day (creates 0.5-0.75kg/week loss)
4. Aggressive deficit: 750-1000 kcal/day (creates 0.75-1kg/week loss)
5. Never recommend >1000 kcal deficit (dangerous)
6. Minimum calories: Never below 1500 kcal for males, 1200 kcal for females
7. Protein priority: 2.0-2.5g per kg body weight for muscle preservation
8. Consider activity level and training demands

STRATEGIC GUIDANCE FACTORS:
- Time available (more time = safer approach)
- Current training load (harder training = need more calories)
- Performance requirements (competitive athletes need higher calories)
- Body composition (leaner athletes need slower cut)
- Recovery capacity (adequate nutrition prevents injury)

OUTPUT FORMAT - You must respond with valid JSON only:
{
  "riskLevel": "green" | "yellow" | "red",
  "requiredWeeklyLoss": 0.8,
  "recommendedCalories": 2200,
  "calorieDeficit": 500,
  "proteinGrams": 160,
  "carbsGrams": 200,
  "fatsGrams": 70,
  "riskExplanation": "Why this is green/yellow/red with scientific reasoning",
  "strategicGuidance": "Comprehensive guidance on how to achieve this safely",
  "nutritionTips": [
    "Specific tip 1",
    "Specific tip 2",
    "Specific tip 3"
  ],
  "trainingConsiderations": "How to adjust training based on calorie deficit",
  "timeline": "Whether the timeline is realistic or needs adjustment",
  "weeklyPlan": {
    "week1": "What to focus on in week 1",
    "week2": "What to focus on in week 2",
    "ongoing": "Ongoing strategy"
  }
}`;

    // Build user prompt with maintenance mode handling
    let userPrompt = `Calculate optimal weight management strategy:
- Current Weight: ${currentWeight}kg
- Goal Weight (Fight Week Target - diet goal before dehydration): ${goalWeight}kg
${fightNightWeight ? `- Fight Night Weight (final weigh-in after dehydration): ${fightNightWeight}kg (for reference only, not the diet target)` : ''}
- Weight to Lose: ${weightToLose.toFixed(1)}kg
- Days Remaining: ${daysRemaining}
- Weeks Remaining: ${weeksRemaining.toFixed(1)}
- Required Weekly Loss: ${requiredWeeklyLoss.toFixed(2)}kg/week
- TDEE: ${tdee} kcal/day
- Activity Level: ${activityLevel}
- Age: ${age}
- Sex: ${sex}
- Height: ${heightCm}cm

${isMaintenanceMode ? `\nIMPORTANT: Current weight (${currentWeight}kg) equals or exceeds fight week target (${goalWeight}kg). Recommend MAINTENANCE calories (TDEE: ${tdee}kcal) to maintain weight. No calorie deficit needed. User is already at the diet goal - any further weight loss to reach fight night weight will be achieved through dehydration in the final days, not through diet.` : ''}

Provide:
1. Risk level assessment (green/yellow/red)${isMaintenanceMode ? ' - Should be GREEN (maintenance mode)' : ''}
2. Recommended daily calorie intake${isMaintenanceMode ? ' - Should be TDEE (maintenance) with no deficit' : ''}
3. Macronutrient breakdown (protein/carbs/fats in grams)${isMaintenanceMode ? ' - Balanced macros for maintenance' : ''}
4. Strategic guidance for achieving goal safely${isMaintenanceMode ? ' - Focus on maintaining current weight and preparing for final dehydration phase' : ''}
5. Weekly plan structure${isMaintenanceMode ? ' - Maintenance nutrition plan' : ''}
6. Training considerations${isMaintenanceMode ? ' - Training nutrition for maintenance' : ' based on deficit'}

${isMaintenanceMode ? 'Since user is already at fight week target, focus on maintenance nutrition. The fight night weight will be achieved through dehydration protocols in the final days before weigh-in, not through continued dieting.' : 'Be specific with numbers and practical advice. If the timeline is unrealistic (requires >1.5kg/week), clearly state this and recommend timeline extension.'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
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
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let analysisText = data.choices[0].message.content;

    // Extract JSON from markdown code blocks if present
    const jsonMatch = analysisText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      analysisText = jsonMatch[1];
    }

    // Parse the JSON analysis
    const analysis = JSON.parse(analysisText);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in weight-tracker-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
