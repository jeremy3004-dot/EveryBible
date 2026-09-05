import * as bibleDb from './bibleDatabase';
import { DEFAULT_MINIMUM_READY_VERSE_COUNT } from './bibleDatabase';
import { bibleBooks, getBookById } from '../../constants';
import type { BibleTranslation, DailyScripture, DailyScriptureReference, Verse } from '../../types';
import { getDailyScriptureReference, shouldLoadDailyScriptureText } from './dailyScripture';
import { buildDailyScripture } from './presentation';

let isInitialized = false;
let initPromise: Promise<void> | null = null;
// Kept in sync with bibleDatabase.ts's own readiness gate — this used to be a separately
// hardcoded 60000, which meant this startup path could declare the bundled DB "ready" at a
// verse count bibleDatabase.ts itself would reject.
const MIN_READY_VERSE_COUNT = DEFAULT_MINIMUM_READY_VERSE_COUNT;

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
      const status = await bibleDb.initDatabase(MIN_READY_VERSE_COUNT);
      const count = status.verseCount;

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
  return getDailyScriptureReference();
}

function getReferencePassageText(
  verses: Verse[],
  reference: DailyScriptureReference
): string | null {
  const startVerse = reference.verse;
  if (!startVerse) {
    return verses[0]?.text?.trim() ?? null;
  }

  const endVerse = reference.verseEnd ?? startVerse;
  const selectedVerses = verses.filter(
    (verse) => verse.verse >= startVerse && verse.verse <= endVerse
  );
  const passageText = selectedVerses
    .map((verse) => verse.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (passageText.length > 0) {
    return passageText;
  }

  return (
    verses.find((verse) => verse.verse === startVerse)?.text?.trim() ??
    verses[0]?.text?.trim() ??
    null
  );
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
    const passageText = getReferencePassageText(verses, reference);

    return buildDailyScripture({
      reference,
      verse,
      passageText,
      translation,
      audioAvailable,
    });
  }

  return buildDailyScripture({
    reference,
    verse,
    passageText: null,
    translation,
    audioAvailable,
  });
}
