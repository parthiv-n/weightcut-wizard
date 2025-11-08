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
      tdee
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = daysRemaining / 7;
    const weightToLose = currentWeight - goalWeight;
    const requiredWeeklyLoss = weightToLose / weeksRemaining;

    const systemPrompt = `You are the Weight Cut Wizard, a science-based nutrition and weight loss expert specializing in combat sports athletes.

CRITICAL SAFETY FRAMEWORK FOR WEEKLY WEIGHT LOSS:
- GREEN (Safe): ≤0.5-1.0kg per week (optimal fat loss, preserves performance)
- YELLOW (Moderate): 1.0-1.5kg per week (aggressive but manageable, slight performance impact)
- RED (Dangerous): >1.5kg per week (excessive, severe performance degradation, health risks)

CALORIE CALCULATION PRINCIPLES:
1. Use TDEE (Total Daily Energy Expenditure) as baseline
2. Safe deficit: 500-750 kcal/day (creates 0.5-0.75kg/week loss)
3. Aggressive deficit: 750-1000 kcal/day (creates 0.75-1kg/week loss)
4. Never recommend >1000 kcal deficit (dangerous)
5. Minimum calories: Never below 1500 kcal for males, 1200 kcal for females
6. Protein priority: 2.0-2.5g per kg body weight for muscle preservation
7. Consider activity level and training demands

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

    const userPrompt = `Calculate optimal weight loss strategy:
- Current Weight: ${currentWeight}kg
- Goal Weight: ${goalWeight}kg
- Weight to Lose: ${weightToLose.toFixed(1)}kg
- Days Remaining: ${daysRemaining}
- Weeks Remaining: ${weeksRemaining.toFixed(1)}
- Required Weekly Loss: ${requiredWeeklyLoss.toFixed(2)}kg/week
- TDEE: ${tdee} kcal/day
- Activity Level: ${activityLevel}
- Age: ${age}
- Sex: ${sex}
- Height: ${heightCm}cm

Provide:
1. Risk level assessment (green/yellow/red)
2. Recommended daily calorie intake
3. Macronutrient breakdown (protein/carbs/fats in grams)
4. Strategic guidance for achieving goal safely
5. Weekly plan structure
6. Training considerations based on deficit

Be specific with numbers and practical advice. If the timeline is unrealistic (requires >1.5kg/week), clearly state this and recommend timeline extension.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
