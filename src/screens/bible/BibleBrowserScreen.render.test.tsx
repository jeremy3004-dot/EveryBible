import test, { mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { BIBLE_SEARCH_DEBOUNCE_MS } from './bibleSearchModel';
import { installBrowserRenderFixture } from './BibleBrowserScreen.renderFixture';

// Book list, reader navigation, search and the translation sheet. Availability,
// the translator summary banner and store-driven updates live in
// BibleBrowserScreen.states.render.test.tsx.
const {
  harness,
  t,
  bibleStore,
  translatorReviewStore,
  feedback,
  searches,
  verse,
  renderBrowser,
  wait,
  bookList,
  translationEntry,
} = installBrowserRenderFixture(mock);

/**
 * Advances node:test's mocked clock, inside `act` so the resulting state updates and
 * effects flush. Scoped to the test via its `context` (node:test restores it when the
 * test ends), so only tests that opt in run the debounce timer on a fake clock; the
 * search-debounce tests below use this instead of a real `wait()` against
 * BIBLE_SEARCH_DEBOUNCE_MS so the window itself can never fire early or late under load.
 */
async function tickTimers(context: TestContext, ms: number) {
  await act(async () => {
    context.mock.timers.tick(ms);
  });
}

/**
 * Once the debounce timer fires, the search hook still reaches the (mocked) search
 * service through a dynamic import(), which settles on a real event-loop turn rather
 * than a microtask (see docs/testing.md's lazy-import note). Polling by iteration count
 * rather than elapsed time means a busy machine just takes longer wall time to satisfy
 * the same bounded number of turns, instead of racing a fixed real-time budget.
 */
async function waitUntil(predicate: () => boolean, maxIterations = 200) {
  for (let i = 0; i < maxIterations && !predicate(); i++) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
  assert.ok(predicate(), 'condition was not met within the poll budget');
}

test('every book row carries a stable key derived from the book', async () => {
  const view = await renderBrowser();
  const list = bookList(view);
  const rows = list.props.data as Array<{ id: string }>;
  const keyExtractor = list.props.keyExtractor as (row: unknown, index: number) => string;

  const keys = rows.map((row, index) => keyExtractor(row, index));
  assert.equal(new Set(keys).size, rows.length, 'keys are unique');
  assert.equal(keys[0], 'book-GEN');
  assert.equal(keys.at(-1), 'book-REV');
  assert.ok(keys.includes('divider-NT'));
});

test('without a route book the list reopens on the saved book, expanded and scrolled into view', async () => {
  const view = await renderBrowser('BibleBrowser', { initialBookId: 'NOPE' });

  assert.ok(view.getByRole('button', { name: 'John', expanded: true }));
  assert.ok(view.getByRole('button', { name: 'Genesis', expanded: false }));
  assert.equal(view.getAllByRole('button', { name: /^\d+$/ }).length, 21, "John's chapters");

  const list = bookList(view);
  const johnRow = (list.props.data as Array<{ id: string }>).findIndex(
    (row) => row.id === 'book-JHN'
  );
  assert.equal(list.props.initialScrollIndex, johnRow);

  await wait(5);
  const scrolls = harness.refCalls.filter((call) => call.method === 'scrollToIndex');
  assert.deepEqual(
    scrolls.map((call) => [call.type, call.args]),
    [['FlatList', [{ index: johnRow, animated: false, viewPosition: 0.15 }]]]
  );
});

test('a valid route book overrides the saved one and opens without an imperative scroll', async () => {
  const view = await renderBrowser('BiblePicker', { initialBookId: 'ROM' });

  assert.ok(view.getByRole('button', { name: 'Romans', expanded: true }));
  assert.ok(view.getByRole('button', { name: 'John', expanded: false }));
  const list = bookList(view);
  const romansRow = (list.props.data as Array<{ id: string }>).findIndex(
    (row) => row.id === 'book-ROM'
  );
  assert.equal(list.props.initialScrollIndex, romansRow);

  await wait(5);
  assert.deepEqual(
    harness.refCalls.filter((call) => call.method === 'scrollToIndex'),
    []
  );
});

test('tapping a book toggles its chapter grid', async () => {
  const view = await renderBrowser();

  await view.press(view.getByRole('button', { name: 'Genesis' }));
  assert.ok(view.getByRole('button', { name: 'Genesis', expanded: true }));
  assert.ok(view.getByRole('button', { name: 'John', expanded: false }));
  assert.equal(view.getAllByRole('button', { name: /^\d+$/ }).length, 50);

  await view.press(view.getByRole('button', { name: 'Genesis' }));
  assert.equal(view.queryAllByRole('button', { name: /^\d+$/ }).length, 0);
});

test('as the picker modal it offers a close control, no translation entry, and pops back to the reader', async () => {
  const view = await renderBrowser('BiblePicker');

  assert.equal(translationEntry(view), null, 'no translation entry inside the picker');
  await view.press(view.getByRole('button', { name: '5' }));
  const [call] = harness.navigation.calls;
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'popTo',
      args: [
        'BibleReader',
        { bookId: 'JHN', chapter: 5, focusVerse: undefined, preferredMode: 'listen' },
      ],
    },
  ]);
  assert.equal('autoplayAudio' in (call.args[1] as object), false, 'listen mode never autoplays');

  await view.press(view.getByRole('button', { name: t('interface.close') }));
  assert.equal(harness.navigation.calls.at(-1)?.method, 'goBack');
});

