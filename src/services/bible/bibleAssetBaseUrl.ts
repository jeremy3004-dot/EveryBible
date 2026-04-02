import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, '');
}

export function getBibleAssetBaseUrl(): string | null {
  return normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_BIBLE_ASSET_BASE_URL);
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeAssetPath(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^\.?\//, '');
}

export function resolveBibleAssetUrl(
  value: string | undefined,
  assetBaseUrl = getBibleAssetBaseUrl()
): string | null {
  const normalizedValue = normalizeAssetPath(value);
  const normalizedAssetBaseUrl = normalizeBaseUrl(assetBaseUrl ?? undefined);

  if (!normalizedValue) {
    return null;
  }

  if (isAbsoluteUrl(normalizedValue)) {
    return normalizedValue;
  }

  if (!normalizedAssetBaseUrl) {
    return null;
  }

  return `${normalizedAssetBaseUrl}/${normalizedValue}`;
}

export function getBibleAudioAssetBaseUrl(): string | null {
  const configuredAssetBaseUrl = getBibleAssetBaseUrl();

  if (configuredAssetBaseUrl) {
    return `${configuredAssetBaseUrl}/audio`;
  }

  const supabaseUrl = normalizeBaseUrl(publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_URL);

  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/bible-audio`;
}
