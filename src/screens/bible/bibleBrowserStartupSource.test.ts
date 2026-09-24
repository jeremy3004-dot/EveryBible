// Startup import-graph guards for BibleBrowserScreen. These stay source checks
// because rendering cannot observe them: under the test loader a static import
// and a lazy `import()` produce the same screen. What they protect is the
// browser's first render on device — the SQLite search service and the shared
// translation picker (catalog + audio helpers) must not load until the user
// types a full-text query or opens the translation sheet. Behaviour (search,
// the lazily rendered picker, navigation) is covered by
// BibleBrowserScreen.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./BibleBrowserScreen.tsx', import.meta.url).href),
  'utf8'
);

test('the SQLite-backed search service loads only inside the debounced full-text search', () => {
  assert.doesNotMatch(
    source,
    /^import[^;]*from '\.\.\/\.\.\/services\/bible\/bibleService';/m,
    'BibleBrowserScreen must not statically import the search service'
  );
  assert.doesNotMatch(
    source,
    /from '\.\.\/\.\.\/services\/bible\/bibleDatabase'/,
    'BibleBrowserScreen must not import the database module just to classify search errors'
  );
  assert.match(
    source,
    /const \{ searchBible \} = await import\('\.\.\/\.\.\/services\/bible\/bibleService'\);/
  );
});

test('the shared translation picker is imported only once the translation sheet opens', () => {
  assert.doesNotMatch(
    source,
    /^import[^;]*from '\.\/TranslationPickerList';/m,
    'a static import pulls catalog and audio helpers into the browser first render'
  );
  assert.match(source, /void import\('\.\/TranslationPickerList'\)\.then/);
  assert.match(
    source,
    /!showTranslationModal \|\| TranslationPickerComponent/,
    'the dynamic import is gated on the sheet being opened'
  );
});
