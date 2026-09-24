import test, { beforeEach, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, mockPackage, sourcePath } from './testing/mockModules';
import { hostComponent } from './testing/reactNativeHost';
import { defaultTestPreferences, installRenderHarness, type RenderResult } from './testing/render';

// Renders the real App.tsx boot sequence: LoadingScreen's gates, the real startup
// coordinator, the real ErrorBoundary and the real usePrivacyLock. Everything App
// loads lazily (navigator, onboarding flow, runtime effects, warmups) is a host
// stand-in, so the tests read which surface is on screen.

// App's own auth store must carry `persist` and `initialize`, so it replaces the
// harness's fake auth store (ThemeProvider reads this one too).
const harness = installRenderHarness(mock, { skip: ['authStore'] });

const startupCalls: string[] = [];

const authStore = Object.assign(
  create<{
    preferences: Record<string, unknown>;
    setPreferences: (patch: Record<string, unknown>) => void;
    user: unknown;
    session: unknown;
    isAuthenticated: boolean;
    initialize: () => Promise<void>;
  }>()((set) => ({
    preferences: { ...defaultTestPreferences },
    setPreferences: (patch) =>
      set((state) => ({ preferences: { ...state.preferences, ...patch } })),
    user: null,
    session: null,
    isAuthenticated: false,
    initialize: async () => {
      startupCalls.push('auth.initialize');
    },
  })),
  {
    persist: {
      rehydrate: async () => {
        startupCalls.push('auth.rehydrate');
      },
    },
  }
);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: authStore });

interface PrivacyFakeState {
  isInitialized: boolean;
  initializationError: 'timeout' | 'unavailable' | null;
  mode: 'standard' | 'discreet';
  hasPin: boolean;
  isLocked: boolean;
  initialize: () => Promise<void>;
  retryInitialize: () => Promise<void>;
  lock: () => void;
}

/** What the fake privacy initialization settles to; `{}` leaves privacy uninitialized. */
let privacyInitResult: Partial<PrivacyFakeState> = {};
const privacyStore = create<PrivacyFakeState>()((set) => ({
  // The real store's cold-start state: locked and not initialized.
  isInitialized: false,
  initializationError: null,
  mode: 'standard',
  hasPin: false,
  isLocked: true,
  initialize: async () => {
    startupCalls.push('privacy.initialize');
    set(privacyInitResult);
  },
  retryInitialize: async () => {},
  lock: () => set({ isLocked: true }),
}));
mockModule(mock, sourcePath('stores/privacyStore.ts'), { usePrivacyStore: privacyStore });
mockBarrel(mock, 'services/privacy/index.ts', { real: ['shouldLockForAppStateChange'] });

// Native packages App.tsx imports directly.
mockPackage(mock, 'expo-status-bar', { StatusBar: hostComponent('StatusBar') });
mockPackage(mock, 'expo-splash-screen', {
  preventAutoHideAsync: async () => true,
  hideAsync: async () => {},
});
mockPackage(mock, 'expo-linking', {
  getInitialURL: async () => null,
  addEventListener: () => ({ remove: () => {} }),
});
mockPackage(mock, 'expo-font', { useFonts: () => [true, null] });
mockPackage(mock, '@expo-google-fonts/lora', {
  Lora_400Regular: 'Lora_400Regular',
  Lora_400Regular_Italic: 'Lora_400Regular_Italic',
  Lora_500Medium: 'Lora_500Medium',
  Lora_600SemiBold: 'Lora_600SemiBold',
  Lora_700Bold: 'Lora_700Bold',
});

// Module-scope boot side effects and app-shell collaborators.
mockModule(mock, sourcePath('i18n/index.ts'), {
  default: harness.i18n,
  changeLanguage: async () => {},
  getCurrentLanguage: () => 'en',
});
mockModule(mock, sourcePath('services/notifications/notificationBootstrap.ts'), {
  setupNotificationHandler: () => {},
});
mockModule(mock, sourcePath('services/diagnostics/globalErrorHandler.ts'), {
  installGlobalErrorHandlers: () => {},
});
mockModule(mock, sourcePath('services/startup/rtlPolicy.ts'), {
  enforceLtrLayoutPolicy: () => {},
});
mockModule(mock, sourcePath('services/diagnostics/crashLogStore.ts'), {
  recordCrashLog: () => {},
});
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  queueCrashReport: () => {},
});
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => false },
});
mockModule(mock, sourcePath('components/privacy/PrivacyLockScreen.tsx'), {
  PrivacyLockScreen: hostComponent('PrivacyLockScreen'),
});

