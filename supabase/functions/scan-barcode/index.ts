import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAIUsage, aiLimitResponse } from "../_shared/subscriptionGuard.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

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

  try {
    const { barcode } = await req.json();

    if (!barcode || typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) {
      return new Response(
        JSON.stringify({ error: "Invalid barcode format. Expected 8-14 digits." }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    edgeLogger.info("Fetching product data for barcode", { barcode });

    // Call OpenFoodFacts API (15s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();

    if (data.status === 0 || !data.product) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const product = data.product;
    const nutriments = product.nutriments || {};

    // Extract nutritional information per 100g
    const calories = Math.round(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0);
    const protein_g = parseFloat(nutriments['proteins_100g'] || nutriments['proteins'] || 0);
    const carbs_g = parseFloat(nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0);
    const fats_g = parseFloat(nutriments['fat_100g'] || nutriments['fat'] || 0);

    const productName = product.product_name || product.product_name_en || "Unknown Product";

    edgeLogger.info("Product found", { productName });

    return new Response(
      JSON.stringify({
        found: true,
        productName,
        calories,
        protein_g: Math.round(protein_g * 10) / 10,
        carbs_g: Math.round(carbs_g * 10) / 10,
        fats_g: Math.round(fats_g * 10) / 10,
        serving_size: product.serving_size || "100g",
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    edgeLogger.error("scan-barcode error", error, { functionName: "scan-barcode" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
