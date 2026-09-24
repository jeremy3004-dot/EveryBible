import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  claimPasscodeAttempt,
  hashPasscodeAttemptKey,
  settlePasscodeAttempt,
} from './passcodeAttempts.ts';

// Both the settings unlock and every council submission use this server-side gate.
export async function verifyCouncilAccess(
  service: SupabaseClient,
  request: Request,
  passcode: unknown,
  expected: string | undefined = Deno.env.get('SCRIPTURE_COUNCIL_PASSCODE')
): Promise<{ status: number; error: string } | null> {
  if (!expected?.trim()) return { status: 503, error: 'Council access is not configured.' };
  const unavailable = { status: 503, error: 'Unable to verify council access. Try again later.' };
  const hash = await hashPasscodeAttemptKey(request, 'council:');
  const claim = await claimPasscodeAttempt(service, hash);
  if (claim.state === 'unavailable') return unavailable;
  if (claim.state === 'locked')
    return { status: 429, error: 'Too many attempts. Try again later.' };
  const actual = typeof passcode === 'string' ? passcode.trim() : '';
  const target = expected.trim();
  let mismatch = actual.length ^ target.length;
  for (let i = 0; i < Math.max(actual.length, target.length); i++) {
    mismatch |= (actual.charCodeAt(i) || 0) ^ (target.charCodeAt(i) || 0);
  }
  const recorded = await settlePasscodeAttempt(service, hash, claim.attemptId, mismatch === 0);
  if (mismatch !== 0) {
    return recorded ? { status: 403, error: 'Council access denied' } : unavailable;
  }
  return null;
}
