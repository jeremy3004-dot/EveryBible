// Startup import-graph guards for BibleBrowserScreen. These stay source checks
// because rendering cannot observe them: under the test loader a static import
// and a lazy `import()` produce the same screen. What they protect is the
// browser's first render on device — the SQLite search service and the shared
// translation picker (catalog + audio helpers) must not load until the user
// types a full-text query or opens the translation sheet. Behaviour (search,
// the lazily rendered picker, navigation) is covered by the
// BibleBrowserScreen.*.render.test.tsx files.
//
// The screen's sections, hooks and model live in ./browser, so the guard reads
// the screen and every non-test module there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');

const browserModules = readdirSync(fileURLToPath(new URL('./browser', import.meta.url).href))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name: `browser/${name}`, source: read(`./browser/${name}`) }));
const startupGraph = [
  { name: 'BibleBrowserScreen.tsx', source: read('./BibleBrowserScreen.tsx') },
  ...browserModules,
];

test('the guard reads the screen and its browser modules', () => {
  const names = startupGraph.map(({ name }) => name);
  for (const expected of ['browser/useBibleSearch.ts', 'browser/TranslationPickerSheet.tsx']) {
    assert.ok(names.includes(expected), `${expected} is part of the guarded graph`);
  }
});

test('the SQLite-backed search service loads only inside the debounced full-text search', () => {
  for (const { name, source } of startupGraph) {
    assert.doesNotMatch(
      source,
      /^(import|export)[^;]*from '(\.\.\/)+services\/bible\/bibleService';/m,
      `${name} must not statically import the search service`
    );
    assert.doesNotMatch(
      source,
      /from '(\.\.\/)+services\/bible\/bibleDatabase'/,
      `${name} must not import the database module just to classify search errors`
    );
  }
  assert.match(
    read('./browser/useBibleSearch.ts'),
    /const \{ searchBible \} = await import\('\.\.\/\.\.\/\.\.\/services\/bible\/bibleService'\);/
  );
});

test('the shared translation picker is imported only once the translation sheet opens', () => {
  for (const { name, source } of startupGraph) {
    assert.doesNotMatch(
      source,
      /^(import|export)[^;]*from '\.{1,2}\/TranslationPickerList';/m,
      `${name}: a static import pulls catalog and audio helpers into the browser first render`
    );
  }
  const sheet = read('./browser/TranslationPickerSheet.tsx');
  assert.match(sheet, /void import\('\.\.\/TranslationPickerList'\)\.then/);
  assert.match(
    sheet,
    /!visible \|\| TranslationPickerComponent/,
    'the dynamic import is gated on the sheet being opened'
  );
});
