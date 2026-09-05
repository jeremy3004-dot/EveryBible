import type { BibleTranslation, TranslationCatalog } from '../../types';
import type { ElCatalog, ElCatalogTranslation } from './elCatalogModel';

// Maps Every Language ISO 639-3 language codes onto the app's own language codes
// for the languages EveryBible already ships/groups. Unmapped codes pass through
// unchanged so an EL translation still groups under its ISO 639-3 code (no dupes
// in the language filter list — decision B7).
const EL_LANGUAGE_CODE_MAP: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  hin: 'hi',
  nep: 'ne',
  mar: 'mr',
  ben: 'bn',
  tam: 'ta',
  tel: 'te',
  pan: 'pa',
  urd: 'ur',
  ara: 'ar',
  fra: 'fr',
  deu: 'de',
  por: 'pt',
  rus: 'ru',
  ind: 'id',
  jpn: 'ja',
  kor: 'ko',
  tur: 'tr',
  vie: 'vi',
  zho: 'zh',
};

// NOTE: This maps to an ISO-style language *code* and is for code-keyed consumers
// (e.g. reading-font selection). It must NOT feed BibleTranslation.language, which
// is the English display-name bucket key used by the picker's filter grouping.
export function mapElLanguageCode(iso6393: string): string {
  return EL_LANGUAGE_CODE_MAP[iso6393] ?? iso6393;
}

// EL audio is CC0-1.0. Mirror the app's existing public-domain wording (see
// src/constants/translations.ts, e.g. the BSB "CC0 1.0 audio" phrasing) while
// making it clear these entries carry audio only, no text.
const EL_COPYRIGHT = 'Public Domain audio (CC0 1.0)';

function mapElTranslation(
  entry: ElCatalogTranslation,
  catalogBaseUrl: string,
  generatedAt: string
): BibleTranslation {
  const audio: NonNullable<TranslationCatalog['audio']> = {
    strategy: 'el-manifest',
    manifestUrl: entry.manifestUrl,
    audioVersion: entry.currentAudioVersion,
    catalogBaseUrl,
    fileExtension: 'mp3',
  };

  const catalog: TranslationCatalog = {
    version: entry.currentAudioVersion,
    updatedAt: generatedAt,
    audio,
  };

  return {
    id: entry.translationId,
    name: entry.translationName,
    abbreviation: entry.abbreviation,
    // Language grouping bucket for the picker MUST be the English display name
    // (matches mapCatalogEntryToBibleTranslation using entry.language_name), so
    // EL entries share a bucket with same-language Supabase entries instead of
    // fragmenting into a raw ISO-code bucket. Do NOT use mapElLanguageCode here.
    language: entry.languageName,
    // Display: prefer the autonym for the language label, fall back to the name.
    description: entry.languageAutonym ?? entry.languageName,
    copyright: EL_COPYRIGHT,
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    // No text pack exists, so book counts/size are unknown; 0 is how the rest of
    // the app represents "nothing installed / no text" for a runtime entry.
    totalBooks: 0,
    sizeInMB: 0,
    // AUDIO-ONLY: hasText=false keeps it out of the text (reader) picker while
    // hasAudio=true + catalog.audio surfaces it as an audio source (decision B6).
    hasText: false,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'remote-only',
    catalog,
    activeDownloadJob: null,
  };
}

export function mapElCatalogToBibleTranslations(catalog: ElCatalog): BibleTranslation[] {
  const translations: BibleTranslation[] = [];
  for (const entry of catalog.translations) {
    // Skip entries that advertise no audio — EL entries are audio-only, so an
    // entry without audio has nothing to offer this app.
    if (!entry.hasAudio) continue;
    translations.push(mapElTranslation(entry, catalog.baseUrl, catalog.generatedAt));
  }
  return translations;
}
