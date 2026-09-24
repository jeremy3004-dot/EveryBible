/**
 * Render-capable fakes for the native UI packages components import:
 * reanimated, safe-area-context, react-native-svg, icon sets, expo-linear-gradient,
 * expo-blur, expo-haptics, gesture-handler and @react-navigation/native.
 *
 * Each factory returns the module's exports object (for `mockModule`) plus,
 * where useful, a handle the test can read or drive. Visual pieces render as
 * host elements carrying their props (`Icon` with `name`, `LinearGradient`, ...).
 * `installRenderHarness()` in `./render.tsx` wires these up.
 */
import {
  createContext,
  createElement,
  Fragment,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatList, hostComponent } from './reactNativeHost';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

const Passthrough = ({ children }: AnyProps) => createElement(Fragment, null, children);

/** A reanimated layout-animation builder (`FadeIn.duration(200).delay(40)`). */
function layoutAnimation(name: string) {
  const builder: Record<string, unknown> = { __layoutAnimation: name };
  for (const method of [
    'duration',
    'delay',
    'springify',
    'damping',
    'stiffness',
    'mass',
    'easing',
    'withCallback',
    'reduceMotion',
    'withInitialValues',
    'randomDelay',
    'overshootClamping',
    'build',
  ]) {
    builder[method] = () => builder;
  }
  return builder;
}

type ScrollWorklet = (event: unknown, context: Record<string, unknown>) => void;
type ScrollHandlers = Partial<
  Record<
    'onScroll' | 'onBeginDrag' | 'onEndDrag' | 'onMomentumBegin' | 'onMomentumEnd',
    ScrollWorklet
  >
>;

export interface AnimationCall {
  kind: 'timing' | 'spring';
  toValue: unknown;
  config?: Record<string, unknown>;
}

export interface ReanimatedFakeState {
  reduceMotion: boolean;
  /** Every `withTiming` / `withSpring` call, in order. */
  animations: AnimationCall[];
}

/**
 * Shared values are plain `{ value }` boxes; `useAnimatedStyle` evaluates its
 * worklet on every render; `withTiming`/`withSpring` resolve to their target at
 * once (and call their completion callback with `true`), recording their
 * config so a test can check durations.
 */
export function createReanimatedFake(state: ReanimatedFakeState) {
  const animate =
    (kind: AnimationCall['kind']) =>
    (toValue: unknown, config?: Record<string, unknown>, callback?: unknown) => {
      state.animations.push({ kind, toValue, config });
      if (typeof callback === 'function') callback(true);
      return toValue;
    };
  const Animated = {
    View: hostComponent('View'),
    Text: hostComponent('Text'),
    Image: hostComponent('Image'),
    ScrollView: hostComponent('ScrollView'),
    // Renders every item like the react-native FlatList fake.
    FlatList,
    createAnimatedComponent: <T,>(component: T) => component,
  };
  const layoutNames = [
    'FadeIn',
    'FadeOut',
    'FadeInDown',
    'FadeInUp',
    'FadeOutDown',
    'FadeOutUp',
    'SlideInDown',
    'SlideOutDown',
    'SlideInUp',
    'SlideOutUp',
    'SlideInRight',
    'SlideOutRight',
    'SlideInLeft',
    'SlideOutLeft',
    'ZoomIn',
    'ZoomOut',
    'LinearTransition',
    'Layout',
  ];
  const easingFn = (t: number) => t;
  return {
    default: Animated,
    ...Animated,
    ...Object.fromEntries(layoutNames.map((name) => [name, layoutAnimation(name)])),
    useReducedMotion: () => state.reduceMotion,
    // Stable across renders, like the real hook, so effects keyed on it settle.
    useSharedValue: <T,>(initial: T) => useRef({ value: initial }).current,
    makeMutable: <T,>(initial: T) => ({ value: initial }),
    useDerivedValue: <T,>(fn: () => T) => ({ value: fn() }),
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useAnimatedProps: (worklet: () => unknown) => worklet(),
    // Like the real hook: `prepare` is read on every render and `react` runs after
    // commit whenever the prepared value changed (previous is null the first time).
    useAnimatedReaction: <T,>(
      prepare: () => T,
      react: (current: T, previous: T | null) => void
    ) => {
      const current = prepare();
      const last = useRef<{ value: T } | null>(null);
      useEffect(() => {
        if (last.current && Object.is(last.current.value, current)) return;
        const previous = last.current ? last.current.value : null;
        last.current = { value: current };
        react(current, previous);
      });
    },
    // The returned handler runs the worklet on the JS thread, so a test can
    // `fire(list, 'onScroll', { nativeEvent: { contentOffset: { y } ... } })`.
    useAnimatedScrollHandler: (handlers: ScrollHandlers | ScrollWorklet) => {
      const context: Record<string, unknown> = {};
      return (event: { nativeEvent?: unknown } | undefined) => {
        const payload = event?.nativeEvent ?? event;
        if (typeof handlers === 'function') handlers(payload, context);
        else handlers.onScroll?.(payload, context);
      };
    },
    useAnimatedRef: () => ({ current: null }),
    useScrollViewOffset: () => ({ value: 0 }),
    withTiming: animate('timing'),
    withSpring: animate('spring'),
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
    cancelAnimation: () => {},
    runOnJS:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A) =>
        fn(...args),
    runOnUI:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A) =>
        fn(...args),
    interpolate: (value: number, input: number[], output: number[]) => {
      if (value <= input[0]) return output[0];
      for (let i = 1; i < input.length; i += 1) {
        if (value <= input[i]) {
          const t = (value - input[i - 1]) / (input[i] - input[i - 1]);
          return output[i - 1] + t * (output[i] - output[i - 1]);
        }
      }
      return output[output.length - 1];
    },
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    Easing: {
      linear: easingFn,
      ease: easingFn,
      quad: easingFn,
      cubic: easingFn,
      sin: easingFn,
      exp: easingFn,
      bezier: () => easingFn,
      bezierFn: () => easingFn,
      in: () => easingFn,
      out: () => easingFn,
      inOut: () => easingFn,
    },
  };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function createSafeAreaFake(insets: Insets, frame: { width: number; height: number }) {
  return {
    SafeAreaView: hostComponent('SafeAreaView'),
    SafeAreaProvider: Passthrough,
    SafeAreaInsetsContext: createContext(insets),
    useSafeAreaInsets: () => ({ ...insets }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...frame }),
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, ...frame } },
  };
}

