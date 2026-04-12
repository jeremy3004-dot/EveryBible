import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('translation picker keeps the clean two-button translation row and language mode', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.equal(
    source.includes("pickerMode === 'languages'"),
    true,
    'TranslationPickerList should still support a dedicated language-selection mode'
  );

  assert.equal(
    source.includes('language-picker-search'),
    true,
    'TranslationPickerList should keep search inside the language picker instead of the default translation list'
  );

  assert.equal(
    source.includes('Select Language'),
    true,
    'TranslationPickerList should keep the language mode header explicit and simple'
  );

  assert.equal(
    source.includes("t('translations.languagePreference')"),
    true,
    'TranslationPickerList should keep the top rail label anchored to the language preference state'
  );

  assert.equal(
    source.includes('text-action-'),
    true,
    'TranslationPickerList should render a separate text action button for each translation row'
  );

  assert.equal(
    source.includes('audio-action-'),
    true,
    'TranslationPickerList should render a separate audio action button for each translation row'
  );

  assert.equal(
    source.includes('document-text-outline'),
    true,
    'TranslationPickerList should keep the text button icon readable at a glance'
  );

  assert.equal(
    source.includes('headset-outline'),
    true,
    'TranslationPickerList should use a distinct audio icon rather than the old chip row language'
  );

  assert.equal(
    source.includes("label={t('audio.showText')}"),
    true,
    'TranslationPickerList should keep the Text button label explicit'
  );

  assert.equal(
    source.includes('label="Audio"'),
    true,
    'TranslationPickerList should keep the Audio button label explicit'
  );

  assert.equal(
    source.includes('translationActions'),
    true,
    'TranslationPickerList should lay out the two buttons as a compact paired action group'
  );

  assert.equal(
    source.includes('translationPickerCard'),
    false,
    'TranslationPickerList should not keep the old boxed picker card treatment from the chip-based version'
  );

  assert.equal(
    source.includes('audioDownloadButtons'),
    false,
    'TranslationPickerList should not render the old audio chip row'
  );

  assert.equal(
    source.includes("t('translations.available')"),
    true,
    'TranslationPickerList should label the top section as available translations'
  );

  assert.equal(
    source.includes("t('translations.myTranslations')"),
    true,
    'TranslationPickerList should label the lower section as the user’s loaded translations'
  );

  assert.match(
    source,
    /label:\s*t\('translations\.available'\)[\s\S]*label:\s*t\('translations\.myTranslations'\)/,
    'TranslationPickerList should list available translations before the loaded ones in the main picker'
  );

  assert.match(
    source,
    /languageRail:[\s\S]*backgroundColor:\s*'#6a2b18'/,
    'TranslationPickerList should keep the warm brown language rail from the mockup'
  );

  assert.match(
    source,
    /actionButton:[\s\S]*borderRadius:\s*999/,
    'TranslationPickerList should style each action button as a clean pill'
  );

  assert.match(
    source,
    /translationRow:[\s\S]*minHeight:\s*70/,
    'TranslationPickerList should keep each translation row compact and vertically centered'
  );

  assert.match(
    source,
    /translationSectionTab:[\s\S]*borderRadius:\s*999/,
    'TranslationPickerList should style the section labels as clean tabs'
  );
});

test('translation picker still resolves runtime catalog and audio availability before enabling actions', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.equal(
    source.includes('ensureRuntimeCatalogLoaded'),
    true,
    'TranslationPickerList should hydrate runtime translations so fresh installs do not show stale placeholders'
  );

  assert.equal(
    source.includes('getVisibleTranslationsForPicker'),
    true,
    'TranslationPickerList should hide unreadable runtime placeholders while the catalog is still loading'
  );

  assert.equal(
    source.includes('getAudioAvailability'),
    true,
    'TranslationPickerList should keep audio gating centralized'
  );

  assert.equal(
    source.includes('canManageAudio'),
    true,
    'TranslationPickerList should only expose audio download controls when the feature is actually manageable'
  );

  assert.equal(
    source.includes('downloadTranslation'),
    true,
    'TranslationPickerList should still call the shared text download action'
  );

  assert.equal(
    source.includes('downloadAudioForTranslation'),
    true,
    'TranslationPickerList should still call the shared audio download action'
  );

  assert.match(
    source,
    /ActivityIndicator/,
    'TranslationPickerList should show a spinner while a translation or audio pack is downloading'
  );

  assert.match(
    source,
    /setPreferredTranslationLanguage\(/,
    'TranslationPickerList should persist the selected language for every entry point'
  );
});

test('translation picker keeps the sheet open until a translation is actually activated', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /if \(selectionState\.isSelectable\) \{[\s\S]*onRequestClose\?\.\(\);[\s\S]*onTranslationActivated\?\.\(nextTranslation\);[\s\S]*return;[\s\S]*\}/,
    'TranslationPickerList should only dismiss the sheet after a translation has been activated'
  );

  assert.doesNotMatch(
    source,
    /onRequestClose\?\.\(\);\s*\n\s*const audioAvailability = getTranslationAudioAvailability/,
    'TranslationPickerList should not close the sheet before it decides whether a tap activates or downloads'
  );
});
