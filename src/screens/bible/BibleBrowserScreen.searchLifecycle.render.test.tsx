import test, { type TestContext, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { BIBLE_SEARCH_DEBOUNCE_MS } from './bibleSearchModel';
import { installBrowserRenderFixture } from './BibleBrowserScreen.renderFixture';

const { harness, t, bibleStore, searches, verse, renderBrowser, bookList } =
  installBrowserRenderFixture(mock);

async function startSearch(context: TestContext, count: number) {
  await act(async () => context.mock.timers.tick(BIBLE_SEARCH_DEBOUNCE_MS));
  for (let turn = 0; turn < 200 && searches.length < count; turn++) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  assert.equal(searches.length, count);
}

for (const change of ['query', 'translation'] as const) {
  test(`a stale failure cannot stop or replace the pending ${change} search`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const view = await renderBrowser();
    const input = view.getByLabelText(t('common.search'));
    await view.changeText(input, 'love');
    await startSearch(context, 1);
    if (change === 'query') {
      await view.changeText(input, 'grace');
    } else {
      await act(async () => bibleStore.setState({ currentTranslation: 'web' }));
    }
    await startSearch(context, 2);
    await act(async () => searches[0].reject(new Error('obsolete query failed')));
    assert.equal(view.queryByText(t('bible.failedToLoad')), null);
    assert.equal(view.queryAllByType('VersesSkeleton').length, 1);
    assert.deepEqual(harness.rn.__recorded.announcements, []);
    await act(async () => searches[1].resolve([verse('EPH', 2, 8, 'Current result.')]));
    await view.press(view.getByRole('button', { name: /Current result\./ }));
    assert.deepEqual(harness.navigation.calls, [
      {
        method: 'navigate',
        args: [
          'BibleReader',
          { bookId: 'EPH', chapter: 2, focusVerse: 8, preferredMode: 'listen' },
        ],
      },
    ]);
  });
}

for (const outcome of ['success', 'failure'] as const) {
  for (const action of ['clear', 'reference', 'unmount'] as const) {
    test(`${action} drops an in-flight search ${outcome} and its announcement`, async (context) => {
      context.mock.timers.enable({ apis: ['setTimeout'] });
      const view = await renderBrowser();
      const input = view.getByLabelText(t('common.search'));
      await view.changeText(input, 'love');
      await startSearch(context, 1);
      if (action === 'clear') {
        await view.press(view.getByRole('button', { name: t('settings.clear') }));
      } else if (action === 'reference') {
        await view.changeText(input, 'John 3:16');
        await view.fire(input, 'onSubmitEditing');
      } else {
        await view.unmount();
      }
      await act(async () => {
        if (outcome === 'success') searches[0].resolve([verse('1JN', 4, 8, 'Obsolete result.')]);
        else searches[0].reject(new Error('obsolete query failed'));
      });
      assert.deepEqual(harness.rn.__recorded.announcements, []);
      if (action !== 'unmount') {
        assert.equal(view.queryByText(/Obsolete result\./), null);
        assert.equal(view.queryByText(t('bible.failedToLoad')), null);
        assert.equal(view.queryAllByType('VersesSkeleton').length, 0);
      }
      if (action === 'clear') assert.ok(bookList(view));
      assert.deepEqual(
        harness.navigation.calls,
        action === 'reference'
          ? [
              {
                method: 'navigate',
                args: [
                  'BibleReader',
                  { bookId: 'JHN', chapter: 3, focusVerse: 16, preferredMode: 'listen' },
                ],
              },
            ]
          : []
      );
    });
  }
}
