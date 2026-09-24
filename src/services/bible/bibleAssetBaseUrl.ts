import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

const DEFAULT_BIBLE_ASSET_BASE_URL = 'https://media.everybible.app';

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

function normalizeRelativeAssetPath(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^(?:data|javascript|blob|file):/i.test(trimmed)) {
    return null;
  }

  return trimmed.replace(/^\.\//, '');
}

// Fast protocol check — avoids the slow WHATWG URL polyfill on Hermes (no JIT).
// Stored URLs have already been validated at write time, so a regex is sufficient
// here. Non-absolute strings fall through to the relative-path normalizer.
const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const PLAIN_HTTP_RE = /^http:\/\//i;

// Guarded because node --test has no __DEV__ (and so behaves like a release build).
const isDevRuntime = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Media URLs come from remote catalog data. Release builds never fetch them over plain
 * http: ATS / Android cleartext rules would block most such loads anyway, but iOS still
 * allowed local-network hosts, and streamed audio has no checksum. Upgrading (rather than
 * dropping) keeps an asset working when its host also serves https. Development builds
 * keep http so a local media server on the LAN still works.
 */
export function requireSecureMediaUrl(url: string): string {
  if (!PLAIN_HTTP_RE.test(url) || isDevRuntime()) {
    return url;
  }

  return `https://${url.slice('http://'.length)}`;
}

export function sanitizeBibleAssetReference(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (ABSOLUTE_HTTP_RE.test(trimmed)) {
    return requireSecureMediaUrl(trimmed);
  }

  return normalizeRelativeAssetPath(trimmed);
}

export function getBibleAssetBaseUrl(): string | null {
  return (
    normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_BIBLE_ASSET_BASE_URL) ??
    DEFAULT_BIBLE_ASSET_BASE_URL
  );
}

export function resolveBibleAssetBaseUrl(
  value: string | undefined | null,
  assetBaseUrl = getBibleAssetBaseUrl()
): string | null {
  const reference = sanitizeBibleAssetReference(value);

  if (!reference) {
    return null;
  }

  // Fast path: already an absolute http(s) URL — skip the slow WHATWG URL
  // polyfill (pure JS on Hermes). This runs per audio chapter / verse timestamp.
  if (ABSOLUTE_HTTP_RE.test(reference)) {
    return reference.replace(/\/+$/, '');
  }

  const normalizedAssetBaseUrl = normalizeBaseUrl(assetBaseUrl);

  if (!normalizedAssetBaseUrl) {
    return null;
  }

  return `${normalizedAssetBaseUrl}/${reference.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

export function resolveBibleAssetUrl(
  value: string | undefined | null,
  assetBaseUrl = getBibleAssetBaseUrl()
): string | null {
  const reference = sanitizeBibleAssetReference(value);

  if (!reference) {
    return null;
  }

  // Fast path: already absolute http(s) — skip the WHATWG URL polyfill.
  if (ABSOLUTE_HTTP_RE.test(reference)) {
    return reference;
  }

  const normalizedAssetBaseUrl = normalizeBaseUrl(assetBaseUrl);

  if (!normalizedAssetBaseUrl) {
    return null;
  }

  return `${normalizedAssetBaseUrl}/${reference.replace(/^\/+/, '')}`;
}

export function getBibleAudioAssetBaseUrl(
  configuredAssetBaseUrl = normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_BIBLE_ASSET_BASE_URL),
  _supabaseUrl = normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_URL)
): string | null {
  if (configuredAssetBaseUrl) {
    return `${configuredAssetBaseUrl}/audio`;
  }

  return `${DEFAULT_BIBLE_ASSET_BASE_URL}/audio`;
}
