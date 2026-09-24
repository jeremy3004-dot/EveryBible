import { mmkvInstance } from '../../stores/mmkvStorage';

/**
 * The sign-out push-token deactivation the backend never confirmed (it failed, timed
 * out, or the device was offline), so the previous account's row in user_devices may
 * still be active for this device.
 *
 * Only the Expo push token and the account id are kept: never an auth token.
 *
 * Under the user_devices RLS (every policy is `TO authenticated` with
 * `user_id = auth.uid()`), a signed-out client cannot deactivate the row, and a signed-in
 * account cannot touch another account's row. So nothing retries this record while
 * signed out. It is resolved by this device registering its token again:
 * - for another account, send-group-notification delivers a token only to the account
 *   that registered it last (latest updated_at), so the old row stops receiving pushes;
 * - for the same account, it is meant to be active again;
 * - discreet mode deactivating the same account's row also resolves it.
 * Finishing it while signed out would need a server-side release of a token by the
 * device that holds it (e.g. a SECURITY DEFINER RPC), which does not exist yet.
 */
export interface PendingPushTokenDeactivation {
  token: string;
  userId: string;
}

const PENDING_PUSH_TOKEN_DEACTIVATION_KEY = 'push-token-pending-deactivation';

export function readPendingPushTokenDeactivation(): PendingPushTokenDeactivation | null {
  try {
    const raw = mmkvInstance.getString(PENDING_PUSH_TOKEN_DEACTIVATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPushTokenDeactivation> | null;
    return typeof parsed?.token === 'string' && typeof parsed.userId === 'string'
      ? { token: parsed.token, userId: parsed.userId }
      : null;
  } catch {
    return null;
  }
}

export function recordPendingPushTokenDeactivation(pending: PendingPushTokenDeactivation): void {
  try {
    mmkvInstance.set(
      PENDING_PUSH_TOKEN_DEACTIVATION_KEY,
      JSON.stringify({ token: pending.token, userId: pending.userId })
    );
  } catch {
    // Best effort: the next registration of this device supersedes the row anyway.
  }
}

/** Clears the record, or only a record for this account and token when one is given. */
export function clearPendingPushTokenDeactivation(match?: PendingPushTokenDeactivation): void {
  try {
    if (match) {
      const pending = readPendingPushTokenDeactivation();
      if (pending?.token !== match.token || pending.userId !== match.userId) return;
    }
    mmkvInstance.delete(PENDING_PUSH_TOKEN_DEACTIVATION_KEY);
  } catch {
    // A record left behind is harmless: it is never acted on, only cleared.
  }
}
