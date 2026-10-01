/**
 * Titles, descriptions, structured data, sitemap and the prerendered set for
 * the /bible reading pages. Pure: the chapter text comes in from the caller.
 */
import type { Metadata, MetadataRoute } from 'next';

import {
  BIBLE_PATH,
  bibleBookById,
  bibleBookPath,
  bibleChapterPath,
  SITE_BIBLE_BOOKS,
  type SiteBibleBook,
} from './bible-books';
import { EVERYBIBLE_SITE_URL } from './site-links';
import { pageMetadata, SITE_NAME } from './site-metadata';

export const BIBLE_TRANSLATION_NAME = 'Berean Standard Bible';
export const BIBLE_TRANSLATION_ABBREVIATION = 'BSB';

/** berean.bible/licensing.htm: placed in the public domain as of April 30, 2023. */
export const BIBLE_TRANSLATION_URL = 'https://berean.bible/';
export const BIBLE_PUBLIC_DOMAIN_DATE = 'April 30, 2023';

/** Last change to the text or the page structure; the sitemap's lastmod. */
export const BIBLE_PAGES_UPDATED = '2026-10-01';

export const BIBLE_INDEX_TITLE = `Read the ${BIBLE_TRANSLATION_NAME} online | ${SITE_NAME}`;
export const BIBLE_INDEX_DESCRIPTION = `Read all 66 books of the ${BIBLE_TRANSLATION_NAME} (${BIBLE_TRANSLATION_ABBREVIATION}) free online, then read offline and listen in the free EveryBible app for iPhone and Android.`;

/** Search results cut titles at about 60 characters. */
const TITLE_MAX_LENGTH = 60;

function firstThatFits(candidates: readonly string[]): string {
  return candidates.find((candidate) => candidate.length <= TITLE_MAX_LENGTH) ?? candidates.at(-1)!;
}

/** "John 3", but "Psalm 23": one psalm is singular, the book is Psalms. */
export function bibleChapterLabel(book: SiteBibleBook, chapter: number): string {
  return `${book.id === 'PSA' ? 'Psalm' : book.name} ${chapter}`;
}

export interface ChapterRef {
  book: SiteBibleBook;
  chapter: number;
}

/** The chapters either side in canonical order, across book boundaries. */
export function adjacentChapters(
  book: SiteBibleBook,
  chapter: number
): { previous: ChapterRef | null; next: ChapterRef | null } {
  const index = SITE_BIBLE_BOOKS.indexOf(book);
  const before = SITE_BIBLE_BOOKS[index - 1];
  const after = SITE_BIBLE_BOOKS[index + 1];
  return {
    previous:
      chapter > 1
        ? { book, chapter: chapter - 1 }
        : before
          ? { book: before, chapter: before.chapters }
          : null,
    next:
      chapter < book.chapters
        ? { book, chapter: chapter + 1 }
        : after
          ? { book: after, chapter: 1 }
          : null,
  };
}

export function bibleChapterTitle(book: SiteBibleBook, chapter: number): string {
  const label = bibleChapterLabel(book, chapter);
  return firstThatFits([
    `${label} — ${BIBLE_TRANSLATION_NAME} (${BIBLE_TRANSLATION_ABBREVIATION}) | ${SITE_NAME}`,
    `${label} — ${BIBLE_TRANSLATION_NAME} | ${SITE_NAME}`,
    `${label} (${BIBLE_TRANSLATION_ABBREVIATION}) | ${SITE_NAME}`,
  ]);
}

export function bibleBookTitle(book: SiteBibleBook): string {
  return firstThatFits([
    `${book.name} — ${BIBLE_TRANSLATION_NAME} (${BIBLE_TRANSLATION_ABBREVIATION}) | ${SITE_NAME}`,
    `${book.name} — ${BIBLE_TRANSLATION_NAME} | ${SITE_NAME}`,
  ]);
}

export function bibleBookDescription(book: SiteBibleBook): string {
  const chapters = book.chapters === 1 ? 'its one chapter' : `all ${book.chapters} chapters`;
  return `Read ${book.name} in the ${BIBLE_TRANSLATION_NAME} (${BIBLE_TRANSLATION_ABBREVIATION}) free online, ${chapters}, and listen in the free EveryBible app.`;
}

/** `description` is the chapter's opening verses (chapterDescription). */
export function bibleChapterMetadata(
  book: SiteBibleBook,
  chapter: number,
  description: string
): Metadata {
  return pageMetadata({
    title: bibleChapterTitle(book, chapter),
    description,
    path: bibleChapterPath(book, chapter),
  });
}

