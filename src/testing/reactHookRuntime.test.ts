/* eslint-disable react-hooks/exhaustive-deps -- these are the runtime's own hooks, exercised outside React on purpose */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReactHookRuntime,
  installIntervalLeakGuard,
  type TestContext,
} from './reactHookRuntime';

const runtime = createReactHookRuntime();
const {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
} = runtime.react as {
  useCallback: <T>(callback: T, deps?: readonly unknown[]) => T;
  useContext: <T>(context: TestContext<T>) => T;
  useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => void;
  useLayoutEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => void;
  useMemo: <T>(factory: () => T, deps?: readonly unknown[]) => T;
  useRef: <T>(initial: T) => { current: T };
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((current: S) => S)) => void];
  createContext: <T>(value: T) => TestContext<T>;
};

afterEach(() => {
  runtime.unmountAll();
});

test('state written by setState is visible to the next render, not the current one', () => {
  const view = runtime.mount(() => {
    const [count, setCount] = useState(0);
    return { count, setCount };
  });

  view.result.setCount(1);
  assert.equal(view.result.count, 0, 'the render already returned; its value is frozen');

  assert.equal(view.rerender().count, 1);
  assert.equal(view.renderCount, 2);
});

test('functional updates compose against the newest stored value', () => {
  const view = runtime.mount(() => {
    const [count, setCount] = useState(() => 10);
    return { count, setCount };
  });

  view.result.setCount((previous) => previous + 1);
  view.result.setCount((previous) => previous + 1);

  assert.equal(view.rerender().count, 12);
});

test('each useState call keeps its own slot in call order across re-renders', () => {
  const view = runtime.mount(() => {
    const [first, setFirst] = useState('a');
    const [second, setSecond] = useState('b');
    return { first, second, setFirst, setSecond };
  });

  view.result.setSecond('B');
  const next = view.rerender();
  assert.deepEqual({ first: next.first, second: next.second }, { first: 'a', second: 'B' });
});

test('useRef is stable and useMemo/useCallback recompute only when deps change', () => {
  let factoryRuns = 0;
  const view = runtime.mount((multiplier: number) => {
    const ref = useRef({ seen: 0 });
    ref.current.seen += 1;
    const doubled = useMemo(() => {
      factoryRuns += 1;
      return multiplier * 2;
    }, [multiplier]);
    const callback = useCallback(() => multiplier, [multiplier]);
    return { ref, doubled, callback };
  }, 2);

  const firstRef = view.result.ref;
  const firstCallback = view.result.callback;

  view.rerender(2);
  assert.equal(view.result.ref, firstRef, 'useRef hands back the same object');
  assert.equal(view.result.callback, firstCallback, 'unchanged deps keep the same callback');
  assert.equal(factoryRuns, 1);
  assert.equal(firstRef.current.seen, 2);

  view.rerender(3);
  assert.equal(factoryRuns, 2);
  assert.equal(view.result.doubled, 6);
  assert.notEqual(view.result.callback, firstCallback);
});

test('useMemo without a dependency array recomputes on every render', () => {
  let runs = 0;
  const view = runtime.mount(() => useMemo(() => ++runs));
  view.rerender();
  view.rerender();
  assert.equal(runs, 3);
});

test('effects stay queued until commit, and layout effects run first', async () => {
  const order: string[] = [];
  const view = runtime.mount(() => {
    useEffect(() => {
      order.push('passive');
    }, []);
    useLayoutEffect(() => {
      order.push('layout');
    }, []);
  });

  assert.deepEqual(order, [], 'rendering does not run effects');
  await view.commit();
  assert.deepEqual(order, ['layout', 'passive']);
});

test('commit drains microtasks so a lazily imported collaborator has resolved', async () => {
  const seen: string[] = [];
  const view = runtime.mount(() => {
    useEffect(() => {
      void Promise.resolve()
        .then(() => Promise.resolve('lazy-module'))
        .then((value) => {
          seen.push(value);
        });
    }, []);
  });

  await view.commit();
  assert.deepEqual(seen, ['lazy-module'], 'a two-tick promise chain has settled');
});

