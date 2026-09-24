/**
 * Component render harness for node --test.
 *
 * Renders real components with react-test-renderer (React 19's own test
 * renderer) against a renderable `react-native` fake, inside the real
 * ThemeProvider and a react-i18next instance loaded with the real English
 * locale. Tests then assert behaviour: the text shown, accessibility roles,
 * labels and states, what a press does, and what renders under which state.
 *
 *   const harness = installRenderHarness(mock);          // module scope, before imports
 *   test('...', async () => {
 *     const { EmptyState } = await import('./EmptyState'); // dynamic, after the mocks
 *     const view = await harness.render(<EmptyState title="Nothing yet" />);
 *     assert.ok(view.getByRole('header', { name: 'Nothing yet' }));
 *     await view.press(view.getByRole('button'));
 *   });
 *
 * See docs/testing.md ("Rendering components") for the full contract.
 */
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import { afterEach, type MockTracker } from 'node:test';
import {
  createElement,
  Fragment,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import TestRenderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
  type TestRendererOptions,
} from 'react-test-renderer';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { create } from 'zustand';
import { DEFAULT_APPEARANCE_PALETTE } from '../constants/appearancePalettes';
import { en } from '../i18n/locales/en';
import { mockBarrel, mockModule, mockPackage, sourcePath } from './mockModules';
import {
  createHostNodeMock,
  createReactNativeRenderStub,
  type ReactNativeRenderStub,
} from './reactNativeHost';
import {
  createGestureHandlerFake,
  createHapticsFake,
  createLucideFake,
  createNavigationFake,
  createReactNavigationFake,
  createReanimatedFake,
  createSafeAreaFake,
  createSvgFake,
  createVectorIconsFake,
  simpleHostExports,
  type AnimationCall,
  type HapticsCall,
  type Insets,
  type ReanimatedFakeState,
  type NavigationFake,
} from './nativePackageFakes';
import {
  createQueries,
  findHandlerHost,
  isPressDisabled,
  textContent,
  type Queries,
} from './renderQueries';

export { flattenStyle } from './reactNativeHost';
export {
  accessibilityLabelOf,
  debugTree,
  isHiddenFromAccessibility,
  textContent,
} from './renderQueries';

// Metro turns `require('./icon.png')` into an asset id; Node would try to parse
// the PNG as JavaScript. Give every asset require a stable stand-in instead,
// carrying the path so a test can tell which image a component chose.
const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ttf', '.otf', '.mp3', '.m4a'];
const requireExtensions = createRequire(import.meta.url).extensions as unknown as Record<
  string,
  (module: { exports: unknown }, filename: string) => void
>;
for (const extension of ASSET_EXTENSIONS) {
  requireExtensions[extension] ??= (module, filename) => {
    module.exports = { testUri: filename };
  };
}

// React 19: opt in to act() semantics and keep react-test-renderer quiet about
// its deprecation (it is still React's only renderer that runs without a DOM).
const globals = globalThis as Record<string, unknown>;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;

export interface RenderHarnessOptions {
  os?: 'ios' | 'android';
  width?: number;
  height?: number;
  /** Theme the ThemeProvider resolves (from the fake auth store's preferences). */
  theme?: 'light' | 'dark';
  insets?: Partial<Insets>;
  /**
   * Fakes for `src/hooks` barrel exports the component uses beyond the light
   * ones kept real (`useDisplayFont`, `useTabBarHeight`, `useKeyboardBottomInset`).
   */
  hooks?: Record<string, unknown>;
  /**
   * Modules NOT to fake, when a test file installs its own mock for one.
   * Keys: 'react-native', 'react-native-reanimated', 'react-native-safe-area-context',
   * 'react-native-svg', '@expo/vector-icons', 'lucide-react-native',
   * 'expo-linear-gradient', 'expo-blur', '@shopify/flash-list', 'expo-haptics',
   * 'react-native-gesture-handler', '@react-navigation/native', 'authStore', 'hooks'.
   */
  skip?: string[];
}

const LIGHT_BARREL_HOOKS = [
  'useDisplayFont',
  'useKeyboardBottomInset',
  'useTabBarHeight',
  'TAB_BAR_CAPSULE_HEIGHT',
  'TAB_BAR_CAPSULE_SIDE_INSET',
  'TAB_BAR_CAPSULE_RADIUS',
  'TAB_BAR_CONTENT_GAP',
];

export interface RenderOptions {
  /** Extra providers around the element, inside Theme and i18n. */
  wrapper?: ComponentType<{ children: ReactNode }>;
}

type Handler = (...args: unknown[]) => unknown;

