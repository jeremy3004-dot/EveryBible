// Pure URL parsing for Supabase password-recovery deep links. Kept free of
// react-native/expo imports so it can be unit-tested directly and so it never
// pulls WHATWG `new URL()` onto the Hermes hot path — see the equivalent
// scheme-check note in ../supabase/client.ts.
export interface AuthRecoveryTokens {
  accessToken: string;
  refreshToken: string;
}

function extractParamsSegment(url: string): string {
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    return url.slice(hashIndex + 1);
  }

  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    return url.slice(queryIndex + 1);
  }

  return '';
}

function extractParam(segment: string, key: string): string | null {
  const match = segment.match(new RegExp(`(?:^|&)${key}=([^&]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Supabase's implicit auth flow (the default, and what this app's client uses —
// see detectSessionInUrl: false in ../supabase/client.ts) delivers recovery
// tokens in the URL fragment, e.g.:
// com.everybible.app://reset-password#access_token=...&refresh_token=...&type=recovery
export function parseAuthRecoveryTokens(url: string): AuthRecoveryTokens | null {
  const segment = extractParamsSegment(url);
  if (!segment) {
    return null;
  }

  if (extractParam(segment, 'type') !== 'recovery') {
    return null;
  }

  const accessToken = extractParam(segment, 'access_token');
  const refreshToken = extractParam(segment, 'refresh_token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}
