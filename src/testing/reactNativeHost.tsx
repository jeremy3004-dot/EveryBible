/**
 * Renderable `react-native` for node --test.
 *
 * `createReactNativeStub()` covers the imperative APIs (Platform, AppState,
 * Alert, ...). This file adds what a component needs to actually render under
 * react-test-renderer: every visual primitive becomes a host element named after
 * the RN component (`View`, `Text`, `Pressable`, ...) that carries the props the
 * component passed, so tests can assert on text, accessibility props and press
 * handlers. List components render all their items eagerly; `Modal` renders
 * nothing while `visible={false}`, as on device.
 *
 * Use it through `installRenderHarness()` in `./render.tsx`, not directly.
 */
import {
  createElement,
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createReactNativeStub, type ReactNativeStubOptions } from './reactNativeStub';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

// React 19 passes `ref` to function components as an ordinary prop, so these
// forward it to the host element by spreading props; no forwardRef needed.

/** A component that renders a host element of the same name with its props. */
export function hostComponent(name: string) {
  const Component = (props: AnyProps) => createElement(name, props);
  Component.displayName = name;
  return Component;
}

const PRESS_STATE = { pressed: false, hovered: false, focused: false };
type PressRender = (state: typeof PRESS_STATE) => ReactNode;

/** Pressable resolves its function style/children with the resting state. */
function Pressable({ children, style, ...rest }: AnyProps) {
  const content =
    typeof children === 'function' ? (children as PressRender)(PRESS_STATE) : children;
  const resolvedStyle =
    typeof style === 'function'
      ? (style as (state: typeof PRESS_STATE) => unknown)(PRESS_STATE)
      : style;
  return createElement('Pressable', { ...rest, style: resolvedStyle }, content);
}

/** A list slot prop may be an element or a component type. */
function renderSlot(slot: unknown): ReactNode {
  if (slot == null || slot === false) return null;
  if (isValidElement(slot)) return slot;
  return createElement(slot as ComponentType);
}

function defaultKey(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const record = item as { key?: unknown; id?: unknown };
    if (typeof record.key === 'string' || typeof record.key === 'number') return String(record.key);
    if (typeof record.id === 'string' || typeof record.id === 'number') return String(record.id);
  }
  return String(index);
}

const separators = { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} };

interface ListSlots {
  ListHeaderComponent?: unknown;
  ListFooterComponent?: unknown;
  ListEmptyComponent?: unknown;
}

interface FlatListProps extends ListSlots {
  data?: ArrayLike<unknown> | null;
  renderItem?: (info: { item: unknown; index: number; separators: typeof separators }) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  ItemSeparatorComponent?: unknown;
  [prop: string]: unknown;
}

/** FlatList renders every item (no virtualisation), plus its header/empty/footer slots. */
function FlatList({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  ...rest
}: FlatListProps) {
  const items = data ? Array.from(data) : [];
  const rows = items.map((item, index) =>
    createElement(
      Fragment,
      { key: keyExtractor ? keyExtractor(item, index) : defaultKey(item, index) },
      renderItem?.({ item, index, separators }),
      index < items.length - 1 ? renderSlot(ItemSeparatorComponent) : null
    )
  );
  return createElement(
    'FlatList',
    { ...rest, data },
    renderSlot(ListHeaderComponent),
    items.length === 0 ? renderSlot(ListEmptyComponent) : rows,
    renderSlot(ListFooterComponent)
  );
}

interface Section {
  data: ArrayLike<unknown>;
  key?: string;
  [extra: string]: unknown;
}

interface SectionListProps extends ListSlots {
  sections?: Section[];
  renderItem?: (info: { item: unknown; index: number; section: Section }) => ReactNode;
  renderSectionHeader?: (info: { section: Section }) => ReactNode;
  renderSectionFooter?: (info: { section: Section }) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  [prop: string]: unknown;
}

function SectionList({
  sections,
  renderItem,
  renderSectionHeader,
  renderSectionFooter,
  keyExtractor,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ...rest
}: SectionListProps) {
  const all = sections ?? [];
  const body = all.map((section, sectionIndex) =>
    createElement(
      Fragment,
      { key: section.key ?? String(sectionIndex) },
      renderSectionHeader?.({ section }),
      Array.from(section.data).map((item, index) =>
        createElement(
          Fragment,
          { key: keyExtractor ? keyExtractor(item, index) : defaultKey(item, index) },
          renderItem?.({ item, index, section })
        )
      ),
      renderSectionFooter?.({ section })
    )
  );
  const isEmpty = all.every((section) => Array.from(section.data).length === 0);
  return createElement(
    'SectionList',
    { ...rest, sections },
    renderSlot(ListHeaderComponent),
    isEmpty ? renderSlot(ListEmptyComponent) : body,
    renderSlot(ListFooterComponent)
  );
}

