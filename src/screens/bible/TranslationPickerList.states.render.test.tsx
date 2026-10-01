// Render tests for the translation picker's download queue states, selection routing, pinning
// and hiding, and how far a download progress tick reaches. Layout, search, the manage sheet's
// audio rows and the keyboard live in TranslationPickerList.render.test.tsx.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { within } from '../../testing/render';
import {
  ALL,
  BSB,
  GOSPEL_AUDIO,
  EMTV,
  NET,
  SPANISH_RV,
  UNKNOWN_COVERAGE_AUDIO,
  bible,
  installPickerRenderFixture,
} from './TranslationPickerList.renderFixture';
import { assertDefined } from '../../utils/assertDefined';

const {
  harness,
  t,
  log,
  pending,
  catalog,
  remote,
  crashReports,
  nextCrashReport,
  useBibleStore,
  usePreferenceStore,
  renderPicker,
  rowOf,
  rowNames,
  headers,
  iconNames,
  openManageSheet,
  closeManageSheet,
  inAct,
  lastAlert,
  alertButton,
} = installPickerRenderFixture(mock);

type View = Awaited<ReturnType<typeof renderPicker>>;

/** Taps a row that needs its text and confirms the download prompt. */
async function startDownload(view: View, translation: typeof NET) {
  await view.press(rowOf(view, translation));
  assert.equal(lastAlert()?.title, translation.name);
  await inAct(() => alertButton(t('translations.download'))?.onPress?.());
}

const textProgress = (translationId: string, progress: number, isIndeterminate = false) =>
  inAct(() =>
    useBibleStore.setState({
      downloadProgress: { translationId, progress, status: 'downloading', isIndeterminate },
    })
  );

// ---------------------------------------------------------------------------
// Sections: pinned and hidden
// ---------------------------------------------------------------------------

test('a pinned Bible joins My Translations after the current one; a hidden one drops to Available', async () => {
  usePreferenceStore.setState({ pinnedIds: ['engnet'], hiddenIds: ['emtv'] });
  const view = await renderPicker();

  assert.deepEqual(headers(view), [
    t('translations.myTranslations'),
    `${t('translations.available')} · English`,
  ]);
  assert.deepEqual(rowNames(view), [
    BSB.name,
    NET.name,
    UNKNOWN_COVERAGE_AUDIO.name,
    EMTV.name,
    GOSPEL_AUDIO.name,
  ]);
});

test('hiding is offered for a pinned Bible that is not installed', async () => {
  usePreferenceStore.setState({ pinnedIds: ['engnet'] });
  const view = await renderPicker();
  const sheet = await openManageSheet(view, NET);

  await view.press(within(sheet).getByRole('button', { name: t('translations.hide') }));
  assert.deepEqual(log, [['hide', 'engnet']]);
  assert.equal(view.queryAllByType('Modal').length, 0);
  assert.equal(rowNames(view).indexOf(NET.name), 3, 'the hidden Bible moves to Available');
});

test('a query that matches nothing leaves only the search field', async () => {
  const view = await renderPicker();
  await view.changeText(view.getByTestId('translation-picker-search'), 'zzzz');

  assert.deepEqual(headers(view), []);
  assert.deepEqual(rowNames(view), []);
  assert.equal(view.queryByTestId('translation-picker-language-search-result'), null);
  assert.equal(view.queryByTestId('translation-picker-language-pill'), null);
});

test('with a single language there is no language pill', async () => {
  useBibleStore.setState({ translations: [BSB, EMTV, NET] });
  const view = await renderPicker();

  assert.equal(view.queryByTestId('translation-picker-language-pill'), null);
  assert.deepEqual(rowNames(view), [BSB.name, EMTV.name, NET.name]);
});

// ---------------------------------------------------------------------------
// Download states
// ---------------------------------------------------------------------------

