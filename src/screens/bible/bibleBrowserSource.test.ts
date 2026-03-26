import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('book-grid rows assign stable keys to rendered book cards', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /keyExtractor=\{\(item\) => item\.id\}/,
    'BibleBrowserScreen should give each rendered row a stable key via keyExtractor so the list does not emit React key warnings'
  );
});

test('Bible browser exposes a search input that drives the deferred query', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.equal(
    source.includes('TextInput'),
    true,
    'BibleBrowserScreen must render a TextInput for search'
  );

  assert.equal(
    source.includes('useDeferredValue'),
    true,
    'BibleBrowserScreen should defer the search query to avoid blocking the UI thread'
  );

  assert.equal(
    source.includes('searchBible'),
    true,
    'BibleBrowserScreen should call the searchBible service for full-text search'
  );
});

test('Bible browser handles all three search intent kinds in the render tree', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.equal(
    source.includes("searchIntent.kind === 'full-text'"),
    true,
    'BibleBrowserScreen should branch on full-text search intent'
  );

  assert.equal(
    source.includes("searchIntent.kind === 'reference'"),
    true,
    'BibleBrowserScreen should branch on reference search intent'
  );
});

test('Bible browser gates audio controls behind getAudioAvailability', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.equal(
    source.includes('getAudioAvailability'),
    true,
    'BibleBrowserScreen must use getAudioAvailability to resolve audio state'
  );

  assert.equal(
    source.includes('canManageAudio'),
    true,
    'BibleBrowserScreen should only render audio management controls when canManageAudio is true'
  );

  assert.equal(
    source.includes('canDownloadAudio'),
    true,
    'BibleBrowserScreen should check canDownloadAudio before enabling download actions'
  );
});

test('Bible browser translation selector can download runtime translations and filter by language', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.equal(
    source.includes('downloadTranslation'),
    true,
    'BibleBrowserScreen should wire the main translation selector to the store download action'
  );

  assert.equal(
    source.includes("reason === 'download-required'"),
    true,
    'BibleBrowserScreen should detect when a translation needs to be downloaded instead of treating it as coming soon'
  );

  assert.equal(
    source.includes('buildTranslationLanguageFilters'),
    true,
    'BibleBrowserScreen should build language filters for the translation selector'
  );

  assert.equal(
    source.includes('horizontal'),
    true,
    'BibleBrowserScreen should render the language picker as a horizontal scroller'
  );
});
