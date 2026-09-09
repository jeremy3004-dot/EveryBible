import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { bibleBooks } from './books';

async function loadVectors() {
  assert.ok(
    existsSync(new URL('./bookIconVectors.generated.json', import.meta.url)),
    'Native vector catalog must exist'
  );
  return import('./bookIcons');
}

const directory = new URL('../../assets/book-icons-vector/', import.meta.url);

test('every existing book-art placement uses the shared vector renderer and its own book ID', () => {
  const placements = [
    ['../screens/bible/BibleBrowserScreen.tsx', 'book.id'],
    ['../screens/bible/ChapterSelectorScreen.tsx', 'book.id'],
    ['../screens/bible/BibleReaderScreen.tsx', 'bookId'],
    ['../components/audio/AudioFirstChapterCard.tsx', 'bookId'],
    ['../components/bible/CompanionCard.tsx', 'item.target.bookId'],
  ];
  for (const [file, bookId] of placements) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(source.includes(`<BookIcon bookId={${bookId}}`), file);
    assert.doesNotMatch(source, /getBookIcon|assets\/book-icons\//, file);
  }
  const renderer = readFileSync(
    new URL('../components/bible/BookIcon.tsx', import.meta.url),
    'utf8'
  );
  assert.match(renderer, /color \?\? colors\.biblePrimaryText/);
});

test('all 66 books have a native vector icon and exactly 57 drawings are stored', async () => {
  const { BOOK_ICONS, getBookIcon } = await loadVectors();
  assert.equal(Object.keys(BOOK_ICONS).length, 66);
  assert.equal(new Set(Object.values(BOOK_ICONS)).size, 57);
  for (const book of bibleBooks) {
    const icon = getBookIcon(book.id);
    assert.ok(icon, book.id);
    assert.ok(icon.paths.length > 0, book.id);
    assert.equal(icon.viewBox, '0 0 768 768');
  }
});

test('numbered books share the exact drawing, while the Gospel of John stays distinct', async () => {
  const { getBookIcon } = await loadVectors();
  for (const suffix of ['SA', 'KI', 'CH', 'CO', 'TH', 'TI', 'PE', 'JN']) {
    assert.strictEqual(getBookIcon(`1${suffix}`), getBookIcon(`2${suffix}`));
  }
  assert.strictEqual(getBookIcon('1JN'), getBookIcon('3JN'));
  assert.notStrictEqual(getBookIcon('JHN'), getBookIcon('1JN'));
  assert.strictEqual(getBookIcon('gen'), getBookIcon('GEN'));
  assert.equal(getBookIcon('UNKNOWN'), null);
});

test('SVG assets are small, transparent, themeable vectors matching native path data', async () => {
  const { getBookIcon } = await loadVectors();
  const files = readdirSync(directory).filter((file) => file.endsWith('.svg'));
  assert.equal(files.length, 57);
  let total = 0;
  for (const file of files) {
    const url = new URL(file, directory);
    const bytes = statSync(url).size;
    total += bytes;
    assert.ok(bytes < 20000, `${file}: ${bytes} bytes`);
    const svg = readFileSync(url, 'utf8');
    assert.match(svg, /currentColor/);
    assert.doesNotMatch(
      svg,
      /<(?:image|rect|filter|mask|linearGradient|radialGradient|script)\b|base64|#[\da-f]{3,8}/i
    );
    const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(getBookIcon(file.slice(0, -4))?.paths, paths);
    assert.ok(paths.join('').match(/[a-z]/gi)!.length < 2000, `${file}: path complexity`);
  }
  assert.ok(total < 600000, `Set exceeds 600 KB: ${total}`);
});
