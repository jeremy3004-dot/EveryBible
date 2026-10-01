/**
 * Hand-written copy for each /plans page: a short introduction, the passages
 * worth knowing in the schedule, and, where the snapshot's own description is
 * thin, a meta description. Website-only; the app never reads it. plan-copy.test.ts
 * checks every claim here against data/plans.json (the days and passages a
 * highlight names must really be in that plan's schedule).
 */
import { bibleChapterPath, SITE_BIBLE_BOOKS, type SiteBibleBook } from './bible-books';
import { PLAN_COPY_DATED } from './plan-copy-dated';
import { PLAN_COPY_SEASONS } from './plan-copy-seasons';
import { PLAN_COPY_STUDY } from './plan-copy-study';

/** One "What you'll read" item. */
export interface PlanHighlight {
  label: string;
  /** "Day 2", "Days 31–90", a weekday ("Friday") or, for the Twelve Days, "25 December". */
  days: string;
  /** Passages in the form parseHighlightRefs reads: "Psalm 23, John 10" or "Exodus – Deuteronomy". */
  refs: string;
}

export interface PlanCopy {
  /** Two or three short paragraphs. */
  intro: readonly string[];
  /** Three to five passages from the schedule. */
  highlights: readonly PlanHighlight[];
  /** Preferred over the snapshot description in search results; at most 155 characters. */
  metaDescription?: string;
}

export const PLAN_COPY: Readonly<Record<string, PlanCopy>> = {
  ...PLAN_COPY_STUDY,
  ...PLAN_COPY_SEASONS,
  ...PLAN_COPY_DATED,
};

export function getPlanCopy(slug: string): PlanCopy | undefined {
  return PLAN_COPY[slug];
}

/* ── Highlight references ───────────────────────────────────────── */

/** A passage ("Psalm 23", "Matthew 5:1–12", "Jude"), or a run of whole books ("Exodus – Deuteronomy"). */
export type HighlightRef =
  | {
      kind: 'passage';
      book: SiteBibleBook;
      /** Omitted when the whole book is meant. */
      chapter?: number;
      toChapter?: number;
      verse?: number;
      toVerse?: number;
    }
  | { kind: 'books'; from: SiteBibleBook; to: SiteBibleBook };

const psalms = SITE_BIBLE_BOOKS.find((book) => book.id === 'PSA')!;

/** Longest names first, so "1 John" is never read as "John". */
const BOOK_NAMES: readonly (readonly [string, SiteBibleBook])[] = [
  ...SITE_BIBLE_BOOKS.map((book) => [book.name, book] as const),
  ['Psalm', psalms] as const,
].sort((a, b) => b[0].length - a[0].length);

function matchBook(text: string): { book: SiteBibleBook; rest: string } | null {
  for (const [name, book] of BOOK_NAMES) {
    if (text === name) return { book, rest: '' };
    if (text.startsWith(`${name} `)) return { book, rest: text.slice(name.length + 1) };
  }
  return null;
}

const CHAPTERS = /^(\d+)(?:–(\d+))?$/;
const VERSES = /^(\d+):(\d+)(?:–(\d+))?$/;

function parseRef(item: string): HighlightRef {
  if (item.includes(' – ')) {
    const [from, to] = item.split(' – ').map(matchBook);
    if (!from || !to || from.rest || to.rest) throw new Error(`Bad book run “${item}”`);
    return { kind: 'books', from: from.book, to: to.book };
  }
  const match = matchBook(item);
  if (!match) throw new Error(`Unknown book in “${item}”`);
  if (!match.rest) return { kind: 'passage', book: match.book };
  const chapters = CHAPTERS.exec(match.rest);
  if (chapters) {
    const [, chapter, toChapter] = chapters;
    return {
      kind: 'passage',
      book: match.book,
      chapter: Number(chapter),
      toChapter: toChapter === undefined ? undefined : Number(toChapter),
    };
  }
  const verses = VERSES.exec(match.rest);
  if (!verses) throw new Error(`Bad passage “${item}”`);
  const [, chapter, verse, toVerse] = verses;
  return {
    kind: 'passage',
    book: match.book,
    chapter: Number(chapter),
    verse: Number(verse),
    toVerse: toVerse === undefined ? undefined : Number(toVerse),
  };
}

/** Parses a highlight's `refs`; throws on anything it cannot place in the Bible. */
export function parseHighlightRefs(refs: string): HighlightRef[] {
  return refs.split(', ').map(parseRef);
}

/**
 * The first reference as text and as a chapter link, plus the rest as plain text,
 * so a highlight links to where its passages start.
 */
export function highlightLink(refs: string): { first: string; rest: string; path: `/${string}` } {
  const [first, ...others] = refs.split(', ');
  const ref = parseRef(first);
  const path =
    ref.kind === 'books'
      ? bibleChapterPath(ref.from, 1)
      : bibleChapterPath(ref.book, ref.chapter ?? 1, ref.verse);
  return { first, rest: others.join(', '), path };
}
