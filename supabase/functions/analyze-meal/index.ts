import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractContent, parseJSON } from "../_shared/parseResponse.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "warm" }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // Check AI usage limits (free: 1/day, premium: unlimited)
    const usage = await checkAIUsage(user.id);
    if (!usage.allowed) {
      return aiLimitResponse(req, usage, corsHeaders);
    }

    const body = await req.json();
    const { mealDescription, imageBase64 } = body;

    if (!mealDescription && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Provide a meal description or photo" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (imageBase64 && imageBase64.length > 5_000_000) {
      return new Response(
        JSON.stringify({ error: "Image too large. Please use a smaller photo." }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (mealDescription && mealDescription.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Meal description too long (max 1000 characters)" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const hasImage = !!imageBase64;
    edgeLogger.info("Analyzing meal", { hasDescription: !!mealDescription, hasImage });

    const systemPrompt = `Nutrition analysis expert. Return ONLY valid JSON.

Rules:
- Separate distinct food items (e.g., "bread with banana, eggs, nutella" → 4 items)
- Do NOT split a single item into raw sub-ingredients (e.g., "tiger bread" stays as one item)
- Each item: total macros (not per-100g), realistic portions
- Use USDA/nutrition databases for reference
- If analyzing a photo, estimate portion sizes from visual cues (plate size, utensils, hand for scale)
- If both photo and text description are provided, use the description to refine portion estimates

{
  "meal_name": "Clean meal name",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fats_g": number,
  "items": [
    { "name": "Item", "quantity": "amount", "calories": number, "protein_g": number, "carbs_g": number, "fats_g": number }
  ]
}`;

    // Build user message — text only, image only, or both
    let userContent: any;
    if (hasImage && mealDescription) {
      userContent = [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        { type: "text", text: `Analyze this meal photo. Additional context from the user: "${mealDescription}". Return nutritional JSON.` },
      ];
    } else if (hasImage) {
      userContent = [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        { type: "text", text: "Analyze this meal photo and estimate the nutritional content. Return JSON." },
      ];
    } else {
      userContent = `Analyze this meal and provide nutritional information: "${mealDescription}"`;
    }

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
          { role: "user", content: userContent }
        ],
        temperature: 0.2,
        max_completion_tokens: 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      edgeLogger.error("Grok API error", undefined, { functionName: "analyze-meal", status: response.status, errorData });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment.", code: "AI_BUSY" }),
          { status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid or quota exceeded." }),
          { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    edgeLogger.info("Grok response received");

    const { content, filtered } = extractContent(data);
    if (!content) {
      if (filtered) throw new Error("Content was filtered for safety. Please try a different meal description.");
      throw new Error("No response from Grok API");
    }

    const nutritionData = parseJSON(content);
    edgeLogger.info("Parsed nutrition data");

    return new Response(
      JSON.stringify({ nutritionData }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    edgeLogger.error("Error in analyze-meal function", error, { functionName: "analyze-meal" });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
