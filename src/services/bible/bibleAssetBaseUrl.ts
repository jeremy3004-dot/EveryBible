import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

const DEFAULT_BIBLE_ASSET_BASE_URL = 'https://everybible.app/api/media';

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

export function sanitizeBibleAssetReference(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }

    return null;
  } catch {
    return normalizeRelativeAssetPath(trimmed);
  }
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
  supabaseUrl = normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_URL)
): string | null {
  if (!configuredAssetBaseUrl && !supabaseUrl) {
    return `${DEFAULT_BIBLE_ASSET_BASE_URL}/audio`;
  }

  if (configuredAssetBaseUrl) {
    return `${configuredAssetBaseUrl}/audio`;
  }

  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/bible-audio`;
}
