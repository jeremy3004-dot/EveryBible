import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { buildBibleDeepLink, parseBibleDeepLink } from './deepLinkParser';
import { bibleBooks } from '../../constants/books';

// ---------------------------------------------------------------------------
// Randomised checks of the Bible deep-link parser and builder. Any installed app
// or web page can fire a com.everybible.app:// URL at us, so the parser sees
// arbitrary text; the builder feeds share sheets from persisted reader state.
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=20000 node --test --import tsx \
//     src/services/bible/deepLinkParser.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 500),
};

const SCHEME = 'com.everybible.app://';
const chaptersById = new Map(bibleBooks.map((book) => [book.id, book.chapters]));
const slugs = bibleBooks.map((book) => book.name.toLowerCase().replace(/\s/g, ''));

// Keys every plain object inherits: a lookup table built with `{}` answers them.
const PROTOTYPE_KEYS = [
  'constructor',
  '__proto__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
];

const segment = fc.oneof(
  fc.constantFrom(...slugs, ...PROTOTYPE_KEYS, 'psalm', 'bible', ''),
  fc.constantFrom('0', '-1', '1', '3', '16', '150', '9999', '1e3', '3.5', 'NaN', 'Infinity'),
  fc.constantFrom('%00', '%2F', '%252F', '%E0%A4%A', '%', '..', '.', ' ', '\u0000', '😀'),
  fc.nat({ max: Number.MAX_SAFE_INTEGER }).map(String),
  fc.string({ unit: 'binary', maxLength: 12 })
);

const hostilePath = fc.oneof(
  fc.array(segment, { maxLength: 6 }).map((parts) => `/bible/${parts.join('/')}`),
  fc.array(segment, { maxLength: 6 }).map((parts) => parts.join('/')),
  fc.string({ unit: 'binary', maxLength: 200 })
);

const assertWellFormedTarget = (path: string) => {
  const result = parseBibleDeepLink(path);
  if (result === null) {
    return;
  }
  const chapterCount = chaptersById.get(result.bookId);
  assert.ok(chapterCount, `${JSON.stringify(path)} opened unknown book ${String(result.bookId)}`);
  assert.ok(
    Number.isSafeInteger(result.chapter) && result.chapter >= 1 && result.chapter <= chapterCount,
    `${JSON.stringify(path)} opened chapter ${result.chapter} of ${result.bookId}`
  );
  if (result.verse !== undefined) {
    assert.ok(
      Number.isSafeInteger(result.verse) && result.verse >= 1,
      `${JSON.stringify(path)} focused verse ${result.verse}`
    );
  }
};

test('any path either opens a real chapter of a catalog book or nothing, and never throws', () => {
  fc.assert(fc.property(hostilePath, assertWellFormedTarget), FC_PARAMS);
});

test('a book slug that is an inherited object key opens nothing', () => {
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(parseBibleDeepLink(`/bible/${key}/1`), null, key);
    assert.equal(parseBibleDeepLink(`/bible/${key}/1/1`), null, key);
  }
});

test('a verse too large to be a real number is dropped rather than focused', () => {
  assert.deepEqual(parseBibleDeepLink(`/bible/john/3/${'9'.repeat(40)}`), {
    bookId: 'JHN',
    chapter: 3,
    verse: undefined,
  });
});

test('a very long path is rejected in linear time', () => {
  const started = Date.now();
  assert.equal(parseBibleDeepLink(`/bible/${'a'.repeat(500_000)}/1`), null);
  assert.equal(parseBibleDeepLink(`/bible/john/${'1'.repeat(500_000)}`), null);
  assert.ok(Date.now() - started < 1000);
});

const validTarget = fc.constantFrom(...bibleBooks).chain((book) =>
  fc.record({
    bookId: fc.constant(book.id),
    chapter: fc.integer({ min: 1, max: book.chapters }),
    verse: fc.option(fc.integer({ min: 1, max: 176 }), { nil: undefined }),
  })
);

test('every link the builder makes opens exactly the chapter and verse it was built for', () => {
  fc.assert(
    fc.property(validTarget, ({ bookId, chapter, verse }) => {
      const url = buildBibleDeepLink(bookId, chapter, verse);
      assert.ok(url.startsWith(SCHEME), url);
      assert.deepEqual(parseBibleDeepLink(url.slice(SCHEME.length)), { bookId, chapter, verse });
    }),
    FC_PARAMS
  );
});

test('the builder makes no link for a book id outside the catalog', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constantFrom(...PROTOTYPE_KEYS, 'jhn', 'JOHN', ''), fc.string({ maxLength: 8 })),
      fc.integer({ min: 1, max: 50 }),
      (bookId, chapter) => {
        fc.pre(!chaptersById.has(bookId));
        assert.equal(buildBibleDeepLink(bookId, chapter), '');
      }
    ),
    FC_PARAMS
  );
});

// Share sheets build links from persisted reader state; a link that cannot be
// opened again is worse than sharing the reference text alone.
test('the builder makes no link for a chapter the book does not have', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...bibleBooks),
      fc.oneof(
        fc.integer({ max: 0 }),
        fc.integer({ min: 151, max: 1_000_000 }),
        fc.double({ noInteger: true }),
        fc.constantFrom(Number.NaN, Infinity, -Infinity)
      ),
      (book, chapter) => {
        fc.pre(!(Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters));
        assert.equal(buildBibleDeepLink(book.id, chapter), '');
      }
    ),
    FC_PARAMS
  );
});

test('the builder leaves out a verse that is not a positive whole number', () => {
  for (const verse of [0, -3, 1.5, Number.NaN, Infinity]) {
    assert.equal(buildBibleDeepLink('JHN', 3, verse), `${SCHEME}bible/john/3`, String(verse));
  }
});

test('a chapter that is not a plain number opens nothing, rather than the number it starts with', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 21 }),
      fc.stringMatching(/^[^/?#\d][^/?#]{0,8}$/),
      (chapter, junk) => {
        assert.equal(parseBibleDeepLink(`/bible/john/${chapter}${junk}`), null);
        assert.equal(parseBibleDeepLink(`/bible/john/${chapter}${junk}/16`), null);
      }
    ),
    FC_PARAMS
  );
  for (const chapter of ['1.5', '3abc', '1e3', '3%20', '3 ', '+3', '0x3']) {
    assert.equal(parseBibleDeepLink(`/bible/john/${chapter}`), null, chapter);
  }
});

test('a verse range focuses its first verse, whichever way round it is written', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 176 }), fc.integer({ min: 1, max: 176 }), (a, b) => {
      assert.deepEqual(parseBibleDeepLink(`/bible/psalms/119/${a}-${b}`), {
        bookId: 'PSA',
        chapter: 119,
        verse: Math.min(a, b),
      });
    }),
    FC_PARAMS
  );
});

test('a verse that is not a number or range still opens the chapter, without a focus', () => {
  for (const verse of ['abc', '16abc', '1.5', '-3', '0', '0-0', '16-', '-16', '1e3', '16--18']) {
    assert.deepEqual(
      parseBibleDeepLink(`/bible/john/3/${verse}`),
      { bookId: 'JHN', chapter: 3, verse: undefined },
      verse
    );
  }
});

test('a trailing slash, query or fragment does not change the reference', () => {
  for (const suffix of ['/', '?utm=x', '#v16', '/?a=1', '/16?x=1', '/16#top', '/16/extra']) {
    const verse = suffix.startsWith('/16') ? 16 : undefined;
    assert.deepEqual(
      parseBibleDeepLink(`/bible/john/3${suffix}`),
      { bookId: 'JHN', chapter: 3, verse },
      suffix
    );
  }
});
