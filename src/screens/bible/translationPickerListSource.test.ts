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
    source.includes("t('translations.download')"),
    true,
    'TranslationPickerList should keep the text download prompt short and explicit'
  );

  assert.equal(
    source.includes("t('common.loading')"),
    true,
    'TranslationPickerList should use the shared loading copy while the catalog hydrates'
  );

  assert.equal(
    source.includes("t('common.downloading')"),
    false,
    'TranslationPickerList should not reference the missing common.downloading key'
  );

  assert.equal(
    source.includes('filterTranslationLanguagesBySearchQuery'),
    true,
    'TranslationPickerList should show matching language results from the global translation catalog while searching'
  );

  assert.equal(
    source.includes('includeAllAvailableTranslations: hasActiveSearchQuery'),
    true,
    'TranslationPickerList should not restrict active search results to the preferred language'
  );

  assert.equal(
    source.includes('translation-picker-language-search-result'),
    true,
    'TranslationPickerList should let language search results switch language or open the only translation'
  );

  assert.equal(
    source.includes('translation-picker-search'),
    true,
    'TranslationPickerList should render a search bar at the top of the picker'
  );

  assert.equal(
    source.includes('numberOfLines={1}'),
    true,
    'TranslationPickerList should keep long translation names on one line'
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
    'TranslationPickerList should keep the manage sheet height stable while its contents change'
  );

  assert.match(
    source,
    /translationListContent:[\s\S]*paddingBottom:\s*layout\.sectionGap/,
    'TranslationPickerList should keep a padded content rail for the grouped translation sections'
  );

  assert.equal(
    source.includes("import { FlashList } from '@shopify/flash-list'"),
    true,
    'TranslationPickerList should virtualize the large translation picker list on Android'
  );

  assert.equal(
    source.includes('TRANSLATION_PICKER_ROW_ESTIMATED_SIZE'),
    true,
    'TranslationPickerList should provide FlashList an estimated row size so long translation catalogs scroll smoothly'
  );

  assert.match(
    source,
    /data=\{translationRows\}[\s\S]*renderItem=\{renderTranslationRow\}[\s\S]*getItemType=\{\(item\) => item\.type\}/,
    'TranslationPickerList should render the translation mode from a typed virtualized row model'
  );

  assert.equal(
    source.includes("t('translations.languagePreference')"),
    true,
    "TranslationPickerList should label the language pill as the user's language preference"
  );

  assert.equal(
    source.includes("t('translations.myTranslations')"),
    true,
    'TranslationPickerList should render a dedicated My Translations section'
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

test('translation picker lists My Translations before the language catalog in one grouped row recipe', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  const myIndex = source.indexOf("id: 'section-my-translations'");
  const availableIndex = source.indexOf("id: 'section-available-translations'");
  assert.ok(myIndex > 0 && availableIndex > 0);
  assert.ok(
    myIndex < availableIndex,
    'The Bibles the reader already has must come before the "more in this language" catalog, so the sheet has one stable order'
  );

  assert.match(
    source,
    /`\$\{t\('translations\.available'\)\} · \$\{languageLabel\}`/,
    'The available section header should name the language inline instead of stacking a second title under the eyebrow'
  );

  assert.equal(
    (source.match(/sectionEyebrow:/g) ?? []).length,
    1,
    'There should be exactly one section heading style in the picker'
  );

  assert.equal(
    source.includes('sectionTitle'),
    false,
    'The picker should not render a second, larger title under section eyebrows'
  );

  assert.equal(
    source.includes('preferenceEyebrow'),
    false,
    'The language preference should be a compact pill, not a boxed card with its own eyebrow'
  );

  assert.equal(
    source.includes('translation-picker-language-pill'),
    true,
    'The language pill should be addressable for UI tests'
  );

  assert.match(
    source,
    /type GroupPosition = 'only' \| 'first' \| 'middle' \| 'last'/,
    'Rows should know their position so a section renders as one grouped list'
  );

  assert.match(
    source,
    /rowTitle:\s*\{\s*\.\.\.typography\.rowTitle/,
    'Row titles should come from the shared rowTitle token'
  );

  assert.match(
    source,
    /rowMeta:\s*\{\s*\.\.\.typography\.caption/,
    'Row metadata should come from the shared caption token'
  );

  assert.equal(
    source.includes('const TranslationRow = memo('),
    true,
    'Each Bible should render through one memoized row component'
  );
});

test('translation picker moves download, pin, hide and delete into a per-translation manage sheet', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');
  const rowStart = source.indexOf('const TranslationRow = memo(');
  const sheetStart = source.indexOf('function TranslationManageSheet(');
  assert.ok(rowStart > 0 && sheetStart > rowStart);
  const rowSource = source.slice(rowStart, sheetStart);
  const sheetSource = source.slice(sheetStart);

  assert.match(
    rowSource,
    /ellipsis-horizontal/,
    'Each row should expose a single "more" affordance instead of a chip row'
  );

  assert.equal(
    rowSource.includes("t('translations.pin')") || rowSource.includes("'translations.pin'"),
    false,
    'The pin action must not render inline on every row'
  );

  assert.equal(
    rowSource.includes('headset-outline'),
    false,
    'Audio download chips must not render inline on every row'
  );

  assert.match(
    sheetSource,
    /'translations\.unpin' : 'translations\.pin'/,
    'The manage sheet should offer pin/unpin'
  );

  assert.match(sheetSource, /t\('translations\.hide'\)/, 'The manage sheet should offer hide');

  assert.equal(
    sheetSource.includes('hasTranslationDownloadData'),
    true,
    'The manage sheet should gate delete on real local assets instead of hard-coded translation ids'
  );

  assert.equal(
    sheetSource.includes('trash-outline'),
    true,
    'The manage sheet should keep the trash icon on delete'
  );

  assert.equal(
    source.includes("translation.id !== 'bsb'"),
    false,
    'TranslationPickerList should not hard-block BSB from the remove-download flow'
  );

  assert.equal(
    sheetSource.includes('deleteTranslation(translation.id)'),
    true,
    'Delete should route through the shared translation cleanup action'
  );

  assert.match(
    sheetSource,
    /t\('bible\.fullBible'\)[\s\S]*t\('bible\.newTestament'\)[\s\S]*t\('bible\.byBook'\)/,
    'The manage sheet should offer Full Bible, New Testament, and by-book audio downloads'
  );

  assert.match(
    sheetSource,
    /chatbox-ellipses-outline[\s\S]*t\('audio\.showText'\)/,
    'The manage sheet should render the text download row with the text icon'
  );

  assert.equal(
    sheetSource.includes('downloadAudioForBooks'),
    true,
    'The manage sheet should use the shared batch audio download action for New Testament audio'
  );

  assert.equal(
    sheetSource.includes('getTranslationAudioBookIds'),
    true,
    'The manage sheet should read explicit audio book coverage when deciding which books to show'
  );

  assert.equal(
    sheetSource.includes('translationAudioBooks.length > 0'),
    true,
    'The manage sheet should hide audio rows when the translation has no known book coverage'
  );

  assert.equal(
    sheetSource.includes('checkmark-circle'),
    true,
    'Completed downloads should show a green check'
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

test('translation picker activates a runtime text translation after download completes', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /await downloadTranslation\(translation\.id\);[\s\S]*setCurrentTranslation\(translation\.id\);[\s\S]*onRequestClose\?\.\(\);[\s\S]*onTranslationActivated\?\.\(/,
    'Downloaded runtime text translations should become the active Bible immediately after the install finishes'
  );
});

test('translation picker shows live download progress on the row itself', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');
  const rowStart = source.indexOf('const TranslationRow = memo(');
  const sheetStart = source.indexOf('function TranslationManageSheet(');
  const rowSource = source.slice(rowStart, sheetStart);

  assert.match(
    rowSource,
    /activeDownloadProgress != null[\s\S]*<ProgressBar[\s\S]*accessibilityLabel=\{t\('translations\.downloading'\)\}[\s\S]*\{activeDownloadProgress\}%/,
    'A downloading row should show a labelled progress bar and percentage in place of its status glyph'
  );

  assert.match(
    rowSource,
    /t\('translations\.cancelDownload'\)[\s\S]*cancelDownload\(\)/,
    'A downloading row should offer cancel'
  );
});

test('translation picker checks remote availability against each by-book row', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /remoteAudioAvailable:\s*isRemoteAudioAvailable\(translation\.id,\s*bookId\s*\?\?\s*currentBook\)/,
    'TranslationPickerList should check remote audio coverage against the row book instead of the reader book'
  );
});

