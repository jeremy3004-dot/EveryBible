import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';

// BibleReader params come from persisted state (last-read position, the audio
// queue, annotations, plan entries) as well as links. The reader renders nothing
// at all for a book id outside the catalog: no chrome, no back button, just a
// blank page. A bad chapter number is loaded as-is: an empty page, marked read,
// with chapter arrows stepping 999 -> 998. The guard sits in front of the reader
// in BibleStack so every caller is covered.

const harness = installRenderHarness(mock);

// BibleStack, as a list of its screens (see stackRoutes.render.test.tsx).
mockModule(mock, '@react-navigation/native-stack', {
  createNativeStackNavigator: () => ({
    Navigator: (props: { children: unknown }) => createElement('Navigator', props),
    Screen: (props: Record<string, unknown>) => createElement('Screen', props),
  }),
});
mockModule(mock, sourcePath('navigation/screenErrorLayout.ts'), {
  renderScreenWithErrorBoundary: ({ children }: { children: unknown }) => children,
});

let readerRenders = 0;
mockModule(mock, sourcePath('screens/bible/BibleReaderScreen.tsx'), {
  BibleReaderScreen: () => {
    readerRenders += 1;
    return createElement('Reader');
  },
});

async function renderRoute(params: unknown) {
  readerRenders = 0;
  harness.navigation.route.params = params as Record<string, unknown>;
  const { BibleReaderRoute } = await import('./bibleReaderRouteGuard');
  const view = await harness.render(<BibleReaderRoute />);
  await view.flush();
  return view;
}

const navigationCalls = () =>
  harness.navigation.calls.map(({ method, args }) => ({ method, args }));

test('a valid chapter renders the reader and changes nothing', async () => {
  const view = await renderRoute({ bookId: 'JHN', chapter: 21, focusVerse: 25 });
  assert.equal(view.queryAllByType('Reader').length, 1);
  assert.deepEqual(navigationCalls(), []);
});

test('a book outside the catalog returns to the Bible browser instead of a blank page', async () => {
  for (const params of [
    { bookId: 'XYZ', chapter: 1 },
    { bookId: 'jhn', chapter: 3 },
    { bookId: 'constructor', chapter: 1 },
    { chapter: 3 },
    undefined,
    null,
  ]) {
    harness.navigation.calls.length = 0;
    const view = await renderRoute(params);
    assert.equal(readerRenders, 0, `${JSON.stringify(params)} rendered the reader`);
    assert.deepEqual(
      navigationCalls(),
      [{ method: 'popTo', args: ['BibleBrowser'] }],
      JSON.stringify(params)
    );
    await view.unmount();
  }
});

test('a chapter the book does not have is corrected before the reader loads it', async () => {
  const cases: Array<[unknown, number]> = [
    [999, 21],
    [22, 21],
    [0, 1],
    [-4, 1],
    [2.7, 2],
    [Number.NaN, 1],
    [Infinity, 1],
    ['3', 3],
    ['three', 1],
    [undefined, 1],
  ];
  for (const [chapter, expected] of cases) {
    harness.navigation.calls.length = 0;
    const view = await renderRoute({ bookId: 'JHN', chapter, focusVerse: 16 });
    assert.equal(readerRenders, 0, `chapter ${String(chapter)} reached the reader`);
    assert.deepEqual(
      navigationCalls(),
      [{ method: 'setParams', args: [{ chapter: expected }] }],
      `chapter ${String(chapter)}`
    );
    await view.unmount();
  }
});

test('BibleStack routes BibleReader through the guard', async () => {
  const { BibleReaderRoute } = await import('./bibleReaderRouteGuard');
  const { BibleStack } = await import('./BibleStack');
  const view = await harness.render(<BibleStack />);
  const reader = view
    .queryAllByType('Screen')
    .map((node) => node.props as { name: string; getComponent: () => unknown })
    .find((screen) => screen.name === 'BibleReader');
  assert.equal(reader?.getComponent(), BibleReaderRoute);
});
