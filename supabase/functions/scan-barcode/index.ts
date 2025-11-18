import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();

    if (!barcode) {
      throw new Error("Barcode is required");
    }

    console.log("Fetching product data for barcode:", barcode);

    // Call OpenFoodFacts API
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 0 || !data.product) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const product = data.product;
    const nutriments = product.nutriments || {};

    // Extract nutritional information per 100g (OpenFoodFacts provides per 100g by default)
    const calories_per_100g = Math.round(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0);
    const protein_per_100g = parseFloat(nutriments['proteins_100g'] || nutriments['proteins'] || 0);
    const carbs_per_100g = parseFloat(nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0);
    const fats_per_100g = parseFloat(nutriments['fat_100g'] || nutriments['fat'] || 0);

    const productName = product.product_name || product.product_name_en || product.generic_name || "Unknown Product";
    const servingSize = product.serving_size || "100g";
    
    // Extract serving size in grams if available
    let servingSizeGrams = 100; // Default to 100g
    const servingMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
    if (servingMatch) {
      servingSizeGrams = parseFloat(servingMatch[1]);
    }

    // Calculate nutrition for serving size (if different from 100g)
    const calories = Math.round((calories_per_100g * servingSizeGrams) / 100);
    const protein_g = Math.round((protein_per_100g * servingSizeGrams / 100) * 10) / 10;
    const carbs_g = Math.round((carbs_per_100g * servingSizeGrams / 100) * 10) / 10;
    const fats_g = Math.round((fats_per_100g * servingSizeGrams / 100) * 10) / 10;

    console.log("Product found:", productName);

    return new Response(
      JSON.stringify({
        found: true,
        productName,
        calories,
        protein_g,
        carbs_g,
        fats_g,
        calories_per_100g,
        protein_per_100g: Math.round(protein_per_100g * 10) / 10,
        carbs_per_100g: Math.round(carbs_per_100g * 10) / 10,
        fats_per_100g: Math.round(fats_per_100g * 10) / 10,
        serving_size: servingSize,
        serving_size_g: servingSizeGrams,
        source: "OpenFoodFacts",
        brand: product.brands || null,
        image_url: product.image_url || product.image_front_url || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in scan-barcode function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
