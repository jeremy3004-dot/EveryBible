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
  KJV,
  NET,
  SPANISH_RV,
  UNKNOWN_COVERAGE_AUDIO,
  bible,
  installPickerRenderFixture,
} from './TranslationPickerList.renderFixture';

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
  usePreferenceStore.setState({ pinnedIds: ['engnet'], hiddenIds: ['kjv'] });
  const view = await renderPicker();

  assert.deepEqual(headers(view), [
    t('translations.myTranslations'),
    `${t('translations.available')} · English`,
  ]);
  assert.deepEqual(rowNames(view), [
    BSB.name,
    NET.name,
    UNKNOWN_COVERAGE_AUDIO.name,
    KJV.name,
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
  useBibleStore.setState({ translations: [BSB, KJV, NET] });
  const view = await renderPicker();

  assert.equal(view.queryByTestId('translation-picker-language-pill'), null);
  assert.deepEqual(rowNames(view), [BSB.name, KJV.name, NET.name]);
});

// ---------------------------------------------------------------------------
// Download states
// ---------------------------------------------------------------------------

test('a Bible chosen during a download waits its turn, and can be taken out of the line', async () => {
  const view = await renderPicker();
  await startDownload(view, NET);
  await textProgress('engnet', 10);
  assert.deepEqual(harness.rn.__recorded.announcements, [t('translations.downloading')]);

  await view.changeText(view.getByTestId('translation-picker-search'), 'Reina');
  await startDownload(view, SPANISH_RV);

  const queued = rowOf(view, SPANISH_RV);
  assert.ok(within(queued).getByText(t('translations.queued')));
  assert.deepEqual(queued.props.accessibilityValue, { text: t('translations.queued') });
  assert.equal(queued.props.disabled, true, 'a waiting row cannot be tapped again');
  assert.deepEqual(log, [['downloadTranslation', 'engnet']], 'only one download runs');
  assert.equal(harness.rn.__recorded.announcements.at(-1), t('translations.queued'));

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
    t('translations.downloading'),
    t('translations.available'),
  ]);
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
  await view.press(rowOf(view, KJV));
  assert.deepEqual(log.at(-1), ['activated', 'kjv']);

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
  sheet = view.queryAllByType('Modal')[0];
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
  useBibleStore.setState({ translations: [BSB, KJV, bundledOnly] });
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

  const sheet = await openManageSheet(view, KJV);
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

  await inAct(() => useBibleStore.setState({ translations: [BSB, KJV, NET] }));

  assert.ok(view.getByTestId('translation-picker-search'), 'back on the translation list');
  assert.equal(view.queryByTestId('translation-picker-language-pill'), null);
});