/** Modal is visible unless told otherwise, and renders nothing while hidden. */
function Modal({ visible, ...rest }: AnyProps) {
  return visible === false ? null : createElement('Modal', { ...rest, visible: true });
}

const StatusBar = Object.assign(() => null, {
  setBarStyle: () => {},
  setBackgroundColor: () => {},
  setHidden: () => {},
  setTranslucent: () => {},
  currentHeight: 0,
});

type Listener = (value: unknown) => void;

/** Just enough of RN's Animated.Value for components that build animations. */
class AnimatedValue {
  private value: number;
  private listeners = new Map<string, Listener>();
  private nextId = 0;
  constructor(value = 0) {
    this.value = value;
  }
  setValue(value: number) {
    this.value = value;
    for (const listener of this.listeners.values()) listener({ value });
  }
  setOffset() {}
  flattenOffset() {}
  extractOffset() {}
  addListener(listener: Listener) {
    const id = String(this.nextId++);
    this.listeners.set(id, listener);
    return id;
  }
  removeListener(id: string) {
    this.listeners.delete(id);
  }
  removeAllListeners() {
    this.listeners.clear();
  }
  stopAnimation(callback?: (value: number) => void) {
    callback?.(this.value);
  }
  resetAnimation(callback?: (value: number) => void) {
    callback?.(this.value);
  }
  interpolate() {
    return new AnimatedValue(this.value);
  }
  __getValue() {
    return this.value;
  }
}

class AnimatedValueXY {
  x: AnimatedValue;
  y: AnimatedValue;
  constructor(value: { x?: number; y?: number } = {}) {
    this.x = new AnimatedValue(value.x ?? 0);
    this.y = new AnimatedValue(value.y ?? 0);
  }
  setValue(value: { x: number; y: number }) {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }
  stopAnimation(callback?: (value: unknown) => void) {
    callback?.({ x: this.x.__getValue(), y: this.y.__getValue() });
  }
  getLayout() {
    return { left: this.x, top: this.y };
  }
  getTranslateTransform() {
    return [{ translateX: this.x }, { translateY: this.y }];
  }
}

interface CompositeAnimation {
  start: (callback?: (result: { finished: boolean }) => void) => void;
  stop: () => void;
  reset: () => void;
}

/** Animations finish immediately; a loop never finishes, as on device. */
const finishedAnimation = (apply: () => void = () => {}): CompositeAnimation => ({
  start: (callback) => {
    apply();
    callback?.({ finished: true });
  },
  stop: () => {},
  reset: () => {},
});

const toValueAnimation = (value: unknown, config: { toValue?: unknown }) =>
  finishedAnimation(() => {
    if (value instanceof AnimatedValue && typeof config?.toValue === 'number') {
      value.setValue(config.toValue);
    }
  });

const group = (animations: CompositeAnimation[]) =>
  finishedAnimation(() => animations.forEach((animation) => animation.start()));

const Animated = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  View: hostComponent('View'),
  Text: hostComponent('Text'),
  Image: hostComponent('Image'),
  ScrollView: hostComponent('ScrollView'),
  FlatList,
  timing: toValueAnimation,
  spring: toValueAnimation,
  decay: () => finishedAnimation(),
  delay: () => finishedAnimation(),
  parallel: group,
  sequence: group,
  stagger: (_delay: number, animations: CompositeAnimation[]) => group(animations),
  loop: (): CompositeAnimation => ({ start: () => {}, stop: () => {}, reset: () => {} }),
  event: () => () => {},
  add: () => new AnimatedValue(0),
  subtract: () => new AnimatedValue(0),
  multiply: () => new AnimatedValue(0),
  divide: () => new AnimatedValue(0),
  modulo: () => new AnimatedValue(0),
  diffClamp: () => new AnimatedValue(0),
  createAnimatedComponent: <T,>(component: T) => component,
};

const easingFn = (t: number) => t;
const Easing = {
  linear: easingFn,
  ease: easingFn,
  quad: easingFn,
  cubic: easingFn,
  sin: easingFn,
  circle: easingFn,
  exp: easingFn,
  bounce: easingFn,
  step0: easingFn,
  step1: easingFn,
  poly: () => easingFn,
  elastic: () => easingFn,
  back: () => easingFn,
  bezier: () => easingFn,
  in: () => easingFn,
  out: () => easingFn,
  inOut: () => easingFn,
};

/** RN's StyleSheet.flatten: merge nested style arrays, skipping falsy entries. */
export function flattenStyle(style: unknown): Record<string, unknown> | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => Object.assign(merged, flattenStyle(entry)),
      {}
    );
  }
  return typeof style === 'object' ? { ...(style as Record<string, unknown>) } : undefined;
}