test('a Bible chosen during a download waits its turn, and can be taken out of the line', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await textProgress('engnet', 10);
  assert.deepEqual(harness.rn.__recorded.announcements, [
    `${NET.name}: ${t('translations.downloading')}`,
  ]);

  await view.changeText(view.getByTestId('translation-picker-search'), 'Reina');
  await startDownload(view, SPANISH_RV);

  const queued = rowOf(view, SPANISH_RV);
  assert.ok(within(queued).getByText(t('translations.queued')));
  assert.deepEqual(queued.props.accessibilityValue, { text: t('translations.queued') });
  assert.equal(queued.props.disabled, true, 'a waiting row cannot be tapped again');
  assert.deepEqual(log, [['downloadTranslation', 'engnet']], 'only one download runs');
  assert.equal(
    harness.rn.__recorded.announcements.at(-1),
    `${SPANISH_RV.name}: ${t('translations.queued')}`
  );

  await view.press(within(queued).getByRole('button', { name: t('translations.cancelDownload') }));
  assert.equal(within(rowOf(view, SPANISH_RV)).queryByText(t('translations.queued')), null);
  assert.ok(iconNames(rowOf(view, SPANISH_RV)).includes('download-outline'));
  assert.deepEqual(
    log,
    [['downloadTranslation', 'engnet']],
    'cancelling a wait cancels no download'
  );
});

test('a waiting Bible starts downloading once the running one finishes, and only it opens', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await view.changeText(view.getByTestId('translation-picker-search'), 'Reina');
  await startDownload(view, SPANISH_RV);

  await inAct(() => pending.download?.resolve('installed'));
  assert.deepEqual(log, [
    ['downloadTranslation', 'engnet'],
    ['downloadTranslation', 'spa-rv'],
  ]);

  log.length = 0;
  await inAct(() => pending.download?.resolve('installed'));
  assert.deepEqual(log, [
    ['setPreferredTranslationLanguage', 'Spanish'],
    ['setCurrentTranslation', 'spa-rv'],
    ['close'],
    ['activated', 'spa-rv'],
  ]);
});

test('an indeterminate text download shows an ellipsis and says it is downloading', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await textProgress('engnet', 0, true);

  const row = rowOf(view, NET);
  assert.ok(within(row).getByText('…'));
  assert.deepEqual(row.props.accessibilityValue, { text: t('translations.downloading') });
  assert.deepEqual(
    row.props.accessibilityActions,
    [{ name: 'cancelDownload', label: t('translations.cancelDownload') }],
    'VoiceOver can cancel from the row itself'
  );
  await view.fire(row, 'onAccessibilityAction', { nativeEvent: { actionName: 'cancelDownload' } });
  assert.deepEqual(log.at(-1), ['cancelDownload']);
});

test('a download that stops without installing announces the Bible as available again', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await textProgress('engnet', 90);
  await inAct(() => useBibleStore.setState({ downloadProgress: null }));

  assert.deepEqual(harness.rn.__recorded.announcements, [
    `${NET.name}: ${t('translations.downloading')}`,
    `${NET.name}: ${t('translations.available')}`,
  ]);
});

test('a finished download announces the Bible installed once, as it moves to My Translations', async () => {
  // The download was superseded (another Bible was chosen meanwhile), so the picker stays open
  // and the row reappears under My Translations with a new key.
  const view = await renderPicker();
  await startDownload(view, NET);
  await textProgress('engnet', 90);

  const installed = (translation: typeof NET) =>
    translation.id === NET.id
      ? { ...translation, isDownloaded: true, textPackLocalPath: '/packs/engnet.sqlite' }
      : translation;
  await inAct(() =>
    useBibleStore.setState((state) => ({
      downloadProgress: null,
      translations: state.translations.map(installed),
    }))
  );

  assert.deepEqual(rowNames(view), [
    BSB.name,
    EMTV.name,
    NET.name,
    UNKNOWN_COVERAGE_AUDIO.name,
    GOSPEL_AUDIO.name,
  ]);
  assert.deepEqual(harness.rn.__recorded.announcements, [
    `${NET.name}: ${t('translations.downloading')}`,
    `${NET.name}: ${t('translations.installed')}`,
  ]);

  await inAct(() =>
    useBibleStore.setState((state) => ({
      translations: state.translations.map((item) => ({ ...item })),
    }))
  );
  assert.equal(harness.rn.__recorded.announcements.length, 2, 'announced once');
});

