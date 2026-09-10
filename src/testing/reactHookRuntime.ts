/**
 * A dependency-free React hook runtime for `node --test`. No renderer is
 * installed here, so a hook can only be exercised by replacing `react` itself;
 * `docs/testing.md` has the usage. Positional per-instance slots make
 * useState / useRef / useMemo / useCallback survive a re-render, dependencies
 * are compared with `Object.is` (no array means "every render"), and effects
 * queued by a render run at commit — every superseded cleanup first, then every
 * new effect body, layout before passive — and again on `unmount()`. The one
 * deliberate divergence: `setState` writes its slot (functional updaters see
 * the newest value) but does not schedule a render; call `rerender()`.
 */
import assert from 'node:assert/strict';

type Deps = readonly unknown[] | undefined;

type ValueSlot = { kind: 'value'; deps: Deps; value: unknown };
type EffectSlot = {
  kind: 'effect';
  layout: boolean;
  deps: Deps;
  run: () => void | (() => void);
  cleanup?: () => void;
  queued: boolean;
};
type Slot = ValueSlot | EffectSlot;
type Instance = { slots: Slot[]; cursor: number; queue: EffectSlot[] };

/**
 * A hook mounted by {@link ReactHookRuntime.mount}. `rerender()` with no
 * arguments reuses the last ones; `flushEffects()` runs the queued effects
 * synchronously and `commit()` also lets microtasks settle; `unmount()` runs
 * every live cleanup but keeps the value slots, so a test can render the
 * torn-down instance once more to prove a stale subscription writes nothing.
 */
export interface MountedHook<Args extends unknown[], Result> {
  readonly result: Result;
  readonly renderCount: number;
  /** Committed effects currently holding a cleanup function. */
  readonly cleanupCount: number;
  rerender: (...args: Args | []) => Result;
  flushEffects: () => void;
  commit: () => Promise<void>;
  unmount: () => void;
}

export interface IntervalLeakGuard {
  readonly liveCount: number;
  /** Clear anything still running and fail the test if there was anything. */
  assertNoLeaks: (message?: string) => void;
  restore: () => void;
}

export interface TestContext<T> {
  _currentValue: T;
  Provider: (props: { value: T; children?: unknown }) => unknown;
  Consumer: (props: { children?: unknown }) => unknown;
}

export interface ReactHookRuntime {
  /** Pass to `mockModule(mock, 'react', runtime.react)`. Includes `default`. */
  react: Record<string, unknown>;
  /** Render `hook(...args)` as a fresh component instance. Effects stay queued. */
  mount: <Args extends unknown[], Result>(
    hook: (...args: Args) => Result,
    ...args: Args
  ) => MountedHook<Args, Result>;
  mountedInstances: ReadonlySet<MountedHook<never, unknown>>;
  /** Unmount everything still mounted. For `afterEach`. */
  unmountAll: () => void;
  setContextValue: <T>(context: TestContext<T>, value: T) => void;
  /** Wrap `setInterval` / `clearInterval` so a leaked timer fails, not hangs. */
  installIntervalLeakGuard: () => IntervalLeakGuard;
}

const depsChanged = (a: Deps, b: Deps): boolean =>
  !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));

/** Captured up front so `mock.timers` cannot swap it out from under `commit()`. */
const realSetImmediate = globalThis.setImmediate;

const scheduleMacrotask = (resolve: () => void): void => {
  void (realSetImmediate ? realSetImmediate(resolve) : Promise.resolve().then(resolve));
};

