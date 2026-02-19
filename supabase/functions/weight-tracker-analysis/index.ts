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

    const {
      currentWeight,
      goalWeight,
      targetDate,
      activityLevel,
      age,
      sex,
      heightCm,
      tdee,
      weighInDayWeight,
      bypassSafety = false,
      weightHistory: clientWeightHistory
    } = await req.json();

    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");

    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    // Use client-provided weight history if available (saves a DB round-trip)
    let weightHistory = clientWeightHistory;
    if (!weightHistory || !Array.isArray(weightHistory) || weightHistory.length === 0) {
      const { data: fetchedHistory } = await supabaseClient
        .from("weight_logs")
        .select("date, weight_kg")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(60);
      weightHistory = fetchedHistory;
    }

    // Fetch stored insights
    const { data: storedInsights } = await supabaseClient
      .from("user_insights")
      .select("*")
      .eq("user_id", user.id);

    // Calculate body adaptation patterns
    const calculatePatterns = (history: any[]) => {
      if (!history || history.length < 2) return null;

      const sorted = [...history].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate average weekly loss rate
      const firstWeight = parseFloat(sorted[0].weight_kg);
      const lastWeight = parseFloat(sorted[sorted.length - 1].weight_kg);
      const daysDiff = (new Date(sorted[sorted.length - 1].date).getTime() -
        new Date(sorted[0].date).getTime()) / (1000 * 60 * 60 * 24);
      const weeksDiff = daysDiff / 7;
      const avgWeeklyLoss = weeksDiff > 0 ? (firstWeight - lastWeight) / weeksDiff : 0;

      // Detect plateaus (no significant change for 7+ days)
      let plateauDetected = false;
      if (sorted.length >= 7) {
        const recent = sorted.slice(-7);
        const weights = recent.map(w => parseFloat(w.weight_kg));
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        if (max - min < 0.3) { // Less than 0.3kg variation
          plateauDetected = true;
        }
      }

      // Calculate trend (improving, declining, stable)
      const recent = sorted.slice(-14); // Last 14 days
      let trend = "stable";
      if (recent.length >= 2) {
        const first = parseFloat(recent[0].weight_kg);
        const last = parseFloat(recent[recent.length - 1].weight_kg);
        const change = first - last;
        if (change > 0.5) trend = "declining";
        else if (change < -0.5) trend = "increasing";
      }

      return {
        avgWeeklyLoss: avgWeeklyLoss.toFixed(2),
        plateauDetected,
        trend,
        dataPoints: sorted.length,
        weightRange: `${lastWeight.toFixed(1)}-${firstWeight.toFixed(1)}kg`
      };
    };

    const patterns = calculatePatterns(weightHistory || []);

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7); // Prevent division by zero

    // Calculate weight difference: positive if need to gain, negative if need to lose
    const weightDifference = goalWeight - currentWeight;

    // Detect maintenance mode: when current weight is AT OR BELOW fight week target
    // If current weight is below target, user is already under their diet goal - use maintenance, not deficit
    const isMaintenanceMode = currentWeight <= goalWeight;

    // Calculate weight to gain (positive) or weight to lose (positive)
    const weightToGain = isMaintenanceMode && weightDifference > 0 ? weightDifference : 0;
    const weightToLose = !isMaintenanceMode && weightDifference < 0 ? Math.abs(weightDifference) : 0;

    // Calculate required weekly change (positive for loss, positive for gain)
    const requiredWeeklyLoss = weightToLose > 0 ? weightToLose / weeksRemaining : 0;
    const requiredWeeklyGain = weightToGain > 0 ? weightToGain / weeksRemaining : 0;

    const systemPrompt = `You are the Weight Cut Wizard — an evidence-based sports nutrition and weight-cutting specialist for combat-sports athletes.

Your responsibilities:
• Calculate safe calories, macronutrients, and weekly weight-loss rates
• Tailor plans to combat athlete timelines
• Enforce scientific safety limits
• Prevent RED-S, overcutting, and dangerous deficits
• Provide structured JSON-only output

EVIDENCE BASE — RESEARCH FOUNDATION
Your recommendations are grounded in peer-reviewed research:
• IOC Consensus Statement on RED-S: Min energy availability ~30 kcal/kg FFM/day, optimal ~45 kcal/kg FFM/day
• ISSN Position Stand (Phillips 2011, Morton 2018): Athlete protein 1.6-2.4 g/kg/day, cutting phase 2.0-2.5 g/kg/day
• ISSN Nutrient Timing: Carbohydrates scale with training load, high-intensity sessions require carb prioritization
• ACSM & Academy Position Stand: Weight loss must be individualized, excessive deficits harm performance
• Combat-Sports RWL Reviews (Reale 2017, Barley 2018): RWL >5% body weight in <7 days increases injury/illness risk
• Safe Weight Loss Research (Garthe 2011, Helms 2014): 0.5-1.0% body weight per week preserves lean mass and performance

You MUST apply these principles, limits, and safety thresholds. Do NOT contradict these guidelines.

CRITICAL DEFINITIONS
• currentWeight = athlete's real weight today
• fightWeekTarget = DIET-ONLY weight target before dehydration
• weighInWeight = final scale weight achieved through water manipulation
• fightWeekTarget is achieved via FAT LOSS & DIET
• weighInWeight is achieved via SHORT-TERM WATER CUTTING ONLY

CALORIE LOGIC — MUST FOLLOW
IF currentWeight ≤ fightWeekTarget:
    - Athlete is AT or BELOW diet goal
    - calorieDeficit MUST be 0
    - recommendedCalories MUST equal TDEE
    - Explain this clearly

IF currentWeight > fightWeekTarget:
    Apply deficit within safe ranges:
    - Safe: 500-750 kcal/day (≈0.5-0.75 kg/week)
    - Aggressive: 750-1000 kcal/day (≈0.75-1 kg/week)
    NEVER exceed 1000 kcal/day.

SAFETY RULES — NON-NEGOTIABLE
• Minimum calories: Males NEVER below 1500 kcal, Females NEVER below 1200 kcal
• RED-S risk MUST be flagged when: energy availability < 30 kcal/kg FFM, calories extremely low, very lean athlete attempts rapid cut, rapid weight loss exceeds guidelines
• Weekly safe weight loss ranges: GREEN ≤0.5-1.0 kg/week, YELLOW 1.0-1.5 kg/week, RED >1.5 kg/week (dangerous)
• Severe dehydration strategies (sauna marathons, diuretics, extreme fasting) must be discouraged

MACRONUTRIENT LOGIC
Protein: 2.0-2.5 g/kg (cutting phase)
Carbohydrates: scale with training intensity, prioritize fuelling key sessions
Fats: 20-30% of total calories unless restricted safely

STRATEGIC CONTEXT — MUST BE USED
All plans must account for: time until fight, training load, recovery demands, athlete leanness, performance requirements, injury risk, sleep and fatigue, realistic weekly loss based on science

WHEN GOALS ARE UNREALISTIC
If requiredWeeklyLoss > 1.5 kg/week:
• classify riskLevel as "red"
• warn user the timeline is unsafe
• recommend alternative timelines
• advise reducing goal rigidity

${bypassSafety ? `SAFETY BYPASS MODE — USER CONFIRMED
The user has explicitly confirmed they want to proceed with an unrealistic goal (>1.5kg/week).
You MUST still generate a plan, but:
- Ignore minimum calorie limits (1500/1200 kcal)
- Ignore weekly loss rate safety warnings
- Still calculate calories and macros
- Include strong warnings about health risks in riskExplanation
- Set riskLevel to "red"
- Clearly state this bypasses all safety features` : ''}

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

    // Build user prompt with maintenance mode handling and weight history
    let userPrompt = `Calculate optimal weight management strategy:
