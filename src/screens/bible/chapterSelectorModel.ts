import type { BibleBook } from '../../constants/books';
import { getBibleBookExperienceContent } from '../../data/bibleBookExperience';

export const CHAPTER_GRID_COLUMNS = 5;
export const CHAPTER_GRID_HORIZONTAL_PADDING = 72;
export const CHAPTER_GRID_ROW_GAP = 8;
const BOOK_HUB_ACCENT_COLOR = '#C0392B';
const BOOK_HUB_ICON_TINT = '#f5f2ea';
export type ChapterLaunchMode = 'listen' | 'read';

export interface BookHubPresentation {
  artworkVariant: string;
  summary: string;
  introLabel: string | null;
  introState: 'ready' | 'coming-soon' | 'unavailable';
  continueChapter: number;
  completedChapters: number[];
  palette: {
    gradient: readonly [string, string];
    accent: string;
    tint: string;
  };
}

interface BuildBookHubPresentationInput {
  book: BibleBook;
  chaptersRead: Record<string, number>;
  currentBookId: string;
  currentChapter: number;
}

export function getChapterGridItemSize(windowWidth: number) {
  return (windowWidth - CHAPTER_GRID_HORIZONTAL_PADDING) / CHAPTER_GRID_COLUMNS;
}

export function buildChapterGridRows(chapterCount: number) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => index + 1);
  const rows: number[][] = [];

  for (let index = 0; index < chapters.length; index += CHAPTER_GRID_COLUMNS) {
    rows.push(chapters.slice(index, index + CHAPTER_GRID_COLUMNS));
  }

  return rows;
}

export function buildBookHubPresentation({
  book,
  chaptersRead,
  currentBookId,
  currentChapter,
}: BuildBookHubPresentationInput): BookHubPresentation {
  const seededContent = getBibleBookExperienceContent(book.id);
  const completedChapters = getCompletedChapters(book.id, chaptersRead, book.chapters);
  const continueChapter = getContinueChapter({
    bookId: book.id,
    chapterCount: book.chapters,
    currentBookId,
    currentChapter,
    completedChapters,
  });

  return {
    artworkVariant: seededContent?.artworkVariant ?? getFallbackArtworkVariant(book.order),
    summary: seededContent?.synopsis ?? buildFallbackSummary(book),
    introLabel: seededContent?.introAudioLabel ?? `${book.name} overview coming soon`,
    introState: seededContent?.introAudioState ?? 'coming-soon',
    continueChapter,
    completedChapters,
    palette: getBookHubPalette(book),
  };
}

export function buildChapterLaunchParams(
  bookId: string,
  chapter: number,
  preferredMode: ChapterLaunchMode
) {
  return {
    bookId,
    chapter,
    ...(preferredMode === 'listen' ? { autoplayAudio: true } : {}),
    preferredMode,
  };
}

function getContinueChapter({
  bookId,
  chapterCount,
  currentBookId,
  currentChapter,
  completedChapters,
}: {
  bookId: string;
  chapterCount: number;
  currentBookId: string;
  currentChapter: number;
  completedChapters: number[];
}) {
  if (currentBookId === bookId && currentChapter >= 1 && currentChapter <= chapterCount) {
    return currentChapter;
  }

  const lastCompletedChapter = completedChapters.at(-1);
  if (lastCompletedChapter) {
    return lastCompletedChapter;
  }

  return 1;
}

function getCompletedChapters(
  bookId: string,
  chaptersRead: Record<string, number>,
  chapterCount: number
) {
  return Object.entries(chaptersRead)
    .filter(([key]) => key.startsWith(`${bookId}_`))
    .map(([key, timestamp]) => ({
      chapter: Number(key.split('_')[1]),
      timestamp,
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.chapter) && entry.chapter >= 1 && entry.chapter <= chapterCount
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => entry.chapter);
}

function buildFallbackSummary(book: BibleBook) {
  const testamentLabel = book.testament === 'NT' ? 'New Testament' : 'Old Testament';
  const chapterLabel = book.chapters === 1 ? 'chapter' : 'chapters';

  return `${book.name} offers ${book.chapters} ${chapterLabel} of ${testamentLabel} Scripture. Start at chapter 1 or jump back into the chapter that matches your reading rhythm.`;
}

function getFallbackArtworkVariant(order: number) {
  const variants = ['sunrise', 'river', 'midnight', 'meadow', 'ember'] as const;
  return variants[order % variants.length];
}

function getBookHubPalette(_book: BibleBook) {
  return {
    gradient: [BOOK_HUB_ACCENT_COLOR, BOOK_HUB_ACCENT_COLOR] as const,
    accent: BOOK_HUB_ACCENT_COLOR,
    tint: BOOK_HUB_ICON_TINT,
  };
}
