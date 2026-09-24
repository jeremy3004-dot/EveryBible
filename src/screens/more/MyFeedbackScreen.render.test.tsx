import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// My feedback lists the reader's own submissions from the server; it has no local copy.
type FeedbackResult = { success: boolean; feedback: unknown[]; error?: string };
const backend = {
  fetches: 0,
  // Holds the next fetch open until the test resolves it.
  pending: null as ((result: FeedbackResult) => void) | null,
  offline: false,
  result: { success: false, feedback: [], error: 'Failed to fetch' } as FeedbackResult,
};
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    fetchMyChapterFeedback: async () => {
      backend.fetches += 1;
      if (backend.pending) {
        return new Promise((resolve) => {
          backend.pending = resolve;
        });
      }
      return backend.result;
    },
  },
});
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

beforeEach(() => {
  backend.fetches = 0;
  backend.pending = null;
  backend.offline = false;
  backend.result = { success: false, feedback: [], error: 'Failed to fetch' };
  harness.authStore.setState({ isAuthenticated: true });
});

async function renderScreen() {
  const { MyFeedbackScreen } = await import('./MyFeedbackScreen');
  const view = await harness.render(<MyFeedbackScreen />);
  await view.flush();
  return view;
}

test('offline, a failed load says the reader is offline instead of "something went wrong"', async () => {
  backend.offline = true;

  const view = await renderScreen();

  assert.ok(view.getByText(t('common.offlineTryAgain')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('online, a failed load keeps the generic error with a retry', async () => {
  const view = await renderScreen();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
});

test('retrying after reconnecting shows the loaded feedback', async () => {
  backend.offline = true;
  const view = await renderScreen();
  backend.offline = false;
  backend.result = {
    success: true,
    feedback: [
      {
        id: 'f1',
        bookId: 'JHN',
        chapter: 3,
        sentiment: 'up',
        status: 'received',
        comment: 'Clear',
        resolutionNote: null,
        hasAudio: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  };

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.ok(view.getByText('Clear'));
});

test('retrying shows the load in progress and ignores further taps until it answers', async () => {
  const view = await renderScreen();
  assert.equal(backend.fetches, 1);
  backend.pending = () => {};

  // Started in its own act and not awaited: the load stays open until answered below.
  const retry = view.getByRole('button', { name: t('common.retry') });
  await act(async () => {
    void (retry.props.onPress as () => unknown)();
  });

  assert.equal(view.queryByRole('button', { name: t('common.retry') }), null);
  assert.ok(view.getByLabelText(t('common.loading')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.equal(backend.fetches, 2);

  const answer = backend.pending;
  backend.pending = null;
  answer?.({ success: false, feedback: [], error: 'Failed to fetch' });
  await view.flush();

  assert.ok(view.getByRole('button', { name: t('common.retry') }));
  assert.equal(backend.fetches, 2);
});

test('a pull-to-refresh that fails keeps the list and says why it did not update', async () => {
  backend.result = {
    success: true,
    feedback: [
      {
        id: 'f1',
        bookId: 'JHN',
        chapter: 3,
        sentiment: 'up',
        status: 'received',
        comment: 'Clear',
        resolutionNote: null,
        hasAudio: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  };
  const view = await renderScreen();
  assert.ok(view.getByText('Clear'));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);

  backend.offline = true;
  backend.result = { success: false, feedback: [], error: 'Failed to fetch' };
  const [list] = view.queryAllByType('FlatList');
  assert.ok(list, 'the feedback list renders');
  const pullToRefresh = async () => {
    const control = list.props.refreshControl as { props: { onRefresh: () => Promise<void> } };
    await act(async () => {
      await control.props.onRefresh();
    });
  };
  await pullToRefresh();

  assert.ok(view.getByText('Clear'), 'the last loaded feedback stays listed');
  assert.ok(view.getByText(t('common.offlineTryAgain')));

  backend.offline = false;
  backend.result = { success: true, feedback: [] };
  await pullToRefresh();
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
});

// The session can end while the screen is open (expired refresh token, account deleted
// elsewhere). A load that was already out must not list that account's feedback after it.
test('feedback that arrives after the reader was signed out is not shown', async () => {
  backend.pending = () => {};
  const view = await renderScreen();
  const answer = backend.pending;
  backend.pending = null;

  await act(async () => {
    harness.authStore.setState({ isAuthenticated: false });
  });
  await view.flush();
  await act(async () => {
    answer?.({
      success: true,
      feedback: [
        {
          id: 'f1',
          bookId: 'JHN',
          chapter: 3,
          sentiment: 'up',
          status: 'received',
          comment: 'Private note from the previous account',
          resolutionNote: null,
          hasAudio: false,
          createdAt: '2026-09-20T10:00:00.000Z',
        },
      ],
    });
  });
  await view.flush();

  assert.equal(view.queryByText('Private note from the previous account'), null);
  assert.ok(view.getByText(t('myFeedback.signInRequired')));
});
