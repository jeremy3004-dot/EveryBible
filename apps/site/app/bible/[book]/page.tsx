import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  BibleAppSection,
  BibleAttribution,
  BibleLayout,
} from '../../../components/bible/BibleLayout';
import { bibleBookBySlug, bibleChapterPath, SITE_BIBLE_BOOKS } from '../../../lib/bible-books';
import {
  bibleBookMetadata,
  bibleBreadcrumbs,
  bibleBreadcrumbStructuredData,
  bibleChapterLabel,
} from '../../../lib/bible-pages';
import { serializeJsonLd } from '../../../lib/site-metadata';
import '../bible.css';

/** All 66 books are built ahead of time and read no Bible text; any other slug is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_BIBLE_BOOKS.map(({ slug }) => ({ book: slug }));
}

interface BookRouteProps {
  params: Promise<{ book: string }>;
}

export async function generateMetadata({ params }: BookRouteProps): Promise<Metadata> {
  const book = bibleBookBySlug((await params).book);
  if (!book) notFound();
  return bibleBookMetadata(book);
}

export default async function BibleBookPage({ params }: BookRouteProps) {
  const book = bibleBookBySlug((await params).book);
  if (!book) notFound();

  const trail = bibleBreadcrumbs(book);
  const chapters = Array.from({ length: book.chapters }, (_, index) => index + 1);
  return (
    <BibleLayout
      trail={trail}
      eyebrow="Berean Standard Bible"
      title={book.name}
      intro={
        book.chapters === 1
          ? `${book.name} is a single chapter. Read it free in the Berean Standard Bible.`
          : `${book.name} has ${book.chapters} chapters. Choose one to read it free in the Berean Standard Bible.`
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(bibleBreadcrumbStructuredData(trail)) }}
      />

      <section aria-labelledby="chapters-heading">
        <h2 id="chapters-heading">Chapters</h2>
        <ol className="bible-chapter-grid">
          {chapters.map((chapter) => (
            <li key={chapter}>
              {/* The number alone is ambiguous out of context, so links are named in full. */}
              <a
                href={bibleChapterPath(book, chapter)}
                aria-label={bibleChapterLabel(book, chapter)}
              >
                {chapter}
              </a>
            </li>
          ))}
        </ol>
      </section>

      <BibleAppSection subject={book.name} />
      <BibleAttribution />
    </BibleLayout>
  );
}
