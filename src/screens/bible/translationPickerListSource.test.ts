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
    source.includes('textDownloadButton'),
    false,
    'TranslationPickerList should not keep a separate text button block once the action is merged into the chip row'
  );

  assert.equal(
    source.includes("t('translations.download')"),
    true,
    'TranslationPickerList should keep the text download prompt short and explicit'
  );

  assert.equal(
    source.includes("t('bible.audioDownloads')"),
    true,
    'TranslationPickerList should still label the audio modal'
  );

  assert.equal(
    source.includes("t('common.loading')"),
    true,
    'TranslationPickerList should use the shared loading copy for download progress instead of an undefined downloading key'
  );

  assert.equal(
    source.includes("t('common.downloading')"),
    false,
    'TranslationPickerList should not reference the missing common.downloading key'
  );

  assert.equal(
    source.includes('filterTranslationsBySearchQuery'),
    true,
    'TranslationPickerList should filter the visible translation list through the shared fuzzy search helper'
  );

  assert.equal(
    source.includes('translation-picker-search'),
    true,
    'TranslationPickerList should render a search bar at the top of the picker'
  );

  assert.equal(
    source.includes('numberOfLines={1}'),
    true,
    'TranslationPickerList should keep long translation names on one line and let the name truncate before the code'
  );

  assert.equal(
    source.includes('audioDownloadHeader'),
    false,
    'TranslationPickerList should not render a separate audio heading above the chips'
  );

  assert.equal(
    source.includes('translationMeta'),
    false,
    'TranslationPickerList should remove the noisy metadata row from each translation card'
  );

  assert.equal(
    source.includes('translationSize'),
    false,
    'TranslationPickerList should not render per-translation size labels in the card body'
  );

  assert.equal(
    source.includes('downloadedBadge'),
    false,
    'TranslationPickerList should not render the old inline status badge row'
  );

  assert.equal(
    source.includes('time-outline'),
    false,
    'TranslationPickerList should remove the old clock icon status hint from the card metadata row'
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
    /translationItem:[\s\S]*minHeight:\s*68,[\s\S]*paddingVertical:\s*10/,
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
    'TranslationPickerList should use the shared batch audio download action for collection audio buttons'
  );

  assert.equal(
    source.includes('getTranslationAudioBookIds'),
    true,
    'TranslationPickerList should read explicit audio book coverage when deciding which books to show'
  );

  assert.equal(
    source.includes("t('bible.fullBible')"),
    true,
    'TranslationPickerList should use the localized full-bible label when the row can wrap cleanly'
  );

  assert.equal(
    source.includes("t('bible.oldTestament')"),
    false,
    'TranslationPickerList should not render a separate Old Testament audio download option'
  );

  assert.equal(
    source.includes("t('bible.byBook')"),
    true,
    'TranslationPickerList should keep the book-by-book audio action while localizing the label'
  );

  assert.equal(
    source.includes("t('bible.newTestament')"),
    true,
    'TranslationPickerList should support a New Testament audio chip when only NT collection audio is available'
  );

  assert.equal(
    source.includes('Download by book'),
    false,
    'TranslationPickerList should stop using the longer book-by-book label'
  );

  assert.equal(
    source.includes('chatbox-ellipses-outline'),
    true,
    'TranslationPickerList should render the text action with a text/message icon'
  );

  assert.equal(
    source.includes('audioDownloadByBook'),
    false,
    'TranslationPickerList should render the book-by-book action as the same chip style as Full Bible'
  );

  assert.equal(
    source.includes('translationAudioBooks.length > 0'),
    true,
    'TranslationPickerList should hide audio chips when the translation has no known book coverage'
  );

  assert.match(
    source,
    /audioDownloadButtons:[\s\S]*flexWrap:\s*'wrap'/,
    'TranslationPickerList should let the audio chip row wrap to a second line when needed'
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

test('translation picker renders collection, by-book, and text chip download actions', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /<View style=\{styles\.audioDownloadButtons\}>[\s\S]*t\('bible\.fullBible'\)[\s\S]*t\('bible\.newTestament'\)[\s\S]*t\('bible\.byBook'\)[\s\S]*chatbox-ellipses-outline[\s\S]*t\('audio\.showText'\)/,
    'TranslationPickerList should render Full Bible, New Testament, By book, and icon-plus-Text chips'
  );

  assert.match(
    source,
    /downloadProgress\?\.translationId === translation\.id[\s\S]*downloadProgress\?\.progress[\s\S]*ActivityIndicator/,
    'TranslationPickerList should render a live percentage beside the active download chip'
  );

  assert.equal(
    source.includes('audioDownloadHeader'),
    false,
    'TranslationPickerList should not render a separate audio heading above the chips'
  );

  assert.equal(
    source.includes('Download by book'),
    false,
    'TranslationPickerList should not use the longer book-by-book label'
  );

  assert.equal(
    source.includes('textDownloadProgress'),
    false,
    'TranslationPickerList should not show the old inline text progress block'
  );

  assert.equal(
    source.includes('downloadProgress?.progress'),
    true,
    'TranslationPickerList should read the shared download progress percent from the Bible store'
  );

  assert.equal(
    source.includes("t('audio.showText')"),
    true,
    'TranslationPickerList should render the Text label again now that the row can wrap'
  );

  assert.equal(
    source.includes('headset-outline'),
    true,
    'TranslationPickerList should keep the headphones icon on the audio chips'
  );

  assert.equal(
    source.includes('checkmark-circle'),
    true,
    'TranslationPickerList should use a green check icon when a download is complete'
  );

  assert.equal(
    source.includes('downloadAudioForBooks'),
    true,
    'TranslationPickerList should use the shared batch audio download action for collection audio buttons like New Testament'
  );

  assert.match(
    source,
    /audioDownloadChip:[\s\S]*paddingHorizontal:\s*10,[\s\S]*paddingVertical:\s*6/,
    'TranslationPickerList should keep the pills readable without making them oversized'
  );
});
