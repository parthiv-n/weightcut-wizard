import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// Lightweight JWT check — decode payload and verify not expired.
// Supabase gateway already validates the signature, so we just
// need to confirm structure + expiry without a network round-trip.
function isValidJwt(authHeader: string): boolean {
  try {
    const token = authHeader.replace("Bearer ", "");
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Date.now() / 1000) return false;
    return !!payload.sub;
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Warmup ping
  if (req.method === "GET") {
    return json({ status: "warm" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !isValidJwt(authHeader)) {
      return json({ error: "Unauthorized" }, 401);
    }

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

    const usdaResponse = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.trim(),
        dataType: ["Foundation", "SR Legacy", "Branded"],
        pageSize: 25,
      }),
    });

    if (!usdaResponse.ok) {
      const errText = await usdaResponse.text();
      console.error("USDA API error:", usdaResponse.status, errText);
      throw new Error(`USDA API returned ${usdaResponse.status}`);
    }

    const usdaData = await usdaResponse.json();
    const foods = (usdaData.foods || []) as USDAFood[];

    const results = foods
      .map(normalizeFood)
      .filter((f) => f.calories_per_100g > 0 && f.name.trim().length > 0);

    // Cache for subsequent requests
    searchCache.set(cacheKey, { results, ts: Date.now() });

    return json({ results });
  } catch (err) {
    console.error("food-search error:", err);
    return json({ error: "Search failed" }, 500);
  }
});
