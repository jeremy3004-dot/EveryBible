import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Brute-force protection shared by the translator and Scripture Council passcodes. Failed
// attempts are recorded in translator_review_attempts under a hashed client key, and a key
// is locked out after too many failures in a short window.
export const PASSCODE_LOCKOUT_THRESHOLD = 10;
export const PASSCODE_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type PasscodeLockoutState = 'open' | 'locked' | 'unavailable';

// 'unavailable' means the counter could not be read. Callers must treat it as a refusal:
// a passcode check that proceeds without its counter gives unlimited guesses to anyone who
// can make the counter query fail.
export async function readPasscodeLockout(
  service: SupabaseClient,
  ipHash: string,
  now: number = Date.now()
): Promise<PasscodeLockoutState> {
  const windowStart = new Date(now - PASSCODE_LOCKOUT_WINDOW_MS).toISOString();
  const { count, error } = await service
    .from('translator_review_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('succeeded', false)
    .gte('created_at', windowStart);

  if (error) return 'unavailable';
  return (count ?? 0) >= PASSCODE_LOCKOUT_THRESHOLD ? 'locked' : 'open';
}

// Returns false when the failure could not be recorded. An unrecorded failure is a free
// guess, so callers refuse the request rather than answer "wrong passcode".
export async function recordFailedPasscodeAttempt(
  service: SupabaseClient,
  ipHash: string
): Promise<boolean> {
  const { error } = await service
    .from('translator_review_attempts')
    .insert({ ip_hash: ipHash, succeeded: false });
  return !error;
}
