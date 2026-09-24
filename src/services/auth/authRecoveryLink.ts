// Pure URL parsing for Supabase password-recovery deep links. Kept free of
// react-native/expo imports so it can be unit-tested directly and so it never
// pulls WHATWG `new URL()` onto the Hermes hot path — see the equivalent
// scheme-check note in ../supabase/client.ts.
//
// The client uses the PKCE flow (see ../supabase/client.ts). The recovery email
// sends the user through Supabase's /verify endpoint, which redirects to
//   com.everybible.app://reset-password?code=<auth code>
// The code is worthless without the code verifier that resetPasswordForEmail
// stored in this install's SecureStore, so another app that claims our custom
// scheme and receives the link cannot turn it into a session.

export type RecoveryLinkParseResult =
  | { kind: 'code'; code: string }
  | {
      kind: 'unusable';
      /**
       * legacy-token: an implicit-flow link carrying a live session (emails sent
       *   before the PKCE switch). Refused, because accepting session tokens over
       *   a custom scheme is the vulnerability PKCE closes.
       * link-error: Supabase redirected with an error (expired or used link).
       * missing-code: the reset path with no usable code.
       */
      reason: 'legacy-token' | 'link-error' | 'missing-code';
    };

export type RecoveryProblem = 'wrong-device' | 'expired' | 'network' | 'configuration';

// Any installed app can fire an arbitrary URL at us. Only the app's own
// reset-password link is a recovery link: another host under our scheme, a
// deeper path, an http(s) link, or an `exp://` dev URL is not.
const RECOVERY_LINK_PREFIX = 'com.everybible.app://reset-password';

// Supabase auth codes are UUIDs. Anything that is not a short plain token is
// refused before it reaches the network.
const AUTH_CODE_PATTERN = /^[A-Za-z0-9-]{16,128}$/;

function isAllowedRecoveryUrl(url: string): boolean {
  // Scheme and host are case-insensitive; the remainder must be nothing, an
  // optional trailing slash, then a query or fragment.
  if (url.slice(0, RECOVERY_LINK_PREFIX.length).toLowerCase() !== RECOVERY_LINK_PREFIX) {
    return false;
  }

  const remainder = url.slice(RECOVERY_LINK_PREFIX.length);
  const afterSlash = remainder.startsWith('/') ? remainder.slice(1) : remainder;
  return afterSlash === '' || afterSlash.startsWith('?') || afterSlash.startsWith('#');
}

function splitUrl(url: string): { query: string; fragment: string } {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);
  return { query, fragment };
}

function readParams(segment: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!segment) {
    return params;
  }

  for (const pair of segment.split('&')) {
    if (!pair) {
      continue;
    }
    const equalsIndex = pair.indexOf('=');
    const rawKey = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
    const rawValue = equalsIndex === -1 ? '' : pair.slice(equalsIndex + 1);
    let value: string;
    try {
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // A malformed escape makes the value unusable, not the whole link fatal.
      value = '';
    }
    if (!params.has(rawKey)) {
      params.set(rawKey, value);
    }
  }

  return params;
}

export function parseRecoveryLink(url: string): RecoveryLinkParseResult | null {
  if (!isAllowedRecoveryUrl(url)) {
    return null;
  }

  const { query, fragment } = splitUrl(url);
  const queryParams = readParams(query);
  const fragmentParams = readParams(fragment);
  const has = (key: string) => queryParams.has(key) || fragmentParams.has(key);

  if (has('access_token') || has('refresh_token')) {
    return { kind: 'unusable', reason: 'legacy-token' };
  }

  if (has('error') || has('error_code') || has('error_description')) {
    return { kind: 'unusable', reason: 'link-error' };
  }

  const code = queryParams.get('code') ?? '';
  if (!AUTH_CODE_PATTERN.test(code)) {
    return { kind: 'unusable', reason: 'missing-code' };
  }

  return { kind: 'code', code };
}

/**
 * Maps a failed `exchangeCodeForSession` to what the user can do about it.
 * auth-js deletes the stored code verifier after every attempt, successful or
 * not, so none of these can be retried with the same link.
 */
export function classifyRecoveryExchangeError(
  error: unknown
): Exclude<RecoveryProblem, 'configuration'> {
  if (!error || typeof error !== 'object') {
    return 'expired';
  }

  const { name, code } = error as { name?: unknown; code?: unknown };

  // No verifier in this install's storage: the link was opened on another
  // device, after a reinstall, or after a sign-in cleared the pending request.
  if (code === 'pkce_code_verifier_not_found' || name === 'AuthPKCECodeVerifierMissingError') {
    return 'wrong-device';
  }

  if (name === 'AuthRetryableFetchError') {
    return 'network';
  }

  // auth-js rethrows anything that is not an auth error, which in practice is a
  // failed fetch.
  const isAuthError = typeof name === 'string' && name.startsWith('Auth');
  if (!isAuthError && code === undefined) {
    return 'network';
  }

  // flow_state_expired, flow_state_not_found (used), bad_code_verifier (a newer
  // reset request replaced the verifier), and anything else from the server.
  return 'expired';
}

export function recoveryProblemMessageKey(problem: RecoveryProblem): string {
  switch (problem) {
    case 'wrong-device':
      return 'auth.resetLinkWrongDevice';
    case 'network':
      return 'auth.serviceUnavailable';
    case 'configuration':
      return 'auth.backendNotConfigured';
    case 'expired':
    default:
      return 'auth.resetPasswordInvalidSession';
  }
}