export interface ReactNativeRenderStubOptions extends ReactNativeStubOptions {
  /** What `AccessibilityInfo.isReduceMotionEnabled()` resolves. */
  reduceMotion?: () => boolean;
  colorScheme?: 'light' | 'dark';
}

export function createReactNativeRenderStub(options: ReactNativeRenderStubOptions = {}) {
  const base = createReactNativeStub(options);
  const shares: unknown[] = [];
  const announcements: string[] = [];
  const actionSheets: Array<{ options: unknown; callback: unknown }> = [];
  const backHandlers = new Set<() => boolean | null | undefined>();

  return {
    ...base,
    StyleSheet: {
      ...base.StyleSheet,
      flatten: flattenStyle,
      compose: (a: unknown, b: unknown) => (a && b ? [a, b] : (a ?? b)),
    },
    View: hostComponent('View'),
    Text: hostComponent('Text'),
    TextInput: hostComponent('TextInput'),
    Image: Object.assign(hostComponent('Image'), {
      getSize: () => {},
      prefetch: async () => true,
      resolveAssetSource: (source: unknown) => source,
    }),
    ImageBackground: hostComponent('ImageBackground'),
    ScrollView: hostComponent('ScrollView'),
    FlatList,
    SectionList,
    VirtualizedList: FlatList,
    Pressable,
    TouchableOpacity: hostComponent('TouchableOpacity'),
    TouchableHighlight: hostComponent('TouchableHighlight'),
    TouchableWithoutFeedback: hostComponent('TouchableWithoutFeedback'),
    Switch: hostComponent('Switch'),
    Modal,
    ActivityIndicator: hostComponent('ActivityIndicator'),
    KeyboardAvoidingView: hostComponent('KeyboardAvoidingView'),
    SafeAreaView: hostComponent('SafeAreaView'),
    RefreshControl: hostComponent('RefreshControl'),
    StatusBar,
    Animated,
    Easing,
    useColorScheme: () => options.colorScheme ?? 'light',
    Appearance: {
      getColorScheme: () => options.colorScheme ?? 'light',
      addChangeListener: () => ({ remove: () => {} }),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => options.reduceMotion?.() ?? false,
      isScreenReaderEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
      announceForAccessibility: (message: string) => {
        announcements.push(message);
      },
      setAccessibilityFocus: () => {},
    },
    Share: {
      share: async (content: unknown) => {
        shares.push(content);
        return { action: 'sharedAction' };
      },
      sharedAction: 'sharedAction',
      dismissedAction: 'dismissedAction',
    },
    InteractionManager: {
      runAfterInteractions: (task?: () => void) => {
        let cancelled = false;
        const done = Promise.resolve().then(() => {
          if (!cancelled) task?.();
        });
        return { then: done.then.bind(done), done: () => {}, cancel: () => (cancelled = true) };
      },
    },
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean | null | undefined) => {
        backHandlers.add(handler);
        return { remove: () => backHandlers.delete(handler) };
      },
      exitApp: () => {},
      /** Test helper: deliver a hardware back press, newest handler first. */
      press: () => [...backHandlers].reverse().some((handler) => handler() === true),
    },
    LayoutAnimation: {
      configureNext: () => {},
      create: () => ({}),
      easeInEaseOut: () => {},
      linear: () => {},
      spring: () => {},
      Presets: { easeInEaseOut: {}, linear: {}, spring: {} },
      Types: {},
      Properties: {},
    },
    UIManager: { setLayoutAnimationEnabledExperimental: () => {}, measure: () => {} },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    ActionSheetIOS: {
      showActionSheetWithOptions: (sheetOptions: unknown, callback: unknown) => {
        actionSheets.push({ options: sheetOptions, callback });
      },
    },
    Vibration: { vibrate: () => {}, cancel: () => {} },
    ToastAndroid: { show: () => {}, SHORT: 0, LONG: 1 },
    findNodeHandle: () => 1,
    processColor: (color: unknown) => color,
    __recorded: { ...base.__recorded, shares, announcements, actionSheets },
  };
}

export type ReactNativeRenderStub = ReturnType<typeof createReactNativeRenderStub>;

/** Ref targets for host elements: the imperative methods components call on refs. */
export function createHostNodeMock(_element: ReactElement): Record<string, () => void> {
  const noop = () => {};
  return {
    focus: noop,
    blur: noop,
    clear: noop,
    measure: noop,
    measureInWindow: noop,
    measureLayout: noop,
    setNativeProps: noop,
    scrollTo: noop,
    scrollToEnd: noop,
    scrollToOffset: noop,
    scrollToIndex: noop,
    scrollToLocation: noop,
    flashScrollIndicators: noop,
  };
}