let tapRoutingThrows = false;
mockModule(mock, sourcePath('hooks/useNotificationTapRouting.ts'), {
  useNotificationTapRouting: () => {
    if (tapRoutingThrows) throw new Error('tap routing exploded');
  },
});
mockModule(mock, sourcePath('hooks/usePushTokenRegistration.ts'), {
  usePushTokenRegistration: () => {},
});
mockModule(mock, sourcePath('hooks/useAudioDownloadRecovery.ts'), {
  useAudioDownloadRecovery: () => {},
});
mockModule(mock, sourcePath('hooks/useAppSessionAnalytics.ts'), {
  useAppSessionAnalytics: () => {},
});

// Everything App.tsx loads through import().
mockModule(mock, sourcePath('navigation/RootNavigator.tsx'), {
  RootNavigator: hostComponent('RootNavigator'),
});
mockModule(mock, sourcePath('screens/onboarding/LocaleSetupFlow.tsx'), {
  LocaleSetupFlow: hostComponent('LocaleSetupFlow'),
});
mockModule(mock, sourcePath('services/onboarding/localeSelection.ts'), {
  prewarmLocaleSearchEngine: () => {},
});
let runtimeEffectsThrow = false;
mockModule(mock, sourcePath('services/startup/AppRuntimeEffects.tsx'), {
  AppRuntimeEffects: () => {
    if (runtimeEffectsThrow) throw new Error('runtime effects exploded');
    return createElement('AppRuntimeEffects');
  },
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  setupAndroidChannels: async () => {},
});
mockModule(mock, sourcePath('services/bible/bibleService.ts'), { initBibleData: async () => {} });
mockModule(mock, sourcePath('services/translations/index.ts'), {
  bootstrapRuntimeTranslationsAndPreferences: async () => {},
});
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: { getState: () => ({ reconcileTranslationPacks: async () => {} }) },
});
mockModule(mock, sourcePath('data/gatherArtwork.ts'), {});

// Boundaries and React report caught errors on the console; keep output readable.
mock.method(console, 'error', () => {});
mock.method(console, 'log', () => {});

// Captured before any test mocks timers, so settling always waits real time.
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  startupCalls.length = 0;
  privacyInitResult = {};
  tapRoutingThrows = false;
  runtimeEffectsThrow = false;
  privacyStore.setState(privacyStore.getInitialState(), true);
  authStore.setState(authStore.getInitialState(), true);
});

/** Let startup promises, dynamic imports and (unmocked) timeouts run. */
async function settle() {
  await act(async () => {
    for (let round = 0; round < 4; round += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 5));
    }
  });
}

async function renderApp() {
  const { default: App } = await import('../App');
  const view = await harness.render(<App />);
  await settle();
  return view;
}

type Surface = 'crash fallback' | 'lock screen' | 'onboarding' | 'navigator' | 'boot shell';

/** Which of LoadingScreen's surfaces is on screen. */
function surface(view: RenderResult): Surface {
  if (view.queryByText('Something went wrong')) return 'crash fallback';
  const shown = (type: string) => view.queryAllByType(type).length > 0;
  const onScreen: Surface[] = [];
  if (shown('PrivacyLockScreen')) onScreen.push('lock screen');
  if (shown('LocaleSetupFlow')) onScreen.push('onboarding');
  if (shown('RootNavigator')) onScreen.push('navigator');
  assert.ok(onScreen.length <= 1, `LoadingScreen showed ${onScreen.join(' and ')} at once`);
  if (onScreen[0]) return onScreen[0];
  const emptyViews = view.queryAllByType('View').filter((node) => node.children.length === 0);
  assert.equal(emptyViews.length, 1, 'expected the empty boot shell view');
  return 'boot shell';
}

async function setPrivacy(patch: Partial<PrivacyFakeState>) {
  await act(async () => {
    privacyStore.setState(patch);
  });
  await settle();
}

async function tickTimers(t: TestContext) {
  await act(async () => {
    t.mock.timers.tick(10);
  });
  await settle();
}

