import assert from 'node:assert/strict';
import test from 'node:test';

import { bibleBookById, SITE_BIBLE_BOOKS } from './bible-books';
import {
  adjacentChapters,
  BIBLE_INDEX_DESCRIPTION,
  BIBLE_INDEX_TITLE,
  bibleBookDescription,
  bibleBookTitle,
  bibleBreadcrumbs,
  bibleBreadcrumbStructuredData,
  bibleChapterLabel,
  bibleChapterMetadata,
  bibleChapterTitle,
  buildBibleSitemap,
  prerenderedChapters,
} from './bible-pages';

const book = (id: string) => bibleBookById(id)!;

test('a single psalm is "Psalm 23"; other chapters use the book name', () => {
  assert.equal(bibleChapterLabel(book('PSA'), 23), 'Psalm 23');
  assert.equal(bibleChapterLabel(book('1CO'), 13), '1 Corinthians 13');
});

test('previous and next chapters cross book boundaries and stop at the ends', () => {
  const at = (id: string, chapter: number) => {
    const { previous, next } = adjacentChapters(book(id), chapter);
    return [
      previous && `${previous.book.id} ${previous.chapter}`,
      next && `${next.book.id} ${next.chapter}`,
    ];
  };
  assert.deepEqual(at('GEN', 1), [null, 'GEN 2']);
  assert.deepEqual(at('GEN', 50), ['GEN 49', 'EXO 1']);
  assert.deepEqual(at('MAT', 1), ['MAL 4', 'MAT 2']);
  assert.deepEqual(at('OBA', 1), ['AMO 9', 'JON 1']);
  assert.deepEqual(at('REV', 22), ['REV 21', null]);
});

test('titles fit in 60 characters and keep the reference and translation', () => {
  assert.equal(
    bibleChapterTitle(book('JHN'), 3),
    'John 3 — Berean Standard Bible (BSB) | EveryBible'
  );
  assert.equal(
    bibleChapterTitle(book('PSA'), 119),
    'Psalm 119 — Berean Standard Bible (BSB) | EveryBible'
  );
  for (const entry of SITE_BIBLE_BOOKS) {
    const titles = [bibleBookTitle(entry), bibleChapterTitle(entry, entry.chapters)];
    for (const title of titles) {
      assert.ok(title.length <= 60, title);
      assert.match(title, /Berean Standard Bible|\(BSB\)/, title);
    }
  }
  assert.ok(BIBLE_INDEX_TITLE.length <= 60);
  assert.ok(BIBLE_INDEX_DESCRIPTION.length <= 160);
  assert.match(bibleBookDescription(book('OBA')), /its one chapter/);
  assert.match(bibleBookDescription(book('GEN')), /all 50 chapters/);
  for (const entry of SITE_BIBLE_BOOKS)
    assert.ok(bibleBookDescription(entry).length <= 160, entry.id);
});

test('chapter metadata is canonical to its own path and carries the description', () => {
  const metadata = bibleChapterMetadata(book('JHN'), 3, 'Now there was a man of the Pharisees…');
  assert.deepEqual(metadata.alternates, { canonical: '/bible/john/3' });
  assert.equal(metadata.description, 'Now there was a man of the Pharisees…');
  assert.equal(metadata.openGraph?.url, '/bible/john/3');
});

test('the breadcrumb runs Home › Bible › book › chapter, with absolute URLs in JSON-LD', () => {
  const trail = bibleBreadcrumbs(book('PSA'), 23);
  assert.deepEqual(
    trail.map((entry) => entry.name),
    ['Home', 'Bible', 'Psalms', 'Psalm 23']
  );
  const data = bibleBreadcrumbStructuredData(trail);
  assert.equal(data['@type'], 'BreadcrumbList');
  assert.deepEqual(data.itemListElement.at(-1), {
    '@type': 'ListItem',
    position: 4,
    name: 'Psalm 23',
    item: 'https://everybible.app/bible/psalms/23',
  });
  assert.equal(data.itemListElement[0].item, 'https://everybible.app/');
});

test('about 150 well-known chapters are prerendered, each real and listed once', () => {
  const chapters = prerenderedChapters();
  const keys = chapters.map(({ book: entry, chapter }) => `${entry.id} ${chapter}`);
  assert.equal(chapters.length, 155);
  assert.equal(new Set(keys).size, keys.length);
  for (const { book: entry, chapter } of chapters)
    assert.ok(
      Number.isInteger(chapter) && chapter >= 1 && chapter <= entry.chapters,
      `${entry.id} ${chapter}`
    );
  for (const key of ['PSA 23', 'JHN 3', '1CO 13', 'JER 29', 'ISA 53', 'REV 22', 'GEN 1'])
    assert.ok(keys.includes(key), key);
});

test('the sitemap lists /bible, 66 books and all 1,189 chapters once each', () => {
  const urls = buildBibleSitemap().map((entry) => entry.url);
  assert.equal(urls.length, 1 + 66 + 1189);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls[0], 'https://everybible.app/bible');
  assert.ok(urls.includes('https://everybible.app/bible/song-of-songs'));
  assert.ok(urls.includes('https://everybible.app/bible/revelation/22'));
});
