// Edge Function: send-group-notification
// Tells the other members of a group that a session was recorded. The caller names the
// session; the server decides whether a push is allowed and writes the text itself, in each
// recipient's interface language. Callers can no longer supply the title or body (groups
// health check G5: any member could push arbitrary text to every other member).
//
// Called by the app via supabase.functions.invoke('send-group-notification') right after a
// successful group session insert (recordSyncedGroupSession in groupService.ts).
//
// Request body: {
//   group_id: string,   — UUID of the group
//   session_id: string, — UUID of the group_sessions row the caller just recorded
// }
// Legacy fields (title, body, exclude_user_id) are ignored.
//
// public.claim_group_session_notification (service role only) checks that the session is in
// the group, was recorded by the caller in the last 15 minutes, that the caller is still a
// member, and that the per-session, per-lesson, per-sender and per-group limits allow a push.
// It records the claim and returns the group name and recipients with their language.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { cleanGroupName, groupSessionMessage } from './messages.ts';

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

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

interface ClaimRecipient {
  user_id: string;
  language: string | null;
}

interface Claim {
  status: 'ok' | 'not_found' | 'forbidden' | 'stale' | 'duplicate' | 'rate_limited';
  group_name?: string | null;
  recipients?: ClaimRecipient[];
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
    const { group_id, session_id } = payload as Record<string, unknown>;
    if (!isUuid(group_id) || !isUuid(session_id)) {
      return jsonResponse({ success: false, error: 'Invalid notification request' }, 400);
    }

    // The claim is the authorization: no recipient identities or push tokens are read
    // until it succeeds.
    const { data: claimData, error: claimError } = await supabase.rpc(
      'claim_group_session_notification',
      { p_session_id: session_id, p_group_id: group_id, p_sender_id: callerId }
    );
    if (claimError) {
      throw new Error(`Failed to claim group notification: ${claimError.message}`);
    }
    const claim = claimData as Claim | null;
    switch (claim?.status) {
      case 'ok':
        break;
      case 'stale':
      case 'duplicate':
        return jsonResponse({ success: true, sent: 0, reason: claim.status });
      case 'rate_limited':
        return jsonResponse({ success: false, error: 'Too many notifications' }, 429);
      case 'not_found':
      case 'forbidden':
        return jsonResponse({ success: false, error: 'Forbidden' }, 403);
      default:
        throw new Error('Unexpected group notification claim');
    }

    const recipients = (Array.isArray(claim.recipients) ? claim.recipients : []).filter(
      (recipient) => isUuid(recipient?.user_id) && recipient.user_id !== callerId
    );
    if (recipients.length === 0) {
      return jsonResponse({ success: true, sent: 0, reason: 'only_creator_in_group' });
    }
    const languageByUser = new Map(
      recipients.map((recipient) => [recipient.user_id, recipient.language])
    );

    const { data: devices, error: devicesError } = await supabase
      .from('user_devices')
      .select('user_id, push_token')
      .eq('is_active', true)
      .in('user_id', [...languageByUser.keys()]);

    if (devicesError) {
      throw new Error(`Failed to query user_devices: ${devicesError.message}`);
    }

    // One message per distinct token, in its owner's language.
    const groupName = cleanGroupName(claim.group_name);
    const messages: ExpoPushMessage[] = [];
    const seenTokens = new Set<string>();
    for (const device of (devices ?? []) as Array<{ user_id: string; push_token: unknown }>) {
      const pushToken = device.push_token;
      if (
        typeof pushToken !== 'string' ||
        pushToken.trim().length === 0 ||
        seenTokens.has(pushToken) ||
        !languageByUser.has(device.user_id)
      ) {
        continue;
      }
      seenTokens.add(pushToken);
      const message = groupSessionMessage(languageByUser.get(device.user_id), groupName);
      messages.push({
        to: pushToken,
        title: message.title,
        body: message.body,
        sound: 'default',
        data: { screen: 'GroupDetail', groupId: group_id },
      });
    }

    if (messages.length === 0) {
      return jsonResponse({ success: true, sent: 0, reason: 'no_active_tokens' });
    }

    // Send in batches of 100 (Expo limit per request).
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

    return jsonResponse({ success: true, sent: totalSent, errors: totalErrors });
  } catch (error) {
    console.error('send-group-notification error:', error);
    return jsonResponse({ success: false, error: 'Unable to send group notification' }, 500);
  }
});
