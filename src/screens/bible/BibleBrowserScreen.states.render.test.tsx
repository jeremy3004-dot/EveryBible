import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { flattenStyle, within } from '../../testing/render';
import { BIBLE_SEARCH_DEBOUNCE_MS } from './bibleSearchModel';
import { installBrowserRenderFixture } from './BibleBrowserScreen.renderFixture';

// Header, availability notes, the translator summary banner, search surface
// transitions and store-driven updates.
const {
  harness,
  t,
  content,
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

type View = Awaited<ReturnType<typeof renderBrowser>>;

const chapterButtons = (view: View) => view.queryAllByRole('button', { name: /^\d+$/ });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('the header names the Bible and the current translation', async () => {
  const view = await renderBrowser();

  assert.ok(view.getByRole('header', { name: t('bible.title') }));
  assert.ok(view.getByText('Berean Standard Bible'));
  assert.ok(within(translationEntry(view)!).getByText('BSB'));
});

test('an unknown current translation falls back to the Berean labels', async () => {
  bibleStore.setState({ currentTranslation: 'missing' });
  const view = await renderBrowser();

  assert.ok(view.getByText(t('about.bereanBible')));
  const entry = translationEntry(view)!;
  assert.deepEqual(entry.props.accessibilityValue, { text: t('about.bereanBible') });
  assert.ok(within(entry).getByText('BSB'));
});

test('the New Testament opens under a single divider header', async () => {
  const view = await renderBrowser();

  assert.equal(view.queryAllByRole('header', { name: t('bible.newTestament') }).length, 1);
  assert.equal(view.queryAllByRole('header', { name: t('bible.oldTestament') }).length, 0);
});

test('the clear control appears with a query and brings the book list back', async () => {
  const view = await renderBrowser();
  assert.equal(view.queryByRole('button', { name: t('settings.clear') }), null);

  await view.changeText(view.getByLabelText(t('common.search')), 'John 3');
  await view.flush();
  assert.equal(view.queryByRole('button', { name: 'Genesis' }), null);

  await view.press(view.getByRole('button', { name: t('settings.clear') }));
  await view.flush();
  assert.equal(view.getByLabelText(t('common.search')).props.value, '');
  assert.ok(view.getByRole('button', { name: 'Genesis' }));
  assert.equal(view.queryByRole('button', { name: t('settings.clear') }), null);
});

test('a book with no content is dimmed, locked, and expands onto a coming-soon note', async () => {
  content.summary = { hasText: false, hasAudio: true, audioChapters: { JHN: [1, 2, 3] } };
  const view = await renderBrowser();

  const genesis = view.getByRole('button', { name: 'Genesis' });
  assert.equal(genesis.props.accessibilityHint, t('bible.notAvailableYet'));
  assert.equal(flattenStyle(genesis.props.style)?.opacity, 0.45);
  assert.deepEqual(
    within(genesis)
      .queryAllByType('Icon')
      .map((icon) => icon.props.name),
    ['lock-closed']
  );
  const john = view.getByRole('button', { name: 'John', expanded: true });
  assert.equal(john.props.accessibilityHint, undefined);

  await view.press(genesis);
  assert.ok(view.getByRole('button', { name: 'Genesis', expanded: true }));
  assert.equal(chapterButtons(view).length, 0, 'no chapter grid for an unavailable book');
  assert.ok(view.getByText(t('bible.notAvailableYet')));
  assert.ok(view.getByText(t('bible.bookComingSoon', { book: 'Genesis' })));
});

test('an unavailable chapter explains itself in place instead of opening the reader', async () => {
  content.summary = { hasText: false, hasAudio: true, audioChapters: { JHN: [1, 2, 3] } };
  const view = await renderBrowser();

  const four = view.getByRole('button', { name: '4' });
  assert.equal(four.props.accessibilityHint, t('bible.notAvailableYet'));
  assert.equal(view.getByRole('button', { name: '3' }).props.accessibilityHint, undefined);

  await view.press(four);
  assert.deepEqual(harness.navigation.calls, []);
  assert.ok(view.getByText(t('bible.fullBibleComingSoon')));

  await view.press(view.getByRole('button', { name: '3' }));
  assert.equal(view.queryByText(t('bible.fullBibleComingSoon')), null);
  assert.equal(harness.navigation.calls.length, 1);
});

test('the coming-soon chapter note clears when the book collapses or the translation changes', async () => {
  content.summary = { hasText: false, hasAudio: true, audioChapters: { JHN: [1, 2, 3] } };
  const view = await renderBrowser();

  await view.press(view.getByRole('button', { name: '4' }));
  assert.ok(view.getByText(t('bible.fullBibleComingSoon')));
  await act(async () => bibleStore.setState({ currentTranslation: 'web' }));
  assert.equal(view.queryByText(t('bible.fullBibleComingSoon')), null);

  await view.press(view.getByRole('button', { name: '4' }));
  await view.press(view.getByRole('button', { name: 'John' }));
  await view.press(view.getByRole('button', { name: 'John' }));
  assert.equal(view.queryByText(t('bible.fullBibleComingSoon')), null);
});

test('the chapter grid shares the panel width once measured', async () => {
  const view = await renderBrowser();
  const tileWidth = () => flattenStyle(chapterButtons(view)[0].props.style)?.width;
  const estimated = tileWidth();
  assert.equal(typeof estimated, 'number');

  const [panel] = view
    .queryAllByType('View')
    .filter((node) => typeof node.props.onLayout === 'function');
  assert.ok(panel, 'the expanded chapter panel measures itself');
  await view.fire(panel, 'onLayout', { nativeEvent: { layout: { width: 200, height: 100 } } });
  assert.notEqual(tileWidth(), estimated);

  await view.fire(panel, 'onLayout', { nativeEvent: { layout: { width: 0, height: 0 } } });
  assert.notEqual(tileWidth(), estimated, 'a zero-width layout pass is ignored');
});

test('a new saved book re-expands and scrolls the list when the route named none', async () => {
  const view = await renderBrowser();
  await wait(5);
  harness.refCalls.length = 0;

  await act(async () => bibleStore.setState({ currentBook: 'ROM' }));
  await wait(5);
  assert.ok(view.getByRole('button', { name: 'Romans', expanded: true }));
  assert.ok(view.getByRole('button', { name: 'John', expanded: false }));
  const romansRow = (bookList(view).props.data as Array<{ id: string }>).findIndex(
    (row) => row.id === 'book-ROM'
  );
  assert.deepEqual(
    harness.refCalls.filter((call) => call.method === 'scrollToIndex').map((call) => call.args),
    [[{ index: romansRow, animated: false, viewPosition: 0.15 }]]
  );
});

test('the translator queue shortcut opens the queue', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  const view = await renderBrowser();

  await view.press(view.getByRole('button', { name: t('translatorQueue.title') }));
  assert.deepEqual(harness.navigation.calls, [{ method: 'navigate', args: ['TranslatorQueue'] }]);
});