export function bibleBookMetadata(book: SiteBibleBook): Metadata {
  return pageMetadata({
    title: bibleBookTitle(book),
    description: bibleBookDescription(book),
    path: bibleBookPath(book),
  });
}

export interface BreadcrumbEntry {
  name: string;
  path: `/${string}`;
}

/** Home › Bible › John › John 3; the last entry is the page itself. */
export function bibleBreadcrumbs(book?: SiteBibleBook, chapter?: number): BreadcrumbEntry[] {
  const trail: BreadcrumbEntry[] = [
    { name: 'Home', path: '/' },
    { name: 'Bible', path: BIBLE_PATH },
  ];
  if (book) trail.push({ name: book.name, path: bibleBookPath(book) });
  if (book && chapter)
    trail.push({ name: bibleChapterLabel(book, chapter), path: bibleChapterPath(book, chapter) });
  return trail;
}

/** schema.org BreadcrumbList for the same trail. */
export function bibleBreadcrumbStructuredData(trail: readonly BreadcrumbEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: new URL(entry.path, EVERYBIBLE_SITE_URL).toString(),
    })),
  };
}

/**
 * The most-read chapters, built ahead of time. Every other chapter renders on
 * its first request and is then cached, which keeps the build short.
 */
const PRERENDERED: Readonly<Record<string, readonly number[]>> = {
  GEN: [1, 2, 3, 12, 22, 50],
  EXO: [3, 14, 20],
  LEV: [19],
  NUM: [6],
  DEU: [6, 28, 31],
  JOS: [1],
  RUT: [1],
  '1SA': [17],
  '2CH': [7],
  EST: [4],
  JOB: [1, 38],
  PSA: [
    1, 8, 19, 23, 27, 32, 34, 37, 46, 51, 62, 63, 84, 90, 91, 100, 103, 107, 118, 119, 121, 139,
    145, 150,
  ],
  PRO: [3, 16, 31],
  ECC: [3],
  ISA: [6, 9, 26, 40, 41, 43, 53, 55, 61],
  JER: [1, 29, 33],
  LAM: [3],
  EZK: [36, 37],
  DAN: [3, 6],
  JOL: [2],
  MIC: [6],
  HAB: [3],
  ZEP: [3],
  MAL: [3],
  MAT: [1, 2, 5, 6, 7, 11, 24, 25, 26, 27, 28],
  MRK: [1, 16],
  LUK: [1, 2, 10, 15, 23, 24],
  JHN: [1, 3, 4, 6, 10, 11, 13, 14, 15, 16, 17, 20, 21],
  ACT: [1, 2, 9],
  ROM: [1, 3, 5, 6, 8, 10, 12, 13],
  '1CO': [10, 13, 15],
  '2CO': [4, 5, 12],
  GAL: [2, 5],
  EPH: [1, 2, 4, 5, 6],
  PHP: [1, 2, 3, 4],
  COL: [1, 3],
  '1TH': [4, 5],
  '2TI': [1, 3],
  TIT: [2],
  HEB: [4, 11, 12],
  JAS: [1, 2, 4],
  '1PE': [1, 5],
  '1JN': [1, 3, 4],
  JUD: [1],
  REV: [1, 3, 12, 21, 22],
};

export function prerenderedChapters(): ChapterRef[] {
  return Object.entries(PRERENDERED).flatMap(([id, chapters]) => {
    const book = bibleBookById(id)!;
    return chapters.map((chapter) => ({ book, chapter }));
  });
}

/** /bible, every book and all 1,189 chapters: well inside one 50,000-URL sitemap. */
export function buildBibleSitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(BIBLE_PAGES_UPDATED);
  const url = (path: string) => new URL(path, EVERYBIBLE_SITE_URL).toString();
  return [
    { url: url(BIBLE_PATH), lastModified, changeFrequency: 'monthly', priority: 0.8 },
    ...SITE_BIBLE_BOOKS.flatMap((book) => [
      {
        url: url(bibleBookPath(book)),
        lastModified,
        changeFrequency: 'yearly' as const,
        priority: 0.6,
      },
      ...Array.from({ length: book.chapters }, (_, index) => ({
        url: url(bibleChapterPath(book, index + 1)),
        lastModified,
        changeFrequency: 'yearly' as const,
        priority: 0.5,
      })),
    ]),
  ];
}