export function createSvgFake() {
  const names = [
    'Circle',
    'ClipPath',
    'Defs',
    'Ellipse',
    'ForeignObject',
    'G',
    'Line',
    'Mask',
    'Path',
    'Pattern',
    'Polygon',
    'Polyline',
    'RadialGradient',
    'Rect',
    'Stop',
    'Symbol',
    'TSpan',
    'Use',
  ];
  const Svg = hostComponent('Svg');
  return {
    default: Svg,
    Svg,
    ...Object.fromEntries(names.map((name) => [name, hostComponent(`Svg.${name}`)])),
    LinearGradient: hostComponent('Svg.LinearGradient'),
    Text: hostComponent('Svg.Text'),
    SvgXml: hostComponent('SvgXml'),
    SvgUri: hostComponent('SvgUri'),
  };
}

/** `@expo/vector-icons`: every family renders `<Icon family name ...props />`. */
export function createVectorIconsFake() {
  const families = [
    'AntDesign',
    'Entypo',
    'Feather',
    'FontAwesome',
    'FontAwesome5',
    'FontAwesome6',
    'Ionicons',
    'MaterialCommunityIcons',
    'MaterialIcons',
    'Octicons',
    'SimpleLineIcons',
  ];
  return Object.fromEntries(
    families.map((family) => {
      const Icon = (props: AnyProps) => createElement('Icon', { family, ...props });
      Icon.displayName = family;
      return [family, Object.assign(Icon, { glyphMap: {} })];
    })
  );
}

/** Every name imported from `lucide-react-native` anywhere under src/. */
function lucideNamesUsedInSource(): Set<string> {
  const names = new Set<string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(entryPath, 'utf8');
        for (const match of source.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*'lucide-react-native'/g
        )) {
          for (const raw of match[1].split(',')) {
            const name = raw.trim().split(/\s+as\s+/)[0];
            if (name && !name.startsWith('type ')) names.add(name);
          }
        }
      }
    }
  };
  visit(fileURLToPath(new URL('..', import.meta.url).href));
  return names;
}

/**
 * `lucide-react-native`: each icon renders `<LucideIcon name ... />`. Only the
 * icons src/ imports are exported, because mocking all ~5,000 of the package's
 * exports costs seconds per test file.
 */
export function createLucideFake() {
  const exports: Record<string, unknown> = {};
  for (const name of lucideNamesUsedInSource()) {
    const Icon = (props: AnyProps) => createElement('LucideIcon', { name, ...props });
    Icon.displayName = name;
    exports[name] = Icon;
  }
  exports.createLucideIcon = (name: string) => (props: AnyProps) =>
    createElement('LucideIcon', { name, ...props });
  exports.LucideProvider = Passthrough;
  return exports;
}

export interface HapticsCall {
  kind: 'impact' | 'notification' | 'selection';
  style?: string;
}

export function createHapticsFake(calls: HapticsCall[]) {
  return {
    impactAsync: async (style?: string) => {
      calls.push({ kind: 'impact', style });
    },
    notificationAsync: async (style?: string) => {
      calls.push({ kind: 'notification', style });
    },
    selectionAsync: async () => {
      calls.push({ kind: 'selection' });
    },
    ImpactFeedbackStyle: {
      Light: 'light',
      Medium: 'medium',
      Heavy: 'heavy',
      Soft: 'soft',
      Rigid: 'rigid',
    },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  };
}

/** A chainable gesture builder: every configuration method returns the gesture. */
function gestureBuilder(kind: string) {
  const gesture: Record<string, unknown> = { __gesture: kind };
  // Every method returns the proxy itself, so chains of any length keep working.
  const proxy: Record<string, unknown> = new Proxy(gesture, {
    get: (target, property) => (property in target ? target[property as string] : () => proxy),
  });
  return proxy;
}

