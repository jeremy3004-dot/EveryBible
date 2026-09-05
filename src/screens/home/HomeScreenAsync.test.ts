import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Exercise the screen's actual async callback while keeping native modules out of Node.
function makeLoaderHarness() {
  const source = ts.createSourceFile(
    'HomeScreen.tsx',
    readFileSync(fileURLToPath(new URL('./HomeScreen.tsx', import.meta.url).href), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let initializer: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'loadVerseOfDay') {
      initializer = node.initializer?.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer);
  const requests: ReturnType<typeof deferred<unknown>>[] = [];
  const scriptureRequests: ReturnType<typeof deferred<unknown>>[] = [];
  const verseRequestIdRef = { current: 0 };
  const state = { override: null as unknown, scripture: null as unknown, loading: false };
  // Stub just the module-loading boundary; run the screen's stale-result checks unchanged.
  initializer = initializer.replace(
    "import('../../services/bible/bibleService')",
    'loadBibleService()'
  );
  const load = runInNewContext(
    ts.transpileModule(`const load = ${initializer}; load;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      useCallback: (callback: unknown) => callback,
      currentTranslationInfo: { id: 'bsb' },
      remoteAudioAvailable: false,
      verseRequestIdRef,
      setIsLoadingVerse: (value: boolean) => {
        state.loading = value;
      },
      setRemoteVerseOverride: (value: unknown) => {
        state.override = value;
      },
      setDailyScripture: (value: unknown) => {
        state.scripture = value;
      },
      loadBibleService: async () => ({
        getDailyScripture: () => {
          const request = deferred<unknown>();
          scriptureRequests.push(request);
          return request.promise;
        },
      }),
      getLiveVerseOfDayOverride: () => {
        const request = deferred<unknown>();
        requests.push(request);
        return request.promise;
      },
      console: { error: () => {} },
    }
  ) as (options?: { silent?: boolean }) => Promise<void>;
  return { load, requests, scriptureRequests, state, verseRequestIdRef };
}

test('an older verse response cannot replace a newer translation or foreground refresh', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  const second = harness.load();
  const newest = { id: 'newest-verse' };
  harness.requests[1].resolve(newest);
  await second;
  harness.requests[0].resolve({ id: 'old-verse' });
  await first;
  assert.equal(harness.state.override, newest);
});

test('an old request failure cannot clear newer verse content', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  const second = harness.load();
  const newest = { id: 'newest-verse' };
  harness.requests[1].resolve(newest);
  await second;
  harness.requests[0].reject(new Error('old request failed'));
  await first;
  assert.equal(harness.state.override, newest);
});

test('an older completion cannot hide the loading state for a newer pending request', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  const second = harness.load();
  harness.requests[0].resolve({ id: 'old-verse' });
  await first;
  assert.equal(harness.state.loading, true);
  harness.requests[1].resolve({ id: 'newest-verse' });
  await second;
  assert.equal(harness.state.loading, false);
});

test('a silent retry that supersedes initial loading settles the loading state', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  const second = harness.load({ silent: true });
  harness.requests[1].resolve({ id: 'newest-verse' });
  await second;
  assert.equal(harness.state.loading, false);
  harness.requests[0].resolve({ id: 'old-verse' });
  await first;
});

test('a slower Bible lookup cannot overwrite scripture from the newer translation', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  harness.requests[0].resolve(null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.scriptureRequests.length, 1);
  const second = harness.load();
  harness.requests[1].resolve(null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.scriptureRequests.length, 2);
  const newest = { translationId: 'newer', text: 'new verse' };
  harness.scriptureRequests[1].resolve(newest);
  await second;
  harness.scriptureRequests[0].resolve({ translationId: 'older', text: 'old verse' });
  await first;
  assert.equal(harness.state.scripture, newest);
});

test('a superseded override lookup does not start unnecessary Bible database work', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  const second = harness.load();
  harness.requests[1].resolve({ id: 'newest-verse' });
  await second;
  harness.requests[0].resolve(null);
  await first;
  assert.equal(harness.scriptureRequests.length, 0);
});
