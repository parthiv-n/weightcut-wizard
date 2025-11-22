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
      targetWeight, 
      daysUntilFight, 
      dailyLogs, 
      startingWeight,
      isWaterloading 
    } = await req.json();
    
    const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") || "AIzaSyBlmYlZE8yk369foFvuYnzjay3O5oBR8rw";

    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert combat sports nutritionist specializing in fight week weight cutting protocols. You have deep knowledge of combat sports physiology, dehydration strategies, rehydration protocols, and fighter safety. Your expertise includes understanding the unique demands of weight cutting in combat sports and the critical balance between achieving weight goals and maintaining performance.

CRITICAL SAFETY ASSESSMENT FRAMEWORK:
- Calculate weight to cut as percentage of body weight
- GREEN (Safe): ≤5% body weight, achievable through carb depletion + minimal dehydration
- YELLOW (Moderate Risk): 5-8% body weight, requires aggressive protocol, may affect performance
- RED (High Risk): >8% body weight, dangerous, exceeds safe physiological limits

WEIGHT CUT COMPONENTS:
1. Glycogen + Water Depletion: ~2-2.5kg (carb restriction)
2. Safe Dehydration: Max 3% of body weight
3. Water Loading Protocol: If used, adds ~2-3kg extra capacity
4. Digestive Tract Clearance: ~0.5-1kg

WATERLOADING PROTOCOL CONSIDERATION:
${isWaterloading ? `
- Fighter IS water loading
- This increases safe dehydration capacity by 2-3kg
- Factor this into total safe cut calculation
- Monitor for hyponatremia risk (excessive water intake)
` : `
- Fighter is NOT water loading
- Base calculations on standard carb depletion + 3% dehydration only
`}

ANALYSIS REQUIREMENTS:
1. Calculate exact weight remaining to cut
2. Determine risk level (GREEN/YELLOW/RED) with scientific justification
3. Analyze daily progress against expected trajectory
4. Identify if weight loss is on track, ahead, or behind
5. Provide specific adaptation recommendations for remaining days
6. Consider if current rate suggests more/less weight from carb depletion than expected

OUTPUT FORMAT - You must respond with valid JSON only:
{
  "riskLevel": "green" | "yellow" | "red",
  "riskPercentage": 5.2,
  "weightRemaining": 3.2,
  "dehydrationRequired": 1.2,
  "carbDepletionEstimate": 2.0,
  "isOnTrack": true,
  "progressStatus": "Ahead of schedule" | "On track" | "Behind schedule",
  "dailyAnalysis": "Detailed analysis of daily weight changes and what they indicate",
  "adaptations": [
    "Specific change 1 for remaining days",
    "Specific change 2 for remaining days"
  ],
  "riskExplanation": "Why this is green/yellow/red with scientific reasoning",
  "recommendation": "Overall strategic guidance for completing the cut safely"
}`;

    const logsContext = dailyLogs && dailyLogs.length > 0 
      ? `Daily logs:\n${dailyLogs.map((log: any) => 
          `Date: ${log.log_date}, Weight: ${log.weight_kg}kg, Carbs: ${log.carbs_g || 'N/A'}g, Fluids: ${log.fluid_intake_ml || 'N/A'}ml`
        ).join('\n')}`
      : 'No daily logs yet';

    const userPrompt = `Analyze this fight week weight cut:
- Starting Weight: ${startingWeight}kg
- Current Weight: ${currentWeight}kg
- Target Weight: ${targetWeight}kg
- Days Until Fight: ${daysUntilFight}
- Water Loading: ${isWaterloading ? 'YES' : 'NO'}

${logsContext}

Provide comprehensive analysis with:
1. Risk level assessment (green/yellow/red)
2. Weight breakdown (carb depletion vs dehydration needed)
3. Progress tracking (on track, ahead, behind)
4. Specific adaptations needed for remaining days
5. Scientific justification for risk level`;

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
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", analysisText);
      return new Response(
        JSON.stringify({ 
          error: "AI returned invalid response format. Please try again.",
          details: analysisText.substring(0, 200) 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fight-week-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
