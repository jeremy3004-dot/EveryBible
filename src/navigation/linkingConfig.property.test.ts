import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import fc from 'fast-check';

import { mockModule } from '../testing/mockModules';
import { bibleBooks } from '../constants/books';

// ---------------------------------------------------------------------------
// Randomised checks of the whole inbound-link pipeline React Navigation runs on a
// URL: extractPathFromURL(prefixes) -> linkingConfig.getStateFromPath ->
// getActionFromState. The vendor functions are the installed ones. React
// Navigation calls this pipeline inside the Linking 'url' listener without a
// try/catch, so a throw here is a fatal crash, and a slow parse freezes the JS
// thread. Any app or web page can send us a com.everybible.app:// URL.
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=20000 node --test --experimental-test-module-mocks \
//     --import tsx src/navigation/linkingConfig.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 1000),
};

const EXPO_PREFIX = 'exp://127.0.0.1:8081/--/';

type StateRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: { index?: number; routes: StateRoute[] };
};
type State = { routes: StateRoute[] };

async function loadPipeline() {
  const require = createRequire(import.meta.url);
  const coreDirectory = dirname(require.resolve('@react-navigation/core/package.json'));
  const nativeDirectory = dirname(require.resolve('@react-navigation/native/package.json'));
  const core = (file: string) => pathToFileURL(join(coreDirectory, 'lib/module', file)).href;
  const { getStateFromPath } = (await import(core('getStateFromPath.js'))) as {
    getStateFromPath: unknown;
  };
  const { getActionFromState } = (await import(core('getActionFromState.js'))) as {
    getActionFromState: (state: State, config: unknown) => unknown;
  };
  const { extractPathFromURL } = (await import(
    pathToFileURL(join(nativeDirectory, 'lib/module/extractPathFromURL.js')).href
  )) as { extractPathFromURL: (prefixes: string[], url: string) => string | undefined };

  mockModule(mock, 'expo-linking', {
    createURL: (path: string) => `${EXPO_PREFIX}${path.replace(/^\//, '')}`,
    getInitialURL: async () => null,
  });
  mockModule(mock, '@react-navigation/native', { getStateFromPath });

  const { linkingConfig } = await import('./linkingConfig');
  const prefixes = linkingConfig.prefixes;
  const getState = linkingConfig.getStateFromPath;
  assert.ok(getState, 'linkingConfig should own inbound parsing');

  /** What React Navigation does with an incoming URL, minus the dispatch. */
  return (url: string): { state: State | undefined; action: unknown } => {
    const path = extractPathFromURL(prefixes, url);
    if (path === undefined) {
      return { state: undefined, action: undefined };
    }
    const state = getState(path, linkingConfig.config as never) as State | undefined;
    const action = state ? getActionFromState(state, linkingConfig.config) : undefined;
    return { state, action };
  };
}

let pipelinePromise: ReturnType<typeof loadPipeline> | undefined;
const pipeline = () => (pipelinePromise ??= loadPipeline());

const chaptersById = new Map(bibleBooks.map((book) => [book.id, book.chapters]));
const slugs = bibleBooks.map((book) => book.name.toLowerCase().replace(/\s/g, ''));

const piece = fc.oneof(
  fc.constantFrom('com.everybible.app://', EXPO_PREFIX, 'https://everybible.app/', 'exp://'),
  fc.constantFrom('bible', 'reset-password', 'More', 'Auth', 'ResetPassword', 'Bible', 'Plans'),
  fc.constantFrom(...slugs, 'psalm', 'constructor', '__proto__', 'toString'),
  fc.constantFrom('/', '//', '?', '#', '&', '=', '.', '..', '*', ':', '\\'),
  fc.constantFrom('%', '%00', '%2F', '%252F', '%25', '%E0%A4%A', '%C3%A9', '%%', '%zz'),
  fc.constantFrom('code=', 'error=', 'screen=', 'params=', 'state=', 'initial=false'),
  fc.constantFrom('0', '-1', '3', '16', '9999', '1.5', 'NaN', '1e3'),
  fc.constantFrom(' ', '\u0000', '\n', '😀', 'é', 'ё', '\u202e', '\uFEFF'),
  fc.string({ unit: 'binary', maxLength: 10 })
);

const hostileUrl = fc.oneof(
  fc.array(piece, { maxLength: 16 }).map((parts) => parts.join('')),
  fc.array(piece, { maxLength: 12 }).map((parts) => `com.everybible.app://${parts.join('')}`),
  fc.string({ unit: 'binary', maxLength: 120 })
);

const routeChain = (route: StateRoute | undefined): string[] => {
  const names: string[] = [];
  let cursor = route;
  while (cursor) {
    names.push(cursor.name);
    const nested: StateRoute[] | undefined = cursor.state?.routes;
    cursor = nested?.[nested.length - 1];
  }
  return names;
};

