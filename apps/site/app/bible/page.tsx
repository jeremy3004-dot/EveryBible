import type { Metadata } from 'next';

import { BibleAppSection, BibleAttribution, BibleLayout } from '../../components/bible/BibleLayout';
import { BIBLE_PATH, bibleBookPath, SITE_BIBLE_BOOKS, type Testament } from '../../lib/bible-books';
import {
  BIBLE_INDEX_DESCRIPTION,
  BIBLE_INDEX_TITLE,
  bibleBreadcrumbs,
  bibleBreadcrumbStructuredData,
} from '../../lib/bible-pages';
import { pageMetadata, serializeJsonLd } from '../../lib/site-metadata';
import './bible.css';

export const metadata: Metadata = pageMetadata({
  title: BIBLE_INDEX_TITLE,
  description: BIBLE_INDEX_DESCRIPTION,
  path: BIBLE_PATH,
});

const TESTAMENTS: readonly { testament: Testament; name: string }[] = [
  { testament: 'OT', name: 'Old Testament' },
  { testament: 'NT', name: 'New Testament' },
];

export default function BiblePage() {
  const trail = bibleBreadcrumbs();
  return (
    <BibleLayout
      trail={trail}
      eyebrow="Berean Standard Bible"
      title="Read the Bible"
      intro="All 66 books of the Berean Standard Bible (BSB), free to read here and in the EveryBible app, where you can also read offline and listen."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(bibleBreadcrumbStructuredData(trail)) }}
      />

      {TESTAMENTS.map(({ testament, name }) => {
        const books = SITE_BIBLE_BOOKS.filter((book) => book.testament === testament);
        const id = `${testament.toLowerCase()}-heading`;
        return (
          <section key={testament} aria-labelledby={id}>
            <h2 id={id}>
              {name} <span className="bible-count">{books.length} books</span>
            </h2>
            <ul className="bible-books">
              {books.map((book) => (
                <li key={book.id}>
                  <a href={bibleBookPath(book)}>{book.name}</a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <BibleAppSection subject="the whole Bible" />
      <BibleAttribution />
    </BibleLayout>
  );
}
