import { bibleBooks, newTestamentBooks } from '../../constants/books';
import { getTranslationById } from '../../constants/translations';
import type {
  AudioProvider,
  BibleIsAudioResponse,
  BibleTranslation,
  TranslationAudioBookCatalog,
  TranslationAudioCoverage,
} from '../../types';
import { resolveBibleAssetBaseUrl, resolveBibleAssetUrl } from '../bible/bibleAssetBaseUrl';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import type { RemoteAudioAsset } from './audioDownloadService';

const BIBLE_IS_API_BASE = 'https://4.dbt.io/api';
const BIBLE_IS_API_KEY = publicRuntimeConfig.EXPO_PUBLIC_BIBLE_IS_API_KEY || '';

const EBIBLE_WEBBE_AUDIO_BASE = 'https://ebible.org/eng-webbe/mp3';
const AUDIO_TEMPLATE_PLACEHOLDERS = new Set([
  '{bookId}',
  '{chapter}',
  '{chapterPadded}',
  '{verse}',
  '{versePadded}',
]);

// Bible.is uses the same 3-letter book IDs as our internal IDs

const EBIBLE_WEBBE_BOOK_PREFIXES: Record<string, string> = {
  GEN: '002_GEN',
  EXO: '003_EXO',
  LEV: '004_LEV',
  NUM: '005_NUM',
  DEU: '006_DEU',
  JOS: '007_JOS',
  JDG: '008_JDG',
  RUT: '009_RUT',
  '1SA': '010_1SA',
  '2SA': '011_2SA',
  '1KI': '012_1KI',
  '2KI': '013_2KI',
  '1CH': '014_1CH',
  '2CH': '015_2CH',
  EZR: '016_EZR',
  NEH: '017_NEH',
  EST: '018_EST',
  JOB: '019_JOB',
  PSA: '020_PSA',
  PRO: '021_PRO',
  ECC: '022_ECC',
  SNG: '023_SNG',
  ISA: '024_ISA',
  JER: '025_JER',
  LAM: '026_LAM',
  EZK: '027_EZK',
  DAN: '028_DAN',
  HOS: '029_HOS',
  JOL: '030_JOL',
  AMO: '031_AMO',
  OBA: '032_OBA',
  JON: '033_JON',
  MIC: '034_MIC',
  NAM: '035_NAM',
  HAB: '036_HAB',
  ZEP: '037_ZEP',
  HAG: '038_HAG',
  ZEC: '039_ZEC',
  MAL: '040_MAL',
  MAT: '070_MAT',
  MRK: '071_MRK',
  LUK: '072_LUK',
  JHN: '073_JHN',
  ACT: '074_ACT',
  ROM: '075_ROM',
  '1CO': '076_1CO',
  '2CO': '077_2CO',
  GAL: '078_GAL',
  EPH: '079_EPH',
  PHP: '080_PHP',
  COL: '081_COL',
  '1TH': '082_1TH',
  '2TH': '083_2TH',
  '1TI': '084_1TI',
  '2TI': '085_2TI',
  TIT: '086_TIT',
  PHM: '087_PHM',
  HEB: '088_HEB',
  JAS: '089_JAS',
  '1PE': '090_1PE',
  '2PE': '091_2PE',
  '1JN': '092_1JN',
  '2JN': '093_2JN',
  '3JN': '094_3JN',
  JUD: '095_JUD',
  REV: '096_REV',
};

const MAX_AUDIO_CACHE_SIZE = 300;
const audioUrlCache = new Map<string, RemoteAudioAsset>();
const NEW_TESTAMENT_BOOK_IDS = new Set(newTestamentBooks.map((book) => book.id));

type RemoteAudioMetadata = {
  id: string;
  hasAudio: boolean;
  audioGranularity?: BibleTranslation['audioGranularity'];
  fileExtension?: string;
  audio?:
    | {
        strategy: 'provider';
        coverage?: TranslationAudioCoverage;
        books?: Record<string, TranslationAudioBookCatalog>;
        provider?: AudioProvider;
        filesetId?: string;
      }
    | {
        strategy: 'stream-template';
        coverage?: TranslationAudioCoverage;
        books?: Record<string, TranslationAudioBookCatalog>;
        baseUrl: string;
        chapterPathTemplate: string;
      }
    | {
        strategy: 'audio-pack';
        coverage?: TranslationAudioCoverage;
        books?: Record<string, TranslationAudioBookCatalog>;
        downloadUrl: string;
      }
    | {
        // Every Language signed audio manifests. Chapter URLs resolve from a verified,
        // immutable manifest fetched via manifestUrl (against catalogBaseUrl) rather than a
        // path template. The heavy elMedia/jose graph is loaded lazily on dispatch only.
        strategy: 'el-manifest';
        coverage?: TranslationAudioCoverage;
        books?: Record<string, TranslationAudioBookCatalog>;
        manifestUrl: string;
        audioVersion: string;
        catalogBaseUrl: string;
      };
};

