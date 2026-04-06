import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function deriveTier(productId: string | undefined): string {
  if (!productId) return "free";
  if (productId.includes("yearly") || productId.includes("annual")) return "premium_annual";
  if (productId.includes("monthly")) return "premium_monthly";
  return "premium_monthly"; // default premium
}

serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook authentication
  const authHeader = req.headers.get("Authorization");
  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    console.error("[revenuecat-webhook] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const event = payload?.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "No event in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      type,
      app_user_id,
      expiration_at_ms,
      product_id,
    } = event;

    console.log(`[revenuecat-webhook] Event: ${type}, user: ${app_user_id}, product: ${product_id}`);

    if (!app_user_id) {
      return new Response(JSON.stringify({ error: "No app_user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Service role client for privileged writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    let updateData: Record<string, any> = {
      revenuecat_customer_id: app_user_id,
      subscription_updated_at: now,
    };

    switch (type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION": {
        updateData.subscription_tier = deriveTier(product_id);
        updateData.subscription_expires_at = expiration_at_ms
          ? new Date(expiration_at_ms).toISOString()
          : null;
        break;
      }

      case "EXPIRATION": {
        updateData.subscription_tier = "free";
        updateData.subscription_expires_at = null;
        break;
      }

      case "CANCELLATION": {
        // Cancellation means they won't renew, but access continues until expiry
        // Keep tier active but set the expiry so it naturally expires
        updateData.subscription_expires_at = expiration_at_ms
          ? new Date(expiration_at_ms).toISOString()
          : null;
        break;
      }

      case "BILLING_ISSUE": {
        // Keep active — Apple/Google gives grace period
        console.warn(`[revenuecat-webhook] Billing issue for user ${app_user_id}`);
        break;
      }

      default: {
        console.log(`[revenuecat-webhook] Unhandled event type: ${type}`);
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", app_user_id);

    if (updateError) {
      console.error("[revenuecat-webhook] Profile update failed:", updateError);
      return new Response(JSON.stringify({ error: "Profile update failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[revenuecat-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
