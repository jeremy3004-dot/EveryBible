// Edge Function: send-group-notification
// Fans out push notifications to all active devices of group members when a
// group session is recorded. Excludes the session creator to avoid notifying
// the person who just triggered the action.
//
// Called by the app via supabase.functions.invoke('send-group-notification') after
// a successful group session insert in groupService.ts.
//
// Request body: {
//   group_id: string,        — UUID of the group
//   title: string,           — notification title
//   body: string,            — notification body
//   exclude_user_id?: string — legacy field, ignored; verified caller is excluded
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

function validMessage(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: {
    screen: string;
    groupId: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: 'Notification service unavailable' }, 503);
  }

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    // Verify with Auth, keeping the service client's database authorization isolated
    // from the caller's header. Decoding JWT claims alone is not authentication.
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    const callerId = authData.user.id;

    const payload: unknown = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse({ success: false, error: 'Invalid notification request' }, 400);
    }
    const { group_id, title, body: notifBody } = payload as Record<string, unknown>;
    if (
      typeof group_id !== 'string' ||
      !UUID_PATTERN.test(group_id) ||
      !validMessage(title, 200) ||
      !validMessage(notifBody, 2000)
    ) {
      return jsonResponse({ success: false, error: 'Invalid notification request' }, 400);
    }

    // All group members may record sessions. Establish membership before reading
    // recipient identities or push tokens with the service role.
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id)
      .eq('user_id', callerId)
      .maybeSingle();
    if (membershipError) {
      throw new Error('Unable to verify group membership');
    }
    if (!membership) {
      return jsonResponse({ success: false, error: 'Forbidden' }, 403);
    }

    // Step 1: Get all members of the group
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id);

    if (membersError) {
      throw new Error(`Failed to query group_members: ${membersError.message}`);
    }

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_members' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 2: Exclude only the verified caller, never the request-supplied user ID.
    const memberUserIds = members
      .map((m: { user_id: string }) => m.user_id)
      .filter((id: string) => id !== callerId);

    if (memberUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: 'only_creator_in_group' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Step 3: Get active push tokens for the filtered members
    const { data: devices, error: devicesError } = await supabase
      .from('user_devices')
      .select('push_token')
      .eq('is_active', true)
      .in('user_id', memberUserIds);

    if (devicesError) {
      throw new Error(`Failed to query user_devices: ${devicesError.message}`);
    }

    if (!devices || devices.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_active_tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 4: Build Expo push messages
    const tokens = [
      ...new Set<string>(
        devices
          .map((device: { push_token: string | null }) => device.push_token)
          .filter(
            (token: string | null): token is string =>
              typeof token === 'string' && token.trim().length > 0
          )
      ),
    ];
    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title,
      body: notifBody,
      sound: 'default',
      data: { screen: 'GroupDetail', groupId: group_id },
    }));

    // Step 5: Send in batches of 100 (Expo limit per request)
    let totalSent = 0;
    let totalErrors = 0;

    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);

      try {
        const response = await fetch(EXPO_PUSH_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown error');
          console.error(`Expo Push API batch failed (${response.status}): ${errorText}`);
          totalErrors += batch.length;
        } else {
          const result = await response.json();
          const tickets = Array.isArray(result?.data) ? result.data : [];
          // HTTP 200 can contain individual ticket errors. Missing or malformed
          // tickets also do not demonstrate that Expo accepted a notification.
          for (let index = 0; index < batch.length; index += 1) {
            if (tickets[index]?.status === 'ok') totalSent += 1;
            else totalErrors += 1;
          }
        }
      } catch (batchError) {
        console.error('Expo Push API batch request threw:', batchError);
        totalErrors += batch.length;
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent, errors: totalErrors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('send-group-notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unable to send group notification' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
