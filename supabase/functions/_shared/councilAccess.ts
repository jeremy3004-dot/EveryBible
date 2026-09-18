import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Both the settings unlock and every council submission use this server-side gate.
export async function verifyCouncilAccess(
  service: SupabaseClient, request: Request, passcode: unknown,
  expected: string | undefined = Deno.env.get('SCRIPTURE_COUNCIL_PASSCODE')
): Promise<{ status: number; error: string } | null> {
  if (!expected?.trim()) return { status: 503, error: 'Council access is not configured.' };
  const ip = request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('council:' + ip));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await service.from('translator_review_attempts')
    .select('id', { count: 'exact', head: true }).eq('ip_hash', hash)
    .eq('succeeded', false).gte('created_at', since);
  if (error) return { status: 503, error: 'Unable to verify council access. Try again later.' };
  if ((count ?? 0) >= 10) return { status: 429, error: 'Too many attempts. Try again later.' };
  const actual = typeof passcode === 'string' ? passcode.trim() : '';
  const target = expected.trim();
  let mismatch = actual.length ^ target.length;
  for (let i = 0; i < Math.max(actual.length, target.length); i++) {
    mismatch |= (actual.charCodeAt(i) || 0) ^ (target.charCodeAt(i) || 0);
  }
  if (mismatch !== 0) {
    const { error: writeError } = await service.from('translator_review_attempts')
      .insert({ ip_hash: hash, succeeded: false });
    return writeError
      ? { status: 503, error: 'Unable to verify council access. Try again later.' }
      : { status: 403, error: 'Council access denied' };
  }
  return null;
}
