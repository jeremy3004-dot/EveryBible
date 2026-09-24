// Render tests for the shared translation picker (Bible browser, reader and Settings all open
// it). Replaces the old source-text checks in translationPickerListSource.test.ts.
//
// Covered elsewhere, so not repeated here:
// - section splitting, language resolution, search matching, visibility while hydrating and
//   audio coverage rules: bibleTranslationModel.test.ts
// - one-text-download-at-a-time ordering and supersede rules: translationPickerDownloadQueue.test.ts
// - error-to-copy mapping for audio download failures: audioDownloadErrorMessage.test.ts
// - missing interface keys (the old "no common.downloading" check): i18n/interfaceCoverage.test.ts
//
// Dropped as implementation detail with no observable behaviour: memo/useCallback use, where
// the downloadProgress selector lives, the GroupPosition type, style-token spreading
// (rowTitle/rowMeta), the count of section-heading style keys, and FlashList's estimated row
// size / getItemType (virtualization tuning; the harness renders FlashList eagerly).
//
// Download queue states, selection routing, pinning and hiding, and render counts live in
// TranslationPickerList.states.render.test.tsx; both files share TranslationPickerList.renderFixture.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { type ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import {
  BSB,
  GOSPEL_AUDIO,
  KJV,
  LONG_SPANISH_NAME,
  LUTHER,
  NET,
  SPANISH_RV,
  UNKNOWN_COVERAGE_AUDIO,
  ALL,
  bible,
  installPickerRenderFixture,
} from './TranslationPickerList.renderFixture';

const {
  harness,
  t,
  log,
  pending,
  audio,
  catalog,
  remote,
  modelCalls,
  resetModelCalls,
  useBibleStore,
  renderPicker,
  rowOf,
  rowNames,
  iconNames,
  openManageSheet,
  inAct,
  lastAlert,
  alertButton,
} = installPickerRenderFixture(mock);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test('the picker opens on a search field, the language pill, My Translations, then Available · <language>', async () => {
  const view = await renderPicker();

  const [list] = view.queryAllByType('FlatList');
  const firstChild = list.children[0] as ReactTestInstance;
  assert.equal(
    within(firstChild).getByTestId('translation-picker-search'),
    view.getByLabelText(t('common.search')),
    'the search field is the list header, above every row'
  );

  const pill = view.getByTestId('translation-picker-language-pill');
  assert.equal(pill.props.accessibilityLabel, t('translations.languagePreference'));
  assert.deepEqual(pill.props.accessibilityValue, { text: 'English' });

  assert.deepEqual(
    view.getAllByRole('header').map((node) => node.props.children),
    [t('translations.myTranslations'), `${t('translations.available')} · English`],
    'one heading per section, and the available heading names the language inline'
  );
  assert.deepEqual(rowNames(view), [
    // The Bible being read leads My Translations; installed ones follow.
    BSB.name,
    KJV.name,
    UNKNOWN_COVERAGE_AUDIO.name,
    NET.name,
    GOSPEL_AUDIO.name,
  ]);
  assert.deepEqual(
    rowOf(view, BSB).props.accessibilityState,
    { selected: true },
    'the current Bible is announced as selected'
  );
  assert.equal(view.queryByText(LUTHER.name), null, 'other languages wait behind the pill');
  assert.equal(catalog.loads, 1, 'opening the picker hydrates the runtime catalog');

  const surface = hostAncestors(list).find((node) => node.props.collapsable === false);
  assert.ok(surface, 'the measured keyboard surface is not collapsed away on Android');
  assert.deepEqual(
    [flattenStyle(surface.props.style)?.flex, flattenStyle(surface.props.style)?.minHeight],
    [1, 0],
    'the picker fills the sheet so the list can claim the space'
  );
});

