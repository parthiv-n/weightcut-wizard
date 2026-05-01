import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";

// In-memory cache — persists across requests on the same warm isolate
const searchCache = new Map<string, { results: any[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  value: number;
  unitName: string;
}

interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients: USDANutrient[];
}

function getNutrient(nutrients: USDANutrient[], num: string): number {
  const n = nutrients.find((n) => n.nutrientNumber === num);
  return n?.value ?? 0;
}

function normalizeFood(food: USDAFood) {
  const cal = getNutrient(food.foodNutrients, "208");
  const protein = getNutrient(food.foodNutrients, "203");
  const carbs = getNutrient(food.foodNutrients, "205");
  const fat = getNutrient(food.foodNutrients, "204");

  return {
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandOwner || food.brandName || "",
    dataType: food.dataType,
    calories_per_100g: Math.round(cal),
    protein_per_100g: Math.round(protein * 10) / 10,
    carbs_per_100g: Math.round(carbs * 10) / 10,
    fats_per_100g: Math.round(fat * 10) / 10,
    serving_size: "100g",
  };
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Warmup ping
  if (req.method === "GET") {
    return json({ status: "warm" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    // Phase 1.2: client distinguishes retryable auth errors from real errors
    // via this flag — signals "refresh session + try again", not "give up".
    return json({ error: "Unauthorized", retryable: true }, 401);
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Invalid token", retryable: true }, 401);
  }

  // Food search is a free USDA database lookup — no AI usage limits
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return json({ error: "Query is required (min 2 chars)" }, 400);
    }

    // Check in-memory cache
    const cacheKey = query.trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return json({ results: cached.results });
    }

    const USDA_API_KEY = Deno.env.get("USDA_API_KEY");
    if (!USDA_API_KEY) {
      throw new Error("USDA_API_KEY is not configured");
    }

    const usdaController = new AbortController();
    const usdaTimer = setTimeout(() => usdaController.abort(), 10000);
    let usdaResponse: Response;
    try {
      usdaResponse = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          dataType: ["Foundation", "SR Legacy", "Branded"],
          pageSize: 25,
        }),
        signal: usdaController.signal,
      });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        edgeLogger.error("USDA API timeout", undefined, { functionName: "food-search", timeoutMs: 10000 });
        return json({ error: "USDA timeout" }, 504);
      }
      throw err;
    } finally {
      clearTimeout(usdaTimer);
    }

    if (!usdaResponse.ok) {
      const errText = await usdaResponse.text();
      edgeLogger.error("USDA API error", undefined, { functionName: "food-search", status: usdaResponse.status, errText });
      throw new Error(`USDA API returned ${usdaResponse.status}`);
    }

    const usdaData = await usdaResponse.json();
    const foods = (usdaData.foods || []) as USDAFood[];

    const normalised = foods
      .map(normalizeFood)
      .filter((f) => f.calories_per_100g > 0 && f.name.trim().length > 0);

    // Phase 3.1: lazy-populate the `foods` catalog so repeat searches for the
    // same USDA item hit our DB instead of the USDA API, and so meal_items can
    // FK to a stable `foods.id` instead of re-inserting the same row N times.
    let results = normalised;
    if (normalised.length > 0) {
      const rows = normalised.map((f) => ({
        name: f.name,
        brand: f.brand || null,
        calories_per_100g: f.calories_per_100g,
        protein_per_100g: f.protein_per_100g,
        carbs_per_100g: f.carbs_per_100g,
        fats_per_100g: f.fats_per_100g,
        source: "usda",
        source_ref: f.id, // USDA fdcId
        verified: true,
        created_by: user.id,
      }));

      const { data: upserted, error: upsertError } = await supabaseClient
        .from("foods")
        .upsert(rows, { onConflict: "source,source_ref", ignoreDuplicates: false })
        .select("id, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, source, source_ref");

      if (upsertError) {
        edgeLogger.warn("foods upsert failed; returning USDA results without catalog ids", {
          functionName: "food-search",
          message: upsertError.message,
        });
      } else if (upserted) {
        // Merge catalog ids back onto the normalised payload by source_ref (fdcId).
        const byFdcId = new Map<string, typeof upserted[number]>();
        for (const row of upserted) {
          if (row.source_ref) byFdcId.set(row.source_ref, row);
        }
        results = normalised.map((f) => {
          const cat = byFdcId.get(f.id);
          return cat
            ? {
                ...f,
                id: cat.id, // swap USDA fdcId for catalog UUID
                name: cat.name,
                brand: cat.brand ?? f.brand,
              }
            : f;
        });
      }
    }

    // Cache for subsequent requests
    searchCache.set(cacheKey, { results, ts: Date.now() });

    return json({ results });
  } catch (err) {
    edgeLogger.error("food-search error", err, { functionName: "food-search" });
    return json({ error: "Search failed" }, 500);
  }
});