test('a failed text download is reported and offers to try again', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);

  const reported = nextCrashReport();
  const failure = new Error('network down');
  await inAct(() => pending.download?.reject(failure));
  await reported;

  assert.deepEqual(crashReports, [{ source: 'textPack.install', error: failure }]);
  assert.equal(lastAlert()?.title, t('bible.translationDownloadFailedTitle'));
  assert.deepEqual(log, [['downloadTranslation', 'engnet']], 'nothing opens');

  await inAct(() => alertButton(t('common.retry'))?.onPress?.());
  assert.deepEqual(log.at(-1), ['downloadTranslation', 'engnet']);
});

test('choosing an installed Bible mid-download opens it, and the download then opens nothing', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await view.press(rowOf(view, EMTV));
  assert.deepEqual(log.at(-1), ['activated', 'emtv']);

  log.length = 0;
  await inAct(() => pending.download?.resolve('installed'));
  assert.deepEqual(log, []);
});

test('the manage sheet downloads the text without a prompt and shows it busy while it runs', async () => {
  const view = await renderPicker();
  let sheet = await openManageSheet(view, NET);
  const textRow = within(sheet).getByRole('button', { name: t('audio.showText') });
  assert.deepEqual(textRow.props.accessibilityValue, {
    text: `${t('translations.download')}, ~4 MB`,
  });

  await view.press(textRow);
  assert.deepEqual(log, [['downloadTranslation', 'engnet']]);
  assert.equal(harness.rn.__recorded.alerts.length, 0);

  await textProgress('engnet', 60);
  sheet = assertDefined(view.queryAllByType('Modal')[0], 'the manage sheet');
  const busy = within(sheet).getByRole('button', { name: t('audio.showText') });
  assert.deepEqual(busy.props.accessibilityValue, { text: '60%' });
  assert.equal(busy.props.disabled, true);
  assert.equal(
    within(sheet).queryByRole('button', { name: t('translations.delete') }),
    null,
    'a text download in progress cannot be deleted from under itself'
  );
  await closeManageSheet(view, sheet);
});

test('a running audio job keeps Delete available so the job can be stopped', async () => {
  useBibleStore.setState({
    translations: ALL.map((translation) =>
      translation.id === 'eng-audio'
        ? {
            ...translation,
            activeDownloadJob: {
              id: 'job-2',
              kind: 'audio-book' as const,
              state: 'running' as const,
              progress: 5,
              startedAt: 0,
              updatedAt: 0,
            },
          }
        : translation
    ),
  });
  const view = await renderPicker();
  const sheet = await openManageSheet(view, GOSPEL_AUDIO);

  assert.ok(within(sheet).getByRole('button', { name: t('translations.delete') }));
  assert.equal(within(sheet).getByRole('button', { name: 'Matthew' }).props.disabled, true);
});

// ---------------------------------------------------------------------------
// Selection routing
// ---------------------------------------------------------------------------

test('a New-Testament-only Bible chosen from an Old Testament book opens at Matthew 1', async () => {
  const ntOnly = bible({
    id: 'eng-nt',
    name: 'English New Testament',
    abbreviation: 'ENT',
    language: 'English',
    isDownloaded: true,
    totalBooks: 27,
  });
  useBibleStore.setState({ currentBook: 'GEN', translations: [...ALL, ntOnly] });
  const view = await renderPicker();
  await view.press(rowOf(view, ntOnly));

  assert.deepEqual(log, [
    ['setPreferredTranslationLanguage', 'English'],
    ['setCurrentBook', 'MAT'],
    ['setCurrentChapter', 1],
    ['setCurrentTranslation', 'eng-nt'],
    ['close'],
    ['activated', 'eng-nt'],
  ]);
});

test('an audio Bible that does not cover the current book opens at the first book it covers', async () => {
  remote.unavailable.add('eng-audio:JHN');
  remote.firstAudioBook = 'MAT';
  const view = await renderPicker();
  await view.press(rowOf(view, GOSPEL_AUDIO));

  assert.deepEqual(log, [
    ['setPreferredTranslationLanguage', 'English'],
    ['setCurrentBook', 'MAT'],
    ['setCurrentChapter', 1],
    ['setCurrentTranslation', 'eng-audio'],
    ['close'],
    ['activated', 'eng-audio'],
  ]);
});

