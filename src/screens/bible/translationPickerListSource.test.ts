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
    source.includes('resolvePreferredTranslationLanguage'),
    true,
    'TranslationPickerList should resolve one persisted preferred translation language for every surface that opens it'
  );

  assert.equal(
    source.includes('buildTranslationPickerSections'),
    true,
    'TranslationPickerList should build shared sections so Bible, reader, and Settings show the same grouped translation layout'
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

  assert.match(
    source,
    /container:[\s\S]*flex:\s*1,[\s\S]*minHeight:\s*0/,
    'TranslationPickerList should keep the shared picker content in a flex container so the translation list can claim the available space'
  );

  assert.match(
    source,
    /modalContent:[\s\S]*height:\s*'82%'/,
    'TranslationPickerList should keep the modal sheet height stable while filters change'
  );

  assert.match(
    source,
    /translationCard:[\s\S]*marginBottom:\s*spacing\.xs/,
    'TranslationPickerList should keep the translation cards close together'
  );

  assert.match(
    source,
    /translationItem:[\s\S]*minHeight:\s*80,[\s\S]*paddingVertical:\s*12/,
    'TranslationPickerList should keep each translation card compact so more rows stay close together'
  );

  assert.match(
    source,
    /translationListContent:[\s\S]*paddingBottom:\s*layout\.sectionGap/,
    'TranslationPickerList should keep a padded content rail for the grouped translation sections'
  );

  assert.equal(
    source.includes('downloadAudioForBooks'),
    true,
    'TranslationPickerList should route testament audio downloads through the batched store action instead of per-book serial loops'
  );

  assert.equal(
    source.includes('Full Bible'),
    true,
    'TranslationPickerList should use the shorter Full Bible label to help the audio chips stay on one row'
  );

  assert.match(
    source,
    /audioDownloadButtons:[\s\S]*flexWrap:\s*'nowrap'/,
    'TranslationPickerList should keep the audio download chip row on a single line'
  );

  assert.equal(
    source.includes("t('translations.languagePreference')"),
    true,
    "TranslationPickerList should label the top row as the user's language preference"
  );

  assert.equal(
    source.includes("t('translations.myTranslations')"),
    true,
    'TranslationPickerList should render a dedicated My Translations section above the language catalog'
  );

  assert.equal(
    source.includes('getTranslationLanguageDisplayLabel'),
    true,
    'TranslationPickerList should render language labels with native-script support where available'
  );

  assert.match(
    source,
    /pickerMode === 'languages'/,
    'TranslationPickerList should support a dedicated languages mode instead of only inline language pills'
  );

  assert.match(
    source,
    /setPreferredTranslationLanguage\(/,
    'TranslationPickerList should persist language changes through the Bible store so every entry point stays aligned'
  );
});

test('translation picker keeps the sheet open while a runtime translation still needs download', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /if \(selectionState\.isSelectable\) \{[\s\S]*onRequestClose\?\.\(\);[\s\S]*onTranslationActivated\?\.\([^)]*\);[\s\S]*return;[\s\S]*\}/,
    'TranslationPickerList should only dismiss the sheet after a translation is actually activated'
  );

  assert.doesNotMatch(
    source,
    /onRequestClose\?\.\(\);\s*\n\s*const audioAvailability = getTranslationAudioAvailability/,
    'TranslationPickerList should not dismiss the sheet before it decides whether the tap starts a download instead of activating a translation'
  );
});

test('translation picker shows inline progress for the active Bible text download', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /const downloadProgress = useBibleStore\(\(state\) => state\.downloadProgress\);/,
    'TranslationPickerList should subscribe to the shared text download progress so the active translation row can show live install state'
  );

  assert.match(
    source,
    /const isTextDownloadActive =[\s\S]*downloadProgress\?\.translationId === translation\.id && !downloadProgress\.bookId;/,
    'TranslationPickerList should recognize the currently-downloading Bible text translation row'
  );

  assert.match(
    source,
    /ActivityIndicator size="small" color=\{colors\.bibleAccent\} \/>[\s\S]*textDownloadStatusLabel/,
    'TranslationPickerList should show a visible spinner and percent complete inside the active translation row while the Bible text pack downloads'
  );
});
