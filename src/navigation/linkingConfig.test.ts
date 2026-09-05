import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Import from buildBibleNavState directly — avoids pulling in expo-linking / react-native
// which cannot run in Node.js test runner environment.
import { buildBibleNavState } from './buildBibleNavState';

// Minimal stub for the default parser (used for non-bible paths)
const stubDefaultParser = (_path: string, _options: unknown) => undefined;

type StateRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: { routes: StateRoute[] };
};

// DEEP-07: buildBibleNavState routes a bible deep link to BibleReader with correct params,
// including the BibleBrowser backstop route in the Bible stack.
test('buildBibleNavState routes /bible/john/3/16 to BibleReader with JHN params', () => {
  const state = buildBibleNavState('/bible/john/3/16', stubDefaultParser, {} as never);
  assert.ok(state, 'should return a state object');

  const routes = state.routes as StateRoute[];
  const bibleRoute = routes.find((r) => r.name === 'Bible');
  assert.ok(bibleRoute, 'state should contain a Bible route');

  const bibleStack = bibleRoute.state?.routes ?? [];
  assert.equal(
    bibleStack.length,
    2,
    'Bible stack should have 2 routes (BibleBrowser + BibleReader)'
  );

  assert.equal(bibleStack[0]?.name, 'BibleBrowser', 'first route should be BibleBrowser');
  assert.equal(bibleStack[1]?.name, 'BibleReader', 'second route should be BibleReader');
  assert.deepEqual(bibleStack[1]?.params, {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
  });
});

// Chapter-only (no verse) deep link
test('buildBibleNavState routes /bible/1corinthians/13 to BibleReader with 1CO params', () => {
  const state = buildBibleNavState('/bible/1corinthians/13', stubDefaultParser, {} as never);
  assert.ok(state);

  const bibleRoute = state.routes.find((r) => r.name === 'Bible');
  const bibleStack = bibleRoute?.state?.routes ?? [];
  const readerRoute = bibleStack.find((r) => r.name === 'BibleReader');
  assert.deepEqual(readerRoute?.params, {
    bookId: '1CO',
    chapter: 13,
    focusVerse: undefined,
  });
});

// Unknown path falls through to defaultParser
test('buildBibleNavState calls defaultParser for non-bible paths', () => {
  let calledWith = '';
  const trackingParser = (path: string, _options: unknown) => {
    calledWith = path;
    return undefined;
  };
  buildBibleNavState('/home/dashboard', trackingParser, {} as never);
  assert.equal(calledWith, '/home/dashboard', 'defaultParser should be called for non-bible paths');
});

test('malformed path or query encoding never reaches the default parser', () => {
  const malformedPaths = [
    '/reset-password?token=%',
    '/reset-password?token=%A',
    '/reset-password?token=%GG',
    '/reset-password?token=%E0%A4%A',
    '/reset-password?token=%ED%A0%80',
    '/reset-password?token=%C0%AF',
    '/home/%FF',
    '/bible/john/3/16?note=%E0%A4%A',
  ];
  for (const path of malformedPaths) {
    let parserCalls = 0;
    const state = buildBibleNavState(
      path,
      () => {
        parserCalls += 1;
        return undefined;
      },
      {}
    );
    assert.equal(parserCalls, 0, `${path} must be rejected before invoking the vendor parser`);
    assert.equal(state, undefined);
  }
});

test('valid password reset, Unicode, and escaped-percent links reach the parser unchanged', () => {
  const paths = [
    '/reset-password',
    '/reset-password?access_token=abc%2Bdef%3D&type=recovery',
    '/home/नेपाली',
    '/reset-password?name=%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A5%80',
    '/reset-password?token=%252F%2525&literal=%25E0%25A4%25A',
  ];
  for (const path of paths) {
    const options = {};
    const expectedState = { routes: [{ name: 'More' }] };
    const state = buildBibleNavState(
      path,
      (receivedPath, receivedOptions) => {
        assert.equal(receivedPath, path);
        assert.equal(receivedOptions, options);
        return expectedState;
      },
      options
    );
    assert.equal(state, expectedState);
  }
});

test('valid encoded query data preserves Bible navigation', () => {
  const state = buildBibleNavState(
    '/bible/john/3/16?note=%E2%9C%93',
    () => {
      assert.fail('Bible links should not use the default parser');
    },
    {}
  );
  assert.equal(state?.routes[0]?.state?.routes[1]?.params?.bookId, 'JHN');
  assert.equal(state?.routes[0]?.state?.routes[1]?.params?.focusVerse, 16);
});

test('installed React Navigation parser decodes a valid reset query once behind the guard', async () => {
  // Load the installed pure parser directly; the package index also loads native UI modules.
  const require = createRequire(import.meta.url);
  const coreDirectory = dirname(require.resolve('@react-navigation/core/package.json'));
  const { getStateFromPath } = (await import(
    pathToFileURL(join(coreDirectory, 'lib/module/getStateFromPath.js')).href
  )) as { getStateFromPath: Parameters<typeof buildBibleNavState>[1] };
  const options = { screens: { ResetPassword: 'reset-password' } } as never;
  const path = '/reset-password?token=%252F%2525&name=%E0%A4%A8&literal=%25E0%25A4%25A';
  const state = buildBibleNavState(path, getStateFromPath, options);
  assert.equal(state?.routes[0]?.name, 'ResetPassword');
  assert.deepEqual(state?.routes[0]?.params, { token: '%2F%25', name: 'न', literal: '%E0%A4%A' });
  assert.equal(
    buildBibleNavState('/reset-password?token=%E0%A4%A', getStateFromPath, options),
    undefined
  );
});