test('as a stack screen it has no close control and navigates to the reader in the saved mode', async () => {
  bibleStore.setState({ preferredChapterLaunchMode: 'read' });
  const view = await renderBrowser('BibleBrowser');

  assert.equal(view.queryByRole('button', { name: t('interface.close') }), null);
  assert.ok(translationEntry(view));
  await view.press(view.getByRole('button', { name: '3' }));
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: [
        'BibleReader',
        { bookId: 'JHN', chapter: 3, focusVerse: undefined, preferredMode: 'read' },
      ],
    },
  ]);
});

test('the focusSearch launch flag focuses the search field, and only then', async () => {
  const focused = async (params: Record<string, unknown>) => {
    const view = await renderBrowser('BibleBrowser', params);
    await wait(5);
    const calls = harness.refCalls
      .filter((call) => call.method === 'focus')
      .map((call) => [call.type, call.props.accessibilityLabel]);
    await view.unmount();
    harness.refCalls.length = 0;
    return calls;
  };

  assert.deepEqual(await focused({}), []);
  assert.deepEqual(await focused({ focusSearch: true }), [['TextInput', t('common.search')]]);
});

test('a typed reference offers a jump card that opens the passage', async () => {
  const view = await renderBrowser();
  await view.changeText(view.getByLabelText(t('common.search')), 'John 3:16');
  await view.flush();

  assert.equal(view.queryByRole('button', { name: 'Genesis' }), null, 'the book list gives way');
  const card = view.getByText('John 3:16');
  assert.ok(
    view.getByText(
      `${t('interface.chapterNumber', { chapter: 3 })} • ${t('interface.verseNumber', { verse: 16 })}`
    )
  );
  await view.press(card);
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['BibleReader', { bookId: 'JHN', chapter: 3, focusVerse: 16, preferredMode: 'listen' }],
    },
  ]);
  assert.equal(searches.length, 0, 'a reference never runs a full-text search');

  // Submitting from the keyboard jumps the same way.
  await view.fire(view.getByLabelText(t('common.search')), 'onSubmitEditing');
  assert.equal(harness.navigation.calls.length, 2);
  assert.deepEqual(harness.navigation.calls[1], harness.navigation.calls[0]);
});