test('an audio Bible with no streamable book explains that audio could not load', async () => {
  remote.unavailable.add('*');
  const view = await renderPicker();
  await view.press(rowOf(view, GOSPEL_AUDIO));

  assert.deepEqual(log, []);
  assert.deepEqual(
    [lastAlert()?.title, lastAlert()?.message],
    [t('common.error'), t('bible.audioDownloadFailed')]
  );
});

test('before the catalog has loaded, choosing a missing Bible retries the catalog first', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const bundledOnly = bible({
    id: 'eng-soon',
    name: 'Coming Soon Bible',
    abbreviation: 'CSB',
    language: 'English',
    hasText: false,
  });
  useBibleStore.setState({ translations: [BSB, EMTV, bundledOnly] });
  catalog.failure = new Error('offline');
  const view = await renderPicker();
  assert.equal(catalog.loads, 1);

  await view.press(rowOf(view, bundledOnly));

  assert.equal(catalog.loads, 2, 'the catalog is asked again before deciding');
  assert.equal(view.queryByText(t('common.loading')), null, 'the loading note clears on failure');
  assert.equal(lastAlert()?.title, t('common.comingSoon'));
  assert.deepEqual(log, []);
});

// ---------------------------------------------------------------------------
// Render reach (download progress ticks: TranslationPickerList.render.test.tsx)
// ---------------------------------------------------------------------------

/** Translation rows (their touchables) drawn since `mark`, by abbreviation; rows at 0 omitted. */
const rowRenders = (mark: number) =>
  Object.fromEntries(
    useBibleStore
      .getState()
      .translations.map((translation) => [
        translation.abbreviation,
        harness.renders.count(mark, 'TouchableOpacity', (props) =>
          String(props.accessibilityLabel ?? '').startsWith(`${translation.name},`)
        ),
      ])
      .filter(([, count]) => count !== 0)
  );

test('typing a query that keeps the same results leaves the rows alone', async () => {
  const view = await renderPicker();
  const search = () => view.getByTestId('translation-picker-search');
  await view.changeText(search(), 'Berea');

  const mark = harness.renders.mark();
  await view.changeText(search(), 'Berean');
  assert.deepEqual(rowRenders(mark), {});
  assert.equal(search().props.value, 'Berean');
});

test('opening and closing the manage sheet leaves the rows alone', async () => {
  const view = await renderPicker();
  const mark = harness.renders.mark();

  const sheet = await openManageSheet(view, EMTV);
  await closeManageSheet(view, sheet);

  assert.deepEqual(rowRenders(mark), {});
});

test('starting and queueing downloads redraws only the rows whose state changed', async () => {
  const view = await renderPicker();
  let mark = harness.renders.mark();
  await startDownload(view, NET);
  assert.deepEqual(rowRenders(mark), { NET: 1 }, 'the downloading row is disabled');

  await view.changeText(view.getByTestId('translation-picker-search'), 'Reina');
  mark = harness.renders.mark();
  await startDownload(view, SPANISH_RV);
  assert.deepEqual(rowRenders(mark), { RV: 1 }, 'only the queued row changes');
});

test('typing within a language match keeps the language row and the Bible rows as they were', async () => {
  const view = await renderPicker();
  const search = () => view.getByTestId('translation-picker-search');
  await view.changeText(search(), 'spanis');
  assert.ok(view.getByTestId('translation-picker-language-search-result'));

  const mark = harness.renders.mark();
  await view.changeText(search(), 'spanish');
  assert.equal(
    harness.renders.count(
      mark,
      'TouchableOpacity',
      (props) => props.testID === 'translation-picker-language-search-result'
    ),
    0
  );
  assert.deepEqual(rowRenders(mark), {});
});

test('a download starting leaves the language pill alone', async () => {
  const view = await renderPicker();
  const mark = harness.renders.mark();
  await startDownload(view, NET);

  assert.equal(
    harness.renders.count(
      mark,
      'TouchableOpacity',
      (props) => props.testID === 'translation-picker-language-pill'
    ),
    0
  );
});