test('translation picker keeps search results reachable above the on-screen keyboard', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /import \{[^}]*useKeyboardBottomInset[^}]*\} from '\.\.\/\.\.\/hooks';/,
    'TranslationPickerList should read the live keyboard inset so list padding can grow while the search keyboard is open'
  );

  assert.match(
    source,
    /keyboardDismissMode="on-drag"/,
    'TranslationPickerList should dismiss the keyboard when the user drags the translation list'
  );

  assert.match(
    source,
    /paddingBottom:\s*layout\.sectionGap \+ keyboardBottomInset/,
    'TranslationPickerList should extend the FlashList bottom padding by the keyboard height so rows behind the keyboard can scroll into view'
  );

  assert.match(
    source,
    /contentContainerStyle=\{translationListContentStyle\}/,
    'TranslationPickerList should actually feed the keyboard-aware style to the FlashList'
  );

  assert.match(
    source,
    /keyboardShouldPersistTaps="handled"/,
    'TranslationPickerList should keep single-tap row activation while the keyboard is up'
  );
});

test('download progress is scoped to memoized translation rows', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');
  const rowStart = source.indexOf('const TranslationRow = memo(');
  assert.ok(rowStart > 0);
  assert.doesNotMatch(source.slice(0, rowStart), /state\.downloadProgress/);
  assert.match(
    source.slice(rowStart),
    /state\.downloadProgress\?\.translationId === translation\.id \? state\.downloadProgress : null/
  );
  assert.match(source, /handleTranslationSelect = useCallback/);
  assert.match(source, /handleDownloadTextTranslation = useCallback/);
});
