import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Brute-force protection shared by the translator and Scripture Council passcodes. Failed
// attempts are recorded in translator_review_attempts under a hashed client key, and a key
// is locked out after too many failures in a short window.
export const PASSCODE_LOCKOUT_THRESHOLD = 10;
export const PASSCODE_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type PasscodeLockoutState = 'open' | 'locked' | 'unavailable';

// Which client address the lockout trusts. Checked against the live project on 2026-09-24:
// - a request carrying its own cf-connecting-ip is rejected by Cloudflare (403, error 1000)
//   before it reaches the function, so the value the function sees is always edge-stamped;
// - a client-sent x-real-ip is replaced with the real address;
// - a client-sent x-forwarded-for reaches the function verbatim, so it is never used here.
// Requests with neither trusted header share one 'unknown' bucket rather than falling back
// to a value the caller chooses.
export function passcodeAttemptClientKey(request: Request): string {
  const ip =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '';
  if (!ip) return 'unknown';
  return ip.includes(':') ? ipv6NetworkKey(ip) : ip;
}

// One IPv6 subscriber normally holds a whole /64 and can rotate the lower 64 bits freely,
// so a per-address limit would not limit them at all. IPv4-mapped addresses key on the IPv4.
function ipv6NetworkKey(ip: string): string {
  const address = ip.split('%')[0].toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];

  const halves = address.split('::');
  if (halves.length > 2) return address;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  // A trailing dotted IPv4 part occupies two 16-bit groups.
  const width = (parts: string[]) =>
    parts.reduce((total, part) => total + (part.includes('.') ? 2 : 1), 0);
  const groups =
    halves.length === 2
      ? [...head, ...Array(Math.max(0, 8 - width(head) - width(tail))).fill('0'), ...tail]
      : head;
  const network = groups.slice(0, 4);
  if (network.length < 4 || !network.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
    return address;
  }
  return `${network.map((group) => parseInt(group, 16).toString(16)).join(':')}::/64`;
}

// SHA-256 of namespace + client key. Only the digest is stored. The translator lockout uses
// no namespace and the council gate uses 'council:', as before, so attempts recorded by the
// previous code still count toward the current window.
export async function hashPasscodeAttemptKey(request: Request, namespace = ''): Promise<string> {
  const data = new TextEncoder().encode(namespace + passcodeAttemptClientKey(request));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

// PostgREST's answer when a function is not in its schema cache (the migration is not applied).
const RPC_MISSING = 'PGRST202';

export type PasscodeAttemptClaim =
  | { state: 'claimed'; attemptId: string | null }
  | { state: 'locked' }
  | { state: 'unavailable' };

// Reserves one attempt BEFORE the passcode is evaluated. Reading the count and recording a
// failure only afterwards let a burst of parallel guesses all read "under the limit", so each
// was evaluated and a correct one was accepted (security review 2026-09-24, pass 2).
// claim_passcode_attempt() counts and records under an advisory lock and returns the new row's
// id, or null when this client is locked out. The attempt counts as a failure until
// settlePasscodeAttempt() releases it after a correct passcode. While the function is not deployed the previous
// read-then-record path is used (attemptId null); any other error refuses the request.
export async function claimPasscodeAttempt(
  service: SupabaseClient,
  ipHash: string,
  now: number = Date.now()
): Promise<PasscodeAttemptClaim> {
  const { data, error } = await service.rpc('claim_passcode_attempt', {
    p_ip_hash: ipHash,
    p_threshold: PASSCODE_LOCKOUT_THRESHOLD,
    p_window_seconds: PASSCODE_LOCKOUT_WINDOW_MS / 1000,
  });
  if (error) {
    if ((error as { code?: unknown }).code !== RPC_MISSING) return { state: 'unavailable' };
    const lockout = await readPasscodeLockout(service, ipHash, now);
    return lockout === 'open' ? { state: 'claimed', attemptId: null } : { state: lockout };
  }
  if (data == null) return { state: 'locked' };
  return typeof data === 'string'
    ? { state: 'claimed', attemptId: data }
    : { state: 'unavailable' };
}

// Returns false only when a failure could not be recorded on the fallback path (a free guess),
// so callers refuse the request. A claimed attempt is already recorded as a failure; after a
// correct passcode its row is deleted (the table only ever held failures). That is best
// effort: a missed delete only costs the caller one attempt.
export async function settlePasscodeAttempt(
  service: SupabaseClient,
  ipHash: string,
  attemptId: string | null,
  succeeded: boolean
): Promise<boolean> {
  if (attemptId === null) {
    return succeeded ? true : recordFailedPasscodeAttempt(service, ipHash);
  }
  if (succeeded) {
    const { error } = await service.from('translator_review_attempts').delete().eq('id', attemptId);
    if (error) console.warn('claimed passcode attempt could not be released');
  }
  return true;
}