test('the language list closes itself when the catalog drops to one language', async () => {
  const view = await renderPicker();
  await view.press(view.getByTestId('translation-picker-language-pill'));
  assert.equal(view.queryByTestId('translation-picker-search'), null);

  await inAct(() => useBibleStore.setState({ translations: [BSB, EMTV, NET] }));

  assert.ok(view.getByTestId('translation-picker-search'), 'back on the translation list');
  assert.equal(view.queryByTestId('translation-picker-language-pill'), null);
});

test('a host re-rendering with fresh callbacks leaves the rows alone, and the newest callbacks run', async () => {
  // The reader re-renders on every audio position tick and passes new handler functions each
  // time; the picker's rows must not redraw for that.
  const { TranslationPickerList } = await import('./TranslationPickerList');
  const picker = (generation: number) => (
    <TranslationPickerList
      onRequestClose={() => log.push(['close', generation])}
      onTranslationActivated={(translation) => log.push(['activated', translation.id, generation])}
    />
  );
  const view = await harness.render(picker(1));
  await view.flush();

  const mark = harness.renders.mark();
  await view.rerender(picker(2));
  assert.deepEqual(rowRenders(mark), {});

  await view.press(rowOf(view, EMTV));
  assert.deepEqual(log.slice(-2), [
    ['close', 2],
    ['activated', 'emtv', 2],
  ]);
});

// A failed catalog can leave the shipped Hindi placeholder visible in search.
// Its next tap retries hydration; closing the host must abandon the selection.
async function renderPendingHindiSelection(host: 'list' | 'reader' | 'browser' = 'list') {
  const { TranslationPickerList } = await import('./TranslationPickerList');
  const { ReaderTranslationSheet } = await import('./reader/ReaderTranslationSheet');
  const { TranslationPickerSheet } = await import('./browser/TranslationPickerSheet');
  const hindi = bible({
    id: 'hincv',
    name: 'Hindi Contemporary Version',
    abbreviation: 'HCV',
    language: 'Hindi',
    source: 'runtime',
    hasText: false,
  });
  useBibleStore.setState({ translations: [BSB, EMTV, hindi] });
  catalog.failure = new Error('offline');
  const renderHost = (active: boolean) =>
    host === 'reader' ? (
      <ReaderTranslationSheet
        canShowTranslationSheet
        showTranslationSheet={active}
        handleCloseTranslationSheet={() => log.push(['close'])}
        handleTranslationActivated={(translation) => log.push(['activated', translation.id])}
      />
    ) : host === 'browser' ? (
      <TranslationPickerSheet visible={active} onClose={() => log.push(['close'])} />
    ) : (
      <TranslationPickerList
        isActive={active}
        onRequestClose={() => log.push(['close'])}
        onTranslationActivated={(translation) => log.push(['activated', translation.id])}
      />
    );
  const view = await harness.render(renderHost(true));
  await view.flush();
  const selectReady = rowOf(view, EMTV).props.onPress as () => void;
  await view.changeText(view.getByTestId('translation-picker-search'), 'Hindi Contemporary');
  log.length = 0;
  catalog.failure = null;
  catalog.hold = true;
  await view.press(rowOf(view, hindi));
  assert.equal(catalog.loads, 2, 'selection entered the awaited refresh');
  const refreshedHindi = {
    ...NET,
    id: hindi.id,
    name: hindi.name,
    abbreviation: 'HCV',
    language: 'Hindi',
  };
  return { view, renderHost, refreshedHindi, selectReady, finishCatalog: catalog.finish };
}

