import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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

    const { tier, expiresAt } = await req.json();
    if (!tier) {
      return new Response(JSON.stringify({ error: 'Missing tier' }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // Use admin client (SERVICE_ROLE_KEY) to bypass RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        subscription_tier: tier,
        subscription_expires_at: expiresAt || null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[activate-premium] Update failed:', updateError);
      return new Response(JSON.stringify({ error: 'Update failed', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // Verify
    const { data: profile } = await adminClient
      .from('profiles')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', user.id)
      .single();

    console.log('[activate-premium] Updated:', { userId: user.id, tier, verified: profile?.subscription_tier });

    return new Response(JSON.stringify({ success: true, tier: profile?.subscription_tier }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

  } catch (error) {
    console.error('[activate-premium] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }
});