test('full-text search waits for the debounce window, then lists and announces results', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderBrowser();
  await view.changeText(view.getByLabelText(t('common.search')), 'love');
  await view.flush();

  // With no results yet, the skeleton takes the surface while the query waits.
  assert.deepEqual(
    view.queryAllByType('VersesSkeleton').map((node) => node.props.count),
    [6]
  );
  assert.equal(view.queryByRole('button', { name: 'Genesis' }), null);

  // The debounce timer runs on the mocked clock, so only an explicit tick moves it
  // forward: stopping one tick short of the window proves it never fires early, with
  // no dependence on wall-clock scheduling at all.
  await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS - 1);
  assert.equal(searches.length, 0, 'no query before the debounce window closes');

  await tickTimers(context, 1);
  await waitUntil(() => searches.length > 0);
  assert.deepEqual(
    searches.map(({ translationId, query }) => [translationId, query]),
    [['bsb', 'love']]
  );

  await act(async () => searches[0].resolve([verse('1JN', 4, 8, 'God is love.')]));
  const result = view.getByRole('button', { name: /1 John 4:8/ });
  assert.ok(within(result).getByText(/God is love\./));
  assert.ok(
    harness.rn.__recorded.announcements.includes(t('interface.searchResultCount', { count: 1 }))
  );

  await view.press(result);
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['BibleReader', { bookId: '1JN', chapter: 4, focusVerse: 8, preferredMode: 'listen' }],
    },
  ]);
});

test('typing again inside the debounce window issues only the latest query', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));

  await view.changeText(input, 'lov');
  // Well inside the window (100 of 250 mocked ms): proves the edit below lands
  // before 'lov' could have fired, deterministically rather than by real-time luck.
  await tickTimers(context, 100);
  await view.changeText(input, 'love');
  await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS);
  await waitUntil(() => searches.length > 0);

  assert.deepEqual(
    searches.map(({ query }) => query),
    ['love']
  );
});

test('a slower earlier search never overwrites the results of a newer one', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));

  await view.changeText(input, 'love');
  await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS);
  await waitUntil(() => searches.length === 1);
  await view.changeText(input, 'grace');
  await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS);
  await waitUntil(() => searches.length === 2);
  assert.deepEqual(
    searches.map(({ query }) => query),
    ['love', 'grace']
  );

  await act(async () => searches[1].resolve([verse('EPH', 2, 8, 'By grace you have been saved.')]));
  await act(async () => searches[0].resolve([verse('1JN', 4, 8, 'God is love.')]));

  assert.ok(view.getByText(/By grace you have been saved\./));
  assert.equal(view.queryByText(/God is love\./), null);
});

test('a translation without full-text search says so; other failures show the load error', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const consoleError = mock.method(console, 'error', () => {});
  try {
    const view = await renderBrowser();
    const input = view.getByLabelText(t('common.search'));

    await view.changeText(input, 'love');
    await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS);
    await waitUntil(() => searches.length === 1);
    const unavailable = Object.assign(new Error('no index'), {
      name: 'BibleSearchUnavailableError',
    });
    await act(async () => searches[0].reject(unavailable));
    assert.ok(view.getByText(t('bible.searchUnavailable')));
    assert.equal(view.queryByText(t('bible.failedToLoad')), null);

    await view.changeText(input, 'grace');
    await tickTimers(context, BIBLE_SEARCH_DEBOUNCE_MS);
    await waitUntil(() => searches.length === 2);
    await act(async () => searches[1].reject(new Error('disk I/O')));
    assert.ok(view.getByText(t('bible.failedToLoad')));
    assert.equal(view.queryByText(t('bible.searchUnavailable')), null);
  } finally {
    consoleError.mock.restore();
  }
});

test('the translation sheet loads the shared picker only once it is opened', async () => {
  const view = await renderBrowser();

  assert.equal(view.queryAllByType('Modal').length, 0);
  assert.equal(view.queryAllByType('TranslationPickerList').length, 0);

  const entry = translationEntry(view);
  assert.ok(entry);
  assert.deepEqual(entry.props.accessibilityValue, { text: 'Berean Standard Bible' });
  await view.press(entry);
  await view.flush();

  const [picker] = view.queryAllByType('TranslationPickerList');
  assert.ok(picker, 'the shared picker renders inside the sheet');
  const sheet = flattenStyle(hostAncestors(picker)[0].props.style);
  assert.equal(sheet?.height, '60%', 'a fixed-height sheet, so the picker cannot collapse it');
  assert.equal(sheet?.overflow, 'hidden', 'the sheet clips the picker');

  await view.fire(picker, 'onRequestClose');
  assert.equal(view.queryAllByType('Modal').length, 0, 'the picker can dismiss the sheet');
});

