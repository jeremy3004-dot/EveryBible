import * as bibleDb from './bibleDatabase';
import { bibleBooks, getBookById } from '../../constants';
import type { BibleTranslation, DailyScripture, DailyScriptureReference, Verse } from '../../types';
import { shouldLoadDailyScriptureText } from './dailyScripture';
import { buildDailyScripture } from './presentation';

let isInitialized = false;
let initPromise: Promise<void> | null = null;
const MIN_READY_VERSE_COUNT = 60000;

export async function isBibleDataReady(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  try {
    const status = await bibleDb.inspectBundledDatabaseStatus(MIN_READY_VERSE_COUNT);
    const ready = status.ready;

    if (ready) {
      isInitialized = true;
    }

    return ready;
  } catch (error) {
    console.warn('[Bible] Failed to inspect bundled database readiness:', error);
    return false;
  }
}

export async function initBibleData(): Promise<void> {
  if (isInitialized) return;

  // Prevent multiple simultaneous initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await bibleDb.initDatabase(MIN_READY_VERSE_COUNT);
      const count = await bibleDb.getVerseCount();

      if (count < MIN_READY_VERSE_COUNT) {
        throw new Error(
          `[Bible] Bundled database is not ready (${count}/${MIN_READY_VERSE_COUNT})`
        );
      }

      isInitialized = true;
    } catch (error) {
      isInitialized = false;
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function getChapter(
  translationId: string,
  bookId: string,
  chapter: number
): Promise<Verse[]> {
  await initBibleData();
  return bibleDb.getChapter(translationId, bookId, chapter);
}

export async function searchBible(translationId: string, query: string): Promise<Verse[]> {
  await initBibleData();
  return bibleDb.searchVerses(translationId, query);
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

export async function getVerseOfTheDay(translationId = 'bsb'): Promise<Verse | null> {
  await initBibleData();

  const verseRef = getTodayReference();
  const verses = await getChapter(translationId, verseRef.bookId, verseRef.chapter);
  return verses.find((v) => v.verse === verseRef.verse) ?? verses[0] ?? null;
}

export async function getDailyScripture(
  translation: Pick<BibleTranslation, 'id' | 'hasText' | 'hasAudio' | 'audioGranularity'>,
  audioAvailable: boolean,
  options?: { allowInitialization?: boolean }
): Promise<DailyScripture> {
  const reference = getTodayReference();
  const allowInitialization = options?.allowInitialization ?? true;

  let verse: Verse | null = null;
  const bibleReady = await isBibleDataReady();

  if (
    shouldLoadDailyScriptureText({
      translationHasText: translation.hasText,
      isBibleReady: bibleReady,
      allowInitialization,
    })
  ) {
    if (!bibleReady) {
      await initBibleData();
    }

    const verses = await getChapter(translation.id, reference.bookId, reference.chapter);
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
  return { loaded: count, total: 62184 };
}
