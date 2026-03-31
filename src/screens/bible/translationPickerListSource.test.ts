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
    source.includes('contentInsetAdjustmentBehavior="never"'),
    true,
    'TranslationPickerList should disable automatic iOS scroll insets so the language row and translation list stay pinned to the top'
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
    /translationList:[\s\S]*flex:\s*1/,
    'TranslationPickerList should let the translation list fill the fixed modal height instead of resizing the whole sheet'
  );

  assert.match(
    source,
    /translationLanguageFilters:[\s\S]*alignItems:\s*'center'/,
    'TranslationPickerList should keep the language pills from stretching vertically in the horizontal row'
  );

  assert.match(
    source,
    /translationLanguageScroller:[\s\S]*flexGrow:\s*0,[\s\S]*flexShrink:\s*0,[\s\S]*height:\s*28,[\s\S]*marginBottom:\s*0,[\s\S]*paddingBottom:\s*0/,
    'TranslationPickerList should keep the language tabs pinned tightly under the translation title instead of letting the row stretch vertically'
  );

  assert.match(
    source,
    /translationLanguageChip:[\s\S]*minHeight:\s*28,[\s\S]*alignSelf:\s*'center'[\s\S]*justifyContent:\s*'center'/,
    'TranslationPickerList should give the language pills enough vertical room so the labels are not clipped'
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
    /translationListContent:[\s\S]*paddingTop:\s*spacing\.sm,[\s\S]*paddingBottom:\s*layout\.sectionGap/,
    'TranslationPickerList should leave a slightly roomier gap between the language row and the first translation card'
  );

  assert.match(
    source,
    /translationLanguageChipText:[\s\S]*fontSize:\s*12,[\s\S]*lineHeight:\s*14/,
    'TranslationPickerList should keep the language chip text aligned within the pill'
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