- Current Weight: ${currentWeight}kg
- Goal Weight (Fight Week Target - diet goal before dehydration): ${goalWeight}kg
${weighInDayWeight ? `- Weigh In Day Weight (day before fight day, final weigh-in after dehydration): ${weighInDayWeight}kg (for reference only, not the diet target)` : ''}
${weightToGain > 0 ? `- Weight to GAIN: ${weightToGain.toFixed(1)}kg (positive value - user is below target)` : ''}
${weightToLose > 0 ? `- Weight to LOSE: ${weightToLose.toFixed(1)}kg (positive value - user is above target)` : ''}
${weightToGain === 0 && weightToLose === 0 ? `- Weight Status: At target (no change needed)` : ''}
- Days Remaining: ${daysRemaining}
- Weeks Remaining: ${weeksRemaining.toFixed(1)}
${requiredWeeklyGain > 0 ? `- Required Weekly GAIN: ${requiredWeeklyGain.toFixed(2)}kg/week` : ''}
${requiredWeeklyLoss > 0 ? `- Required Weekly LOSS: ${requiredWeeklyLoss.toFixed(2)}kg/week` : ''}
${requiredWeeklyGain === 0 && requiredWeeklyLoss === 0 ? `- Required Weekly Change: 0 kg/week (maintenance)` : ''}
- TDEE: ${tdee} kcal/day
- Activity Level: ${activityLevel}
- Age: ${age}
- Sex: ${sex}
- Height: ${heightCm}cm

