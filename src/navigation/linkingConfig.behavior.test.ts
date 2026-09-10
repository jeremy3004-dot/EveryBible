import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { mockModule } from '../testing/mockModules';
import { rootTabManifest } from './tabManifest';

/**
 * Exercises the real linkingConfig object: its prefixes, its screen path map and
 * its custom getStateFromPath. expo-linking cannot load under Node, and
 * @react-navigation/native's index pulls in native UI, so the installed *pure*
 * parser is loaded straight out of @react-navigation/core and handed back through
 * the package mock. Path -> state therefore runs through the vendor implementation
 * against this app's real config.
 */

const EXPO_PREFIX = 'exp://127.0.0.1:8081/--/';

type StateRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: { routes: StateRoute[] };
};

type LoadedConfig = Awaited<ReturnType<typeof importConfig>>;

const createUrlCalls: string[] = [];

async function importConfig() {
  // The vendor parser ships ESM only, so it has to be pulled in before the mocks
  // that stand in for the packages linkingConfig imports.
  const require = createRequire(import.meta.url);
  const coreDirectory = dirname(require.resolve('@react-navigation/core/package.json'));
  const { getStateFromPath } = (await import(
    pathToFileURL(join(coreDirectory, 'lib/module/getStateFromPath.js')).href
  )) as { getStateFromPath: unknown };

  mockModule(mock, 'expo-linking', {
    createURL: (path: string) => {
      createUrlCalls.push(path);
      return `${EXPO_PREFIX}${path.replace(/^\//, '')}`;
    },
  });
  mockModule(mock, '@react-navigation/native', { getStateFromPath });

  return (await import('./linkingConfig')).linkingConfig;
}

let configPromise: Promise<LoadedConfig> | undefined;
const loadConfig = () => (configPromise ??= importConfig());

const parse = async (path: string) => {
  const config = await loadConfig();
  assert.ok(config.getStateFromPath, 'linkingConfig should own inbound parsing');
  return config.getStateFromPath(path, config.config as never) as
    | { routes: StateRoute[] }
    | undefined;
};

const leafParams = (route: StateRoute): Record<string, unknown> | undefined => {
  let cursor: StateRoute = route;
  while (cursor.state?.routes[0]) {
    cursor = cursor.state.routes[0];
  }
  return cursor.params;
};

const routeChain = (route: StateRoute): string[] => {
  const names: string[] = [];
  let cursor: StateRoute | undefined = route;
  while (cursor) {
    names.push(cursor.name);
    cursor = cursor.state?.routes[0];
  }
  return names;
};

test('the config accepts both the Expo-generated prefix and the custom app scheme', async () => {
  const config = await loadConfig();
  assert.deepEqual(config.prefixes, [EXPO_PREFIX, 'com.everybible.app://']);
  assert.deepEqual(createUrlCalls, ['/'], 'the Expo prefix comes from Linking.createURL("/")');
});

test('the screen map only names root tabs the tab navigator actually registers', async () => {
  const config = await loadConfig();
  const tabNames = new Set<string>(rootTabManifest.map((entry) => entry.name));
  const mappedTabs = Object.keys(config.config?.screens ?? {});
  assert.deepEqual(
    mappedTabs,
    ['More'],
    'only the reset-password flow needs a path template; bible paths are parsed in code'
  );
  for (const name of mappedTabs) {
    assert.ok(tabNames.has(name), `${name} is not a registered root tab`);
  }
});

test('a bible deep link opens BibleReader on the resolved book id, behind BibleBrowser', async () => {
  const state = await parse('/bible/john/3/16');
  assert.ok(state);
  const bible = state.routes.find((route) => route.name === 'Bible');
  assert.ok(bible, 'the Bible tab should be the target');
  assert.deepEqual(
    bible.state?.routes.map((route) => route.name),
    ['BibleBrowser', 'BibleReader']
  );
  assert.deepEqual(bible.state?.routes[1]?.params, {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
  });
});

test('a chapter-only bible link opens the chapter with no focused verse', async () => {
  const state = await parse('/bible/1corinthians/13');
  const reader = state?.routes[0]?.state?.routes[1];
  assert.deepEqual(reader?.params, { bookId: '1CO', chapter: 13, focusVerse: undefined });
});

// BUG (fixed below in linkingConfig.ts): an unrecognised book slug used to fall
// through parseBibleDeepLink into the inbound-only `bible/:bookSlug/:chapter/:verse?`
// template, which pushed BibleReader with { bookSlug, chapter: '3', verse: '16' } —
// no bookId at all, a string chapter, and no BibleBrowser backstop to go back to.
test('an unknown book slug opens nothing rather than a BibleReader with no bookId', async () => {
  assert.equal(await parse('/bible/gondor/3/16'), undefined);
});

test('a bible path with a non-numeric chapter opens nothing', async () => {
  assert.equal(await parse('/bible/john/three'), undefined);
});

test('the reset-password link resolves through the More > Auth > ResetPassword template', async () => {
  const state = await parse('/reset-password?access_token=abc&type=recovery');
  assert.ok(state);
  assert.deepEqual(routeChain(state.routes[0]), ['More', 'Auth', 'ResetPassword']);
  assert.deepEqual(leafParams(state.routes[0]), { access_token: 'abc', type: 'recovery' });
});

test('a path no template covers yields no state rather than a wrong screen', async () => {
  assert.equal(await parse('/definitely-not-a-screen'), undefined);
});

test('a malformed percent-escape is rejected before the vendor parser sees it', async () => {
  assert.equal(await parse('/reset-password?token=%E0%A4%A'), undefined);
});