const pressEvent = () => ({
  nativeEvent: { locationX: 0, locationY: 0, pageX: 0, pageY: 0, timestamp: 0 },
  persist: () => {},
  preventDefault: () => {},
  stopPropagation: () => {},
});

export interface RenderResult extends Queries {
  renderer: ReactTestRenderer;
  root: ReactTestInstance;
  /** Press like a finger would: the nearest `onPress` at or above `node`, unless disabled. */
  press: (node: ReactTestInstance) => Promise<void>;
  longPress: (node: ReactTestInstance) => Promise<void>;
  /** Type into the nearest `onChangeText` at or above `node`. */
  changeText: (node: ReactTestInstance, text: string) => Promise<void>;
  /** Call any handler prop (`onValueChange`, `onLayout`, ...) at or above `node`. */
  fire: (node: ReactTestInstance, handler: string, ...args: unknown[]) => Promise<void>;
  rerender: (element: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
  /** Let pending effects, state updates and microtasks settle. */
  flush: () => Promise<void>;
}

/** Queries scoped to one element's subtree (a row, a sheet, a list item). */
export function within(node: ReactTestInstance): Queries {
  return createQueries(() => node);
}

const mounted = new Set<ReactTestRenderer>();

/**
 * A failing `assert.equal(view.queryByText('x'), null)` makes node:assert inspect
 * the element it got, and a test instance reaches the whole fiber graph: the
 * message takes minutes to build and the file looks hung. Print instances as a
 * one-line summary instead.
 */
function makeInstancesInspectable(instance: ReactTestInstance) {
  const prototype = Object.getPrototypeOf(instance) as Record<symbol, unknown>;
  if (prototype[inspect.custom]) return;
  prototype[inspect.custom] = function (this: ReactTestInstance) {
    const type =
      typeof this.type === 'string'
        ? this.type
        : ((this.type as { displayName?: string; name?: string }).displayName ??
          (this.type as { name?: string }).name ??
          'Component');
    const text = textContent(this);
    return `<${type}${text ? ` "${text.slice(0, 80)}"` : ''}>`;
  };
}

/** Unmount everything rendered so far. Registered as an afterEach by the harness. */
export async function cleanup(): Promise<void> {
  for (const renderer of mounted) {
    await act(async () => renderer.unmount());
  }
  mounted.clear();
}

export const defaultTestPreferences = {
  fontSize: 'medium',
  theme: 'light',
  appearancePalette: DEFAULT_APPEARANCE_PALETTE,
  language: 'en',
  countryCode: null,
  countryName: null,
  contentLanguageCode: null,
  contentLanguageName: null,
  contentLanguageNativeName: null,
  chapterFeedbackName: null,
  chapterFeedbackRole: null,
  onboardingCompleted: true,
  chapterFeedbackEnabled: false,
  hidePlayButtonFromReadingTab: false,
  notificationsEnabled: false,
  reminderTime: null,
};

/** The fake auth store's shape: preferences plus whatever a test sets. */
export interface FakeAuthState {
  preferences: Record<string, unknown>;
  setPreferences: (patch: Record<string, unknown>) => void;
  user: unknown;
  session: unknown;
  isAuthenticated: boolean;
  [extra: string]: unknown;
}

function createFakeAuthStore(theme: 'light' | 'dark') {
  return create<FakeAuthState>()((set) => ({
    preferences: { ...defaultTestPreferences, theme },
    setPreferences: (patch) =>
      set((state) => ({ preferences: { ...state.preferences, ...patch } })),
    user: null,
    session: null,
    isAuthenticated: false,
    setUser: (user: unknown) => set({ user, isAuthenticated: Boolean(user) }),
    setSession: (session: unknown) => set({ session, isAuthenticated: Boolean(session) }),
  }));
}

function createTestI18n(): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

export interface RenderHarness {
  rn: ReactNativeRenderStub;
  i18n: I18nInstance;
  /** Zustand store standing in for `stores/authStore` (ThemeProvider reads it). */
  authStore: ReturnType<typeof createFakeAuthStore>;
  navigation: NavigationFake;
  haptics: HapticsCall[];
  /** Every reanimated `withTiming` / `withSpring` call since the test started. */
  animations: AnimationCall[];
  insets: Insets;
  /** Read by reanimated's `useReducedMotion` and `AccessibilityInfo`. Reset after each test. */
  setReduceMotion: (value: boolean) => void;
  render: (element: ReactElement, options?: RenderOptions) => Promise<RenderResult>;
}

/**
 * Install the render fakes with `mock.module`. Call once at module scope,
 * before any `await import()` of the component under test.
 */
export function installRenderHarness(
  mocker: MockTracker,
  options: RenderHarnessOptions = {}
): RenderHarness {
  const skip = new Set(options.skip ?? []);
  const width = options.width ?? 390;
  const height = options.height ?? 844;
  const motion: ReanimatedFakeState = { reduceMotion: false, animations: [] };
  const rn = createReactNativeRenderStub({
    os: options.os ?? 'ios',
    width,
    height,
    reduceMotion: () => motion.reduceMotion,
  });
  const insets: Insets = { top: 47, right: 0, bottom: 34, left: 0, ...options.insets };
  const haptics: HapticsCall[] = [];
  const navigation = createNavigationFake();
  const authStore = createFakeAuthStore(options.theme ?? 'light');
  const i18n = createTestI18n();

  const fakes: Record<string, () => Record<string, unknown>> = {
    'react-native': () => rn,
    'react-native-reanimated': () => createReanimatedFake(motion),
    'react-native-safe-area-context': () => createSafeAreaFake(insets, { width, height }),
    'react-native-svg': createSvgFake,
    '@expo/vector-icons': createVectorIconsFake,
    'lucide-react-native': createLucideFake,
    'expo-haptics': () => createHapticsFake(haptics),
    'react-native-gesture-handler': createGestureHandlerFake,
    '@react-navigation/native': () => createReactNavigationFake(navigation),
    ...simpleHostExports,
  };
  for (const [specifier, factory] of Object.entries(fakes)) {
    if (!skip.has(specifier)) mockPackage(mocker, specifier, factory());
  }
  if (!skip.has('authStore')) {
    mockModule(mocker, sourcePath('stores/authStore.ts'), { useAuthStore: authStore });
  }
  if (!skip.has('hooks')) {
    // The hooks barrel re-exports audio, sync and auth hooks whose graphs pull in
    // most of the app. Keep the light presentation hooks real; everything else
    // must be provided by the test that renders a component using it.
    mockBarrel(mocker, 'hooks/index.ts', {
      real: LIGHT_BARREL_HOOKS.filter((name) => !(name in (options.hooks ?? {}))),
      provide: options.hooks,
    });
  }

  afterEach(async () => {
    await cleanup();
    navigation.reset();
    haptics.length = 0;
    motion.animations.length = 0;
    motion.reduceMotion = false;
    rn.__recorded.alerts.length = 0;
    rn.__recorded.announcements.length = 0;
    rn.__recorded.shares.length = 0;
    authStore.setState(authStore.getInitialState(), true);
  });

  const render = async (element: ReactElement, renderOptions: RenderOptions = {}) => {
    const { ThemeProvider } = await import('../contexts/ThemeContext');
    const Wrapper = renderOptions.wrapper ?? Fragment;
    const wrap = (child: ReactElement) =>
      createElement(
        I18nextProvider,
        { i18n },
        createElement(ThemeProvider, null, createElement(Wrapper, null, child))
      );

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(wrap(element), {
        createNodeMock: createHostNodeMock,
        // Honoured when IS_REACT_NATIVE_TEST_ENVIRONMENT is set; missing from the types.
        unstable_isConcurrent: true,
      } as TestRendererOptions);
    });
    mounted.add(renderer);
    makeInstancesInspectable(renderer.root);