${patterns ? `\nWEIGHT HISTORY & BODY ADAPTATION PATTERNS (learn from this data):
- Historical Data Points: ${patterns.dataPoints} entries
- Average Weekly Loss Rate: ${patterns.avgWeeklyLoss} kg/week
- Weight Range: ${patterns.weightRange}
- Trend: ${patterns.trend}
- Plateau Detected: ${patterns.plateauDetected ? 'Yes (weight stable for 7+ days)' : 'No'}
${patterns.plateauDetected ? 'Consider: Plateau may indicate metabolic adaptation or need for strategy adjustment.' : ''}
${parseFloat(patterns.avgWeeklyLoss) > 0 ? `Historical loss rate (${patterns.avgWeeklyLoss} kg/week) suggests body responds to deficit.` : ''}
${parseFloat(patterns.avgWeeklyLoss) < 0 ? `Historical gain rate suggests body may be in recovery/maintenance phase.` : ''}
Use this historical pattern to inform calorie recommendations and predict body response.` : '\nWEIGHT HISTORY: No historical data available. Recommendations based on standard calculations only.'}

${storedInsights && storedInsights.length > 0 ? `\nSTORED BODY INSIGHTS (learned from previous analyses):
${storedInsights.map((insight: any) => {
      const data = insight.insight_data;
      if (insight.insight_type === 'metabolism_rate') {
        return `- Metabolism Rate: ${data.estimatedRate || 'N/A'} (confidence: ${(insight.confidence_score * 100).toFixed(0)}%)`;
      } else if (insight.insight_type === 'deficit_response') {
        return `- Deficit Response: ${data.response || 'N/A'} (confidence: ${(insight.confidence_score * 100).toFixed(0)}%)`;
      } else if (insight.insight_type === 'weekly_loss_rate') {
        return `- Weekly Loss Rate: ${data.rate || 'N/A'} kg/week (confidence: ${(insight.confidence_score * 100).toFixed(0)}%)`;
      }
      return null;
    }).filter(Boolean).join('\n')}
Use these insights to personalize recommendations.` : ''}

${bypassSafety ? `\nWARNING: User has confirmed they want to proceed despite unrealistic goal. Generate plan ignoring all safety limits. Still include health risk warnings.` : ''}

${isMaintenanceMode ? `\nCRITICAL: Current weight (${currentWeight}kg) is AT OR BELOW fight week target (${goalWeight}kg). User is already at or below their diet goal. ${weightToGain > 0 ? `User needs to GAIN ${weightToGain.toFixed(1)}kg to reach target, but this should be achieved through natural weight gain with MAINTENANCE calories, not a surplus.` : 'User is at target.'} You MUST recommend MAINTENANCE calories (TDEE: ${tdee}kcal) with NO calorie deficit (calorieDeficit MUST be 0). The remaining weight to reach weigh-in day weight will be achieved through dehydration protocols in the final days before weigh-in, NOT through diet.` : ''}