test('a catalog selection settling after picker unmount presents no prompt', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { view, refreshedHindi } = await renderPendingHindiSelection();
  await view.unmount();
  await inAct(() => useBibleStore.setState({ translations: [BSB, EMTV, refreshedHindi] }));
  await inAct(() => catalog.finish());
  assert.equal(lastAlert(), undefined);
  assert.deepEqual(log, []);
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

for (const host of ['list', 'reader', 'browser'] as const) {
  test(`a hidden then reopened ${host} sheet abandons its pending catalog selection`, async (context) => {
    context.mock.method(console, 'warn', () => {});
    const { view, renderHost, refreshedHindi, finishCatalog } =
      await renderPendingHindiSelection(host);
    await view.rerender(renderHost(false));
    await view.rerender(renderHost(true));
    await inAct(() => useBibleStore.setState({ translations: [BSB, EMTV, refreshedHindi] }));
    await inAct(() => finishCatalog());
    assert.equal(lastAlert(), undefined, 'reopening cannot restore old selection ownership');
    assert.deepEqual(log, []);
    assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
    await view.changeText(view.getByTestId('translation-picker-search'), '');
    await view.press(rowOf(view, EMTV));
    assert.equal(
      useBibleStore.getState().currentTranslation,
      'emtv',
      'fresh selection still works'
    );
    assert.equal(log.at(-1)?.[0], host === 'browser' ? 'close' : 'activated');
  });
}

test('a newer selection owns the reader when an older catalog selection settles', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { refreshedHindi, selectReady } = await renderPendingHindiSelection();
  // A tap captured before the loading render may already be queued by native input.
  await inAct(() => selectReady());
  assert.equal(useBibleStore.getState().currentTranslation, EMTV.id);
  const latestChoiceLog = [...log];
  await inAct(() =>
    useBibleStore.setState({
      translations: [BSB, EMTV, { ...GOSPEL_AUDIO, id: refreshedHindi.id }],
    })
  );
  await inAct(() => catalog.finish());
  assert.equal(useBibleStore.getState().currentTranslation, EMTV.id);
  assert.deepEqual(log, latestChoiceLog);
  assert.equal(lastAlert(), undefined);
});

test('a translation removed during catalog refresh cannot be selected from its old row', async (context) => {
  context.mock.method(console, 'warn', () => {});
  await renderPendingHindiSelection();
  await inAct(() => useBibleStore.setState({ translations: [BSB, EMTV] }));
  await inAct(() => catalog.finish());
  assert.equal(useBibleStore.getState().currentTranslation, BSB.id);
  assert.deepEqual(log, []);
  assert.equal(
    lastAlert(),
    undefined,
    'the removed placeholder cannot explain its stale availability'
  );
});

test('a captured removed-row tap releases loading owned by the superseded catalog selection', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { view, selectReady, finishCatalog } = await renderPendingHindiSelection();
  assert.ok(view.getByText(t('common.loading')));
  await inAct(() =>
    useBibleStore.setState({
      translations: useBibleStore.getState().translations.filter(({ id }) => id !== EMTV.id),
    })
  );
  await inAct(() => selectReady());
  await inAct(() => finishCatalog());
  assert.equal(view.queryByText(t('common.loading')), null);
  assert.equal(useBibleStore.getState().currentTranslation, BSB.id);
  assert.deepEqual(log, []);
  await view.changeText(view.getByTestId('translation-picker-search'), '');
  await view.press(rowOf(view, BSB));
  assert.deepEqual(log.at(-1), ['activated', BSB.id], 'available rows remain tappable');
});

test('a download prompt superseded by a newer Bible selection cannot start work', async () => {
  const view = await renderPicker();
  await view.press(rowOf(view, NET));
  const acceptOldPrompt = alertButton(t('translations.download'))?.onPress;
  assert.ok(acceptOldPrompt);
  await view.press(rowOf(view, EMTV));
  const latestChoiceLog = [...log];
  await inAct(() => acceptOldPrompt());
  assert.deepEqual(log, latestChoiceLog);
  assert.equal(pending.download, null);
  assert.equal(useBibleStore.getState().currentTranslation, 'emtv');
});

test('hide and reopen invalidate an existing download prompt while a fresh prompt works', async () => {
  const { TranslationPickerList } = await import('./TranslationPickerList');
  const picker = (isActive: boolean) => <TranslationPickerList isActive={isActive} />;
  const view = await harness.render(picker(true));
  await view.flush();
  await view.press(rowOf(view, NET));
  const acceptOldPrompt = alertButton(t('translations.download'))?.onPress;
  assert.ok(acceptOldPrompt);
  await view.rerender(picker(false));
  await view.rerender(picker(true));
  await inAct(() => acceptOldPrompt());
  assert.equal(pending.download, null);
  await startDownload(view, NET);
  assert.ok(pending.download, 'fresh prompt can start a download');
  await inAct(() => pending.download?.resolve('installed'));
  assert.equal(useBibleStore.getState().currentTranslation, NET.id);
});

