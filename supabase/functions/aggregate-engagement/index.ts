// Edge Function: aggregate-engagement
// Runs on a daily cron to refresh engagement summaries for active users.
// Called only by the scheduled job or the authenticated admin server action.
// Both send the project's server-only service-role credential.
//
// Cron setup (via Supabase dashboard or CLI):
//   schedule: "0 2 * * *" (daily at 2 AM UTC)
//
// Manual invocation:
//   POST /functions/v1/aggregate-engagement
//   Body: { "user_id": "optional-specific-user-uuid" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // The cron job and the admin action POST; GET is kept for manual runs. Any other method used
  // to run a full refresh too.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Gateway JWT verification also admits ordinary user JWTs. PostgREST verifies
  // the caller's credential and its database role before any privileged access.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!serviceRoleKey || !supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: 'Service authentication unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const authorization = req.headers.get('authorization');
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Use only our public API key and the incoming bearer credential. Do not
    // forward caller headers into the client used for aggregation below.
    const verifier = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authorized, error: authorizationError } = await verifier.rpc(
      'authorize_engagement_refresh'
    );
    if (authorizationError || authorized !== true) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if specific user requested
    let targetUserId: string | null = null;
    if (req.method === 'POST') {
      // An unreadable or non-object body refreshes every user, as before; JSON `null` used to
      // throw here. A user_id that is not a UUID failed the uuid cast in the RPC (a 500).
      const body: unknown = await req.json().catch(() => null);
      const requested =
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as { user_id?: unknown }).user_id
          : undefined;
      if (requested !== undefined && requested !== null && requested !== '') {
        if (typeof requested !== 'string' || !UUID_PATTERN.test(requested)) {
          return new Response(JSON.stringify({ success: false, error: 'user_id must be a UUID' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        targetUserId = requested;
      }
    }

    const { data, error } = await supabase.rpc('refresh_engagement_summaries', {
      p_user_id: targetUserId,
    });
    if (error) throw error;
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    // Database detail goes to the function log only, as in every other function (audit
    // 2026-09-24 L7).
    console.error('Aggregate engagement error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unable to refresh engagement summaries.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
