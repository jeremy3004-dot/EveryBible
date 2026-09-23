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
