import type { BibleBook } from '../../constants/books';
import { getBibleBookExperienceContent } from '../../data/bibleBookExperience';

export const CHAPTER_GRID_COLUMNS = 5;
export const CHAPTER_GRID_HORIZONTAL_PADDING = 72;
export const CHAPTER_GRID_ROW_GAP = 8;
export type ChapterLaunchMode = 'listen' | 'read';

export interface BookHubPresentation {
  artworkVariant: string;
  summary: string;
  introLabel: string | null;
  introState: 'ready' | 'coming-soon' | 'unavailable';
  continueChapter: number;
  chaptersReadCount: number;
  completedChapters: number[];
  progressRatio: number;
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
    chaptersReadCount: completedChapters.length,
    completedChapters,
    progressRatio: book.chapters === 0 ? 0 : completedChapters.length / book.chapters,
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

function getBookHubPalette(book: BibleBook) {
  const palettes =
    book.testament === 'NT'
      ? ([
          { gradient: ['#304a78', '#7e6db3'], accent: '#f3d28b', tint: '#d7e8ff' },
          { gradient: ['#4a375f', '#b16372'], accent: '#f3d28b', tint: '#f9dde3' },
          { gradient: ['#214f5d', '#5f8c91'], accent: '#f7c95f', tint: '#d8f0ef' },
        ] as const)
      : ([
          { gradient: ['#5a3b2f', '#936142'], accent: '#f0c78d', tint: '#f7e6d0' },
          { gradient: ['#3f4c2f', '#7b8350'], accent: '#f0d38a', tint: '#ebf2cf' },
          { gradient: ['#4a394f', '#74627d'], accent: '#e3c38f', tint: '#eadcf1' },
        ] as const);

  return palettes[book.order % palettes.length];
}