export function createGestureHandlerFake() {
  const Gesture = Object.fromEntries(
    ['Pan', 'Tap', 'LongPress', 'Pinch', 'Rotation', 'Fling', 'Native', 'Manual', 'Hover'].map(
      (kind) => [kind, () => gestureBuilder(kind)]
    )
  );
  Object.assign(Gesture, {
    Simultaneous: (...gestures: unknown[]) => gestures,
    Exclusive: (...gestures: unknown[]) => gestures,
    Race: (...gestures: unknown[]) => gestures,
  });
  return {
    Gesture,
    GestureDetector: Passthrough,
    GestureHandlerRootView: hostComponent('View'),
    Swipeable: hostComponent('Swipeable'),
    ScrollView: hostComponent('ScrollView'),
    State: {},
    Directions: {},
  };
}

export interface NavigationCall {
  method: string;
  args: unknown[];
}

export interface NavigationFake {
  calls: NavigationCall[];
  route: { key: string; name: string; params?: Record<string, unknown> };
  navigation: Record<string, (...args: unknown[]) => unknown>;
  /** Listeners added through `navigation.addListener(event, fn)`. */
  emit: (event: string, payload?: unknown) => void;
  reset: () => void;
}

export function createNavigationFake(): NavigationFake {
  const calls: NavigationCall[] = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const route: NavigationFake['route'] = { key: 'test-route', name: 'TestRoute', params: {} };
  const record =
    (method: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  const navigation: NavigationFake['navigation'] = {
    navigate: record('navigate'),
    push: record('push'),
    replace: record('replace'),
    goBack: record('goBack'),
    pop: record('pop'),
    popToTop: record('popToTop'),
    popTo: record('popTo'),
    reset: record('reset'),
    dispatch: record('dispatch'),
    setParams: record('setParams'),
    setOptions: record('setOptions'),
    canGoBack: () => true,
    isFocused: () => true,
    getState: () => ({ routes: [route], index: 0 }),
    getId: () => undefined,
    addListener: (event: unknown, listener: unknown) => {
      const set = listeners.get(event as string) ?? new Set();
      set.add(listener as (payload: unknown) => void);
      listeners.set(event as string, set);
      return () => set.delete(listener as (payload: unknown) => void);
    },
    removeListener: () => {},
  };
  navigation.getParent = () => navigation;
  return {
    calls,
    route,
    navigation,
    emit: (event, payload) => listeners.get(event)?.forEach((listener) => listener(payload)),
    reset: () => {
      calls.length = 0;
      listeners.clear();
      route.params = {};
    },
  };
}

export function createReactNavigationFake(fake: NavigationFake) {
  const action =
    (type: string) =>
    (...args: unknown[]) => ({ type, args });
  return {
    useNavigation: () => fake.navigation,
    useRoute: () => fake.route,
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void | (() => void)) => {
      // Mirrors useFocusEffect: runs on focus (mount) and again when the callback changes.
      useEffect(effect, [effect]);
    },
    useScrollToTop: () => {},
    useNavigationState: (selector: (state: unknown) => unknown) =>
      selector(fake.navigation.getState()),
    useLinkTo: () => () => {},
    // A host element, so a test can fire onReady / onStateChange on it.
    NavigationContainer: hostComponent('NavigationContainer'),
    createNavigationContainerRef: () => ({
      current: null,
      isReady: () => false,
      navigate: () => {},
      getCurrentRoute: () => undefined,
    }),
    // Like the real helper: the nested state's focused route, else (before the
    // nested navigator has state) the `screen` param the route was opened with.
    getFocusedRouteNameFromRoute: (value: {
      state?: { routes: Array<{ name: string }>; index?: number };
      params?: { screen?: unknown };
    }) =>
      value?.state
        ? value.state.routes[value.state.index ?? 0]?.name
        : typeof value?.params?.screen === 'string'
          ? value.params.screen
          : undefined,
    getStateFromPath: () => undefined,
    CommonActions: {
      navigate: action('NAVIGATE'),
      reset: action('RESET'),
      goBack: action('GO_BACK'),
    },
    StackActions: {
      push: action('PUSH'),
      replace: action('REPLACE'),
      pop: action('POP'),
      popToTop: action('POP_TO_TOP'),
    },
    DefaultTheme: { dark: false, colors: {} },
    DarkTheme: { dark: true, colors: {} },
  };
}

export const simpleHostExports = {
  'expo-linear-gradient': () => ({ LinearGradient: hostComponent('LinearGradient') }),
  'expo-blur': () => ({ BlurView: hostComponent('BlurView') }),
  // FlashList renders like the eager FlatList fake (every item, header/empty/footer).
  '@shopify/flash-list': () => ({ FlashList: FlatList as ComponentType<AnyProps> }),
} satisfies Record<string, () => Record<string, ComponentType<AnyProps>>>;
