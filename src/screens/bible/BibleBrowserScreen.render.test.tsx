import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import type { Verse } from '../../types';
import type { TranslatorFeedbackChapterSummary } from '../../services/feedback/translatorFeedbackReviewModel';
import { BIBLE_SEARCH_DEBOUNCE_MS } from './bibleSearchModel';

const harness = installRenderHarness(mock, {
  hooks: {
    useI18n: () => {
      const { t, i18n } = useTranslation();
      return { t, i18n, currentLanguage: 'en' };
    },
    // No catalog summary: every book and chapter counts as available.
    useTranslationContentSummary: () => undefined,
  },
});
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// React Native provides these globally; Node does not.
const timerGlobals = globalThis as unknown as {
  requestAnimationFrame: (callback: () => void) => unknown;
  cancelAnimationFrame: (id: unknown) => void;
};
timerGlobals.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
timerGlobals.cancelAnimationFrame ??= (id) => clearTimeout(id as NodeJS.Timeout);

const initialBibleState = {
  currentBook: 'JHN',
  currentTranslation: 'bsb',
  translations: [{ id: 'bsb', name: 'Berean Standard Bible', abbreviation: 'BSB' }],
  preferredChapterLaunchMode: 'listen' as 'listen' | 'read',
};
const bibleStore = create(() => ({ ...initialBibleState }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });

const translatorReviewStore = create(() => ({
  enabled: false,
  accessPasscode: null as string | null,
}));
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
  useTranslatorReviewStore: translatorReviewStore,
});

type SummaryResult =
  | { success: true; chapters: TranslatorFeedbackChapterSummary[] }
  | { success: false; code?: string };
const feedback = {
  requests: [] as Array<{ translationId: string; passcode: string }>,
  result: { success: true, chapters: [] } as SummaryResult,
};
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    TRANSLATION_NOT_COVERED: 'translation_not_covered',
    fetchChapterFeedbackReviewSummaryForTranslation: async (request: {
      translationId: string;
      passcode: string;
    }) => {
      feedback.requests.push(request);
      return feedback.result;
    },
  },
  real: ['getTranslatorFeedbackBookSummaryStatus', 'getTranslatorFeedbackChapterSummaryStatus'],
});
mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
  TranslationNotCoveredNotice: () => null,
});

// Full-text search goes through the SQLite-backed service, loaded lazily by the screen.
// Each call gets a promise the test settles, so ordering and staleness can be driven.
interface PendingSearch {
  translationId: string;
  query: string;
  resolve: (verses: Verse[]) => void;
  reject: (error: Error) => void;
}
const searches: PendingSearch[] = [];
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  searchBible: (translationId: string, query: string) =>
    new Promise<Verse[]>((resolve, reject) => {
      searches.push({ translationId, query, resolve, reject });
    }),
});

// Another suite owns the real picker; here it is a host element carrying its props.
mockModule(mock, sourcePath('screens/bible/TranslationPickerList.tsx'), {
  TranslationPickerList: (props: Record<string, unknown>) =>
    createElement('TranslationPickerList', props),
});

afterEach(() => {
  bibleStore.setState({ ...initialBibleState }, true);
  translatorReviewStore.setState({ enabled: false, accessPasscode: null }, true);
  feedback.requests.length = 0;
  feedback.result = { success: true, chapters: [] };
  searches.length = 0;
  harness.navigation.route.name = 'TestRoute';
});

let nextVerseId = 1;
const verse = (bookId: string, chapter: number, verseNumber: number, text: string): Verse => ({
  id: nextVerseId++,
  bookId,
  chapter,
  verse: verseNumber,
  text,
});

async function renderBrowser(
  routeName: 'BibleBrowser' | 'BiblePicker' = 'BibleBrowser',
  params: Record<string, unknown> = {}
) {
  harness.navigation.route.name = routeName;
  harness.navigation.route.params = params;
  const { BibleBrowserScreen } = await import('./BibleBrowserScreen');
  const view = await harness.render(<BibleBrowserScreen />);
  await view.flush();
  return view;
}

/** Let real time pass inside act, so timers that set state are flushed. */
async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const bookList = (view: Awaited<ReturnType<typeof renderBrowser>>) => {
  const [list] = view
    .queryAllByType('FlatList')
    .filter((node) => (node.props.data as unknown[]).length > 60);
  assert.ok(list, 'the book list is rendered');
  return list;
};

const translationEntry = (view: Awaited<ReturnType<typeof renderBrowser>>) =>
  view.queryByRole('button', { name: t('bible.selectTranslation') });

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

test('full-text search waits for the debounce window, then lists and announces results', async () => {
  const view = await renderBrowser();
  await view.changeText(view.getByLabelText(t('common.search')), 'love');
  await view.flush();

  assert.equal(view.queryAllByType('VersesSkeleton').length, 0);
  assert.equal(view.queryByRole('button', { name: 'Genesis' }), null);

  await wait(BIBLE_SEARCH_DEBOUNCE_MS - 100);
  assert.equal(searches.length, 0, 'no query before the debounce window closes');

  await wait(150);
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

test('typing again inside the debounce window issues only the latest query', async () => {
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));

  await view.changeText(input, 'lov');
  await wait(100);
  await view.changeText(input, 'love');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);

  assert.deepEqual(
    searches.map(({ query }) => query),
    ['love']
  );
});

test('a slower earlier search never overwrites the results of a newer one', async () => {
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));

  await view.changeText(input, 'love');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
  await view.changeText(input, 'grace');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
  assert.deepEqual(
    searches.map(({ query }) => query),
    ['love', 'grace']
  );

  await act(async () => searches[1].resolve([verse('EPH', 2, 8, 'By grace you have been saved.')]));
  await act(async () => searches[0].resolve([verse('1JN', 4, 8, 'God is love.')]));

  assert.ok(view.getByText(/By grace you have been saved\./));
  assert.equal(view.queryByText(/God is love\./), null);
});

test('a translation without full-text search says so; other failures show the load error', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  try {
    const view = await renderBrowser();
    const input = view.getByLabelText(t('common.search'));

    await view.changeText(input, 'love');
    await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
    const unavailable = Object.assign(new Error('no index'), {
      name: 'BibleSearchUnavailableError',
    });
    await act(async () => searches[0].reject(unavailable));
    assert.ok(view.getByText(t('bible.searchUnavailable')));
    assert.equal(view.queryByText(t('bible.failedToLoad')), null);

    await view.changeText(input, 'grace');
    await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
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
