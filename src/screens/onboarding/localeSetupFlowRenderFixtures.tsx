/**
 * Shared fakes for the LocaleSetupFlow render tests (one file per platform).
 *
 * `installLocaleSetupFlowFakes(mock, options)` must run at module scope, before
 * the flow is imported: it installs the render harness plus fakes for every
 * store and service the flow reaches (bible store, runtime catalog, i18n,
 * expo-localization, the locale search engine, deferred preference sync) and
 * resets them after each test.
 */
import { afterEach, type MockTracker } from 'node:test';
import { createElement, useEffect, type ComponentType } from 'react';
import { create } from 'zustand';
import {
  installRenderHarness,
  type RenderHarnessOptions,
  type RenderResult,
} from '../../testing/render';
import { mockBarrel, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { FlatList } from '../../testing/reactNativeHost';
import type { ThemeColors } from '../../contexts/ThemeContext';
import type { BibleTranslation } from '../../types';
import type { LocaleCountry, LocaleLanguage } from '../../services/onboarding/localeSelection';

export const COUNTRIES: LocaleCountry[] = [
  { code: 'IN', name: 'India', languageCodes: ['hin', 'eng'] },
  { code: 'NP', name: 'Nepal', languageCodes: ['npi'] },
  { code: 'US', name: 'United States', languageCodes: ['eng', 'spa'] },
];

const language = (
  code: string,
  iso6391: string,
  name: string,
  nativeName: string,
  countryCodes: string[]
): LocaleLanguage => ({
  code,
  iso6391,
  iso6393: code,
  name,
  nativeName,
  aliases: [],
  countryCodes,
});

export const LANGUAGES: LocaleLanguage[] = [
  language('eng', 'en', 'English', 'English', ['US', 'IN']),
  language('hin', 'hi', 'Hindi', 'हिन्दी', ['IN']),
  language('npi', 'ne', 'Nepali', 'नेपाली', ['NP']),
  language('spa', 'es', 'Spanish', 'Español', ['US']),
];

export function makeTranslation(
  overrides: Partial<BibleTranslation> & Pick<BibleTranslation, 'id' | 'name' | 'language'>
): BibleTranslation {
  return {
    abbreviation: overrides.id.toUpperCase(),
    description: '',
    copyright: '',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'bundled',
    ...overrides,
  } as BibleTranslation;
}

/** Bibles that ship with the app: readable offline, no catalog needed. */
export const BUNDLED_BIBLES: BibleTranslation[] = [
  makeTranslation({ id: 'bsb', name: 'Berean Standard Bible', language: 'English' }),
  makeTranslation({ id: 'hau', name: 'Littafi Mai Tsarki', language: 'Hausa' }),
  makeTranslation({ id: 'hincv', name: 'Hindi Contemporary Version', language: 'Hindi' }),
  makeTranslation({ id: 'hmn', name: 'Vaajtswv Txojlus', language: 'Hmong' }),
  makeTranslation({ id: 'npiulb', name: 'Nepali Unlocked Bible', language: 'Nepali' }),
];

/** A runtime-catalog Bible that must be downloaded before it can be read. */
export function downloadableBible(id: string, languageName: string): BibleTranslation {
  return makeTranslation({
    id,
    name: `${languageName} Bible`,
    language: languageName,
    source: 'runtime',
    isDownloaded: false,
    catalog: {
      text: { downloadUrl: `https://example.test/${id}.zip` },
    } as unknown as BibleTranslation['catalog'],
  });
}

export interface LocaleSetupFlowFakes {
  harness: ReturnType<typeof installRenderHarness>;
  /** Every locale-search-engine call, in order, interleaved with probe renders. */
  log: string[];
  prewarmCalls: { count: number };
  deviceLocale: { languageCode: string; regionCode: string; languageTag: string };
  useBibleStore: ReturnType<typeof createBibleStore>;
  bibleCalls: Array<{ method: string; args: unknown[] }>;
  /** Replace to make a download fail or hang. */
  download: { impl: (id: string) => Promise<'installed' | 'cancelled'> };
  catalog: { loads: number; impl: () => Promise<void> };
  changeLanguage: { calls: string[]; impl: (code: string) => Promise<void> };
  sync: { calls: number; next: Promise<void> };
  /**
   * Resolves once the flow's deferred `import('services/sync')` has called
   * syncPreferences; fails (rather than hanging the file) if that never happens.
   */
  waitForSync: () => Promise<void>;
  /** The props the flow last passed to FlashList. */
  flashList: { props: Record<string, unknown> | null };
  colors: { current: ThemeColors | null };
  renderFlow: (
    props?: Record<string, unknown>,
    options?: { probes?: boolean }
  ) => Promise<RenderResult>;
}

function createBibleStore(
  calls: Array<{ method: string; args: unknown[] }>,
  fakes: {
    download: LocaleSetupFlowFakes['download'];
  }
) {
  return create<{
    translations: BibleTranslation[];
    downloadProgress: null;
    setCurrentTranslation: (id: string) => void;
    setPreferredTranslationLanguage: (languageName: string) => void;
    downloadTranslation: (id: string) => Promise<'installed' | 'cancelled'>;
  }>()(() => ({
    translations: BUNDLED_BIBLES,
    downloadProgress: null,
    setCurrentTranslation: (id) => {
      calls.push({ method: 'setCurrentTranslation', args: [id] });
    },
    setPreferredTranslationLanguage: (languageName) => {
      calls.push({ method: 'setPreferredTranslationLanguage', args: [languageName] });
    },
    downloadTranslation: (id) => {
      calls.push({ method: 'downloadTranslation', args: [id] });
      return fakes.download.impl(id);
    },
  }));
}

export function installLocaleSetupFlowFakes(
  mocker: MockTracker,
  options: RenderHarnessOptions = {}
): LocaleSetupFlowFakes {
  const harness = installRenderHarness(mocker, {
    ...options,
    skip: [...(options.skip ?? []), '@shopify/flash-list'],
  });
  const log: string[] = [];
  const prewarmCalls = { count: 0 };
  const deviceLocale = { languageCode: 'en', regionCode: 'US', languageTag: 'en-US' };
  const bibleCalls: LocaleSetupFlowFakes['bibleCalls'] = [];
  const download: LocaleSetupFlowFakes['download'] = { impl: async () => 'installed' };
  const catalog: LocaleSetupFlowFakes['catalog'] = { loads: 0, impl: async () => {} };
  const changeLanguage: LocaleSetupFlowFakes['changeLanguage'] = {
    calls: [],
    impl: async () => {},
  };
  const flashList: LocaleSetupFlowFakes['flashList'] = { props: null };
  const colors: LocaleSetupFlowFakes['colors'] = { current: null };
  let resolveSync = () => {};
  const sync: LocaleSetupFlowFakes['sync'] = {
    calls: 0,
    next: new Promise<void>((resolve) => (resolveSync = resolve)),
  };
  const resetSync = () => {
    sync.calls = 0;
    sync.next = new Promise<void>((resolve) => (resolveSync = resolve));
  };

  // The FlashList the flow virtualizes through: renders every item like the
  // harness FlatList, marked so a test can tell it from a plain FlatList or a
  // ScrollView, and records the props FlashList itself consumes.
  const FlashList = (props: Record<string, unknown>) => {
    flashList.props = props;
    return createElement(FlatList, { ...props, virtualizedBy: 'FlashList' });
  };
  mockPackage(mocker, '@shopify/flash-list', { FlashList });

  const traced =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      log.push(`engine:${name}`);
      return fn(...args);
    };
  const findCountry = (code: string | null | undefined) =>
    COUNTRIES.find((country) => country.code === code?.toUpperCase()) ?? null;
  const matches = (value: string, query: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const localeSearchEngine = {
    get countries() {
      log.push('engine:countries');
      return COUNTRIES;
    },
    get languages() {
      log.push('engine:languages');
      return LANGUAGES;
    },
    getCountryByCode: traced('getCountryByCode', findCountry),
    getCountryDisplayName: traced(
      'getCountryDisplayName',
      (code: string) => findCountry(code)?.name ?? code
    ),
    getLanguageByCode: traced(
      'getLanguageByCode',
      (code: string | null | undefined) =>
        LANGUAGES.find((entry) => entry.code === code || entry.iso6391 === code) ?? null
    ),
    getLanguageByName: traced(
      'getLanguageByName',
      (name: string | null | undefined) =>
        LANGUAGES.find((entry) => entry.name.toLowerCase() === name?.trim().toLowerCase()) ?? null
    ),
    searchCountries: traced('searchCountries', (query: string) =>
      COUNTRIES.filter((country) => matches(country.name, query))
    ),
    searchLanguages: traced(
      'searchLanguages',
      (query: string, countryCode: string | null, limit: number = 30) => {
        const found = LANGUAGES.filter((entry) => matches(entry.name, query));
        const recommended = found.filter(
          (entry) => countryCode && entry.countryCodes.includes(countryCode)
        );
        return {
          recommended,
          global: found.filter((entry) => !recommended.includes(entry)).slice(0, limit),
        };
      }
    ),
    getRecommendedLanguages: traced('getRecommendedLanguages', () => []),
    mapLanguageToAppLanguage: traced('mapLanguageToAppLanguage', () => null),
  };
  mockModule(mocker, sourcePath('services/onboarding/localeSelection.ts'), {
    localeSearchEngine,
    prewarmLocaleSearchEngine: () => {
      prewarmCalls.count += 1;
      log.push('prewarm');
    },
    createLocaleSearchEngine: () => localeSearchEngine,
    COUNTRY_DISPLAY_LOCALES: {},
  });

  // constants/index.ts reaches expo-constants through the runtime-config reader.
  mockPackage(mocker, 'expo-constants', { default: { expoConfig: { extra: {} } } });
  mockPackage(mocker, 'expo-localization', {
    getLocales: () => [{ ...deviceLocale }],
    getCalendars: () => [],
  });

  const useBibleStore = createBibleStore(bibleCalls, { download });
  mockModule(mocker, sourcePath('stores/bibleStore.ts'), { useBibleStore });

  mockBarrel(mocker, 'services/translations/index.ts', {
    provide: {
      ensureRuntimeCatalogLoaded: () => {
        catalog.loads += 1;
        return catalog.impl();
      },
      hasRuntimeCatalogTranslations: (translations: BibleTranslation[]) =>
        translations.some((translation) => translation.source === 'runtime' && translation.catalog),
    },
  });

  mockBarrel(mocker, 'i18n/index.ts', {
    provide: {
      changeLanguage: (code: string) => {
        changeLanguage.calls.push(code);
        return changeLanguage.impl(code);
      },
      getCurrentLanguage: () => 'en',
    },
  });

  mockBarrel(mocker, 'services/sync/index.ts', {
    provide: {
      syncPreferences: async () => {
        sync.calls += 1;
        resolveSync();
      },
    },
  });

  const waitForSync = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('preferences were never synced')), 2000);
    });
    try {
      await Promise.race([sync.next, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  afterEach(() => {
    log.length = 0;
    prewarmCalls.count = 0;
    Object.assign(deviceLocale, { languageCode: 'en', regionCode: 'US', languageTag: 'en-US' });
    bibleCalls.length = 0;
    download.impl = async () => 'installed';
    catalog.loads = 0;
    catalog.impl = async () => {};
    changeLanguage.calls.length = 0;
    changeLanguage.impl = async () => {};
    flashList.props = null;
    colors.current = null;
    resetSync();
    useBibleStore.setState(useBibleStore.getInitialState(), true);
  });

  const Probe = ({ name }: { name: string }) => {
    log.push(`render:${name}`);
    return null;
  };

  const renderFlow: LocaleSetupFlowFakes['renderFlow'] = async (props = {}, renderOptions = {}) => {
    const { LocaleSetupFlow } = await import('./LocaleSetupFlow');
    const { useTheme } = await import('../../contexts/ThemeContext');
    const ColorProbe: ComponentType = () => {
      const theme = useTheme();
      useEffect(() => {
        colors.current = theme.colors;
      });
      return null;
    };
    const flow = createElement(LocaleSetupFlow, { mode: 'initial', ...props });
    return harness.render(
      renderOptions.probes
        ? createElement(
            'Root',
            null,
            createElement(Probe, { name: 'before' }),
            flow,
            createElement(Probe, { name: 'after' }),
            createElement(ColorProbe)
          )
        : createElement('Root', null, flow, createElement(ColorProbe))
    );
  };

  return {
    harness,
    log,
    prewarmCalls,
    deviceLocale,
    useBibleStore,
    bibleCalls,
    download,
    catalog,
    changeLanguage,
    sync,
    waitForSync,
    flashList,
    colors,
    renderFlow,
  };
}
