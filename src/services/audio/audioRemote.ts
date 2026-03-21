import { getBookById } from '../../constants/books';
import { getTranslationById } from '../../constants/translations';
import type { BibleIsAudioResponse } from '../../types';
import type { RemoteAudioAsset } from './audioDownloadService';

const BIBLE_IS_API_BASE = 'https://4.dbt.io/api';
const BIBLE_IS_API_KEY = process.env.EXPO_PUBLIC_BIBLE_IS_API_KEY || '';
const EBIBLE_WEBBE_AUDIO_BASE = 'https://ebible.org/eng-webbe/mp3';
const OPENBIBLE_BSB_SOUER_AUDIO_BASE = 'https://openbible.com/audio/souer';

const BOOK_ID_MAP: Record<string, string> = {
  GEN: 'GEN',
  EXO: 'EXO',
  LEV: 'LEV',
  NUM: 'NUM',
  DEU: 'DEU',
  JOS: 'JOS',
  JDG: 'JDG',
  RUT: 'RUT',
  '1SA': '1SA',
  '2SA': '2SA',
  '1KI': '1KI',
  '2KI': '2KI',
  '1CH': '1CH',
  '2CH': '2CH',
  EZR: 'EZR',
  NEH: 'NEH',
  EST: 'EST',
  JOB: 'JOB',
  PSA: 'PSA',
  PRO: 'PRO',
  ECC: 'ECC',
  SNG: 'SNG',
  ISA: 'ISA',
  JER: 'JER',
  LAM: 'LAM',
  EZK: 'EZK',
  DAN: 'DAN',
  HOS: 'HOS',
  JOL: 'JOL',
  AMO: 'AMO',
  OBA: 'OBA',
  JON: 'JON',
  MIC: 'MIC',
  NAM: 'NAM',
  HAB: 'HAB',
  ZEP: 'ZEP',
  HAG: 'HAG',
  ZEC: 'ZEC',
  MAL: 'MAL',
  MAT: 'MAT',
  MRK: 'MRK',
  LUK: 'LUK',
  JHN: 'JHN',
  ACT: 'ACT',
  ROM: 'ROM',
  '1CO': '1CO',
  '2CO': '2CO',
  GAL: 'GAL',
  EPH: 'EPH',
  PHP: 'PHP',
  COL: 'COL',
  '1TH': '1TH',
  '2TH': '2TH',
  '1TI': '1TI',
  '2TI': '2TI',
  TIT: 'TIT',
  PHM: 'PHM',
  HEB: 'HEB',
  JAS: 'JAS',
  '1PE': '1PE',
  '2PE': '2PE',
  '1JN': '1JN',
  '2JN': '2JN',
  '3JN': '3JN',
  JUD: 'JUD',
  REV: 'REV',
};

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

const audioUrlCache = new Map<string, RemoteAudioAsset>();

function getCacheKey(
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): string {
  return `${translationId}_${bookId}_${chapter}_${verse ?? 'chapter'}`;
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

function buildOpenBibleBsbSouerChapterAudioUrl(bookId: string, chapter: number): string | null {
  if (!Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  const book = getBookById(bookId);
  if (!book) {
    return null;
  }

  const orderSegment = String(book.order).padStart(2, '0');
  const bookSegment =
    /^[1-3][A-Z]{2}$/.test(bookId)
      ? `${bookId[0]}${bookId[1]}${bookId[2].toLowerCase()}`
      : `${bookId[0]}${bookId.slice(1).toLowerCase()}`;
  const chapterSegment = String(chapter).padStart(3, '0');

  return `${OPENBIBLE_BSB_SOUER_AUDIO_BASE}/BSB_${orderSegment}_${bookSegment}_${chapterSegment}.mp3`;
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

  const translation = getTranslationById(translationId);
  if (!translation?.hasAudio) {
    return null;
  }

  if (translation.audioProvider === 'openbible-bsb-souer') {
    const url = buildOpenBibleBsbSouerChapterAudioUrl(bookId, chapter);
    if (!url) {
      return null;
    }

    const result = {
      url,
      duration: 0,
    };

    audioUrlCache.set(cacheKey, result);
    return result;
  }

  if (translation.audioProvider === 'ebible-webbe') {
    const url = buildEbibleWebbeChapterAudioUrl(bookId, chapter);
    if (!url) {
      return null;
    }

    const result = {
      url,
      duration: 0,
    };

    audioUrlCache.set(cacheKey, result);
    return result;
  }

  if (!BIBLE_IS_API_KEY) {
    console.warn('Bible.is API key not configured. Audio playback unavailable.');
    return null;
  }

  try {
    const filesetId = translation?.audioFilesetId;
    if (!filesetId) {
      return null;
    }

    const bibleIsBookId = BOOK_ID_MAP[bookId] || bookId;
    const response = await fetch(
      `${BIBLE_IS_API_BASE}/bibles/filesets/${filesetId}/${bibleIsBookId}/${chapter}?v=4&key=${BIBLE_IS_API_KEY}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

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

    const result = {
      url: audioFile.path,
      duration: audioFile.duration * 1000,
    };

    audioUrlCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error fetching audio URL:', error);
    return null;
  }
}

export function isRemoteAudioAvailable(translationId: string): boolean {
  const translation = getTranslationById(translationId);
  if (!translation?.hasAudio) {
    return false;
  }

  if (
    translation.audioProvider === 'ebible-webbe' ||
    translation.audioProvider === 'openbible-bsb-souer'
  ) {
    return true;
  }

  return Boolean(translation.audioFilesetId && BIBLE_IS_API_KEY);
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
