import * as bibleDb from './bibleDatabase';
import { bibleBooks, getBookById } from '../../constants';
import type { BibleTranslation, DailyScripture, DailyScriptureReference, Verse } from '../../types';
import { loadBSBData } from './bsbData';
import { buildDailyScripture } from './presentation';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function initBibleData(): Promise<void> {
  if (isInitialized) return;

  // Prevent multiple simultaneous initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await bibleDb.initDatabase();

    // Check if we already have data
    const count = await bibleDb.getVerseCount();

    if (count < 20000) {
      // Load full BSB data
      await loadFullBSBData();
    }

    isInitialized = true;
  })();

  return initPromise;
}

async function loadFullBSBData(): Promise<void> {
  try {
    // Clear any existing partial data
    await bibleDb.clearVerses();

    // Load processed BSB data
    const bsbData = await loadBSBData();

    // Convert to our verse format and insert in batches
    const BATCH_SIZE = 1000;
    const verses = bsbData.verses;

    for (let i = 0; i < verses.length; i += BATCH_SIZE) {
      const batch = verses.slice(i, i + BATCH_SIZE).map((v) => ({
        bookId: v.b,
        chapter: v.c,
        verse: v.v,
        text: v.t,
        heading: v.h,
      }));

      await bibleDb.insertVerses(batch);
    }
  } catch (error) {
    console.error('[Bible] Failed to load BSB data:', error);
    throw error;
  }
}

export async function getChapter(bookId: string, chapter: number): Promise<Verse[]> {
  await initBibleData();
  return bibleDb.getChapter(bookId, chapter);
}

export async function searchBible(query: string): Promise<Verse[]> {
  await initBibleData();
  return bibleDb.searchVerses(query);
}

export function getBookInfo(bookId: string) {
  return getBookById(bookId);
}

export function getAllBooks() {
  return bibleBooks;
}

function getTodayReference(): DailyScriptureReference {
  // Get a verse based on the day of the year for variety
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Popular verses for verse of the day
  const popularVerses = [
    { bookId: 'JHN', chapter: 3, verse: 16 },
    { bookId: 'ROM', chapter: 8, verse: 28 },
    { bookId: 'PHP', chapter: 4, verse: 13 },
    { bookId: 'JER', chapter: 29, verse: 11 },
    { bookId: 'PSA', chapter: 23, verse: 1 },
    { bookId: 'PRO', chapter: 3, verse: 5 },
    { bookId: 'ISA', chapter: 40, verse: 31 },
    { bookId: 'MAT', chapter: 11, verse: 28 },
    { bookId: 'ROM', chapter: 12, verse: 2 },
    { bookId: 'GAL', chapter: 5, verse: 22 },
  ];

  return popularVerses[dayOfYear % popularVerses.length];
}

export async function getVerseOfTheDay(): Promise<Verse | null> {
  await initBibleData();

  const verseRef = getTodayReference();
  const verses = await getChapter(verseRef.bookId, verseRef.chapter);
  return verses.find((v) => v.verse === verseRef.verse) ?? verses[0] ?? null;
}

export async function getDailyScripture(
  translation: Pick<BibleTranslation, 'hasText' | 'hasAudio' | 'audioGranularity'>,
  audioAvailable: boolean
): Promise<DailyScripture> {
  const reference = getTodayReference();

  let verse: Verse | null = null;

  if (translation.hasText) {
    await initBibleData();
    const verses = await getChapter(reference.bookId, reference.chapter);
    verse = verses.find((item) => item.verse === reference.verse) ?? verses[0] ?? null;
  }

  return buildDailyScripture({
    reference,
    verse,
    translation,
    audioAvailable,
  });
}

export async function getLoadingProgress(): Promise<{ loaded: number; total: number }> {
  const count = await bibleDb.getVerseCount();
  return { loaded: count, total: 31086 };
}