export type RemoteAudioMetadataResolver = (translationId: string) => RemoteAudioMetadata | null;

// Reference the audio layer hands to the EL manifest service: the persisted catalog.audio
// fields for an 'el-manifest' entry (no manifest_sha256 — it is not threaded through
// BibleTranslation persistence, so the manifest service skips the integrity pre-check and
// relies on signature verification instead).
interface ElManifestAudioRef {
  translationId: string;
  manifestUrl: string;
  audioVersion: string;
  catalogBaseUrl: string;
}

interface ElResolvedChapterAudio {
  url: string;
  mimeType: string;
  fileExt: string;
  bytes: number;
  durationMs?: number;
}

type ElManifestChapterResolver = (
  ref: ElManifestAudioRef,
  bookId: string,
  chapter: number
) => Promise<ElResolvedChapterAudio | null>;

// Default resolver: lazy-imports the elMedia manifest service + chapter resolver so the heavy
// jose/JWKS graph never enters audioRemote's static import graph (audioRemote is on warm audio
// paths). Any failure degrades to "no audio" (null), never throws.
const defaultElManifestChapterResolver: ElManifestChapterResolver = async (
  ref,
  bookId,
  chapter
) => {
  const [{ getElManifestForAudioCatalog }, { resolveElChapterFromManifest }] = await Promise.all([
    import('../elMedia/elManifestService'),
    import('../elMedia/elManifestModel'),
  ]);
  const manifest = await getElManifestForAudioCatalog(ref);
  if (!manifest) {
    return null;
  }
  return resolveElChapterFromManifest(manifest, bookId, chapter);
};

let elManifestChapterResolver: ElManifestChapterResolver = defaultElManifestChapterResolver;

// Test seam: inject a manifest-chapter resolver double (keeps jose/network out of unit tests).
// Passing null restores the lazy production resolver.
export function setElManifestChapterResolverForTests(
  resolver: ElManifestChapterResolver | null
): void {
  elManifestChapterResolver = resolver ?? defaultElManifestChapterResolver;
}

