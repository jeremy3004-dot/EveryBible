import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import { assertDefined } from '../../utils/assertDefined';

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
  fetch: null as (() => Promise<FeedbackResult>) | null,
  probe: null as (() => Promise<boolean>) | null,
};
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    fetchMyChapterFeedback: async () => {
      backend.fetches += 1;
      if (backend.fetch) return backend.fetch();
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
  isDeviceOffline: async () => (backend.probe ? backend.probe() : backend.offline),
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });
const authFlows: string[] = [];
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => false },
  openAuthFlow: (mode: string) => {
    authFlows.push(mode);
  },
});

beforeEach(() => {
  authFlows.length = 0;
  backend.fetches = 0;
  backend.pending = null;
  backend.fetch = null;
  backend.probe = null;
  backend.offline = false;
  backend.result = { success: false, feedback: [], error: 'Failed to fetch' };
  harness.authStore.setState({
    user: { uid: 'reader-a' },
    authGeneration: 0,
    isAuthenticated: true,
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function feedback(comment: string): FeedbackResult {
  return {
    success: true,
    feedback: [
      {
        id: comment,
        bookId: 'JHN',
        chapter: 3,
        sentiment: 'up',
        status: 'received',
        comment,
        resolutionNote: null,
        hasAudio: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  };
}

function refresh(view: Awaited<ReturnType<typeof renderScreen>>) {
  const [list] = view.queryAllByType('FlatList');
  return (
    assertDefined(list, 'list').props.refreshControl as {
      props: { onRefresh: () => Promise<void> };
    }
  ).props.onRefresh();
}

for (const transition of ['account', 'generation'] as const) {
  test(`a ${transition} change hides feedback while the replacement load is pending`, async () => {
    backend.result = feedback('Previous private comment');
    const view = await renderScreen();
    const next = deferred<FeedbackResult>();
    backend.fetch = () => next.promise;
    await act(async () =>
      harness.authStore.setState({
        user: { uid: transition === 'account' ? 'reader-b' : 'reader-a' },
        authGeneration: 1,
      })
    );
    assert.equal(view.queryByText('Previous private comment'), null);
    assert.ok(view.getByLabelText(t('common.loading')));
    next.resolve(feedback('Current private comment'));
    await view.flush();
    assert.ok(view.getByText('Current private comment'));
  });
}

test('a previous account response cannot replace the new account list', async () => {
  const old = deferred<FeedbackResult>();
  backend.fetch = () => old.promise;
  const view = await renderScreen();
  backend.fetch = null;
  backend.result = feedback('B comment');
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'reader-b' }, authGeneration: 1 })
  );
  await view.flush();
  old.resolve(feedback('A comment'));
  await view.flush();
  assert.equal(view.queryByText('A comment'), null);
  assert.ok(view.getByText('B comment'));
});

test('an old connectivity check cannot replace the new account loading state', async () => {
  const oldProbe = deferred<boolean>();
  backend.probe = () => oldProbe.promise;
  const view = await renderScreen();
  const current = deferred<FeedbackResult>();
  backend.fetch = () => current.promise;
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'reader-b' }, authGeneration: 1 })
  );
  oldProbe.resolve(true);
  await view.flush();
  assert.ok(view.getByLabelText(t('common.loading')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  current.resolve(feedback('B comment'));
  await view.flush();
  assert.ok(view.getByText('B comment'));
});

test('only the latest refresh may replace feedback or stop its refreshing indicator', async () => {
  backend.result = feedback('Initial comment');
  const view = await renderScreen();
  const older = deferred<FeedbackResult>();
  const newer = deferred<FeedbackResult>();
  backend.fetch = () => older.promise;
  await act(async () => {
    void refresh(view);
  });
  backend.fetch = () => newer.promise;
  await act(async () => {
    void refresh(view);
  });
  older.resolve(feedback('Older refresh'));
  await view.flush();
  const [list] = view.queryAllByType('FlatList');
  assert.equal(
    (assertDefined(list, 'list').props.refreshControl as { props: { refreshing: boolean } }).props
      .refreshing,
    true
  );
  newer.resolve(feedback('Newest refresh'));
  await view.flush();
  assert.ok(view.getByText('Newest refresh'));
  assert.equal(view.queryByText('Older refresh'), null);
});

test('a pending feedback request is discarded on unmount', async () => {
  const pending = deferred<FeedbackResult>();
  backend.fetch = () => pending.promise;
  const view = await renderScreen();
  await view.unmount();
  pending.resolve(feedback('Unmounted comment'));
  await view.flush();
  assert.equal(backend.fetches, 1);
});

async function renderScreen() {
  const { MyFeedbackScreen } = await import('./MyFeedbackScreen');
  const view = await harness.render(<MyFeedbackScreen />);
  await view.flush();
  return view;
}

test('a direct account switch reloads feedback instead of showing the previous reader comments', async () => {
  harness.authStore.setState({ user: { uid: 'reader-a' }, isAuthenticated: true });
  backend.result = {
    success: true,
    feedback: [
      {
        id: 'f1',
        bookId: 'JHN',
        chapter: 3,
        sentiment: 'up',
        status: 'received',
        comment: 'Private comment from A',
        resolutionNote: null,
        hasAudio: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  };
  const view = await renderScreen();
  assert.ok(view.getByText('Private comment from A'));
  backend.result = { success: true, feedback: [] };
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'reader-b' }, isAuthenticated: true });
  });
  await view.flush();
  assert.equal(view.queryByText('Private comment from A'), null);
  assert.equal(backend.fetches, 2);
});

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

test('a guest is told to sign in and can start sign-in from here', async () => {
  harness.authStore.setState({ isAuthenticated: false });
  const view = await renderScreen();

  assert.ok(view.getByText(t('myFeedback.signInRequired')));
  await view.press(view.getByRole('button', { name: t('more.signInOrCreate') }));
  assert.deepEqual(authFlows, ['signIn']);
  assert.equal(backend.fetches, 0, 'nothing is requested for a guest');
});