/** Every state a link may produce: a real chapter, or the reset-password screen. */
const assertAllowedDestination = (url: string, state: State | undefined) => {
  if (state === undefined) {
    return;
  }
  assert.equal(state.routes.length, 1, `${JSON.stringify(url)} opened several tabs`);
  const [tab] = state.routes;
  const chain = routeChain(tab);
  if (tab.name === 'Bible') {
    assert.deepEqual(
      tab.state?.routes.map((route) => route.name),
      ['BibleBrowser', 'BibleReader'],
      `${JSON.stringify(url)} opened the reader without the browser beneath it`
    );
    const params = tab.state?.routes[1]?.params as
      | { bookId: string; chapter: number; focusVerse?: number }
      | undefined;
    const chapterCount = chaptersById.get(params?.bookId ?? '');
    assert.ok(chapterCount, `${JSON.stringify(url)} opened unknown book`);
    assert.ok(
      params && Number.isInteger(params.chapter) && params.chapter >= 1,
      `${JSON.stringify(url)} opened a chapter that is not a whole number`
    );
    assert.ok(params.chapter <= chapterCount);
    assert.ok(
      params.focusVerse === undefined ||
        (Number.isSafeInteger(params.focusVerse) && params.focusVerse >= 1)
    );
    return;
  }
  assert.deepEqual(
    chain.slice(-2),
    ['Auth', 'ResetPassword'],
    `${JSON.stringify(url)} opened ${chain.join(' > ')}`
  );
  assert.equal(tab.name, 'More');
};

test('no URL makes the link pipeline throw, and every state it yields is an allowed destination', async () => {
  const run = await pipeline();
  fc.assert(
    fc.property(hostileUrl, (url) => {
      const { state } = run(url);
      assertAllowedDestination(url, state);
    }),
    FC_PARAMS
  );
});

test('links for any real chapter and verse open that chapter under both prefixes', async () => {
  const run = await pipeline();
  const target = fc.constantFrom(...bibleBooks).chain((book) =>
    fc.record({
      book: fc.constant(book),
      chapter: fc.integer({ min: 1, max: book.chapters }),
      verse: fc.option(fc.integer({ min: 1, max: 176 }), { nil: undefined }),
      prefix: fc.constantFrom('com.everybible.app://', EXPO_PREFIX),
    })
  );
  fc.assert(
    fc.property(target, ({ book, chapter, verse, prefix }) => {
      const slug = book.name.toLowerCase().replace(/\s/g, '');
      const url = `${prefix}bible/${slug}/${chapter}${verse === undefined ? '' : `/${verse}`}`;
      const { state, action } = run(url);
      assert.ok(action, url);
      assert.deepEqual(state?.routes[0]?.state?.routes[1]?.params, {
        bookId: book.id,
        chapter,
        focusVerse: verse,
      });
    }),
    FC_PARAMS
  );
});

test('a link to a chapter the book does not have opens nothing', async () => {
  const run = await pipeline();
  for (const chapter of ['0', '-1', '22', '9999', '1.5', '3abc', 'three', '']) {
    assert.equal(run(`com.everybible.app://bible/john/${chapter}`).state, undefined, chapter);
  }
  // John has 21 chapters; 21 is the last real one.
  assert.ok(run('com.everybible.app://bible/john/21').state);
});

test('a link naming a screen directly cannot reach it', async () => {
  const run = await pipeline();
  for (const path of [
    'More',
    'Bible',
    'BibleReader?bookId=JHN&chapter=3',
    'Plans/PlanDetail?planId=x',
    'Learn/GroupDetail?groupId=x',
    'ResetPassword',
    'Auth',
    'MoreScreen',
    'TranslatorQueue',
    'Diagnostics',
  ]) {
    assert.equal(run(`com.everybible.app://${path}`).state, undefined, path);
  }
});

// The vendor query parser is quadratic in the number of query parameters: a
// 200 KB reset link held the JS thread for seconds under V8 (far longer on
// Hermes). Real links are a few hundred characters.
test('an enormous link is turned away quickly instead of freezing the JS thread', async () => {
  const run = await pipeline();
  const huge = [
    `com.everybible.app://reset-password?${'a=b&'.repeat(50_000)}`,
    `com.everybible.app://reset-password?code=${'x'.repeat(200_000)}`,
    `com.everybible.app://bible/john/3?${'q=1&'.repeat(50_000)}`,
    `com.everybible.app://${'bible/'.repeat(50_000)}`,
  ];
  for (const url of huge) {
    const started = performance.now();
    const { state } = run(url);
    const elapsed = performance.now() - started;
    assert.ok(state === undefined, `a ${url.length}-char link opened a screen`);
    assert.ok(elapsed < 250, `took ${Math.round(elapsed)} ms for a ${url.length}-char link`);
  }
});

test('a real reset-password link with a long error description still opens the reset screen', async () => {
  const run = await pipeline();
  const description = encodeURIComponent('Email link is invalid or has expired. '.repeat(10));
  const { state } = run(
    `com.everybible.app://reset-password?error=access_denied&error_code=otp_expired&error_description=${description}`
  );
  assert.deepEqual(routeChain(state?.routes[0]).slice(-2), ['Auth', 'ResetPassword']);
});
