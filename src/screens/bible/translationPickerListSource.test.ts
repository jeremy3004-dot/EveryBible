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
    source.includes('horizontal'),
    true,
    'TranslationPickerList should render the language pills in a horizontal scroller'
  );
});