Provide:
1. Risk level assessment (green/yellow/red)${isMaintenanceMode ? ' - Should be GREEN (maintenance mode)' : ''}
2. Recommended daily calorie intake${isMaintenanceMode ? ' - Should be TDEE (maintenance) with no deficit' : ''}
3. Macronutrient breakdown (protein/carbs/fats in grams)${isMaintenanceMode ? ' - Balanced macros for maintenance' : ''}
4. Strategic guidance for achieving goal safely${isMaintenanceMode ? ' - Focus on maintaining current weight and preparing for final dehydration phase' : ''}
5. Weekly plan structure${isMaintenanceMode ? ' - Maintenance nutrition plan' : ''}
6. Training considerations${isMaintenanceMode ? ' - Training nutrition for maintenance' : ' based on deficit'}

${isMaintenanceMode ? 'Since user is already at or below fight week target, focus on maintenance nutrition. The weigh-in day weight will be achieved through dehydration protocols in the final days before weigh-in, not through continued dieting. calorieDeficit MUST be 0, recommendedCalories MUST equal TDEE.' : 'Be specific with numbers and practical advice. If the timeline is unrealistic (requires >1.5kg/week), clearly state this and recommend timeline extension.'}`;

    // Call Minimax API
    console.log("Calling Minimax API for weight tracker analysis...");
    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048
      }),
    });

    if (!response.ok) {
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
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API access denied. Please check your API key and billing." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Minimax API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Minimax weight tracker response:", JSON.stringify(data, null, 2));

    let analysisText = data.choices?.[0]?.message?.content;
    // Strip <think> tags from Minimax response
    if (analysisText) {
      analysisText = analysisText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    if (!analysisText) {
      console.error("No content found in Minimax response");
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'content_filter') {
        throw new Error("Content was filtered for safety. Please try a different request.");
      }
      throw new Error("No response from Minimax API");
    }

    // Parse the JSON analysis
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error("Could not parse analysis data from AI response");
      }
    }

    // Calculate and store insights
    const insightsToStore: Array<{
      user_id: string;
      insight_type: string;
      insight_data: Record<string, any>;
      confidence_score: number;
    }> = [];

    // Store weekly loss rate insight
    if (patterns && parseFloat(patterns.avgWeeklyLoss) !== 0) {
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'weekly_loss_rate',
        insight_data: {
          rate: parseFloat(patterns.avgWeeklyLoss),
          dataPoints: patterns.dataPoints,
          trend: patterns.trend
        },
        confidence_score: Math.min(0.9, 0.5 + (patterns.dataPoints / 60) * 0.4) // Higher confidence with more data
      });
    }

    // Store metabolism/deficit response insight
    if (analysis.recommendedCalories && analysis.calorieDeficit !== undefined) {
      const estimatedMetabolism = analysis.recommendedCalories + analysis.calorieDeficit;
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'metabolism_rate',
        insight_data: {
          estimatedRate: estimatedMetabolism,
          recommendedCalories: analysis.recommendedCalories,
          deficit: analysis.calorieDeficit
        },
        confidence_score: 0.6
      });

      if (analysis.calorieDeficit > 0) {
        insightsToStore.push({
          user_id: user.id,
          insight_type: 'deficit_response',
          insight_data: {
            deficit: analysis.calorieDeficit,
            weeklyLoss: analysis.requiredWeeklyLoss || 0,
            response: patterns ? `Historical: ${patterns.avgWeeklyLoss} kg/week` : 'No historical data'
          },
          confidence_score: 0.5
        });
      }
    }

    // Store body adaptation pattern
    if (patterns) {
      insightsToStore.push({
        user_id: user.id,
        insight_type: 'body_adaptation',
        insight_data: {
          avgWeeklyLoss: parseFloat(patterns.avgWeeklyLoss),
          plateauDetected: patterns.plateauDetected,
          trend: patterns.trend,
          weightRange: patterns.weightRange
        },
        confidence_score: Math.min(0.8, 0.4 + (patterns.dataPoints / 60) * 0.4)
      });
    }

    // Upsert insights (update if exists, insert if not)
    for (const insight of insightsToStore) {
      await supabaseClient
        .from("user_insights")
        .upsert({
          user_id: insight.user_id,
          insight_type: insight.insight_type,
          insight_data: insight.insight_data,
          confidence_score: insight.confidence_score,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,insight_type'
        });
    }

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