test('long translation names wrap to a second line instead of truncating after one', async () => {
  useBibleStore.setState({ preferredTranslationLanguage: 'Spanish' });
  const view = await renderPicker();

  assert.ok(
    view.getByRole('header', { name: `${t('translations.available')} · Spanish / Español` })
  );
  const title = view.getByText(LONG_SPANISH_NAME);
  assert.equal(title.props.numberOfLines, 2);
  assert.equal(title.props.ellipsizeMode, 'tail');
});

test('the catalog is announced as loading while it hydrates and rows cannot be opened yet', async () => {
  catalog.hold = true;
  const placeholder = bible({
    id: 'eng-placeholder',
    name: 'Placeholder Runtime Bible',
    abbreviation: 'PRB',
    language: 'English',
    source: 'runtime',
  });
  useBibleStore.setState({ translations: [BSB, KJV, placeholder] });
  const view = await renderPicker();

  assert.ok(view.getByText(t('common.loading')));
  assert.equal(view.queryByText(placeholder.name), null, 'unreadable placeholders stay hidden');
  await view.press(rowOf(view, KJV));
  assert.deepEqual(log, [], 'rows are disabled until the catalog settles');

  await inAct(() => catalog.finish());
  assert.equal(view.queryByText(t('common.loading')), null);
  assert.ok(view.getByText(placeholder.name));
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

test('typing re-filters the list without remounting the search field', async () => {
  const view = await renderPicker();
  const input = view.getByTestId('translation-picker-search');

  await view.changeText(input, 'Luther');

  assert.equal(
    view.getByTestId('translation-picker-search'),
    input,
    'the same TextInput instance survives the re-filter, so focus and the keyboard stay'
  );
  assert.equal(input.props.value, 'Luther');
  const names = rowNames(view);
  assert.ok(names.includes(LUTHER.name), 'search spans every language');
  assert.ok(!names.includes(KJV.name) && !names.includes(NET.name), 'non-matches are filtered out');
  assert.deepEqual(
    view.getAllByRole('header').map((node) => node.props.children),
    [t('translations.available')],
    'search results are not labelled with the preferred language'
  );

  await view.press(view.getByRole('button', { name: t('settings.clear') }));
  assert.equal(input.props.value, '');
  assert.equal(view.getByTestId('translation-picker-search'), input);
});

test('a query that matches nothing says so under the search field; clearing it brings the list back', async () => {
  const view = await renderPicker();
  const input = view.getByTestId('translation-picker-search');
  assert.equal(view.queryByText(t('bible.translationSearchNoResults')), null);

  await view.changeText(input, 'zzzz');
  assert.ok(view.getByText(t('bible.translationSearchNoResults')));
  assert.deepEqual(rowNames(view), []);

  await view.press(view.getByRole('button', { name: t('settings.clear') }));
  assert.equal(view.queryByText(t('bible.translationSearchNoResults')), null);
  assert.ok(rowNames(view).includes(BSB.name));
});

test('once typing pauses, a screen reader hears how many Bibles match, or that none do', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderPicker();
  const input = view.getByTestId('translation-picker-search');
  const announced = () => harness.rn.__recorded.announcements;

  await view.changeText(input, 'L');
  await view.changeText(input, 'Luther');
  await inAct(() => context.mock.timers.tick(699));
  assert.deepEqual(announced(), [], 'nothing is said while the reader is still typing');

  await inAct(() => context.mock.timers.tick(1));
  const matches = rowNames(view).length;
  assert.ok(matches > 0);
  assert.deepEqual(announced(), [t('bible.translationSearchResultCount', { count: matches })]);

  await view.changeText(input, 'zzzz');
  await inAct(() => context.mock.timers.tick(700));
  assert.equal(announced().at(-1), t('bible.translationSearchNoResults'));

  await view.changeText(input, '');
  await inAct(() => context.mock.timers.tick(700));
  assert.equal(announced().length, 2, 'clearing the query says nothing');
});

test('a language search result with several Bibles switches the language and clears the query', async () => {
  const view = await renderPicker();
  await view.changeText(view.getByTestId('translation-picker-search'), 'spanish');

  const result = view.getByTestId('translation-picker-language-search-result');
  assert.ok(within(result).getByText('Spanish / Español'));
  assert.ok(within(result).getByText('2'), 'the result counts its Bibles');

  await view.press(result);

  assert.deepEqual(log, [['setPreferredTranslationLanguage', 'Spanish']]);
  assert.equal(view.getByTestId('translation-picker-search').props.value, '');
  assert.ok(
    view.getByRole('header', { name: `${t('translations.available')} · Spanish / Español` })
  );
  assert.deepEqual(rowNames(view).slice(-2), [LONG_SPANISH_NAME, SPANISH_RV.name]);
});

test('a language search result with one Bible opens that Bible straight away', async () => {
  const view = await renderPicker();
  await view.changeText(view.getByTestId('translation-picker-search'), 'german');

  await view.press(view.getByTestId('translation-picker-language-search-result'));

  assert.deepEqual(log[0], ['setPreferredTranslationLanguage', 'German']);
  assert.equal(lastAlert()?.title, LUTHER.name, 'the only German Bible is offered for download');
});

// ---------------------------------------------------------------------------
// Opening and downloading
// ---------------------------------------------------------------------------

test('a readable translation activates and closes the sheet', async () => {
  const view = await renderPicker();
  await view.press(rowOf(view, KJV));

  assert.deepEqual(log, [
    ['setPreferredTranslationLanguage', 'English'],
    ['setCurrentTranslation', 'kjv'],
    ['close'],
    ['activated', 'kjv'],
  ]);
});

test('a runtime translation that needs its text downloads in place, then opens once installed', async () => {
  const view = await renderPicker();
  assert.ok(
    iconNames(rowOf(view, NET)).includes('download-outline'),
    'the row says tapping it downloads'
  );
  assert.deepEqual(rowOf(view, NET).props.accessibilityValue, {
    text: t('translations.download'),
  });
  assert.equal(rowOf(view, BSB).props.accessibilityValue, undefined, 'an installed Bible opens');
  assert.ok(
    view.getByRole('button', { name: `${t('gather.moreOptions')}, ${NET.name}` }),
    "each row's options button names its Bible"
  );

  await view.press(rowOf(view, NET));
  assert.equal(lastAlert()?.title, NET.name);
  assert.equal(lastAlert()?.message, t('translations.downloadPrompt', { name: NET.name, size: 4 }));
  assert.deepEqual(log, [], 'nothing downloads or closes until the reader confirms');

  await inAct(() => alertButton(t('translations.download'))?.onPress?.());
  assert.deepEqual(log, [['downloadTranslation', 'engnet']], 'the sheet stays open');
  assert.equal(rowOf(view, NET).props.disabled, true, 'the downloading row cannot be re-tapped');

  // Live progress lands on the row itself.
  await inAct(() =>
    useBibleStore.setState({
      downloadProgress: { translationId: 'engnet', progress: 40, status: 'downloading' },
    })
  );
  const row = rowOf(view, NET);
  const bar = within(row).getByRole('progressbar', { name: t('translations.downloading') });
  assert.equal(bar.props.accessibilityValue.now, 40);
  assert.ok(within(row).getByText('40%'));
  const cancel = within(row).getByRole('button', { name: t('translations.cancelDownload') });
  // A 20pt glyph widened to the 44pt touch floor.
  assert.deepEqual(cancel.props.hitSlop, { top: 12, bottom: 12, left: 12, right: 12 });
  await view.press(cancel);
  assert.deepEqual(log.at(-1), ['cancelDownload']);

  log.length = 0;
  await inAct(() => pending.download?.resolve('installed'));
  assert.deepEqual(log, [
    ['setPreferredTranslationLanguage', 'English'],
    ['setCurrentTranslation', 'engnet'],
    ['close'],
    ['activated', 'engnet'],
  ]);
});

// ---------------------------------------------------------------------------
// Manage sheet
// ---------------------------------------------------------------------------

test('the manage sheet reserves the safe area and keeps a stable 82% height', async () => {
  const view = await renderPicker();
  const sheet = await openManageSheet(view, BSB);

  const title = within(sheet).getByRole('header', { name: BSB.name });
  const content = hostAncestors(title).find(
    (node) => flattenStyle(node.props.style)?.height === '82%'
  );
  assert.ok(content, 'the sheet body is 82% tall');
  assert.equal(flattenStyle(content.props.style)?.paddingBottom, harness.insets.bottom);

  await view.press(within(sheet).getAllByRole('button', { name: t('interface.close') })[1]);
  assert.equal(view.queryAllByType('Modal').length, 0);
});

test('the manage sheet for the current Bible offers pin, the installed text, and audio by collection and book', async () => {
  const view = await renderPicker();
  const sheet = await openManageSheet(view, BSB);
  const scope = within(sheet);

  assert.equal(scope.queryByRole('button', { name: t('translations.hide') }), null);
  assert.equal(
    scope.queryByRole('button', { name: t('translations.delete') }),
    null,
    'nothing is stored locally, so there is nothing to delete'
  );

  const textRow = scope.getByRole('button', { name: t('audio.showText') });
  assert.deepEqual(textRow.props.accessibilityValue, { text: t('translations.installed') });
  assert.deepEqual(iconNames(textRow), ['chatbox-ellipses-outline', 'checkmark-circle']);

  assert.ok(scope.getByRole('header', { name: t('bible.audioDownloads') }));
  assert.ok(scope.getByRole('button', { name: t('bible.fullBible') }));
  assert.ok(scope.getByRole('button', { name: t('bible.newTestament') }));
  assert.ok(scope.getByRole('header', { name: t('bible.byBook') }));
  assert.ok(scope.getByRole('button', { name: 'Genesis' }));
  assert.ok(scope.getByRole('button', { name: 'Revelation' }));

  await view.press(scope.getByRole('button', { name: t('translations.pin') }));
  assert.deepEqual(log, [['pin', 'bsb']]);
  assert.ok(within(sheet).getByRole('button', { name: t('translations.unpin') }));
  await view.press(within(sheet).getByRole('button', { name: t('translations.unpin') }));
  assert.deepEqual(log.at(-1), ['unpin', 'bsb']);
});

test('BSB with downloaded audio can be hidden or deleted, and its downloaded books show a check', async () => {
  useBibleStore.setState({
    currentTranslation: 'kjv',
    translations: ALL.map((translation) =>
      translation.id === 'bsb' ? { ...translation, downloadedAudioBooks: ['GEN'] } : translation
    ),
  });
  const view = await renderPicker();
  let sheet = await openManageSheet(view, BSB);

  const genesis = within(sheet).getByRole('button', { name: 'Genesis' });
  assert.ok(iconNames(genesis).includes('checkmark-circle'));
  assert.equal(genesis.props.disabled, true, 'a downloaded book has nothing left to do');
  // Otherwise "Genesis, dimmed" sounds the same as a book that cannot be fetched.
  assert.deepEqual(genesis.props.accessibilityValue, { text: t('translations.installed') });

  const deleteRow = within(sheet).getByRole('button', { name: t('translations.delete') });
  assert.ok(iconNames(deleteRow).includes('trash-outline'));
  await view.press(deleteRow);
  assert.equal(lastAlert()?.title, t('translations.deleteConfirmTitle'));
  assert.deepEqual(log, [], 'delete waits for confirmation');
  await inAct(() => alertButton(t('translations.delete'))?.onPress?.());
  assert.deepEqual(log, [['deleteTranslation', 'bsb']]);
  assert.equal(view.queryAllByType('Modal').length, 0, 'the sheet closes after delete');

  sheet = await openManageSheet(view, BSB);
  await view.press(within(sheet).getByRole('button', { name: t('translations.hide') }));
  assert.deepEqual(log.at(-1), ['hide', 'bsb']);
  assert.equal(view.queryAllByType('Modal').length, 0, 'the sheet closes after hide');
});

test('audio rows appear only when the translation has known book coverage it can manage', async () => {
  const view = await renderPicker();

  for (const translation of [KJV, UNKNOWN_COVERAGE_AUDIO]) {
    const sheet = await openManageSheet(view, translation);
    assert.equal(within(sheet).queryByRole('header', { name: t('bible.audioDownloads') }), null);
    assert.equal(within(sheet).queryByText(t('bible.byBook')), null, translation.name);
    await view.press(within(sheet).getAllByRole('button', { name: t('interface.close') })[1]);
  }
});

test('audio management is hidden when nothing can be streamed or played offline', async () => {
  remote.unavailable.add('*');
  const view = await renderPicker();
  const sheet = await openManageSheet(view, BSB);

  assert.equal(within(sheet).queryByRole('button', { name: t('bible.fullBible') }), null);
  assert.equal(within(sheet).queryByText(t('bible.byBook')), null);
});

test('offline audio keeps the audio rows, but downloads are unavailable while remote audio is', async () => {
  remote.unavailable.add('*');
  useBibleStore.setState({
    translations: ALL.map((translation) =>
      translation.id === 'bsb' ? { ...translation, downloadedAudioBooks: ['JHN'] } : translation
    ),
  });
  const view = await renderPicker();
  const sheet = await openManageSheet(view, BSB);

  const fullBible = within(sheet).getByRole('button', { name: t('bible.fullBible') });
  assert.deepEqual(fullBible.props.accessibilityValue, { text: t('bible.notAvailableYet') });
  assert.ok(iconNames(fullBible).includes('cloud-offline-outline'));
  assert.equal(fullBible.props.disabled, true, 'no download can be started');
  assert.equal(fullBible.props.onPress, undefined);
});

test('the New Testament row downloads just the New Testament books', async () => {
  const view = await renderPicker();
  const sheet = await openManageSheet(view, BSB);
  await view.press(within(sheet).getByRole('button', { name: t('bible.newTestament') }));

  const [call] = log;
  assert.equal(call[0], 'downloadAudioForBooks');
  assert.equal(call[1], 'bsb');
  const books = call[2] as string[];
  assert.equal(books.length, 27);
  assert.deepEqual([books[0], books.at(-1)], ['MAT', 'REV']);
});

test('each by-book row checks remote audio for its own book, not the book being read', async () => {
  remote.unavailable.add('eng-audio:MRK');
  const view = await renderPicker();
  const sheet = await openManageSheet(view, GOSPEL_AUDIO);
  const scope = within(sheet);

  assert.equal(scope.queryByRole('button', { name: t('bible.fullBible') }), null);
  assert.equal(scope.queryByRole('button', { name: t('bible.newTestament') }), null);

  const mark = scope.getByRole('button', { name: 'Mark' });
  assert.equal(mark.props.disabled, true);
  assert.ok(iconNames(mark).includes('cloud-offline-outline'));
  assert.deepEqual(mark.props.accessibilityValue, { text: t('bible.notAvailableYet') });

  const matthew = scope.getByRole('button', { name: 'Matthew' });
  assert.ok(iconNames(matthew).includes('download-outline'));
  assert.deepEqual(matthew.props.accessibilityValue, { text: t('translations.download') });
  await view.press(matthew);
  assert.deepEqual(log, [['downloadAudioForBook', 'eng-audio', 'MAT']]);
  assert.ok(remote.calls.includes('eng-audio:MAT') && remote.calls.includes('eng-audio:MRK'));
});

test('a running audio job shows a labelled progress bar, its percentage and cancel in the sheet', async () => {
  useBibleStore.setState({
    translations: ALL.map((translation) =>
      translation.id === 'bsb'
        ? {
            ...translation,
            activeDownloadJob: {
              id: 'job-1',
              kind: 'translation-audio',
              state: 'running',
              progress: 25,
              startedAt: 0,
              updatedAt: 0,
            },
          }
        : translation
    ),
  });
  const view = await renderPicker();

  // The list row shows the job too.
  assert.ok(within(rowOf(view, BSB)).getByText('25%'));

  const sheet = await openManageSheet(view, BSB);
  const fullBible = within(sheet).getByRole('button', { name: t('bible.fullBible') });
  const bar = within(fullBible).getByRole('progressbar', { name: t('translations.downloading') });
  assert.equal(bar.props.accessibilityValue.now, 25);
  assert.ok(within(fullBible).getByText('25%'));
  await view.press(
    within(fullBible).getByRole('button', { name: t('translations.cancelDownload') })
  );
  assert.deepEqual(log, [['cancelDownload']]);
});

test('audio download failures alert with the specific reason, from collections and single books', async () => {
  const { AudioDownloadInsufficientSpaceError } =
    await import('../../services/audio/audioDownloadErrorMessage');
  audio.failure = new AudioDownloadInsufficientSpaceError(2 * 1024 ** 3, 100 * 1024 ** 2);
  const expected = t('bible.audioDownloadInsufficientSpace', {
    required: '2.0 GB',
    free: '100 MB',
  });
  assert.notEqual(expected, t('bible.audioDownloadFailed'));

  const view = await renderPicker();
  let sheet = await openManageSheet(view, BSB);
  await view.press(within(sheet).getByRole('button', { name: t('bible.fullBible') }));
  assert.deepEqual(log, [['downloadAudioForTranslation', 'bsb']]);
  assert.deepEqual([lastAlert()?.title, lastAlert()?.message], [t('common.error'), expected]);

  sheet = view.queryAllByType('Modal')[0];
  await view.press(within(sheet).getByRole('button', { name: 'Genesis' }));
  assert.deepEqual(log.at(-1), ['downloadAudioForBook', 'bsb', 'GEN']);
  assert.equal(harness.rn.__recorded.alerts.length, 2);
  assert.equal(lastAlert()?.message, expected);
});

// ---------------------------------------------------------------------------
// Keyboard and languages mode
// ---------------------------------------------------------------------------

test('the list keeps taps and scroll-to-dismiss while typing, and grows by the keyboard height', async () => {
  const { layout } = await import('../../design/system');
  const view = await renderPicker();
  const list = () => view.queryAllByType('FlatList')[0];

  assert.equal(list().props.keyboardShouldPersistTaps, 'handled');
  assert.equal(list().props.keyboardDismissMode, 'on-drag');
  assert.equal(list().props.contentContainerStyle.paddingBottom, layout.sectionGap);

  await inAct(() =>
    harness.rn.Keyboard.emit('keyboardWillShow', {
      endCoordinates: { height: 300, screenY: 544, screenX: 0, width: 390 },
    })
  );
  assert.equal(list().props.contentContainerStyle.paddingBottom, layout.sectionGap + 300);

  await inAct(() => harness.rn.Keyboard.emit('keyboardWillHide', {}));
  assert.equal(list().props.contentContainerStyle.paddingBottom, layout.sectionGap);
});

test('the language pill opens a language list whose choice persists through the Bible store', async () => {
  const view = await renderPicker();
  await view.press(view.getByTestId('translation-picker-language-pill'));

  assert.equal(view.queryByTestId('translation-picker-search'), null);
  const english = view.getByRole('button', { name: /^English/ });
  assert.deepEqual(english.props.accessibilityState, { selected: true });
  assert.ok(view.getByRole('button', { name: /^German \/ Deutsch/ }));

  await view.press(view.getByRole('button', { name: /^Spanish \/ Español/ }));

  assert.deepEqual(log, [['setPreferredTranslationLanguage', 'Spanish']]);
  assert.equal(useBibleStore.getState().preferredTranslationLanguage, 'Spanish');
  assert.ok(view.getByTestId('translation-picker-search'), 'back on the translation list');
  assert.ok(
    view.getByRole('header', { name: `${t('translations.available')} · Spanish / Español` })
  );
});

// ---------------------------------------------------------------------------
// Re-render reach during downloads
// ---------------------------------------------------------------------------

/** Renders of each translation row (its touchable) since `mark`, keyed by abbreviation. */
const rowRenders = (mark: number) =>
  Object.fromEntries(
    ALL.map((translation) => [
      translation.abbreviation,
      harness.renders.count(mark, 'TouchableOpacity', (props) =>
        String(props.accessibilityLabel ?? '').startsWith(`${translation.name},`)
      ),
    ])
  );
const onlyRow = (abbreviation: string, count = 1) =>
  Object.fromEntries(
    ALL.map((translation) => [translation.abbreviation, 0]).concat([[abbreviation, count]])
  );

const textProgress = (progress: number, bytesDownloaded: number) =>
  inAct(() =>
    useBibleStore.setState({
      downloadProgress: {
        translationId: 'engnet',
        progress,
        status: 'downloading',
        bytesDownloaded,
        bytesTotal: 1_000,
      },
    })
  );

test('text download progress redraws only its row, and only when the percentage moves', async () => {
  const view = await renderPicker();
  await view.press(rowOf(view, NET));
  await inAct(() => alertButton(t('translations.download'))?.onPress?.());
  await textProgress(40, 400);

  // Bytes arrive in many small chunks between whole-percent steps.
  let mark = harness.renders.mark();
  await textProgress(40, 404);
  assert.deepEqual(rowRenders(mark), onlyRow('NET', 0));

  mark = harness.renders.mark();
  await textProgress(41, 410);
  assert.deepEqual(rowRenders(mark), onlyRow('NET'));
  assert.ok(within(rowOf(view, NET)).getByText('41%'));
});

/** The store's per-book audio progress: a fresh copy of the downloading Bible, nothing else. */
const audioJobTick = (progress: number) =>
  inAct(() =>
    useBibleStore.setState((state) => ({
      translations: state.translations.map((translation) =>
        translation.id === 'bsb'
          ? {
              ...translation,
              activeDownloadJob: {
                id: 'job-1',
                kind: 'translation-audio',
                state: 'running',
                progress,
                startedAt: 0,
                updatedAt: progress,
              },
            }
          : translation
      ),
    }))
  );

test('an audio job tick on one translation redraws only that row', async () => {
  await renderPicker();
  const mark = harness.renders.mark();

  await audioJobTick(10);

  assert.deepEqual(rowRenders(mark), onlyRow('BSB'));
});

test('audio job ticks reuse the search and language indexes; a catalog change rebuilds them once', async () => {
  const view = await renderPicker();
  await view.changeText(view.getByTestId('translation-picker-search'), 'Berean');
  resetModelCalls();

  await audioJobTick(10);
  await audioJobTick(11);
  const noRebuilds = {
    buildTranslationSearchIndex: 0,
    buildTranslationLanguageSearchIndex: 0,
    buildTranslationLanguageFilters: 0,
    buildTranslationLanguageOptions: 0,
    resolvePreferredTranslationLanguage: 0,
  };
  assert.deepEqual({ ...modelCalls }, noRebuilds);
  assert.ok(
    within(rowOf(view, BSB)).getByText('11%'),
    'the row still draws the newest progress from the store'
  );

  await inAct(() =>
    useBibleStore.setState((state) => ({
      translations: state.translations.map((translation) =>
        translation.id === 'bsb' ? { ...translation, name: 'Berean Study Bible' } : translation
      ),
    }))
  );
  assert.deepEqual(
    { ...modelCalls },
    {
      buildTranslationSearchIndex: 1,
      buildTranslationLanguageSearchIndex: 1,
      buildTranslationLanguageFilters: 1,
      buildTranslationLanguageOptions: 1,
      resolvePreferredTranslationLanguage: 1,
    }
  );
  assert.ok(view.getByRole('button', { name: /^Berean Study Bible,/ }), 'the rename is searchable');
});
