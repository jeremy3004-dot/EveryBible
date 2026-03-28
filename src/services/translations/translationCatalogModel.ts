import type { BibleTranslation } from '../../types';
import type { TranslationCatalogEntry } from '../supabase/types';
import { resolveCloudTextTranslationId } from '../bible/cloudTranslationModel';

export interface CatalogLanguageFilter {
  code: string;
  label: string;
}

const CATALOG_TRANSLATION_ID_ALIASES: Record<string, string> = {
  'eng-asv': 'asv',
  engbbe: 'bbe',
  engbsb: 'bsb',
  engwebp: 'web',
  engwebpb: 'web',
  engylt: 'ylt',
  rvr: 'sparv1909',
};

export function normalizeCatalogTranslationId(translationId: string): string {
  const normalizedId = translationId.trim().toLowerCase();
  return CATALOG_TRANSLATION_ID_ALIASES[normalizedId] ?? normalizedId;
}

function normalizeCatalogLanguageName(languageName: string | null | undefined): string {
  return languageName?.trim() || 'Other';
}

export function normalizeCatalogEntries(
  entries: TranslationCatalogEntry[]
): TranslationCatalogEntry[] {
  const normalizedById = new Map<string, TranslationCatalogEntry>();

  for (const entry of entries) {
    const normalizedId = normalizeCatalogTranslationId(entry.translation_id);
    const existing = normalizedById.get(normalizedId);

    if (
      !existing ||
      (existing.sort_order ?? Number.MAX_SAFE_INTEGER) >
        (entry.sort_order ?? Number.MAX_SAFE_INTEGER)
    ) {
      normalizedById.set(normalizedId, {
        ...entry,
        translation_id: normalizedId,
      });
    }
  }

  return Array.from(normalizedById.values());
}

export function filterInstallableCatalogEntries(
  entries: TranslationCatalogEntry[],
  currentVersionIds: Set<string>
): TranslationCatalogEntry[] {
  return normalizeCatalogEntries(entries).filter((entry) => {
    const resolvedBackendId = resolveCloudTextTranslationId(
      entry.translation_id,
      entry.translation_id
    );

    return currentVersionIds.has(resolvedBackendId);
  });
}

export function buildCatalogLanguageFilters(
  entries: TranslationCatalogEntry[]
): CatalogLanguageFilter[] {
  const labels = Array.from(
    new Set(entries.map((entry) => normalizeCatalogLanguageName(entry.language_name)))
  );

  return labels
    .sort((left, right) => {
      if (left === 'English') return -1;
      if (right === 'English') return 1;
      return left.localeCompare(right);
    })
    .map((label) => ({ code: label, label }));
}

export function filterCatalogEntriesByLanguage(
  entries: TranslationCatalogEntry[],
  selectedLanguage: string
): TranslationCatalogEntry[] {
  if (selectedLanguage === 'all') {
    return entries;
  }

  return entries.filter(
    (entry) => normalizeCatalogLanguageName(entry.language_name) === selectedLanguage
  );
}

export function mapCatalogEntryToBibleTranslation(
  entry: TranslationCatalogEntry,
  existing?: BibleTranslation
): BibleTranslation {
  const translationId = normalizeCatalogTranslationId(entry.translation_id);
  const hasCatalogAudio = Boolean(entry.catalog?.audio);

  return {
    id: translationId,
    name: entry.name,
    abbreviation: entry.abbreviation,
    language: entry.language_name,
    description: existing?.description ?? entry.license_type ?? '',
    copyright: existing?.copyright ?? entry.license_type ?? 'Unknown',
    isDownloaded: existing?.isDownloaded ?? false,
    downloadedBooks: existing?.downloadedBooks ?? [],
    downloadedAudioBooks: existing?.downloadedAudioBooks ?? [],
    totalBooks: existing?.totalBooks ?? 66,
    sizeInMB: existing?.sizeInMB ?? 5,
    hasText: Boolean(existing?.hasText || entry.has_text),
    hasAudio: Boolean(existing?.hasAudio || entry.has_audio || hasCatalogAudio),
    audioGranularity:
      existing?.audioGranularity ??
      (entry.has_audio || hasCatalogAudio ? 'chapter' : 'none'),
    audioProvider:
      existing?.audioProvider ??
      (entry.catalog?.audio?.strategy === 'provider' ? entry.catalog.audio.provider : undefined),
    source: entry.is_bundled ? existing?.source : 'runtime',
    installState:
      existing?.installState ??
      (entry.is_bundled ? 'seeded' : entry.has_text ? 'remote-only' : 'remote-only'),
    textPackLocalPath: existing?.textPackLocalPath,
    activeTextPackVersion: existing?.activeTextPackVersion,
    pendingTextPackVersion: existing?.pendingTextPackVersion,
    pendingTextPackLocalPath: existing?.pendingTextPackLocalPath,
    rollbackTextPackVersion: existing?.rollbackTextPackVersion,
    rollbackTextPackLocalPath: existing?.rollbackTextPackLocalPath,
    lastInstallError: existing?.lastInstallError,
    catalog: entry.catalog ?? existing?.catalog,
    activeDownloadJob: existing?.activeDownloadJob ?? null,
  };
}
