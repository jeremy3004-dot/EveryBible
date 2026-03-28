import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('shared translation picker can filter by language and download runtime translations', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.equal(
    source.includes('buildTranslationLanguageFilters'),
    true,
    'TranslationPickerList should build the shared language pills for both Bible and Settings'
  );

  assert.equal(
    source.includes('filterTranslationsByLanguage'),
    true,
    'TranslationPickerList should filter visible translations through the shared model'
  );

  assert.equal(
    source.includes('downloadTranslation'),
    true,
    'TranslationPickerList should wire the shared selector to the store download action'
  );

  assert.equal(
    source.includes("reason === 'download-required'"),
    true,
    'TranslationPickerList should detect when a runtime translation needs downloading instead of treating it as coming soon'
  );

  assert.equal(
    source.includes('ensureRuntimeCatalogLoaded'),
    true,
    'TranslationPickerList should hydrate the runtime catalog on mount so fresh installs do not leave cloud translations stuck as coming soon'
  );

  assert.equal(
    source.includes('getVisibleTranslationsForPicker'),
    true,
    'TranslationPickerList should hide unreadable runtime placeholders while the runtime catalog is still hydrating'
  );

  assert.equal(
    source.includes('horizontal'),
    true,
    'TranslationPickerList should render the language pills in a horizontal scroller'
  );

  assert.equal(
    source.includes('downloadAudioForBooks'),
    true,
    'TranslationPickerList should route testament audio downloads through the batched store action instead of per-book serial loops'
  );
});

test('translation picker keeps the sheet open while a runtime translation still needs download', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /if \(selectionState\.isSelectable\) \{[\s\S]*onRequestClose\?\.\(\);[\s\S]*onTranslationActivated\?\.\(\);[\s\S]*return;[\s\S]*\}/,
    'TranslationPickerList should only dismiss the sheet after a translation is actually activated'
  );

  assert.doesNotMatch(
    source,
    /onRequestClose\?\.\(\);\s*\n\s*const audioAvailability = getTranslationAudioAvailability/,
    'TranslationPickerList should not dismiss the sheet before it decides whether the tap starts a download instead of activating a translation'
  );
});
