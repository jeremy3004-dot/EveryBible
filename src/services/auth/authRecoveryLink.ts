// Pure URL parsing for Supabase password-recovery deep links. Kept free of
// react-native/expo imports so it can be unit-tested directly and so it never
// pulls WHATWG `new URL()` onto the Hermes hot path — see the equivalent
// scheme-check note in ../supabase/client.ts.
export interface AuthRecoveryTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthRecoveryTokenClaims {
  email: string | null;
  subject: string | null;
}

// Any installed app can fire an arbitrary URL at us. Only the app's own
// reset-password link is a recovery link: anything else (another host under our
// scheme, a http(s) universal link, an `exp://` dev URL carrying a crafted
// fragment) is rejected outright so an attacker cannot smuggle their own tokens
// in through a path we merely "happen to parse".
const RECOVERY_LINK_PREFIX = 'com.everybible.app://reset-password';

function isAllowedRecoveryUrl(url: string): boolean {
  // Only the scheme+host are case-insensitive in practice; compare the prefix
  // case-insensitively and then require a real boundary so that hosts such as
  // `reset-password.attacker.example` cannot pass as a prefix match.
  if (url.slice(0, RECOVERY_LINK_PREFIX.length).toLowerCase() !== RECOVERY_LINK_PREFIX) {
    return false;
  }

  const remainder = url.slice(RECOVERY_LINK_PREFIX.length);
  return (
    remainder === '' ||
    remainder.startsWith('/') ||
    remainder.startsWith('#') ||
    remainder.startsWith('?')
  );
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
  if (!isAllowedRecoveryUrl(url)) {
    return null;
  }

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

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Hermes ships neither `atob` nor `Buffer`, so the base64url decode is written
// out by hand. This is DISPLAY-ONLY: the payload is never verified here, and
// nothing security-relevant is decided from it beyond "which account does this
// link claim to be for", which the user then confirms.
function decodeBase64UrlToBytes(input: string): number[] | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '=') {
      break;
    }

    const value = BASE64_ALPHABET.indexOf(character);
    if (value === -1) {
      return null;
    }

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return bytes;
}

function decodeUtf8(bytes: number[]): string | null {
  let output = '';
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index];
    index += 1;
    let codePoint: number;
    let continuationCount: number;

    if (first < 0x80) {
      output += String.fromCharCode(first);
      continue;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      continuationCount = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      continuationCount = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      continuationCount = 3;
    } else {
      return null;
    }

    if (index + continuationCount > bytes.length) {
      return null;
    }

    for (let step = 0; step < continuationCount; step += 1) {
      const continuation = bytes[index];
      index += 1;
      if ((continuation & 0xc0) !== 0x80) {
        return null;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    if (codePoint > 0x10ffff) {
      return null;
    }

    output += String.fromCodePoint(codePoint);
  }

  return output;
}

function readStringClaim(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Reads the `email`/`sub` claims out of a Supabase access token so the reset
 * screen can name the account the link belongs to BEFORE any session exists.
 *
 * The signature is deliberately NOT verified — Hermes has no WebCrypto, and the
 * real trust decision is made by Supabase when the token is exchanged for a
 * session. Treat everything returned here as untrusted, user-visible text.
 */
export function decodeRecoveryTokenClaims(accessToken: string): AuthRecoveryTokenClaims {
  const segments = accessToken.split('.');
  if (segments.length !== 3) {
    return { email: null, subject: null };
  }

  const bytes = decodeBase64UrlToBytes(segments[1]);
  if (!bytes) {
    return { email: null, subject: null };
  }

  const json = decodeUtf8(bytes);
  if (!json) {
    return { email: null, subject: null };
  }

  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') {
      return { email: null, subject: null };
    }

    const payload = parsed as Record<string, unknown>;
    return {
      email: readStringClaim(payload, 'email'),
      subject: readStringClaim(payload, 'sub'),
    };
  } catch {
    return { email: null, subject: null };
  }
}

export type RecoveryLinkAudience = 'match' | 'different-account';

/**
 * A recovery link that belongs to a different account than the one currently
 * signed in must never be allowed to silently swap the session out from under
 * the user (session fixation). Signed-out devices, and links whose subject we
 * could not read, fall through to the ordinary confirmation prompt.
 */
export function resolveRecoveryLinkAudience(
  linkSubject: string | null,
  signedInUserId: string | null | undefined
): RecoveryLinkAudience {
  if (!signedInUserId || !linkSubject) {
    return 'match';
  }

  return linkSubject === signedInUserId ? 'match' : 'different-account';
}
