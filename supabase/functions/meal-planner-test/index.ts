import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { edgeLogger } from "../_shared/errorReporter.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    edgeLogger.info("Test function called", { method: req.method });
    
    const body = await req.json();
    edgeLogger.info("Request body", { body });

    return new Response(
      JSON.stringify({ 
        message: "Test function working",
        receivedData: body,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200
      }
    );
  } catch (error) {
    edgeLogger.error("Test function error", error, { functionName: "meal-planner-test" });
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
