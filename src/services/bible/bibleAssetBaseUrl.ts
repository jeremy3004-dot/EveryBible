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

export function sanitizeBibleAssetReference(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (ABSOLUTE_HTTP_RE.test(trimmed)) {
    return trimmed;
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

  try {
    return new URL(reference).toString().replace(/\/+$/, '');
  } catch {
    const normalizedAssetBaseUrl = normalizeBaseUrl(assetBaseUrl);

    if (!normalizedAssetBaseUrl) {
      return null;
    }

    return `${normalizedAssetBaseUrl}/${reference.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }
}

export function resolveBibleAssetUrl(
  value: string | undefined | null,
  assetBaseUrl = getBibleAssetBaseUrl()
): string | null {
  const reference = sanitizeBibleAssetReference(value);

  if (!reference) {
    return null;
  }

  try {
    return new URL(reference).toString();
  } catch {
    const normalizedAssetBaseUrl = normalizeBaseUrl(assetBaseUrl);

    if (!normalizedAssetBaseUrl) {
      return null;
    }

    return `${normalizedAssetBaseUrl}/${reference.replace(/^\/+/, '')}`;
  }
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
