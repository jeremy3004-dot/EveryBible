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

test('Bible browser modal picker shows a dismiss control and opens on the requested book', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /route\.name === 'BiblePicker'/,
    'BibleBrowserScreen should detect picker modal presentation from the route name so root BibleBrowser history does not masquerade as modal state'
  );

  assert.match(
    source,
    /name="close"/,
    'BibleBrowserScreen should render a close icon when presented as the picker modal'
  );

  assert.match(
    source,
    /initialBookId/,
    'BibleBrowserScreen should accept an initial book id so the picker can open on the current book'
  );

  assert.match(
    source,
    /const canOpenTranslationPicker =\s*!isPickerModal && config\.features\.multipleTranslations;/,
    'BibleBrowserScreen should hide the translation entry point when it is acting as the chapter picker modal'
  );

  assert.match(
    source,
    /navigation\.navigate\('BibleReader', params\);/,
    'BibleBrowserScreen should navigate back to BibleReader from picker selection so the destination reader stays in the normal tab stack'
  );

  assert.equal(
    source.includes("navigation.replace('BibleReader', params)"),
    false,
    'BibleBrowserScreen should not replace BiblePicker with BibleReader in-place because that can preserve modal presentation on iOS'
  );
});

test('Bible browser preserves the listen-or-read launch mode when opening a chapter from picker/search', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /preferredChapterLaunchMode/,
    'BibleBrowserScreen should read the preferred chapter launch mode from the bible store'
  );

  assert.match(
    source,
    /preferredMode:\s*preferredChapterLaunchMode/,
    'BibleBrowserScreen should forward preferredMode into BibleReader params so chapter switches preserve listen/read intent'
  );

  assert.match(
    source,
    /preferredChapterLaunchMode === 'listen' \? \{ autoplayAudio: true } : \{\}/,
    'BibleBrowserScreen should keep autoplayAudio when the preferred launch mode is listen'
  );
});

test('Bible browser debounces full-text search requests and ignores stale completions', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /BIBLE_SEARCH_DEBOUNCE_MS/,
    'BibleBrowserScreen should use a shared debounce window before issuing SQLite-backed full-text searches'
  );

  assert.match(
    source,
    /setTimeout\(/,
    'BibleBrowserScreen should debounce full-text search requests instead of starting a database query on every keystroke'
  );

  assert.match(
    source,
    /searchRequestIdRef/,
    'BibleBrowserScreen should track the latest search request so stale async completions do not overwrite newer results'
  );

  assert.match(
    source,
    /requestId === searchRequestIdRef\.current/,
    'BibleBrowserScreen should ignore outdated async search completions once a newer query has started'
  );
});

test('Bible browser shows a dedicated message when the selected translation does not support full-text search', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /BibleSearchUnavailableError/,
    'BibleBrowserScreen should distinguish unsupported full-text search from generic load failures'
  );

  assert.match(
    source,
    /t\('bible\.searchUnavailable'\)/,
    'BibleBrowserScreen should show a dedicated unsupported-search message when the current translation lacks full-text search'
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
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.equal(
    source.includes('getAudioAvailability'),
    true,
    'TranslationPickerList must use getAudioAvailability to resolve shared audio state'
  );

  assert.equal(
    source.includes('canManageAudio'),
    true,
    'TranslationPickerList should only render audio management controls when canManageAudio is true'
  );

  assert.equal(
    source.includes('canDownloadAudio'),
    true,
    'TranslationPickerList should check canDownloadAudio before enabling download actions'
  );
});

test('Bible browser translation selector is delegated to the shared picker', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.equal(
    source.includes('TranslationPickerList'),
    true,
    'BibleBrowserScreen should delegate the selector UI to TranslationPickerList so Bible and Settings stay aligned'
  );
});

test('Bible browser translation modal uses a fixed-height sheet for the shared picker', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /modalHeader:[\s\S]*marginBottom:\s*spacing\.xs/,
    'BibleBrowserScreen should keep only a small gap between the translation title and the language tabs'
  );

  assert.match(
    source,
    /modalContent:[\s\S]*paddingTop:\s*layout\.denseCardPadding,[\s\S]*height:\s*'60%'/,
    'BibleBrowserScreen should keep the translation modal at a compact fixed height so the picker does not collapse to the bottom'
  );

  assert.match(
    source,
    /modalContent:[\s\S]*overflow:\s*'hidden'/,
    'BibleBrowserScreen should clip the translation modal contents instead of letting the picker resize the sheet'
  );
});

test('Bible browser and settings translation screens share the same picker implementation', () => {
  const bibleSource = readRelativeSource('./BibleBrowserScreen.tsx');
  const settingsSource = readRelativeSource('../more/TranslationBrowserScreen.tsx');

  assert.equal(
    bibleSource.includes('TranslationPickerList'),
    true,
    'BibleBrowserScreen should render the shared TranslationPickerList so its behavior stays aligned with Settings'
  );

  assert.equal(
    settingsSource.includes('TranslationPickerList'),
    true,
    'TranslationBrowserScreen should render the shared TranslationPickerList so its behavior stays aligned with Bible'
  );
});
