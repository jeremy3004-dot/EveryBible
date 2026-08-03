export interface ElCatalogTranslation {
  translationId: string;
  languageIso6393: string;
  languageName: string;
  translationName: string;
  abbreviation: string;
  languageAutonym?: string;
  textDirection?: 'ltr' | 'rtl';
  source: string;
  copyright: string;
  deliveryMode: 'chapter';
  hasAudio: boolean;
  currentAudioVersion: string;
  manifestUrl: string;
  manifestSha256: string;
}

export interface ElCatalog {
  schemaVersion: string;
  sequence: number;
  generatedAt: string;
  baseUrl: string;
  translations: ElCatalogTranslation[];
}

import { isNonEmptyString, isNonNegativeInteger, isSha256Hex } from './elParseGuards';

const EL_CATALOG_SCHEMA_PREFIX = 'lqd-catalog/v1';
// Collision guard: EL ids are always lq-prefixed, lowercase — reject anything else.
const EL_TRANSLATION_ID_RE = /^lq[a-z0-9][a-z0-9-]*$/;
// Only absolute http(s) base URLs are trusted.
const HTTP_URL_RE = /^https?:\/\//;

function parseElCatalogTranslation(raw: unknown): ElCatalogTranslation | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  // Unknown delivery modes (e.g. a future "segment") are skipped, not fatal.
  if (entry.delivery_mode !== 'chapter') return null;
  if (
    !isNonEmptyString(entry.translation_id) ||
    !EL_TRANSLATION_ID_RE.test(entry.translation_id) ||
    !isNonEmptyString(entry.language_iso639_3) ||
    !isNonEmptyString(entry.language_name) ||
    !isNonEmptyString(entry.translation_name) ||
    !isNonEmptyString(entry.abbreviation) ||
    !isNonEmptyString(entry.source) ||
    !isNonEmptyString(entry.copyright) ||
    typeof entry.has_audio !== 'boolean' ||
    !isNonEmptyString(entry.current_audio_version) ||
    !isNonEmptyString(entry.manifest_url) ||
    !isSha256Hex(entry.manifest_sha256)
  ) {
    return null;
  }
  const parsed: ElCatalogTranslation = {
    translationId: entry.translation_id,
    languageIso6393: entry.language_iso639_3,
    languageName: entry.language_name,
    translationName: entry.translation_name,
    abbreviation: entry.abbreviation,
    source: entry.source,
    copyright: entry.copyright,
    deliveryMode: 'chapter',
    hasAudio: entry.has_audio,
    currentAudioVersion: entry.current_audio_version,
    manifestUrl: entry.manifest_url,
    manifestSha256: entry.manifest_sha256,
  };
  if (isNonEmptyString(entry.language_autonym)) parsed.languageAutonym = entry.language_autonym;
  if (entry.text_direction === 'ltr' || entry.text_direction === 'rtl') {
    parsed.textDirection = entry.text_direction;
  }
  return parsed;
}

export function parseElCatalogPayload(payload: unknown): ElCatalog | null {
  if (!payload || typeof payload !== 'object') return null;
  const doc = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(doc.schema_version) ||
    !doc.schema_version.startsWith(EL_CATALOG_SCHEMA_PREFIX)
  ) {
    return null;
  }
  if (!isNonNegativeInteger(doc.sequence)) {
    return null;
  }
  if (
    !isNonEmptyString(doc.generated_at) ||
    !isNonEmptyString(doc.base_url) ||
    !HTTP_URL_RE.test(doc.base_url)
  ) {
    return null;
  }
  if (!Array.isArray(doc.translations)) return null;
  const translations: ElCatalogTranslation[] = [];
  for (const raw of doc.translations) {
    const entry = parseElCatalogTranslation(raw);
    // One bad entry never fails the whole catalog.
    if (entry) translations.push(entry);
  }
  return {
    schemaVersion: doc.schema_version,
    sequence: doc.sequence,
    generatedAt: doc.generated_at,
    baseUrl: doc.base_url,
    translations,
  };
}
