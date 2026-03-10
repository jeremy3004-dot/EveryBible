import { getTranslationById } from '../../constants';
import type { BibleIsAudioResponse } from '../../types';
import type { RemoteAudioAsset } from './audioDownloadService';

const BIBLE_IS_API_BASE = 'https://4.dbt.io/api';
const BIBLE_IS_API_KEY = process.env.EXPO_PUBLIC_BIBLE_IS_API_KEY || '';

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

const audioUrlCache = new Map<string, RemoteAudioAsset>();

function getCacheKey(
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): string {
  return `${translationId}_${bookId}_${chapter}_${verse ?? 'chapter'}`;
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

  if (!BIBLE_IS_API_KEY) {
    console.warn('Bible.is API key not configured. Audio playback unavailable.');
    return null;
  }

  try {
    const translation = getTranslationById(translationId);
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
  return Boolean(translation?.hasAudio && translation.audioFilesetId && BIBLE_IS_API_KEY);
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
