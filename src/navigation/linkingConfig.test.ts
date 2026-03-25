import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(bibleStack[1]?.params, { bookId: 'JHN', chapter: 3, focusVerse: 16 });
});

// Chapter-only (no verse) deep link
test('buildBibleNavState routes /bible/1corinthians/13 to BibleReader with 1CO params', () => {
  const state = buildBibleNavState('/bible/1corinthians/13', stubDefaultParser, {} as never);
  assert.ok(state);

  const bibleRoute = state.routes.find((r) => r.name === 'Bible');
  const bibleStack = bibleRoute?.state?.routes ?? [];
  const readerRoute = bibleStack.find((r) => r.name === 'BibleReader');
  assert.deepEqual(readerRoute?.params, { bookId: '1CO', chapter: 13, focusVerse: undefined });
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
