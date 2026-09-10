/**
 * Minimal `react-native` replacement for node --test.
 *
 * Why: `react-native` cannot be imported under Node (Flow syntax, native
 * bindings). Modules that need `Platform`, `AppState`, `Dimensions`, etc. are
 * loaded with `mock.module('react-native', { exports: createReactNativeStub() })`.
 * The stub records what the code under test did (listeners added, alerts shown,
 * URLs opened) and exposes `emit` helpers so tests can drive app-state and
 * keyboard events.
 *
 * Add fields to the returned object BEFORE calling mock.module if a module
 * needs something not provided here.
 */

export interface ReactNativeStubOptions {
  os?: 'ios' | 'android' | 'web';
  version?: string | number;
  width?: number;
  height?: number;
  isRTL?: boolean;
  appState?: 'active' | 'background' | 'inactive';
  nativeModules?: Record<string, unknown>;
}

type Listener = (...args: unknown[]) => void;

interface ListenerRegistry {
  listeners: Map<string, Set<Listener>>;
  add(event: string, listener: Listener): { remove: () => void };
  emit(event: string, ...args: unknown[]): void;
  count(event: string): number;
}

const createRegistry = (): ListenerRegistry => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    add(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return {
        remove: () => {
          set.delete(listener);
        },
      };
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
    count(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
};

export function createReactNativeStub(options: ReactNativeStubOptions = {}) {
  const os = options.os ?? 'ios';
  const version = options.version ?? (os === 'ios' ? '18.0' : 34);
  const width = options.width ?? 390;
  const height = options.height ?? 844;

  const appStateRegistry = createRegistry();
  const keyboardRegistry = createRegistry();
  const linkingRegistry = createRegistry();
  const dimensionsRegistry = createRegistry();

  const alerts: Array<{ title: string; message?: string; buttons?: unknown; options?: unknown }> =
    [];
  const openedUrls: string[] = [];
  const rtlCalls: Array<{ method: string; value: boolean }> = [];

  const Platform = {
    OS: os,
    Version: version,
    isPad: false,
    isTV: false,
    isTesting: true,
    select: <T>(specifics: Record<string, T>): T | undefined =>
      specifics[os] ?? specifics.native ?? specifics.default,
    constants: {},
  };

  const AppState = {
    currentState: options.appState ?? 'active',
    addEventListener: (event: string, listener: Listener) => appStateRegistry.add(event, listener),
    removeEventListener: (event: string, listener: Listener) => {
      appStateRegistry.listeners.get(event)?.delete(listener);
    },
    /** Test helper: change state and notify listeners. */
    emit: (state: 'active' | 'background' | 'inactive') => {
      AppState.currentState = state;
      appStateRegistry.emit('change', state);
    },
    listenerCount: () => appStateRegistry.count('change'),
  };

  const Dimensions = {
    get: (_dimension: 'window' | 'screen') => ({ width, height, scale: 3, fontScale: 1 }),
    addEventListener: (event: string, listener: Listener) =>
      dimensionsRegistry.add(event, listener),
    emit: (payload: unknown) => dimensionsRegistry.emit('change', payload),
  };

  const Keyboard = {
    addListener: (event: string, listener: Listener) => keyboardRegistry.add(event, listener),
    removeAllListeners: (event: string) => keyboardRegistry.listeners.delete(event),
    dismiss: () => undefined,
    emit: (event: string, payload: unknown) => keyboardRegistry.emit(event, payload),
    listenerCount: (event: string) => keyboardRegistry.count(event),
  };

  const Linking = {
    openURL: async (url: string) => {
      openedUrls.push(url);
    },
    canOpenURL: async (_url: string) => true,
    getInitialURL: async () => null as string | null,
    addEventListener: (event: string, listener: Listener) => linkingRegistry.add(event, listener),
    emit: (url: string) => linkingRegistry.emit('url', { url }),
  };

  const Alert = {
    alert: (title: string, message?: string, buttons?: unknown, alertOptions?: unknown) => {
      alerts.push({ title, message, buttons, options: alertOptions });
    },
  };

  const I18nManager = {
    isRTL: options.isRTL ?? false,
    doLeftAndRightSwapInRTL: true,
    allowRTL: (value: boolean) => {
      rtlCalls.push({ method: 'allowRTL', value });
    },
    forceRTL: (value: boolean) => {
      rtlCalls.push({ method: 'forceRTL', value });
      I18nManager.isRTL = value;
    },
    swapLeftAndRightInRTL: (value: boolean) => {
      rtlCalls.push({ method: 'swapLeftAndRightInRTL', value });
    },
    getConstants: () => ({ isRTL: I18nManager.isRTL, doLeftAndRightSwapInRTL: true }),
  };

  class NativeEventEmitter {
    private registry = createRegistry();
    constructor(_nativeModule?: unknown) {}
    addListener(event: string, listener: Listener) {
      return this.registry.add(event, listener);
    }
    removeAllListeners(event: string) {
      this.registry.listeners.delete(event);
    }
    emit(event: string, ...args: unknown[]) {
      this.registry.emit(event, ...args);
    }
    listenerCount(event: string) {
      return this.registry.count(event);
    }
  }

  const StyleSheet = {
    create: <T>(styles: T): T => styles,
    flatten: (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style),
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  };

  const PixelRatio = {
    get: () => 3,
    getFontScale: () => 1,
    roundToNearestPixel: (value: number) => Math.round(value * 3) / 3,
  };

  return {
    Platform,
    AppState,
    Dimensions,
    Keyboard,
    Linking,
    Alert,
    I18nManager,
    NativeEventEmitter,
    NativeModules: options.nativeModules ?? {},
    StyleSheet,
    PixelRatio,
    useWindowDimensions: () => ({ width, height, scale: 3, fontScale: 1 }),
    DeviceEventEmitter: new NativeEventEmitter(),
    /** Recorded side effects for assertions. */
    __recorded: { alerts, openedUrls, rtlCalls },
  };
}

export type ReactNativeStub = ReturnType<typeof createReactNativeStub>;