test('the translation sheet shares the reader header: capped title and a 44pt close target', async () => {
  const { DISPLAY_TEXT_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  harness.setFontScale(3.12);
  const view = await renderBrowser();
  await view.press(translationEntry(view)!);
  await view.flush();

  const title = view.getByRole('header', { name: t('bible.selectTranslation') });
  assert.equal(title.props.maxFontSizeMultiplier, DISPLAY_TEXT_MAX_FONT_SCALE);
  const close = view.getByRole('button', { name: t('interface.close') });
  const style = flattenStyle(close.props.style) ?? {};
  assert.deepEqual([style.width, style.height], [44, 44]);
  await view.press(close);
  assert.equal(view.queryAllByType('Modal').length, 0);
});

test('translator review badges mark pending and addressed feedback on books and chapters', async () => {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const colors = createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  feedback.result = {
    success: true,
    chapters: [
      { bookId: 'JHN', chapter: 3, total: 2, unresolvedDown: 1, unresolvedUp: 0 },
      { bookId: 'JHN', chapter: 4, total: 1, unresolvedDown: 0, unresolvedUp: 0 },
      { bookId: 'GEN', chapter: 1, total: 1, unresolvedDown: 0, unresolvedUp: 0 },
    ],
  };
  const view = await renderBrowser();
  await view.flush();

  assert.deepEqual(feedback.requests, [{ translationId: 'bsb', passcode: '2468' }]);

  const badgeOf = (node: ReactTestInstance) => {
    const badges = within(node).queryAllByRole('image');
    assert.equal(badges.length, 1);
    const [badge] = badges;
    const [icon] = within(badge).queryAllByType('Icon');
    return {
      label: badge.props.accessibilityLabel,
      icon: icon.props.name,
      iconColor: icon.props.color,
      background: flattenStyle(badge.props.style)?.backgroundColor,
    };
  };
  const pending = {
    label: t('translatorQueue.title'),
    icon: 'alert',
    iconColor: colors.onAccent,
    background: colors.accentPrimary,
  };
  const addressed = {
    label: t('bible.translatorReviewConfirmedAccurate'),
    icon: 'checkmark',
    iconColor: colors.onAccent,
    background: colors.success,
  };

  assert.deepEqual(badgeOf(view.getByRole('button', { name: 'John' })), pending);
  assert.deepEqual(badgeOf(view.getByRole('button', { name: 'Genesis' })), addressed);
  assert.deepEqual(badgeOf(view.getByRole('button', { name: '3' })), pending);
  assert.deepEqual(badgeOf(view.getByRole('button', { name: '4' })), addressed);
  assert.equal(within(view.getByRole('button', { name: '5' })).queryAllByRole('image').length, 0);
  assert.ok(view.getByRole('button', { name: t('translatorQueue.title') }), 'queue shortcut');
});

test('a book whose summary rows carry no feedback shows no badge, like its chapters', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  feedback.result = {
    success: true,
    chapters: [
      { bookId: 'JHN', chapter: 3, total: 0, unresolvedDown: 0, unresolvedUp: 0 },
      { bookId: 'JHN', chapter: 4, total: 0, unresolvedDown: 0, unresolvedUp: 0 },
    ],
  };
  const view = await renderBrowser();
  await view.flush();

  assert.deepEqual(feedback.requests, [{ translationId: 'bsb', passcode: '2468' }]);
  assert.equal(view.queryAllByRole('image').length, 0);
});

test('normal readers see no feedback badges and never request the review summary', async () => {
  translatorReviewStore.setState({ enabled: false, accessPasscode: '2468' });
  feedback.result = {
    success: true,
    chapters: [{ bookId: 'JHN', chapter: 3, total: 2, unresolvedDown: 1, unresolvedUp: 0 }],
  };
  const view = await renderBrowser();
  await view.flush();

  assert.deepEqual(feedback.requests, []);
  assert.equal(view.queryAllByRole('image').length, 0);
  assert.equal(view.queryByRole('button', { name: t('translatorQueue.title') }), null);
});
