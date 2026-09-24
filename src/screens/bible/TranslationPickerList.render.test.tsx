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
import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { useTranslation } from 'react-i18next';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import type { BibleTranslation, TranslationDownloadProgress } from '../../types';

const harness = installRenderHarness(mock, {
  hooks: {
    useI18n: () => {
      const { t } = useTranslation();
      return { t, currentLanguage: 'en' };
    },
  },
});
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });
mockBarrel(mock, 'components/ui/index.ts', { real: ['ProgressBar'] });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bible(
  overrides: Partial<BibleTranslation> &
    Pick<BibleTranslation, 'id' | 'name' | 'abbreviation' | 'language'>
): BibleTranslation {
  return {
    description: '',
    copyright: '',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'bundled',
    ...overrides,
  };
}

const runtimeText = (id: string) => ({
  source: 'runtime' as const,
  catalog: {
    version: '1',
    updatedAt: '2026-09-01',
    text: {
      format: 'sqlite' as const,
      version: '1',
      downloadUrl: `https://example.test/${id}.sqlite`,
      sha256: 'x',
    },
  },
});

const BSB = bible({
  id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  language: 'English',
  isDownloaded: true,
  hasAudio: true,
  audioGranularity: 'chapter',
});
const KJV = bible({
  id: 'kjv',
  name: 'King James Version',
  abbreviation: 'KJV',
  language: 'English',
  isDownloaded: true,
});
const NET = bible({
  id: 'engnet',
  name: 'New English Translation',
  abbreviation: 'NET',
  language: 'English',
  ...runtimeText('engnet'),
});
const LONG_SPANISH_NAME =
  'La Santa Biblia en Español Contemporáneo: Edición de Estudio Completa con Notas';
const SPANISH_LONG = bible({
  id: 'spa-long',
  name: LONG_SPANISH_NAME,
  abbreviation: 'SBEC',
  language: 'Spanish',
  ...runtimeText('spa-long'),
});
const SPANISH_RV = bible({
  id: 'spa-rv',
  name: 'Reina-Valera',
  abbreviation: 'RV',
  language: 'Spanish',
  ...runtimeText('spa-rv'),
});
const LUTHER = bible({
  id: 'deu-luther',
  name: 'Lutherbibel',
  abbreviation: 'LUT',
  language: 'German',
  ...runtimeText('deu-luther'),
});
// Audio for two Gospels only: no whole-testament collection, just by-book rows.
const GOSPEL_AUDIO = bible({
  id: 'eng-audio',
  name: 'Gospel Audio',
  abbreviation: 'GA',
  language: 'English',
  hasText: false,
  hasAudio: true,
  audioGranularity: 'chapter',
  source: 'runtime',
  catalog: {
    version: '1',
    updatedAt: '2026-09-01',
    audio: { strategy: 'stream-template', books: { MAT: {}, MRK: {} } },
  },
});
// Has audio, but the catalog says nothing about which books.
const UNKNOWN_COVERAGE_AUDIO = bible({
  id: 'eng-unknown-audio',
  name: 'Unknown Coverage Audio',
  abbreviation: 'UCA',
  language: 'English',
  isDownloaded: true,
  hasAudio: true,
  audioGranularity: 'chapter',
});

const ALL = [BSB, KJV, NET, SPANISH_LONG, SPANISH_RV, LUTHER, GOSPEL_AUDIO, UNKNOWN_COVERAGE_AUDIO];

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Every store action and picker callback, in the order they happened. */
const log: unknown[][] = [];

type Deferred<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };
const pending: { download: Deferred<'installed' | 'cancelled'> | null } = { download: null };
const audio: { failure: unknown } = { failure: null };

interface FakeBibleState {
  currentBook: string;
  currentTranslation: string;
  preferredTranslationLanguage: string | null;
  translations: BibleTranslation[];
  downloadProgress: TranslationDownloadProgress | null;
  [action: string]: unknown;
}

const recordAudio =
  (name: string) =>
  async (...args: unknown[]) => {
    log.push([name, ...args]);
    if (audio.failure) throw audio.failure;
  };