export function createReactHookRuntime(): ReactHookRuntime {
  let active: Instance | null = null;

  const current = (): Instance => {
    if (!active) throw new Error('A React hook was called outside of a render pass');
    return active;
  };

  const valueSlot = (deps: Deps, create: () => unknown): ValueSlot => {
    const instance = current();
    const index = instance.cursor++;
    const slot = instance.slots[index] as ValueSlot | undefined;
    if (slot && !depsChanged(slot.deps, deps)) return slot;
    const next: ValueSlot = { kind: 'value', deps, value: create() };
    instance.slots[index] = next;
    return next;
  };

  const stateHook = <S>(initial: S | (() => S)): [S, (next: S | ((current: S) => S)) => void] => {
    const slot = valueSlot([], () =>
      typeof initial === 'function' ? (initial as () => S)() : initial
    );
    const setState = (next: S | ((value: S) => S)) => {
      slot.value = typeof next === 'function' ? (next as (value: S) => S)(slot.value as S) : next;
    };
    return [slot.value as S, setState];
  };

  const refHook = <T>(initial: T): { current: T } =>
    valueSlot([], () => ({ current: initial })).value as { current: T };
  const memoHook = <T>(factory: () => T, deps?: Deps): T => valueSlot(deps, factory).value as T;
  const callbackHook = <T>(callback: T, deps?: Deps): T => memoHook(() => callback, deps);
  const effectHook =
    (layout: boolean) =>
    (run: () => void | (() => void), deps?: Deps): void => {
      const instance = current();
      const index = instance.cursor++;
      const slot = instance.slots[index] as EffectSlot | undefined;
      if (!slot) {
        const created: EffectSlot = { kind: 'effect', layout, deps, run, queued: true };
        instance.slots[index] = created;
        instance.queue.push(created);
        return;
      }
      if (!depsChanged(slot.deps, deps)) return;
      slot.deps = deps;
      slot.run = run;
      if (!slot.queued) {
        slot.queued = true;
        instance.queue.push(slot);
      }
    };

  const contextHook = <T>(value: T): TestContext<T> => ({
    _currentValue: value,
    Provider: (props) => props.children,
    Consumer: (props) => props.children,
  });

  const react: Record<string, unknown> = {
    useState: stateHook,
    useRef: refHook,
    useMemo: memoHook,
    useCallback: callbackHook,
    useEffect: effectHook(false),
    useLayoutEffect: effectHook(true),
    useInsertionEffect: effectHook(true),
    useContext: <T>(context: TestContext<T>): T => context._currentValue,
    createContext: contextHook,
    useSyncExternalStore: <T>(_sub: unknown, getSnapshot: () => T): T => getSnapshot(),
    useDebugValue: () => {},
    useId: () => 'test-id',
  };
  react.default = react;

  const mountedInstances = new Set<MountedHook<never, unknown>>();

  function mount<Args extends unknown[], Result>(
    hook: (...args: Args) => Result,
    ...args: Args
  ): MountedHook<Args, Result> {
    const instance: Instance = { slots: [], cursor: 0, queue: [] };
    let lastArgs = args;
    let lastResult: Result;
    let renderCount = 0;
    const render = (nextArgs: Args): Result => {
      const previous = active;
      active = instance;
      instance.cursor = 0;
      renderCount += 1;
      try {
        lastResult = hook(...nextArgs);
      } finally {
        active = previous;
      }
      lastArgs = nextArgs;
      return lastResult;
    };

    const effectSlots = (): EffectSlot[] =>
      instance.slots.filter((slot): slot is EffectSlot => slot?.kind === 'effect');

    // React's commit order: every superseded cleanup, then every effect body.
    const runQueue = (layout: boolean) => {
      const due = instance.queue.filter((slot) => slot.layout === layout);
      instance.queue = instance.queue.filter((slot) => slot.layout !== layout);
      for (const slot of due) {
        slot.cleanup?.();
        slot.cleanup = undefined;
      }
      for (const slot of due) {
        slot.queued = false;
        const cleanup = slot.run();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    };
    const flushEffects = () => {
      runQueue(true);
      runQueue(false);
    };

    const view: MountedHook<Args, Result> = {
      get result() {
        return lastResult;
      },
      get renderCount() {
        return renderCount;
      },
      get cleanupCount() {
        return effectSlots().filter((slot) => slot.cleanup).length;
      },
      rerender: (...next: Args | []) => render(next.length > 0 ? (next as Args) : lastArgs),
      flushEffects,
      commit: async () => {
        flushEffects();
        await new Promise<void>(scheduleMacrotask);
      },
      unmount: () => {
        for (const slot of effectSlots()) {
          slot.cleanup?.();
          slot.cleanup = undefined;
          slot.queued = false;
        }
        instance.queue = [];
        mountedInstances.delete(view as MountedHook<never, unknown>);
      },
    };

    mountedInstances.add(view as MountedHook<never, unknown>);
    render(args);
    return view;
  }

  return {
    react,
    mount,
    mountedInstances,
    unmountAll: () => {
      for (const view of Array.from(mountedInstances)) {
        view.unmount();
      }
    },
    setContextValue: (context, value) => {
      context._currentValue = value;
    },
    installIntervalLeakGuard,
  };
}

/**
 * Hooks that own intervals keep the runner process alive forever when a test
 * forgets to unmount them. Recording live handles turns that hang into an
 * ordinary assertion failure naming the test that leaked.
 */
export function installIntervalLeakGuard(): IntervalLeakGuard {
  const live = new Set<ReturnType<typeof setInterval>>();
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;

  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const handle = realSetInterval(...args);
    live.add(handle);
    return handle;
  }) as typeof setInterval;

  globalThis.clearInterval = ((handle?: ReturnType<typeof setInterval>) => {
    if (handle !== undefined) {
      live.delete(handle);
    }
    return realClearInterval(handle);
  }) as typeof clearInterval;

  const drain = (): number => {
    const leaked = live.size;
    for (const handle of Array.from(live)) {
      realClearInterval(handle);
    }
    live.clear();
    return leaked;
  };

  return {
    get liveCount() {
      return live.size;
    },
    assertNoLeaks: (message = 'the test left a real setInterval running') => {
      assert.equal(drain(), 0, message);
    },
    restore: () => {
      drain();
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    },
  };
}