test('an installation started before hide finishes without stealing the reopened choice', async () => {
  const { TranslationPickerList } = await import('./TranslationPickerList');
  const picker = (isActive: boolean) => (
    <TranslationPickerList
      isActive={isActive}
      onRequestClose={() => log.push(['close'])}
      onTranslationActivated={(translation) => log.push(['activated', translation.id])}
    />
  );
  const view = await harness.render(picker(true));
  await view.flush();
  await startDownload(view, NET);
  await view.rerender(picker(false));
  await view.rerender(picker(true));
  // Completion races with reopening before the user makes another choice.
  await inAct(() =>
    useBibleStore.setState({
      translations: ALL.map((translation) =>
        translation.id === NET.id
          ? { ...translation, isDownloaded: true, textPackLocalPath: 'file:///net.sqlite' }
          : translation
      ),
    })
  );
  await inAct(() => pending.download?.resolve('installed'));
  assert.equal(
    useBibleStore.getState().translations.find((translation) => translation.id === NET.id)
      ?.isDownloaded,
    true
  );
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.deepEqual(log, [['downloadTranslation', NET.id]], 'no cancel, activation or old close');
  await view.press(rowOf(view, EMTV));
  assert.equal(useBibleStore.getState().currentTranslation, 'emtv');
});

test('catalog-delayed selection uses current book and current translation availability', async (context) => {
  context.mock.method(console, 'warn', () => {});
  useBibleStore.setState({ currentBook: 'GEN' });
  const { view, refreshedHindi } = await renderPendingHindiSelection();
  remote.unavailable.add('hincv:GEN');
  remote.firstAudioBook = 'MAT';
  await inAct(() =>
    useBibleStore.setState({
      currentBook: 'JHN',
      translations: [
        BSB,
        EMTV,
        { ...GOSPEL_AUDIO, id: refreshedHindi.id, name: refreshedHindi.name, language: 'Hindi' },
      ],
    })
  );
  await inAct(() => catalog.finish());
  assert.equal(useBibleStore.getState().currentTranslation, 'hincv');
  assert.equal(
    log.some(([action]) => action === 'setCurrentBook' || action === 'setCurrentChapter'),
    false,
    'the old Genesis location must not redirect the current John reader'
  );
  assert.equal(lastAlert(), undefined);
  await view.unmount();
});

for (const supersede of ['hide-reopen', 'new-selection', 'new-prompt', 'unmount'] as const) {
  test(`a failed-download Retry cannot resume after ${supersede}`, async (context) => {
    context.mock.method(console, 'error', () => {});
    const { TranslationPickerList } = await import('./TranslationPickerList');
    const picker = (isActive: boolean) => (
      <TranslationPickerList
        isActive={isActive}
        onRequestClose={() => log.push(['close'])}
        onTranslationActivated={(translation) => log.push(['activated', translation.id])}
      />
    );
    const view = await harness.render(picker(true));
    await view.flush();
    await startDownload(view, NET);
    const reported = nextCrashReport();
    await inAct(() => pending.download?.reject(new Error('offline')));
    await reported;
    await view.flush();
    const retry = alertButton(t('common.retry'))?.onPress;
    assert.ok(retry);
    pending.download = null;
    if (supersede === 'hide-reopen') {
      await view.rerender(picker(false));
      await view.rerender(picker(true));
    } else if (supersede === 'new-selection') {
      await view.press(rowOf(view, EMTV));
    } else if (supersede === 'new-prompt') {
      await view.changeText(view.getByTestId('translation-picker-search'), 'Reina');
      await view.press(rowOf(view, SPANISH_RV));
    } else {
      await view.unmount();
    }
    const latestLog = [...log];
    await inAct(() => retry());
    assert.equal(pending.download, null, 'old Retry cannot start a fresh operation');
    assert.deepEqual(log, latestLog);
    assert.equal(
      useBibleStore.getState().currentTranslation,
      supersede === 'new-selection' ? EMTV.id : BSB.id
    );
  });
}
