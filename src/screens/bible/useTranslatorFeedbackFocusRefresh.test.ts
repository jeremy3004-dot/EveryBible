import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';
import { createReactHookRuntime } from '../../testing/reactHookRuntime';

// React Navigation's own useFocusEffect runs here, with `react` replaced by the shared
// hook runtime and only the navigation object it reads supplied by the test.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const focusEffectFile = fileURLToPath(
  new URL(
    '../../../node_modules/@react-navigation/core/lib/module/useFocusEffect.js',
    import.meta.url
  ).href
);
const navigationListeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
let focused = true;
const navigation = {
  isFocused: () => focused,
  addListener: (event: keyof typeof navigationListeners, callback: () => void) => {
    navigationListeners[event].add(callback);
    return () => navigationListeners[event].delete(callback);
  },
};
mockModule(mock, fileURLToPath(new URL('./useNavigation.js', `file://${focusEffectFile}`).href), {
  useNavigation: () => navigation,
});

type FocusRefreshHook =
  typeof import('./useTranslatorFeedbackFocusRefresh').useTranslatorFeedbackFocusRefresh;
let useTranslatorFeedbackFocusRefresh: FocusRefreshHook;

before(async () => {
  const { useFocusEffect } = (await import(focusEffectFile)) as {
    useFocusEffect: (effect: () => void | (() => void)) => void;
  };
  mockModule(mock, '@react-navigation/native', { useFocusEffect });
  ({ useTranslatorFeedbackFocusRefresh } = await import('./useTranslatorFeedbackFocusRefresh'));
});

afterEach(() => {
  runtime.unmountAll();
  navigationListeners.focus.clear();
  navigationListeners.blur.clear();
  focused = true;
});

async function browser(initiallyFocused = true) {
  focused = initiallyFocused;
  const calls: string[] = [];
  const requestIdRef = { current: 0 };
  const loaders = new Map<string, () => Promise<void>>();
  // The screen's loader is a useCallback keyed on the translation, so each translation
  // gets one stable function identity.
  const loaderFor = (translationId: string) => {
    let loader = loaders.get(translationId);
    if (!loader) {
      loader = async () => {
        calls.push(translationId);
      };
      loaders.set(translationId, loader);
    }
    return loader;
  };
  const view = runtime.mount(
    (translationId: string) =>
      useTranslatorFeedbackFocusRefresh(loaderFor(translationId), requestIdRef),
    'bsb'
  );
  view.flushEffects();
  return {
    calls,
    requestIdRef,
    show(translationId: string) {
      view.rerender(translationId);
      view.flushEffects();
    },
    focus(value: boolean) {
      focused = value;
      navigationListeners[value ? 'focus' : 'blur'].forEach((callback) => callback());
    },
    unmount: () => view.unmount(),
  };
}

test('a focused browser mount and each translation change fetch feedback once', async () => {
  const h = await browser();
  assert.deepEqual(h.calls, ['bsb']);
  h.focus(true);
  assert.deepEqual(h.calls, ['bsb'], 'a duplicate initial focus event must not refetch');
  h.show('web');
  assert.deepEqual(h.calls, ['bsb', 'web']);
});

test('feedback waits while hidden and refreshes the latest translation on return', async () => {
  const h = await browser(false);
  assert.deepEqual(h.calls, []);
  h.focus(true);
  assert.deepEqual(h.calls, ['bsb']);
  h.focus(false);
  h.show('web');
  assert.deepEqual(h.calls, ['bsb']);
  h.focus(true);
  assert.deepEqual(h.calls, ['bsb', 'web']);
});

test('blur and unmount invalidate pending feedback responses', async () => {
  const h = await browser();
  const mountedRequest = h.requestIdRef.current;
  h.focus(false);
  assert.ok(h.requestIdRef.current > mountedRequest);
  h.focus(true);
  const focusedRequest = h.requestIdRef.current;
  h.unmount();
  assert.ok(h.requestIdRef.current > focusedRequest);
});
