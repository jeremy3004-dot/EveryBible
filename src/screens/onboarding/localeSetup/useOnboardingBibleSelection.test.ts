import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockPackage, mockReactNative, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import type { BibleTranslation } from '../../../types';

// First run: picking a Bible finishes onboarding, a download is queued, and a failed
// download or a failed finish tells the reader and lets them retry.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockPackage(mock, 'react-i18next', {
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
});
const rn = mockReactNative(mock, { os: 'ios' });

type Preferences = Record<string, unknown>;

// Minimal selector stores: the hook only reads through selectors and getState().
function fakeStore<T extends object>(initial: T) {
  let state = initial;
  const useStore = <R>(selector: (value: T) => R): R => selector(state);
  useStore.getState = () => state;
  useStore.setState = (patch: Partial<T>) => {
    state = { ...state, ...patch };
  };
  return useStore;
}

const useAuthStore = fakeStore({
  preferences: {} as Preferences,
  setPreferences: (patch: Preferences) =>
    useAuthStore.setState({
      preferences: { ...useAuthStore.getState().preferences, ...patch },
    }),
});
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore });

type Download = { id: string; resolve: () => void; reject: (error: Error) => void };
const downloads: Download[] = [];
const useBibleStore = fakeStore({
  translations: [] as BibleTranslation[],
  currentTranslation: 'bsb',
  preferredLanguage: null as string | null,
  setCurrentTranslation: (id: string) => useBibleStore.setState({ currentTranslation: id }),
  setPreferredTranslationLanguage: (language: string | null) =>
    useBibleStore.setState({ preferredLanguage: language }),
  downloadTranslation: (id: string) =>
    new Promise<'installed' | 'cancelled'>((resolve, reject) => {
      downloads.push({ id, resolve: () => resolve('installed'), reject });
    }),
});
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });

const interfaceLanguage = { changes: [] as string[], fail: false };
mockModule(mock, sourcePath('i18n/index.ts'), {
  changeLanguage: async (code: string) => {
    interfaceLanguage.changes.push(code);
    if (interfaceLanguage.fail) throw new Error('locale bundle failed to load');
  },
});

const regional = { fallback: null as BibleTranslation | null };
mockModule(mock, sourcePath('services/translations/regionalTranslationFallback.ts'), {
  resolveRegionalFallbackTranslation: () => regional.fallback,
});
mockModule(mock, sourcePath('services/onboarding/localeSelection.ts'), {
  localeSearchEngine: {
    getLanguageByName: (name: string) =>
      name === 'Nepali' ? { code: 'npi', name: 'Nepali', nativeName: 'नेपाली' } : null,
    getCountryByCode: (code: string | null) =>
      code === 'NP' ? { code: 'NP', name: 'Nepal' } : null,
  },
});
mockModule(mock, sourcePath('screens/bible/bibleTranslationModel.ts'), {
  normalizeTranslationLanguage: (language: string | null | undefined) => language?.trim() ?? '',
});
const reportedFailures: unknown[] = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (_source: string, error: unknown) => reportedFailures.push(error),
});

// What the picker row says about each Bible: ready, needs a download, or not available.
const selectionReason = new Map<string, 'ready' | 'download-required' | 'unavailable'>();
mockModule(mock, sourcePath('screens/onboarding/localeSetup/useOnboardingTranslationOptions.ts'), {
  getOnboardingTranslationDisplayData: (translation: BibleTranslation) => {
    const reason = selectionReason.get(translation.id) ?? 'ready';
    return {
      availability: {},
      selectionState: { reason, isSelectable: reason === 'ready' },
    };
  },
});

const bible = (id: string, language: string, name = `${language} Bible`) =>
  ({ id, name, language }) as BibleTranslation;

const finished = { count: 0 };

async function mountSelection() {
  const { useOnboardingBibleSelection } = await import('./useOnboardingBibleSelection');
  return runtime.mount(useOnboardingBibleSelection, {
    deviceCountryCode: 'NP',
    selectedInterfaceLanguageCode: 'ne',
    onFinished: () => {
      finished.count += 1;
    },
  });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** The failure report goes through a lazy import, so wait for it to land. */
async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) await settle();
  assert.ok(condition(), 'condition met');
}

interface AlertButton {
  text: string;
  onPress?: () => void;
}
const lastAlert = () => rn.__recorded.alerts.at(-1);
const alertButton = (text: string) =>
  (lastAlert()?.buttons as AlertButton[] | undefined)?.find((button) => button.text === text);