test('the translator summary shows a loading line until the first summary lands', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  const gate = deferred();
  feedback.gate = gate.promise;
  const view = await renderBrowser();

  assert.ok(view.getByText(t('bible.translatorReviewLoading')));
  await act(async () => gate.resolve());
  await view.flush();
  assert.equal(view.queryByText(t('bible.translatorReviewLoading')), null);
});

test('a failed translator summary offers a retry that asks again', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  feedback.result = { success: false };
  const view = await renderBrowser();

  assert.ok(view.getByText(t('common.unexpectedError')));
  assert.equal(view.queryAllByType('TranslationNotCoveredNotice').length, 0);
  feedback.result = { success: true, chapters: [] };
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(feedback.requests.length, 2);
  assert.equal(view.queryByText(t('common.unexpectedError')), null);
});

test('a passcode that does not open this translation shows the coverage notice', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  feedback.result = {
    success: false,
    code: 'translation_not_covered',
    coveredTranslationIds: ['web'],
  };
  const view = await renderBrowser();

  const [notice] = view.queryAllByType('TranslationNotCoveredNotice');
  assert.ok(notice);
  assert.deepEqual(
    [notice.props.tone, notice.props.translationId, notice.props.coveredTranslationIds],
    ['reader', 'bsb', ['web']]
  );
  assert.equal(view.queryByText(t('common.unexpectedError')), null, 'the notice replaces it');

  feedback.result = { success: true, chapters: [] };
  await act(async () => (notice.props.onRetry as () => void)());
  await view.flush();
  assert.equal(feedback.requests.length, 2);
  assert.equal(view.queryAllByType('TranslationNotCoveredNotice').length, 0);
});

test('switching translation reloads the translator summary for the new one', async () => {
  translatorReviewStore.setState({ enabled: true, accessPasscode: '2468' });
  await renderBrowser();

  await act(async () => bibleStore.setState({ currentTranslation: 'web' }));
  await wait(5);
  assert.deepEqual(
    feedback.requests.map((request) => request.translationId),
    ['bsb', 'web']
  );
});

test('earlier results stay on screen while a newer search runs', async () => {
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));

  await view.changeText(input, 'love');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
  await act(async () => searches[0].resolve([verse('1JN', 4, 8, 'God is love.')]));
  assert.equal(view.queryAllByType('VersesSkeleton').length, 0);

  await view.changeText(input, 'loved');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
  assert.equal(searches.length, 2);
  assert.equal(view.queryAllByType('VersesSkeleton').length, 0, 'no flash back to the skeleton');
  assert.ok(view.getByText(/God is love\./));
});

test('an empty search result is announced as zero results', async () => {
  const view = await renderBrowser();

  await view.changeText(view.getByLabelText(t('common.search')), 'zzzz');
  await wait(BIBLE_SEARCH_DEBOUNCE_MS + 50);
  await act(async () => searches[0].resolve([]));

  assert.equal(view.queryAllByType('VersesSkeleton').length, 0);
  assert.ok(
    harness.rn.__recorded.announcements.includes(t('interface.searchResultCount', { count: 0 }))
  );
});

test('a whole-chapter reference shows only the chapter line', async () => {
  const view = await renderBrowser();
  await view.changeText(view.getByLabelText(t('common.search')), 'Romans 8');
  await view.flush();

  assert.ok(view.getByText('Romans 8'));
  assert.ok(view.getByText(t('interface.chapterNumber', { chapter: 8 })));
  await view.press(view.getByText('Romans 8'));
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: [
        'BibleReader',
        { bookId: 'ROM', chapter: 8, focusVerse: undefined, preferredMode: 'listen' },
      ],
    },
  ]);
});

test('submitting a full-text query from the keyboard does not navigate', async () => {
  const view = await renderBrowser();
  const input = view.getByLabelText(t('common.search'));
  await view.changeText(input, 'love');
  await view.fire(input, 'onSubmitEditing');

  assert.deepEqual(harness.navigation.calls, []);
});
