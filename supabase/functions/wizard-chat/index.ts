import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent } from "../_shared/parseResponse.ts";
import { RESEARCH_SUMMARY } from "../_shared/researchSummary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildDataContext(results: {
  profile: any;
  weightLogs: any[];
  nutritionLogs: any[];
  hydrationLogs: any[];
  trainingLogs: any[];
  fightWeekPlan: any;
  dietPrefs: any;
  wellnessLogs: any[];
  insights: any[];
  fightCamps: any[];
  fightWeekLogs: any[];
}): string {
  const sections: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Profile
  const p = results.profile;
  if (p) {
    const daysLeft = Math.ceil((new Date(p.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const macros = p.ai_recommended_protein_g
      ? `P${p.ai_recommended_protein_g}/C${p.ai_recommended_carbs_g}/F${p.ai_recommended_fats_g}`
      : 'not set';
    sections.push(`PROFILE: ${p.current_weight_kg}kg → ${p.goal_weight_kg}kg, target ${p.target_date} (${daysLeft} days), ${p.sex}, age ${p.age}, ${p.height_cm}cm, activity ${p.activity_level}, TDEE ${p.tdee || 'unknown'}, macros ${macros}`);
  }

  // Weight logs (last 10)
  if (results.weightLogs?.length) {
    const entries = results.weightLogs.slice(0, 10).map(w => {
      const d = w.date.slice(5); // MM-DD
      return `${d}:${w.weight_kg}`;
    });
    sections.push(`WEIGHT (last ${entries.length}): ${entries.join(', ')}`);
  }

  // Nutrition logs (7d)
  if (results.nutritionLogs?.length) {
    const logs = results.nutritionLogs;
    const days = new Set(logs.map((l: any) => l.date));
    const totalCal = logs.reduce((s: number, l: any) => s + (l.calories || 0), 0);
    const totalP = logs.reduce((s: number, l: any) => s + (l.protein_g || 0), 0);
    const totalC = logs.reduce((s: number, l: any) => s + (l.carbs_g || 0), 0);
    const totalF = logs.reduce((s: number, l: any) => s + (l.fats_g || 0), 0);
    const numDays = days.size || 1;
    const avgCal = Math.round(totalCal / numDays);
    const avgP = Math.round(totalP / numDays);
    const avgC = Math.round(totalC / numDays);
    const avgF = Math.round(totalF / numDays);

    // Today's meals
    const todayMeals = logs.filter((l: any) => l.date === today);
    const todayCal = todayMeals.reduce((s: number, l: any) => s + (l.calories || 0), 0);

    let line = `NUTRITION (${numDays}d avg): ${avgCal} cal, P${avgP}g C${avgC}g F${avgF}g`;
    if (todayMeals.length > 0) {
      line += ` | Today: ${todayCal} cal (${todayMeals.length} meals logged)`;
    }
    sections.push(line);
  }

  // Training logs (7d)
  if (results.trainingLogs?.length) {
    const logs = results.trainingLogs;
    const avgRpe = (logs.reduce((s: number, l: any) => s + (l.rpe || 0), 0) / logs.length).toFixed(1);
    const sleepLogs = logs.filter((l: any) => l.sleep_hours != null);
    const avgSleep = sleepLogs.length ? (sleepLogs.reduce((s: number, l: any) => s + l.sleep_hours, 0) / sleepLogs.length).toFixed(1) : 'N/A';
    const sorenessList = logs.filter((l: any) => l.soreness_level != null);
    const avgSoreness = sorenessList.length ? (sorenessList.reduce((s: number, l: any) => s + l.soreness_level, 0) / sorenessList.length).toFixed(1) : 'N/A';
    sections.push(`TRAINING (7d): ${logs.length} sessions, avg RPE ${avgRpe}, avg sleep ${avgSleep}h, avg soreness ${avgSoreness}/10`);
  }

  // Hydration logs (7d)
  if (results.hydrationLogs?.length) {
    const logs = results.hydrationLogs;
    const days = new Set(logs.map((l: any) => l.date));
    const numDays = days.size || 1;
    const totalMl = logs.reduce((s: number, l: any) => s + (l.amount_ml || 0), 0);
    const totalSodium = logs.reduce((s: number, l: any) => s + (l.sodium_mg || 0), 0);
    sections.push(`HYDRATION (${numDays}d avg): ${Math.round(totalMl / numDays)}ml/day, sodium ${Math.round(totalSodium / numDays)}mg/day`);
  }

  // Fight week plan
  const fw = results.fightWeekPlan;
  if (fw) {
    sections.push(`FIGHT WEEK: fight ${fw.fight_date}, start ${fw.starting_weight_kg}kg → target ${fw.target_weight_kg}kg`);
  }

  // Diet preferences
  const dp = results.dietPrefs;
  if (dp) {
    const parts: string[] = [];
    if (dp.dietary_restrictions?.length) parts.push(`restrictions=[${dp.dietary_restrictions.join(', ')}]`);
    if (dp.disliked_foods?.length) parts.push(`dislikes=[${dp.disliked_foods.join(', ')}]`);
    if (dp.favorite_cuisines?.length) parts.push(`cuisines=[${dp.favorite_cuisines.join(', ')}]`);
    if (parts.length) sections.push(`DIET: ${parts.join(', ')}`);
  }

  // Wellness / Readiness (7d)
  if (results.wellnessLogs?.length) {
    const logs = results.wellnessLogs;
    const avg = (key: string) => {
      const vals = logs.filter((l: any) => l[key] != null);
      return vals.length ? (vals.reduce((s: number, l: any) => s + l[key], 0) / vals.length).toFixed(1) : 'N/A';
    };
    const avgSleepHrs = avg('sleep_hours');
    sections.push(`WELLNESS (${logs.length}d): avg Hooper ${avg('hooper_index')}/28, sleep ${avgSleepHrs}h (quality ${avg('sleep_quality')}/7), stress ${avg('stress_level')}/7, fatigue ${avg('fatigue_level')}/7, soreness ${avg('soreness_level')}/7, energy ${avg('energy_level')}/7, motivation ${avg('motivation_level')}/7`);
    const todayWellness = logs.find((l: any) => l.date === today);
    if (todayWellness) {
      sections.push(`TODAY WELLNESS: Hooper ${todayWellness.hooper_index}, readiness ${todayWellness.readiness_score ?? 'N/A'}`);
    }
  }

  // Body Insights
  if (results.insights?.length) {
    const parts: string[] = [];
    for (const ins of results.insights) {
      const d = ins.insight_data || {};
      const conf = ins.confidence_score != null ? ` (conf ${Math.round(ins.confidence_score * 100)}%)` : '';
      if (ins.insight_type === 'metabolism') {
        parts.push(`metabolism=${d.estimatedRate || d.estimatedTDEE || '?'}kcal${conf}`);
      } else if (ins.insight_type === 'weekly_loss') {
        parts.push(`weekly_loss=${d.rate || d.averageWeeklyLoss || '?'}kg/wk${conf}`);
      } else if (ins.insight_type === 'plateau') {
        parts.push(`plateau=${d.detected ? 'yes' : 'no'}${conf}`);
      } else {
        parts.push(`${ins.insight_type}=${JSON.stringify(d).slice(0, 60)}${conf}`);
      }
    }
    sections.push(`INSIGHTS: ${parts.join(', ')}`);
  }

  // Fight Camp History
  if (results.fightCamps?.length) {
    const camps = results.fightCamps.map((c: any) => {
      const w = c.starting_weight_kg && c.end_weight_kg ? `${c.starting_weight_kg}→${c.end_weight_kg}kg` : 'no weight data';
      const feel = c.performance_feeling ? `, feeling=${c.performance_feeling}` : '';
      return `${c.name} (${c.fight_date}): ${w}${feel}`;
    });
    sections.push(`FIGHT CAMPS: ${camps.join(' | ')}`);
  }

  // Fight Week Logs
  if (results.fightWeekLogs?.length) {
    const entries = results.fightWeekLogs.map((l: any) => {
      const d = l.log_date.slice(5);
      const parts: string[] = [];
      if (l.weight_kg != null) parts.push(`${l.weight_kg}kg`);
      if (l.carbs_g != null) parts.push(`carbs:${l.carbs_g}g`);
      if (l.fluid_intake_ml != null) parts.push(`fluid:${l.fluid_intake_ml}ml`);
      if (l.sweat_session_min != null) parts.push(`sweat:${l.sweat_session_min}min`);
      return `${d}:${parts.join(' ')}`;
    });
    sections.push(`FIGHT WEEK LOGS: ${entries.join(', ')}`);
  }

  // Today's Meals (individual meal names)
  if (results.nutritionLogs?.length) {
    const todayMeals = results.nutritionLogs.filter((l: any) => l.date === today && l.meal_name);
    if (todayMeals.length) {
      const meals = todayMeals.map((m: any) => {
        const type = m.meal_type || 'meal';
        const cal = m.calories ? ` (${m.calories}cal)` : '';
        return `${type}: ${m.meal_name}${cal}`;
      });
      sections.push(`TODAY'S MEALS: ${meals.join(' | ')}`);
    }
  }

  return sections.join('\n');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET warmup handler
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Parallel data fetching
    const [
      profileRes,
      weightRes,
      nutritionRes,
      hydrationRes,
      trainingRes,
      fightWeekRes,
      dietRes,
      wellnessRes,
      insightsRes,
      fightCampsRes,
      fightWeekLogsRes,
    ] = await Promise.allSettled([
      supabaseClient.from('profiles').select('*').eq('id', user.id).single(),
      supabaseClient.from('weight_logs').select('date, weight_kg').eq('user_id', user.id).gte('date', thirtyDaysAgo).order('date', { ascending: false }).limit(15),
      supabaseClient.from('nutrition_logs').select('date, calories, protein_g, carbs_g, fats_g, meal_type, meal_name').eq('user_id', user.id).gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabaseClient.from('hydration_logs').select('date, amount_ml, sodium_mg').eq('user_id', user.id).gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabaseClient.from('fight_camp_calendar').select('date, session_type, duration_minutes, rpe, soreness_level, sleep_hours').eq('user_id', user.id).gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabaseClient.from('fight_week_plans').select('fight_date, starting_weight_kg, target_weight_kg').eq('user_id', user.id).gte('fight_date', today).order('fight_date', { ascending: true }).limit(1).maybeSingle(),
      supabaseClient.from('user_dietary_preferences').select('dietary_restrictions, disliked_foods, favorite_cuisines').eq('user_id', user.id).maybeSingle(),
      supabaseClient.from('daily_wellness_checkins').select('date, sleep_quality, stress_level, fatigue_level, soreness_level, energy_level, motivation_level, sleep_hours, hooper_index, readiness_score').eq('user_id', user.id).gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabaseClient.from('user_insights').select('insight_type, insight_data, confidence_score').eq('user_id', user.id),
      supabaseClient.from('fight_camps').select('name, event_name, fight_date, starting_weight_kg, end_weight_kg, is_completed, performance_feeling').eq('user_id', user.id).order('fight_date', { ascending: false }).limit(4),
      supabaseClient.from('fight_week_logs').select('log_date, weight_kg, carbs_g, fluid_intake_ml, sweat_session_min, notes').eq('user_id', user.id).gte('log_date', sevenDaysAgo).order('log_date', { ascending: false }),
    ]);

    const getData = (res: PromiseSettledResult<any>) =>
      res.status === 'fulfilled' ? res.value.data : null;

    const dataContext = buildDataContext({
      profile: getData(profileRes),
      weightLogs: getData(weightRes) || [],
      nutritionLogs: getData(nutritionRes) || [],
      hydrationLogs: getData(hydrationRes) || [],
      trainingLogs: getData(trainingRes) || [],
      fightWeekPlan: getData(fightWeekRes),
      dietPrefs: getData(dietRes),
      wellnessLogs: getData(wellnessRes) || [],
      insights: getData(insightsRes) || [],
      fightCamps: getData(fightCampsRes) || [],
      fightWeekLogs: getData(fightWeekLogsRes) || [],
    });

    const { messages } = await req.json();
    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");

    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    // Cap conversation history to last 20 messages to prevent token explosion
    const cappedMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const systemPrompt = `You are the "Weight Cut Wizard" — an elite combat sports nutritionist and coach. You speak directly to the fighter. Concise, evidence-based, no fluff. Under 150 words unless explaining a complex protocol.

You have full access to this athlete's data — reference specific numbers when relevant. Don't ask for data you already have.

<athlete_data>
${dataContext}
</athlete_data>

<research>
${RESEARCH_SUMMARY}
</research>

RULES:
- Base advice on the research and athlete data above. Don't hallucinate stats.
- Safety first. Firmly decline dangerous protocols and give the safe alternative.
- Calculate exact deficits/timelines when asked, using the athlete's real numbers.
- Performance focus — making weight with no energy = losing the fight.
- If asked about training load, reference their recent sessions and RPE trends.
- If asked about nutrition, reference their actual logged meals and macro averages.
- If asked about recovery, sleep, or readiness, reference their Hooper index and wellness trends.
- If asked about body patterns, reference their stored insights (metabolism, plateau, adaptation).
- If asked "what did I eat today?", list their actual logged meals by name and calories.
- If asked about fight camp history, reference past camps and performance outcomes.
- If asked about their current weight cut, reference fight week logs (daily weight, fluid, carbs).
- Format: short paragraphs, bullet points for lists, bold key terms. No walls of text.`;

    console.log("Calling Grok API with full athlete data context...");

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: systemPrompt },
          ...cappedMessages
        ],
        temperature: 0.5,
        max_completion_tokens: 1200
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Grok API error:", response.status, errorData);

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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Wizard chat Grok response:", JSON.stringify(data, null, 2));

    let { content: generatedText, filtered } = extractContent(data);

    if (!generatedText) {
      if (filtered) {
        generatedText = "I can't provide that specific advice for safety reasons. Let me help you with a safer approach to your weight cut goals.";
      } else {
        throw new Error("No response from Grok API");
      }
    }

    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: generatedText,
            role: "assistant"
          }
        }]
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("wizard-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