beforeEach(() => {
  downloads.length = 0;
  reportedFailures.length = 0;
  interfaceLanguage.changes.length = 0;
  interfaceLanguage.fail = false;
  regional.fallback = null;
  selectionReason.clear();
  finished.count = 0;
  rn.__recorded.alerts.length = 0;
  useAuthStore.setState({ preferences: {} });
  useBibleStore.setState({ translations: [], currentTranslation: 'bsb', preferredLanguage: null });
});

afterEach(() => runtime.unmountAll());

test('a Bible already on the device finishes onboarding with it and saves the locale choices', async () => {
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('npiulb', 'Nepali'));
  await settle();

  assert.equal(finished.count, 1);
  assert.deepEqual(interfaceLanguage.changes, ['ne']);
  assert.equal(useBibleStore.getState().currentTranslation, 'npiulb');
  assert.equal(useBibleStore.getState().preferredLanguage, 'Nepali');
  assert.deepEqual(useAuthStore.getState().preferences, {
    language: 'ne',
    countryCode: 'NP',
    countryName: 'Nepal',
    contentLanguageCode: 'npi',
    contentLanguageName: 'Nepali',
    contentLanguageNativeName: 'नेपाली',
    onboardingCompleted: true,
  });
});

test('a language the locale catalog does not know is saved by its Bible language name', async () => {
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('xyz', 'Unlisted Dialect'));
  await settle();

  assert.deepEqual(
    {
      code: useAuthStore.getState().preferences.contentLanguageCode,
      name: useAuthStore.getState().preferences.contentLanguageName,
      nativeName: useAuthStore.getState().preferences.contentLanguageNativeName,
    },
    { code: null, name: 'Unlisted Dialect', nativeName: 'Unlisted Dialect' }
  );
});

test('a Bible that needs a download finishes onboarding once it is installed', async () => {
  selectionReason.set('npiulb', 'download-required');
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('npiulb', 'Nepali'));
  await settle();
  view.rerender();
  assert.deepEqual(view.result.bibleSelectionState, { downloadingId: 'npiulb', queuedId: null });
  assert.equal(finished.count, 0);

  downloads[0].resolve();
  await settle();

  assert.equal(finished.count, 1);
  assert.equal(useBibleStore.getState().currentTranslation, 'npiulb');
});

test('a failed download falls back to the bundled Bible for the region without asking', async () => {
  selectionReason.set('npiulb', 'download-required');
  regional.fallback = bible('npibundled', 'Nepali', 'Nepali (bundled)');
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('npiulb', 'Nepali'));
  await settle();
  downloads[0].reject(new Error('disk full'));
  await settle();

  await waitFor(() => reportedFailures.length === 1);
  assert.equal(finished.count, 1);
  assert.equal(useBibleStore.getState().currentTranslation, 'npibundled');
  assert.deepEqual(rn.__recorded.alerts, []);
});

test('a failed download with no regional fallback asks, and Retry downloads it again', async () => {
  selectionReason.set('npiulb', 'download-required');
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('npiulb', 'Nepali'));
  await settle();
  downloads[0].reject(new Error('network lost'));
  await settle();

  assert.equal(lastAlert()?.title, 'bible.translationDownloadFailedTitle');
  assert.equal(finished.count, 0);

  alertButton('common.retry')?.onPress?.();
  await settle();
  assert.deepEqual(
    downloads.map((download) => download.id),
    ['npiulb', 'npiulb']
  );
  downloads[1].resolve();
  await settle();
  assert.equal(finished.count, 1);
});

test('when finishing setup fails, onboarding stays open and Retry finishes it', async () => {
  interfaceLanguage.fail = true;
  const view = await mountSelection();
  const consoleError = mock.method(console, 'error', () => {});

  view.result.handleTranslationSelect(bible('npiulb', 'Nepali'));
  await settle();
  consoleError.mock.restore();

  assert.equal(finished.count, 0);
  assert.equal(lastAlert()?.title, 'common.somethingWentWrong');

  interfaceLanguage.fail = false;
  alertButton('common.retry')?.onPress?.();
  await settle();
  assert.equal(finished.count, 1);
});

test('an unavailable Bible uses the regional fallback, or says it is coming soon', async () => {
  selectionReason.set('future', 'unavailable');
  const view = await mountSelection();

  view.result.handleTranslationSelect(bible('future', 'Nepali', 'Future Bible'));
  await settle();
  assert.equal(finished.count, 0);
  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: 'common.comingSoon', message: 'bible.translationComingSoon:Future Bible' }
  );

  regional.fallback = bible('npibundled', 'Nepali');
  view.result.handleTranslationSelect(bible('future', 'Nepali', 'Future Bible'));
  await settle();
  assert.equal(finished.count, 1);
  assert.equal(useBibleStore.getState().currentTranslation, 'npibundled');
});
