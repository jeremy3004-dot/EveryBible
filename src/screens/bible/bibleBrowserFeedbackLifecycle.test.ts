import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const screen = ts.createSourceFile(
  'BibleBrowserScreen.tsx',
  readSource('./BibleBrowserScreen.tsx'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const effects: string[] = [];
const visit = (node: ts.Node) => {
  if (
    ts.isCallExpression(node) &&
    ['useEffect', 'useFocusEffect'].includes(node.expression.getText(screen)) &&
    node.getText(screen).includes('loadTranslatorFeedbackSummaries')
  )
    effects.push(node.getText(screen));
  ts.forEachChild(node, visit);
};
visit(screen);
const compile = (source: string) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

// Run the actual screen effects and installed React Navigation focus hook. The harness
// supplies only React's effect boundary and navigation events, avoiding native UI imports.
function makeHarness(initiallyFocused = true) {
  let focused = initiallyFocused;
  const calls: string[] = [];
  const cleanups: Array<() => void> = [];
  const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  const requestIdRef = { current: 0 };
  const useEffect = (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  };
  const navigation = {
    isFocused: () => focused,
    addListener: (event: keyof typeof listeners, callback: () => void) => {
      listeners[event].add(callback);
      return () => listeners[event].delete(callback);
    },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(
    compile(readSource('../../../node_modules/@react-navigation/core/src/useFocusEffect.tsx')),
    {
      exports,
      require: (moduleName: string) => {
        if (moduleName === 'react') return { useEffect };
        if (moduleName === './useNavigation') return { useNavigation: () => navigation };
        throw new Error(`Unexpected dependency: ${moduleName}`);
      },
      process: { env: { NODE_ENV: 'production' } },
      console,
    }
  );
  const unmount = () => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  };
  return {
    calls,
    requestIdRef,
    render(translationId: string) {
      unmount();
      runInNewContext(compile(effects.join(';\n')), {
        useEffect,
        useFocusEffect: exports.useFocusEffect,
        useCallback: (callback: unknown) => callback,
        translatorFeedbackSummaryRequestIdRef: requestIdRef,
        loadTranslatorFeedbackSummaries: async () => {
          calls.push(translationId);
        },
      });
    },
    focus(value: boolean) {
      focused = value;
      listeners[value ? 'focus' : 'blur'].forEach((callback) => callback());
    },
    unmount,
  };
}

test('focused browser mount and each translation change fetch feedback once', () => {
  const harness = makeHarness();
  harness.render('bsb');
  assert.deepEqual(harness.calls, ['bsb']);
  harness.focus(true);
  assert.deepEqual(harness.calls, ['bsb'], 'duplicate initial focus events must not refetch');
  harness.render('web');
  assert.deepEqual(harness.calls, ['bsb', 'web']);
});

test('feedback waits while hidden and refreshes the latest translation on return', () => {
  const harness = makeHarness(false);
  harness.render('bsb');
  assert.deepEqual(harness.calls, []);
  harness.focus(true);
  assert.deepEqual(harness.calls, ['bsb']);
  harness.focus(false);
  harness.render('web');
  assert.deepEqual(harness.calls, ['bsb']);
  harness.focus(true);
  assert.deepEqual(harness.calls, ['bsb', 'web']);
});

test('blur and unmount invalidate pending feedback responses', () => {
  const harness = makeHarness();
  harness.render('bsb');
  const mountedRequest = harness.requestIdRef.current;
  harness.focus(false);
  assert.ok(harness.requestIdRef.current > mountedRequest);
  harness.focus(true);
  const focusedRequest = harness.requestIdRef.current;
  harness.unmount();
  assert.ok(harness.requestIdRef.current > focusedRequest);
});