function normalizeFileExtension(extension: string | null | undefined): string | undefined {
  if (!extension) {
    return undefined;
  }

  const normalized = extension.trim().replace(/^\./, '').toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function inferFileExtensionFromPath(path: string | null | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  const match = path.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return normalizeFileExtension(match?.[1]);
}

function buildRemoteAudioMetadataFromTranslation(
  translation: Pick<
    BibleTranslation,
    'id' | 'hasAudio' | 'audioGranularity' | 'audioProvider' | 'audioFilesetId' | 'catalog'
  > | null
): RemoteAudioMetadata | null {
  if (!translation) {
    return null;
  }

  if (!translation.hasAudio) {
    return {
      id: translation.id,
      hasAudio: false,
      audioGranularity: translation.audioGranularity,
    };
  }

  const catalogAudio = translation.catalog?.audio;
  if (catalogAudio) {
    if (catalogAudio.strategy === 'stream-template') {
      return {
        id: translation.id,
        hasAudio: true,
        audioGranularity: translation.audioGranularity,
        fileExtension:
          normalizeFileExtension(catalogAudio.fileExtension) ??
          inferFileExtensionFromPath(catalogAudio.chapterPathTemplate),
        audio: {
          strategy: 'stream-template',
          coverage: catalogAudio.coverage,
          books: catalogAudio.books,
          baseUrl: catalogAudio.baseUrl ?? '',
          chapterPathTemplate: catalogAudio.chapterPathTemplate ?? '',
        },
      };
    }

    if (catalogAudio.strategy === 'provider') {
      return {
        id: translation.id,
        hasAudio: true,
        audioGranularity: translation.audioGranularity,
        fileExtension:
          normalizeFileExtension(catalogAudio.fileExtension) ??
          (catalogAudio.provider === 'ebible-webbe' ? 'mp3' : undefined),
        audio: {
          strategy: 'provider',
          coverage: catalogAudio.coverage,
          books: catalogAudio.books,
          provider: catalogAudio.provider,
          filesetId: translation.audioFilesetId ?? undefined,
        },
      };
    }

    if (catalogAudio.strategy === 'audio-pack') {
      return {
        id: translation.id,
        hasAudio: true,
        audioGranularity: translation.audioGranularity,
        fileExtension:
          normalizeFileExtension(catalogAudio.fileExtension) ??
          inferFileExtensionFromPath(catalogAudio.downloadUrl),
        audio: {
          strategy: 'audio-pack',
          coverage: catalogAudio.coverage,
          books: catalogAudio.books,
          downloadUrl: catalogAudio.downloadUrl ?? '',
        },
      };
    }

    if (catalogAudio.strategy === 'el-manifest') {
      // EL audio is always mp3 (contract); the mapper sets fileExtension: 'mp3'. Downloads name
      // files by this extension, so default to 'mp3' if it is ever missing from the catalog.
      return {
        id: translation.id,
        hasAudio: true,
        audioGranularity: translation.audioGranularity,
        fileExtension: normalizeFileExtension(catalogAudio.fileExtension) ?? 'mp3',
        audio: {
          strategy: 'el-manifest',
          coverage: catalogAudio.coverage,
          books: catalogAudio.books,
          manifestUrl: catalogAudio.manifestUrl ?? '',
          audioVersion: catalogAudio.audioVersion ?? '',
          catalogBaseUrl: catalogAudio.catalogBaseUrl ?? '',
        },
      };
    }
  }

  if (translation.audioProvider) {
    return {
      id: translation.id,
      hasAudio: true,
      audioGranularity: translation.audioGranularity,
      fileExtension: translation.audioProvider === 'ebible-webbe' ? 'mp3' : undefined,
      audio: {
        strategy: 'provider',
        provider: translation.audioProvider,
        filesetId: translation.audioFilesetId ?? undefined,
      },
    };
  }

  return {
    id: translation.id,
    hasAudio: translation.hasAudio,
    audioGranularity: translation.audioGranularity,
  };
}

export function createRemoteAudioMetadataResolverFromTranslations(
  translations: readonly BibleTranslation[]
): RemoteAudioMetadataResolver {
  const translationsById = new Map(
    translations.map((translation) => [translation.id, translation])
  );

  return (translationId) =>
    buildRemoteAudioMetadataFromTranslation(
      translationsById.get(translationId) ?? getTranslationById(translationId) ?? null
    );
}

const defaultRemoteAudioMetadataResolver: RemoteAudioMetadataResolver = (translationId) =>
  buildRemoteAudioMetadataFromTranslation(getTranslationById(translationId) ?? null);

let remoteAudioMetadataResolver: RemoteAudioMetadataResolver = defaultRemoteAudioMetadataResolver;

export function setRemoteAudioMetadataResolver(resolver: RemoteAudioMetadataResolver | null): void {
  remoteAudioMetadataResolver = resolver ?? defaultRemoteAudioMetadataResolver;
  audioUrlCache.clear();
}

export function syncRemoteAudioMetadataResolverWithTranslations(
  translations: readonly BibleTranslation[]
): void {
  setRemoteAudioMetadataResolver(createRemoteAudioMetadataResolverFromTranslations(translations));
}

function getCacheKey(
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): string {
  return `${translationId}_${bookId}_${chapter}_${verse ?? 'chapter'}`;
}

function resolveRemoteAudioMetadata(translationId: string): RemoteAudioMetadata | null {
  try {
    return remoteAudioMetadataResolver(translationId);
  } catch (error) {
    console.warn('[Audio] Failed to resolve remote audio metadata:', error);
    return null;
  }
}

function isRemoteAudioBookSupported(
  metadata: RemoteAudioMetadata,
  bookId: string | null | undefined
): boolean {
  if (!bookId) {
    return true;
  }

  const audio = metadata.audio;
  if (!audio) {
    return false;
  }

  const configuredBooks = audio.books ? Object.keys(audio.books) : [];
  if (configuredBooks.length > 0) {
    return configuredBooks.includes(bookId);
  }

  if (audio.coverage === 'new-testament') {
    return NEW_TESTAMENT_BOOK_IDS.has(bookId);
  }

  return true;
}

/**
 * Returns the first book (in canonical order) that the translation has audio for,
 * or null if it has no audio at all. Used so that selecting an audio-only
 * translation (e.g. a New-Testament-only translation such as Ahirani) while
 * reading an Old Testament chapter can jump the reader to the first chapter that
 * actually has audio, instead of failing with a misleading download error.
 */
export function getFirstAvailableAudioBook(translationId: string): string | null {
  const metadata = resolveRemoteAudioMetadata(translationId);
  if (!metadata?.hasAudio || !metadata.audio) {
    return null;
  }

  for (const book of bibleBooks) {
    if (isRemoteAudioBookSupported(metadata, book.id)) {
      return book.id;
    }
  }

  return null;
}

export function hasConfiguredTranslationAudio(translationId: string): boolean {
  return Boolean(resolveRemoteAudioMetadata(translationId)?.hasAudio);
}

export function getConfiguredAudioGranularity(
  translationId: string
): NonNullable<BibleTranslation['audioGranularity']> {
  return resolveRemoteAudioMetadata(translationId)?.audioGranularity ?? 'chapter';
}

export function getRemoteAudioFileExtension(translationId: string): string {
  return resolveRemoteAudioMetadata(translationId)?.fileExtension ?? 'mp3';
}

function buildStreamTemplateAudioUrl(
  baseUrl: string,
  chapterPathTemplate: string,
  bookId: string,
  chapter: number,
  verse?: number
): string | null {
  if (!baseUrl || !chapterPathTemplate) {
    return null;
  }

  if (!Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  const normalizedBaseUrl = resolveBibleAssetBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }

  const chapterPadded = String(chapter).padStart(2, '0');
  const versePadded = verse == null ? '' : String(verse).padStart(3, '0');
  const path = chapterPathTemplate
    .replaceAll('{bookId}', bookId)
    .replaceAll('{chapter}', String(chapter))
    .replaceAll('{chapterPadded}', chapterPadded)
    .replaceAll('{verse}', verse == null ? '' : String(verse))
    .replaceAll('{versePadded}', versePadded);

  if (
    !path ||
    Array.from(AUDIO_TEMPLATE_PLACEHOLDERS).every((placeholder) => !path.includes(placeholder))
  ) {
    return `${normalizedBaseUrl}/${path.replace(/^\/+/, '')}`;
  }

  return null;
}

function buildEbibleWebbeChapterAudioUrl(bookId: string, chapter: number): string | null {
  if (!Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  const bookPrefix = EBIBLE_WEBBE_BOOK_PREFIXES[bookId];
  if (!bookPrefix) {
    return null;
  }

  const chapterSegment =
    bookId === 'PSA' ? String(chapter).padStart(3, '0') : String(chapter).padStart(2, '0');

  return `${EBIBLE_WEBBE_AUDIO_BASE}/eng-webbe_${bookPrefix}_${chapterSegment}.mp3`;
}

function buildProviderChapterAudioUrl(
  provider: AudioProvider | undefined,
  bookId: string,
  chapter: number
): string | null {
  if (provider === 'ebible-webbe') {
    return buildEbibleWebbeChapterAudioUrl(bookId, chapter);
  }

  return null;
}

async function fetchBibleIsChapterAudio(
  filesetId: string | undefined,
  bookId: string,
  chapter: number,
  verse?: number
): Promise<RemoteAudioAsset | null> {
  if (!BIBLE_IS_API_KEY || !filesetId) {
    return null;
  }

  try {
    const bibleIsBookId = bookId;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(
      `${BIBLE_IS_API_BASE}/bibles/filesets/${filesetId}/${bibleIsBookId}/${chapter}?v=4&key=${BIBLE_IS_API_KEY}`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: BibleIsAudioResponse = await response.json();
    if (!data.data || data.data.length === 0) {
      return null;
    }

    const audioFile =
      verse == null
        ? data.data[0]
        : (data.data.find((file) => verse >= file.verse_start && verse <= file.verse_end) ??
          data.data[0]);

    return {
      url: audioFile.path,
      duration: audioFile.duration * 1000,
    };
  } catch (error) {
    console.error('Error fetching audio URL:', error);
    return null;
  }
}

export async function fetchRemoteChapterAudio(
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): Promise<RemoteAudioAsset | null> {
  const cacheKey = getCacheKey(translationId, bookId, chapter, verse);
  const cached = audioUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Evict oldest entries when cache is full
  if (audioUrlCache.size >= MAX_AUDIO_CACHE_SIZE) {
    const firstKey = audioUrlCache.keys().next().value;
    if (firstKey !== undefined) {
      audioUrlCache.delete(firstKey);
    }
  }

  const translation = resolveRemoteAudioMetadata(translationId);
  if (!translation?.hasAudio) {
    return null;
  }

  const audio = translation.audio;
  if (!audio || !isRemoteAudioBookSupported(translation, bookId)) {
    return null;
  }

  if (audio.strategy === 'stream-template') {
    const url = buildStreamTemplateAudioUrl(
      audio.baseUrl,
      audio.chapterPathTemplate,
      bookId,
      chapter,
      verse
    );
    if (!url) {
      return null;
    }

    const result = { url, duration: 0 };
    audioUrlCache.set(cacheKey, result);
    return result;
  }

  if (audio.strategy === 'audio-pack') {
    const resolvedDownloadUrl = resolveBibleAssetUrl(audio.downloadUrl);
    if (!resolvedDownloadUrl) {
      return null;
    }

    const result = { url: resolvedDownloadUrl, duration: 0 };
    audioUrlCache.set(cacheKey, result);
    return result;
  }

  if (audio.strategy === 'el-manifest') {
    if (!audio.manifestUrl || !audio.audioVersion || !audio.catalogBaseUrl) {
      return null;
    }

    let resolved: ElResolvedChapterAudio | null = null;
    try {
      resolved = await elManifestChapterResolver(
        {
          translationId,
          manifestUrl: audio.manifestUrl,
          audioVersion: audio.audioVersion,
          catalogBaseUrl: audio.catalogBaseUrl,
        },
        bookId,
        chapter
      );
    } catch (error) {
      // Verification/network failure degrades to "no audio" — never surface an error here.
      console.warn('[Audio] Failed to resolve EL manifest chapter audio:', error);
      return null;
    }

    if (!resolved?.url) {
      return null;
    }

    // EL manifest URLs are immutable, so caching the resolved chapter URL is safe.
    const result = { url: resolved.url, duration: resolved.durationMs ?? 0 };
    audioUrlCache.set(cacheKey, result);
    return result;
  }

  const providerUrl = buildProviderChapterAudioUrl(audio.provider, bookId, chapter);
  if (providerUrl) {
    const result = { url: providerUrl, duration: 0 };
    audioUrlCache.set(cacheKey, result);
    return result;
  }

  const bibleIsAudio = await fetchBibleIsChapterAudio(audio.filesetId, bookId, chapter, verse);
  if (bibleIsAudio) {
    audioUrlCache.set(cacheKey, bibleIsAudio);
  }

  return bibleIsAudio;
}

export function isRemoteAudioAvailable(translationId: string, bookId?: string | null): boolean {
  const translation = resolveRemoteAudioMetadata(translationId);
  if (!translation?.hasAudio) {
    return false;
  }

  const audio = translation.audio;
  if (!audio || !isRemoteAudioBookSupported(translation, bookId)) {
    return false;
  }

  if (audio.strategy === 'stream-template') {
    return Boolean(audio.baseUrl && audio.chapterPathTemplate);
  }

  if (audio.strategy === 'audio-pack') {
    return Boolean(audio.downloadUrl);
  }

  if (audio.strategy === 'el-manifest') {
    // Availability = the manifest is addressable. Whether a *specific* chapter exists is
    // determined at fetch time (manifest lookup), matching stream-template's coverage semantics.
    return Boolean(audio.manifestUrl && audio.audioVersion && audio.catalogBaseUrl);
  }

  if (audio.provider === 'ebible-webbe') {
    return true;
  }

  return Boolean(audio.filesetId && BIBLE_IS_API_KEY);
}

export function clearRemoteAudioCache(): void {
  audioUrlCache.clear();
}

export async function prefetchRemoteChapterAudio(
  translationId: string,
  bookId: string,
  startChapter: number,
  count: number = 3
): Promise<void> {
  const prefetchPromises: Promise<unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const chapter = startChapter + i;
    const cacheKey = getCacheKey(translationId, bookId, chapter);
    if (!audioUrlCache.has(cacheKey)) {
      prefetchPromises.push(fetchRemoteChapterAudio(translationId, bookId, chapter));
    }
  }

  await Promise.allSettled(prefetchPromises);
}
