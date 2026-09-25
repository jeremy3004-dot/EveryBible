/**
 * Shared setup for the TranslationPickerList render tests.
 *
 * Installs the render harness plus real Zustand stores holding just the fields the picker
 * selects, a runtime catalog load the test can hold open, a remote-audio stand-in with
 * per-book gaps, and a crash queue that records reports. Call `installPickerRenderFixture(mock)`
 * once at module scope, before the picker is imported.
 */
import { afterEach, type MockTracker } from 'node:test';
import assert from 'node:assert/strict';
import { useTranslation } from 'react-i18next';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { installRenderHarness, within } from '../../testing/render';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import type { BibleTranslation, TranslationDownloadProgress } from '../../types';
// Loaded for real before the picker's copy is replaced by the counting wrapper below.
import * as translationModel from './bibleTranslationModel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function bible(
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

export const runtimeText = (id: string) => ({
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

export const BSB = bible({
  id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  language: 'English',
  isDownloaded: true,
  hasAudio: true,
  audioGranularity: 'chapter',
});
export const EMTV = bible({
  id: 'emtv',
  name: 'English Majority Text Version',
  abbreviation: 'EMTV',
  language: 'English',
  isDownloaded: true,
});
export const NET = bible({
  id: 'engnet',
  name: 'New English Translation',
  abbreviation: 'NET',
  language: 'English',
  ...runtimeText('engnet'),
});
export const LONG_SPANISH_NAME =
  'La Santa Biblia en Español Contemporáneo: Edición de Estudio Completa con Notas';
export const SPANISH_LONG = bible({
  id: 'spa-long',
  name: LONG_SPANISH_NAME,
  abbreviation: 'SBEC',
  language: 'Spanish',
  ...runtimeText('spa-long'),
});
export const SPANISH_RV = bible({
  id: 'spa-rv',
  name: 'Reina-Valera',
  abbreviation: 'RV',
  language: 'Spanish',
  ...runtimeText('spa-rv'),
});
export const LUTHER = bible({
  id: 'deu-luther',
  name: 'Lutherbibel',
  abbreviation: 'LUT',
  language: 'German',
  ...runtimeText('deu-luther'),
});
// Audio for two Gospels only: no whole-testament collection, just by-book rows.
export const GOSPEL_AUDIO = bible({
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
export const UNKNOWN_COVERAGE_AUDIO = bible({
  id: 'eng-unknown-audio',
  name: 'Unknown Coverage Audio',
  abbreviation: 'UCA',
  language: 'English',
  isDownloaded: true,
  hasAudio: true,
  audioGranularity: 'chapter',
});

export const ALL = [
  BSB,
  EMTV,
  NET,
  SPANISH_LONG,
  SPANISH_RV,
  LUTHER,
  GOSPEL_AUDIO,
  UNKNOWN_COVERAGE_AUDIO,
];

type Deferred<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };
export type AlertButton = { text: string; style?: string; onPress?: () => void };

interface FakeBibleState {
  currentBook: string;
  currentTranslation: string;
  preferredTranslationLanguage: string | null;
  translations: BibleTranslation[];
  downloadProgress: TranslationDownloadProgress | null;
  [action: string]: unknown;
}

export function installPickerRenderFixture(mock: MockTracker) {
  const harness = installRenderHarness(mock);
  // The picker imports useI18n from its own module, not the hooks barrel.
  mockModule(mock, sourcePath('hooks/useI18n.ts'), {
    useI18n: () => {
      const { t } = useTranslation();
      return { t, currentLanguage: 'en' };
    },
  });
  const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

  mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });

  // The catalog-wide builders the picker runs over every visible Bible, counted per call so a
  // test can tell a rebuild from a reused index.
  const modelCalls = {
    buildTranslationSearchIndex: 0,
    buildTranslationLanguageSearchIndex: 0,
    buildTranslationLanguageFilters: 0,
    buildTranslationLanguageOptions: 0,
    resolvePreferredTranslationLanguage: 0,
  };
  const counted =
    <Args extends unknown[], Result>(
      name: keyof typeof modelCalls,
      run: (...args: Args) => Result
    ) =>
    (...args: Args) => {
      modelCalls[name] += 1;
      return run(...args);
    };
  // A CommonJS-compiled module's namespace also carries `default`, which the mock would take
  // for the module's default export.
  const realModel = Object.fromEntries(
    Object.entries(translationModel).filter(([name]) => name !== 'default')
  );
  mockModule(mock, sourcePath('screens/bible/bibleTranslationModel.ts'), {
    ...realModel,
    buildTranslationSearchIndex: counted(
      'buildTranslationSearchIndex',
      translationModel.buildTranslationSearchIndex<BibleTranslation>
    ),
    buildTranslationLanguageSearchIndex: counted(
      'buildTranslationLanguageSearchIndex',
      translationModel.buildTranslationLanguageSearchIndex<BibleTranslation>
    ),
    buildTranslationLanguageFilters: counted(
      'buildTranslationLanguageFilters',
      translationModel.buildTranslationLanguageFilters<BibleTranslation>
    ),
    buildTranslationLanguageOptions: counted(
      'buildTranslationLanguageOptions',
      translationModel.buildTranslationLanguageOptions
    ),
    resolvePreferredTranslationLanguage: counted(
      'resolvePreferredTranslationLanguage',
      translationModel.resolvePreferredTranslationLanguage<BibleTranslation>
    ),
  });
  const resetModelCalls = () => {
    for (const name of Object.keys(modelCalls) as (keyof typeof modelCalls)[]) {
      modelCalls[name] = 0;
    }
  };
  mockBarrel(mock, 'components/ui/index.ts', { real: ['ProgressBar'] });

  /** Every store action and picker callback, in the order they happened. */
  const log: unknown[][] = [];
  const pending: { download: Deferred<'installed' | 'cancelled'> | null } = { download: null };
  const audio: { failure: unknown } = { failure: null };

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

  // The runtime catalog load the picker kicks off on mount; held open when a test sets `hold`,
  // and rejected (once settled) when a test sets `failure`.
  const catalog = {
    loads: 0,
    hold: false,
    failure: null as unknown,
    finish: () => {},
  };
  mockModule(mock, sourcePath('services/translations/index.ts'), {
    ensureRuntimeCatalogLoaded: () => {
      catalog.loads += 1;
      const settle = () => (catalog.failure ? Promise.reject(catalog.failure) : undefined);
      if (!catalog.hold) return Promise.resolve().then(settle);
      return new Promise<void>((resolve) => {
        catalog.finish = resolve;
      }).then(settle);
    },
    hasRuntimeCatalogTranslations: (translations: BibleTranslation[]) =>
      translations.some((translation) => translation.source === 'runtime' && translation.catalog),
  });

  // Remote audio: available everywhere except the `translation:book` pairs listed here.
  const remote = {
    unavailable: new Set<string>(),
    calls: [] as string[],
    firstAudioBook: null as string | null,
  };
  mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
    isRemoteAudioAvailable: (translationId: string, bookId: string) => {
      remote.calls.push(`${translationId}:${bookId}`);
      return !remote.unavailable.has(`${translationId}:${bookId}`) && !remote.unavailable.has('*');
    },
    getFirstAvailableAudioBook: () => remote.firstAudioBook,
  });

  // Failed text downloads are reported through the lazily loaded crash queue.
  const crashReports: { source: string; error: unknown }[] = [];
  let crashReported: () => void = () => {};
  const nextCrashReport = () =>
    new Promise<void>((resolve) => {
      crashReported = resolve;
    });
  mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
    reportHandledError: (source: string, error: unknown) => {
      crashReports.push({ source, error });
      crashReported();
    },
  });

  afterEach(() => {
    log.length = 0;
    pending.download = null;
    audio.failure = null;
    catalog.loads = 0;
    catalog.hold = false;
    catalog.failure = null;
    remote.unavailable.clear();
    remote.calls.length = 0;
    remote.firstAudioBook = null;
    crashReports.length = 0;
    resetModelCalls();
    useBibleStore.setState(useBibleStore.getInitialState(), true);
    usePreferenceStore.setState(usePreferenceStore.getInitialState(), true);
  });

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
  const rowOf = (view: View, translation: Pick<BibleTranslation, 'name'>) =>
    view.getByRole('button', { name: new RegExp(`^${escapeRegExp(translation.name)},`) });
  const rowNames = (view: View) => {
    const names = useBibleStore.getState().translations.map((translation) => translation.name);
    return view
      .getAllByRole('button')
      .map((node) => String(node.props.accessibilityLabel ?? ''))
      .filter((label) => names.some((name) => label.startsWith(`${name},`)))
      .map((label) => label.split(',')[0]);
  };
  const headers = (view: View) => view.queryAllByRole('header').map((node) => node.props.children);
  const iconNames = (node: ReactTestInstance) =>
    within(node)
      .queryAllByType('Icon')
      .map((icon) => icon.props.name);

  async function openManageSheet(view: View, translation: Pick<BibleTranslation, 'id'>) {
    await view.press(view.getByTestId(`translation-picker-more-${translation.id}`));
    const [sheet] = view.queryAllByType('Modal');
    assert.ok(sheet, 'the manage sheet opens');
    return sheet;
  }

  const closeManageSheet = async (view: View, sheet: ReactTestInstance) => {
    const [, closeButton] = within(sheet).getAllByRole('button', { name: t('interface.close') });
    assert.ok(closeButton, 'the sheet header has a close button');
    await view.press(closeButton);
  };

  const inAct = async (work: () => unknown) => {
    await act(async () => {
      await work();
    });
  };

  const lastAlert = () => harness.rn.__recorded.alerts.at(-1);
  const alertButton = (text: string) =>
    (lastAlert()?.buttons as AlertButton[] | undefined)?.find((button) => button.text === text);

  return {
    harness,
    t,
    log,
    pending,
    audio,
    catalog,
    remote,
    crashReports,
    nextCrashReport,
    modelCalls,
    resetModelCalls,
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
  };
}

export type PickerRenderFixture = ReturnType<typeof installPickerRenderFixture>;
export type PickerView = Awaited<ReturnType<PickerRenderFixture['renderPicker']>>;