test('while privacy has not initialized, the boot shell stays up instead of onboarding or the lock', async () => {
  authStore.getState().setPreferences({ onboardingCompleted: false });
  const view = await renderApp();

  assert.equal(surface(view), 'boot shell');
  assert.deepEqual(startupCalls, ['privacy.initialize'], 'auth must not initialize before privacy');

  await setPrivacy({ isLocked: false });
  assert.equal(
    surface(view),
    'boot shell',
    'unlocked but uninitialized privacy still fails closed'
  );
});

test('the navigator is not scheduled until privacy initializes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderApp();
  await setPrivacy({ isLocked: false });
  await tickTimers(t);
  assert.equal(surface(view), 'boot shell');

  // Had the navigator been scheduled early it would appear in this same commit.
  await setPrivacy({ isInitialized: true });
  assert.equal(surface(view), 'boot shell');

  await tickTimers(t);
  assert.equal(surface(view), 'navigator');
});

test('auth rehydrates its persisted state after privacy and before it initializes', async () => {
  privacyInitResult = { isInitialized: true, isLocked: false };
  const view = await renderApp();

  assert.deepEqual(startupCalls, ['privacy.initialize', 'auth.rehydrate', 'auth.initialize']);
  assert.equal(surface(view), 'navigator');
});

test('a locked install shows the lock screen before onboarding', async () => {
  authStore.getState().setPreferences({ onboardingCompleted: false });
  privacyInitResult = { isInitialized: true, mode: 'discreet', hasPin: true, isLocked: true };
  const view = await renderApp();

  assert.equal(surface(view), 'lock screen');

  await setPrivacy({ isLocked: false });
  assert.equal(surface(view), 'onboarding');
});

test('the navigator is not scheduled while the install is locked', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  privacyInitResult = { isInitialized: true, mode: 'discreet', hasPin: true, isLocked: true };
  const view = await renderApp();
  await tickTimers(t);
  assert.equal(surface(view), 'lock screen');

  await setPrivacy({ isLocked: false });
  assert.equal(surface(view), 'boot shell', 'the navigator mounts only after unlocking');

  await tickTimers(t);
  assert.equal(surface(view), 'navigator');
});

test('a throw in AppContent is caught by the root boundary instead of crashing the app', async () => {
  tapRoutingThrows = true;
  privacyInitResult = { isInitialized: true, isLocked: false };
  const view = await renderApp();

  assert.equal(surface(view), 'crash fallback');
  assert.ok(view.getByRole('button', { name: 'Try Again' }));
});

test('a failing runtime-effects host renders nothing and the app keeps running', async () => {
  runtimeEffectsThrow = true;
  privacyInitResult = { isInitialized: true, isLocked: false };
  const view = await renderApp();

  assert.equal(surface(view), 'navigator');
  assert.equal(view.queryAllByType('AppRuntimeEffects').length, 0);
});

test('a failing runtime-effects host cannot switch off the privacy lock', async (t) => {
  t.after(() => {
    harness.rn.AppState.currentState = 'active';
  });
  runtimeEffectsThrow = true;
  privacyInitResult = { isInitialized: true, mode: 'discreet', hasPin: true, isLocked: false };
  const view = await renderApp();
  assert.equal(surface(view), 'navigator');

  await act(async () => {
    harness.rn.AppState.emit('background');
  });
  await settle();

  assert.equal(surface(view), 'lock screen');
});

test('the runtime-effects host loads once onboarding and privacy are done', async () => {
  privacyInitResult = { isInitialized: true, isLocked: false };
  const view = await renderApp();

  assert.equal(view.queryAllByType('AppRuntimeEffects').length, 1);
});

test('a failing privacy lock locks a discreet install instead of taking the app down', async (t) => {
  // Privacy is already initialized as discreet and unlocked when the lock host mounts.
  privacyStore.setState({ isInitialized: true, mode: 'discreet', hasPin: true, isLocked: false });
  t.mock.method(harness.rn.AppState, 'addEventListener', () => {
    throw new Error('AppState unavailable');
  });
  const view = await renderApp();

  assert.equal(privacyStore.getState().isLocked, true);
  assert.equal(surface(view), 'lock screen');
});

test('a failing privacy lock leaves a standard install usable', async (t) => {
  privacyStore.setState({ isInitialized: true, mode: 'standard', isLocked: false });
  t.mock.method(harness.rn.AppState, 'addEventListener', () => {
    throw new Error('AppState unavailable');
  });
  const view = await renderApp();

  assert.equal(surface(view), 'navigator');
});