    const call = async (node: ReactTestInstance, handler: string, args: unknown[]) => {
      const host = findHandlerHost(node, handler);
      await act(async () => {
        await ((host.props as Record<string, Handler>)[handler] as Handler)(...args);
      });
    };
    // A tap delivers pressIn, the press and pressOut to the touchable, and
    // nothing at all when the touchable is disabled.
    const pressWith = (handler: string) => async (node: ReactTestInstance) => {
      const host = findHandlerHost(node, handler);
      if (isPressDisabled(host)) return;
      const props = host.props as Record<string, Handler | undefined>;
      await act(async () => {
        props.onPressIn?.(pressEvent());
        await props[handler]?.(pressEvent());
        props.onPressOut?.(pressEvent());
      });
    };

    const result: RenderResult = {
      ...createQueries(() => renderer.root),
      renderer,
      get root() {
        return renderer.root;
      },
      press: pressWith('onPress'),
      longPress: pressWith('onLongPress'),
      changeText: (node, text) => call(node, 'onChangeText', [text]),
      fire: (node, handler, ...args) => call(node, handler, args),
      rerender: async (next) => {
        await act(async () => renderer.update(wrap(next)));
      },
      unmount: async () => {
        await act(async () => renderer.unmount());
        mounted.delete(renderer);
      },
      flush: async () => {
        await act(async () => {});
      },
    };
    return result;
  };

  return {
    rn,
    i18n,
    authStore,
    navigation,
    haptics,
    animations: motion.animations,
    insets,
    setReduceMotion: (value) => {
      motion.reduceMotion = value;
    },
    render,
  };
}
