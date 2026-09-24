// Import-graph guards for opening the reader. What the reader renders and does
// is covered by the BibleReaderScreen.*.render.test.tsx files; these two checks
// stay source-level because they are about which modules load on the open
// path, which rendering under mocks cannot observe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readerSource = readFileSync(
  fileURLToPath(new URL('./BibleReaderScreen.tsx', import.meta.url).href),
  'utf8'
);

test('BibleReaderScreen lazy-loads verse timestamps only when follow-along opens', () => {
  assert.equal(
    readerSource.includes("from '../../services/bible/verseTimestamps'"),
    false,
    'BibleReaderScreen should keep the large verse timestamp require map off the initial reader import path'
  );

  assert.match(
    readerSource,
    /import\('\.\.\/\.\.\/services\/bible\/verseTimestamps'\)/,
    'BibleReaderScreen should dynamically import the verse timestamp module when follow-along is requested'
  );
});

test('BibleReaderScreen avoids broad barrels on the reader open path', () => {
  for (const barrel of [
    "from '../../stores';",
    "from '../../hooks';",
    "from '../../components';",
  ]) {
    assert.equal(
      readerSource.includes(barrel),
      false,
      `BibleReaderScreen should not evaluate a whole barrel (${barrel}) before the reader can open`
    );
  }

  assert.match(
    readerSource,
    /from '\.\.\/\.\.\/stores\/bibleStore';/,
    'BibleReaderScreen should import its reader-critical stores directly'
  );

  assert.match(
    readerSource,
    /from '\.\.\/\.\.\/components\/skeleton\/VersesSkeleton';/,
    'BibleReaderScreen should import reader loading UI directly'
  );
});