test('a changed dependency runs the previous cleanup before the new effect body', async () => {
  const order: string[] = [];
  const view = runtime.mount((topic: string) => {
    useEffect(() => {
      order.push(`subscribe:${topic}`);
      return () => order.push(`unsubscribe:${topic}`);
    }, [topic]);
  }, 'a');

  await view.commit();
  view.rerender('a');
  await view.commit();
  assert.deepEqual(order, ['subscribe:a'], 'unchanged deps do not re-run the effect');

  view.rerender('b');
  await view.commit();
  assert.deepEqual(order, ['subscribe:a', 'unsubscribe:a', 'subscribe:b']);
});

test('all superseded cleanups run before any new effect body in one commit', async () => {
  const order: string[] = [];
  const view = runtime.mount((key: string) => {
    useEffect(() => {
      order.push(`up:1:${key}`);
      return () => order.push(`down:1:${key}`);
    }, [key]);
    useEffect(() => {
      order.push(`up:2:${key}`);
      return () => order.push(`down:2:${key}`);
    }, [key]);
  }, 'a');

  await view.commit();
  order.length = 0;
  view.rerender('b');
  await view.commit();

  assert.deepEqual(order, ['down:1:a', 'down:2:a', 'up:1:b', 'up:2:b']);
});

test('unmount runs every live cleanup and stops later renders from re-running them', async () => {
  const order: string[] = [];
  const view = runtime.mount(() => {
    useEffect(() => () => order.push('cleanup'), []);
  });

  await view.commit();
  assert.equal(view.cleanupCount, 1, 'the committed effect holds a cleanup');
  view.unmount();
  view.unmount();

  assert.deepEqual(order, ['cleanup'], 'cleanup runs exactly once');
  assert.equal(view.cleanupCount, 0);
  assert.equal(runtime.mountedInstances.has(view as never), false);
});

test('an effect that returns nothing registers no cleanup', async () => {
  const view = runtime.mount(() => {
    useEffect(() => {}, []);
  });

  await view.commit();
  assert.equal(view.cleanupCount, 0);
});

test('unmountAll tears down every instance still mounted', async () => {
  const cleaned: number[] = [];
  for (const id of [1, 2, 3]) {
    const view = runtime.mount(() => {
      useEffect(() => () => cleaned.push(id), []);
    });
    await view.commit();
  }
  assert.equal(runtime.mountedInstances.size, 3);

  runtime.unmountAll();
  assert.deepEqual(cleaned, [1, 2, 3]);
  assert.equal(runtime.mountedInstances.size, 0);
});

test('useContext reads the value the runtime last set', () => {
  const ThemeContext = createContext('light');
  const view = runtime.mount(() => useContext(ThemeContext));
  assert.equal(view.result, 'light');

  runtime.setContextValue(ThemeContext, 'dark');
  assert.equal(view.rerender(), 'dark');
});

test('calling a hook outside a render pass is an error, not silent corruption', () => {
  assert.throws(() => useState(0), /outside of a render pass/);
});

test('the interval leak guard reports an interval nobody cleared', () => {
  const guard = installIntervalLeakGuard();
  try {
    const handle = setInterval(() => {}, 1000);
    assert.equal(guard.liveCount, 1);
    assert.throws(() => guard.assertNoLeaks(), /setInterval/);
    assert.equal(guard.liveCount, 0, 'assertNoLeaks clears what it found');
    clearInterval(handle);

    const cleared = setInterval(() => {}, 1000);
    clearInterval(cleared);
    guard.assertNoLeaks();
  } finally {
    guard.restore();
  }
});

test('restoring the leak guard puts the real timer functions back', () => {
  const realSetInterval = globalThis.setInterval;
  const guard = installIntervalLeakGuard();
  assert.notEqual(globalThis.setInterval, realSetInterval);
  guard.restore();
  assert.equal(globalThis.setInterval, realSetInterval);
});
