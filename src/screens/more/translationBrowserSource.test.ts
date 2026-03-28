import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('translation browser screen delegates the selector UI to the shared picker', () => {
  const source = readRelativeSource('./TranslationBrowserScreen.tsx');

  assert.equal(
    source.includes('TranslationPickerList'),
    true,
    'TranslationBrowserScreen should render the shared TranslationPickerList so it matches the Bible selector'
  );
});

test('translation browser screen removes legacy reading-preference rows and uses the shared picker', () => {
  const source = readRelativeSource('./TranslationBrowserScreen.tsx');

  assert.equal(
    source.includes('TranslationPickerList'),
    true,
    'TranslationBrowserScreen should use the shared TranslationPickerList so it matches the Bible selector'
  );

  assert.equal(
    source.includes("t('settings.reading')"),
    false,
    'TranslationBrowserScreen should no longer render a Readings preferences section above the picker'
  );

  assert.equal(
    source.includes("t('translations.secondary')"),
    false,
    'TranslationBrowserScreen should remove the comparison translation preference row'
  );

  assert.equal(
    source.includes("t('translations.audioPreference')"),
    false,
    'TranslationBrowserScreen should remove the audio translation preference row'
  );

  assert.equal(
    source.includes('showPreferencePicker'),
    false,
    'TranslationBrowserScreen should not keep the old preference picker flow once the shared picker is in place'
  );
});