const useBibleStore = create<FakeBibleState>()((set) => ({
  currentBook: 'JHN',
  currentTranslation: 'bsb',
  preferredTranslationLanguage: 'English',
  translations: ALL,
  downloadProgress: null,
  setCurrentTranslation: (id: string) => {
    log.push(['setCurrentTranslation', id]);
    set({ currentTranslation: id });
  },
  setCurrentBook: (id: string) => log.push(['setCurrentBook', id]),
  setCurrentChapter: (chapter: number) => log.push(['setCurrentChapter', chapter]),
  setPreferredTranslationLanguage: (language: string) => {
    log.push(['setPreferredTranslationLanguage', language]);
    set({ preferredTranslationLanguage: language });
  },
  downloadTranslation: (id: string) => {
    log.push(['downloadTranslation', id]);
    return new Promise((resolve, reject) => {
      pending.download = { resolve, reject };
    });
  },
  cancelDownload: () => log.push(['cancelDownload']),
  downloadAudioForBook: recordAudio('downloadAudioForBook'),
  downloadAudioForBooks: recordAudio('downloadAudioForBooks'),
  downloadAudioForTranslation: recordAudio('downloadAudioForTranslation'),
  deleteTranslation: (id: string) => log.push(['deleteTranslation', id]),
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });

const usePreferenceStore = create<{
  pinnedIds: string[];
  hiddenIds: string[];
  pin: (id: string) => void;
  unpin: (id: string) => void;
  hide: (id: string) => void;
}>()((set) => ({
  pinnedIds: [],
  hiddenIds: [],
  pin: (id) => {
    log.push(['pin', id]);
    set((state) => ({ pinnedIds: [...state.pinnedIds, id] }));
  },
  unpin: (id) => {
    log.push(['unpin', id]);
    set((state) => ({ pinnedIds: state.pinnedIds.filter((pinned) => pinned !== id) }));
  },
  hide: (id) => {
    log.push(['hide', id]);
    set((state) => ({ hiddenIds: [...state.hiddenIds, id] }));
  },
}));
mockModule(mock, sourcePath('stores/translationPreferenceStore.ts'), {
  useTranslationPreferenceStore: usePreferenceStore,
});

// The runtime catalog load the picker kicks off on mount; held open when a test sets `hold`.
const catalog = { loads: 0, hold: false, finish: () => {} };
mockModule(mock, sourcePath('services/translations/index.ts'), {
  ensureRuntimeCatalogLoaded: () => {
    catalog.loads += 1;
    if (!catalog.hold) return Promise.resolve();
    return new Promise<void>((resolve) => {
      catalog.finish = resolve;
    });
  },
  hasRuntimeCatalogTranslations: (translations: BibleTranslation[]) =>
    translations.some((translation) => translation.source === 'runtime' && translation.catalog),
});

// Remote audio: available everywhere except the `translation:book` pairs listed here.
const remote = { unavailable: new Set<string>(), calls: [] as string[] };
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  isRemoteAudioAvailable: (translationId: string, bookId: string) => {
    remote.calls.push(`${translationId}:${bookId}`);
    return !remote.unavailable.has(`${translationId}:${bookId}`) && !remote.unavailable.has('*');
  },
  getFirstAvailableAudioBook: () => null,
});

afterEach(() => {
  log.length = 0;
  pending.download = null;
  audio.failure = null;
  catalog.loads = 0;
  catalog.hold = false;
  remote.unavailable.clear();
  remote.calls.length = 0;
  useBibleStore.setState(useBibleStore.getInitialState(), true);
  usePreferenceStore.setState(usePreferenceStore.getInitialState(), true);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderPicker() {
  const { TranslationPickerList } = await import('./TranslationPickerList');
  const view = await harness.render(
    <TranslationPickerList
      onRequestClose={() => log.push(['close'])}
      onTranslationActivated={(translation) => log.push(['activated', translation.id])}
    />
  );
  await view.flush();
  return view;
}
type View = Awaited<ReturnType<typeof renderPicker>>;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A translation row is announced as "<name>, <abbreviation> · <availability>". */
const rowOf = (view: View, translation: BibleTranslation) =>
  view.getByRole('button', { name: new RegExp(`^${escapeRegExp(translation.name)},`) });
const rowNames = (view: View) =>
  view
    .getAllByRole('button')
    .map((node) => String(node.props.accessibilityLabel ?? ''))
    .filter((label) => ALL.some((translation) => label.startsWith(`${translation.name},`)))
    .map((label) => label.split(',')[0]);
const iconNames = (node: ReactTestInstance) =>
  within(node)
    .queryAllByType('Icon')
    .map((icon) => icon.props.name);

async function openManageSheet(view: View, translation: BibleTranslation) {
  await view.press(view.getByTestId(`translation-picker-more-${translation.id}`));
  const [sheet] = view.queryAllByType('Modal');
  assert.ok(sheet, 'the manage sheet opens');
  return sheet;
}

const inAct = async (work: () => unknown) => {
  await act(async () => {
    await work();
  });
};

type AlertButton = { text: string; style?: string; onPress?: () => void };
const lastAlert = () => harness.rn.__recorded.alerts.at(-1);
const alertButton = (text: string) =>
  (lastAlert()?.buttons as AlertButton[]).find((button) => button.text === text);

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
  await view.press(within(row).getByRole('button', { name: t('translations.cancelDownload') }));
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
  assert.ok(scope.getByText(t('bible.byBook')));
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

  const matthew = scope.getByRole('button', { name: 'Matthew' });
  assert.ok(iconNames(matthew).includes('download-outline'));
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
