import { getFeatureFlag } from '../featureFlags';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

export interface ResolveElCatalogUrlDeps {
  baseUrl?: string | null;
  isDev?: boolean;
  isFlagEnabled?: boolean;
}

// Only https origins are trusted for the signed catalog fetch; anything else is inert.
// Plaintext http is rejected even in dev: every configured EL origin (see eas.json) is
// https, and allowing http would hand a network attacker the catalog bytes to tamper with
// before signature verification ever runs. Mirrors the check in services/supabase/client.ts.
const HTTPS_URL_RE = /^https:\/\//i;

// Guarded because node --test has no __DEV__; the flag-off default keeps EL inert in tests.
const defaultIsDev = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

// Resolves the signed EL catalog URL, or null when the feature is inert. Inert whenever the
// flag is off or no valid base URL is configured, so flag-off / unconfigured builds make zero
// EL network calls (contract R6 + design B8/B9). No module-eval side effects.
export function resolveElCatalogUrl(deps: ResolveElCatalogUrlDeps = {}): string | null {
  const {
    baseUrl = publicRuntimeConfig.EXPO_PUBLIC_EL_MEDIA_BASE_URL ?? null,
    isDev = defaultIsDev(),
    isFlagEnabled = getFeatureFlag('el_media_source'),
  } = deps;

  if (!isFlagEnabled) {
    return null;
  }

  if (typeof baseUrl !== 'string') {
    return null;
  }

  const trimmed = baseUrl.trim();
  if (trimmed.length === 0 || !HTTPS_URL_RE.test(trimmed)) {
    return null;
  }

  const normalizedBase = trimmed.replace(/\/+$/, '');
  const catalogPath = isDev ? '/catalog.dev.json' : '/catalog.json';
  return `${normalizedBase}${catalogPath}`;
}
