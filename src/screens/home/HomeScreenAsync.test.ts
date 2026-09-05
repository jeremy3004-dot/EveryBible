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
function makeLoaderHarness(currentTranslationInfo: { id: string } | null = { id: 'bsb' }) {
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
  const scriptureCalls: { translation: unknown; options: { allowInitialization: boolean } }[] = [];
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
      currentTranslationInfo,
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
        getDailyScripture: (
          translation: unknown,
          _audioAvailable: boolean,
          options: { allowInitialization: boolean }
        ) => {
          scriptureCalls.push({ translation, options });
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
  return { load, requests, scriptureRequests, scriptureCalls, state, verseRequestIdRef };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Home loads the selected Bible locally without requesting an online override', async () => {
  const harness = makeLoaderHarness();
  const loading = harness.load();
  await flush();
  assert.equal(harness.requests.length, 0, 'verse of the day must never need a connection');
  assert.equal(harness.scriptureRequests.length, 1);
  assert.deepEqual(harness.scriptureCalls[0].translation, { id: 'bsb' });
  assert.equal(harness.scriptureCalls[0].options.allowInitialization, true);
  const local = { translationId: 'bsb', text: 'Local Scripture' };
  harness.scriptureRequests[0].resolve(local);
  await loading;
  assert.equal(harness.state.scripture, local);
  assert.equal(harness.state.loading, false);
});

test('a slower Bible lookup cannot overwrite Scripture from the newer translation', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  await flush();
  assert.equal(harness.scriptureRequests.length, 1);
  const second = harness.load();
  await flush();
  const newest = { translationId: 'newer', text: 'new verse' };
  harness.scriptureRequests[1].resolve(newest);
  await second;
  harness.scriptureRequests[0].resolve({ text: 'old verse' });
  await first;
  assert.equal(harness.state.scripture, newest);
});

test('an older failure cannot hide the spinner or clear the newer pending load', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  await flush();
  assert.equal(harness.scriptureRequests.length, 1);
  const second = harness.load();
  await flush();
  harness.scriptureRequests[0].reject(new Error('old request failed'));
  await first;
  assert.equal(harness.state.loading, true);
  const newest = { text: 'new verse' };
  harness.scriptureRequests[1].resolve(newest);
  await second;
  assert.equal(harness.state.scripture, newest);
  assert.equal(harness.state.loading, false);
});

test('a silent foreground refresh settles an initial loading spinner', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  await flush();
  assert.equal(harness.scriptureRequests.length, 1);
  const second = harness.load({ silent: true });
  await flush();
  harness.scriptureRequests[1].resolve({ text: 'new verse' });
  await second;
  assert.equal(harness.state.loading, false);
  harness.scriptureRequests[0].resolve({ text: 'old verse' });
  await first;
});

test('a superseded module load does not start unnecessary Bible database work', async () => {
  const harness = makeLoaderHarness();
  const first = harness.load();
  harness.verseRequestIdRef.current += 1;
  await flush();
  assert.equal(harness.scriptureRequests.length, 0);
  assert.equal(harness.requests.length, 0);
  await first;
});

test('Home settles safely when no translation is available', async () => {
  const harness = makeLoaderHarness(null);
  const loading = harness.load();
  await flush();
  assert.equal(harness.requests.length, 0);
  await loading;
  assert.equal(harness.state.scripture, null);
  assert.equal(harness.state.loading, false);
});
