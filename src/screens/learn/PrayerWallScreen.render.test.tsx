import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

type WriteResult = { success: boolean; error?: string };
type ListResult = {
  success: boolean;
  data?: unknown[];
  error?: string;
  nextCursor?: { created_at: string; id: string } | null;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// The wall lives only on the server; posts wait for its moderation, so nothing is cached.
const backend = {
  offline: false,
  result: { success: false, error: 'Failed to fetch' } as ListResult,
  /** Answers for the next listPrayerRequests calls, in order; `result` once they run out. */
  pages: [] as ListResult[],
  listCalls: [] as unknown[][],
  writes: [] as Array<{ op: 'add' | 'remove'; requestId: string; type: string }>,
  /** Each write waits for the test to settle it. */
  pendingWrites: [] as Array<ReturnType<typeof deferred<WriteResult>>>,
};
const write = (op: 'add' | 'remove') => (requestId: string, type: string) => {
  backend.writes.push({ op, requestId, type });
  const pending = deferred<WriteResult>();
  backend.pendingWrites.push(pending);
  return pending.promise;
};
mockModule(mock, sourcePath('services/prayer/prayerService.ts'), {
  listPrayerRequests: async (...args: unknown[]) => {
    backend.listCalls.push(args);
    return backend.pages.shift() ?? backend.result;
  },
  addInteraction: write('add'),
  removeInteraction: write('remove'),
});
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  group_id: 'group-1',
  user_id: 'someone-else',
  content: 'Pray for my neighbour',
  is_answered: false,
  answered_at: null,
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
  hidden_at: null,
  hidden_reason: null,
  prayed_count: 0,
  encouraged_count: 0,
  viewer_prayed: false,
  viewer_encouraged: false,
  ...overrides,
});

beforeEach(() => {
  backend.offline = false;
  backend.result = { success: false, error: 'Failed to fetch' };
  backend.pages = [];
  backend.listCalls = [];
  backend.writes = [];
  backend.pendingWrites = [];
  harness.authStore.setState({ user: { uid: 'viewer-1', displayName: 'Lydia' } });
});

async function renderWall() {
  harness.navigation.route.params = { groupId: 'group-1', groupName: 'Tuesday group' };
  const { PrayerWallScreen } = await import('./PrayerWallScreen');
  const view = await harness.render(<PrayerWallScreen />);
  await view.flush();
  await view.flush();
  return view;
}
type WallView = Awaited<ReturnType<typeof renderWall>>;

const prayedPill = (view: WallView, count: number) =>
  view.getByRole('button', { name: t('prayer.prayedCount', { count }) });

async function settleWrite(view: WallView, index: number, result: WriteResult) {
  backend.pendingWrites[index].resolve(result);
  await view.flush();
  await view.flush();
}

/** Pull to refresh: the RefreshControl is a prop of the list, not a child, so drive its handler. */
async function pullToRefresh(view: WallView) {
  const [list] = view.queryAllByType('FlatList');
  const control = list.props.refreshControl as ReactElement<{ onRefresh: () => Promise<void> }>;
  const host = { type: 'RefreshControl', props: control.props, parent: null };
  await view.fire(host as unknown as ReactTestInstance, 'onRefresh');
  await view.flush();
}

test('offline, a failed load says the reader is offline instead of "something went wrong"', async () => {
  backend.offline = true;

  const view = await renderWall();

  assert.ok(view.getByText(t('common.offlineTryAgain')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('online, a failed load keeps the generic error with a retry', async () => {
  const view = await renderWall();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('retrying after reconnecting shows the wall instead of the offline message', async () => {
  backend.offline = true;
  const view = await renderWall();
  backend.offline = false;
  backend.result = { success: true, data: [] };

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
});

test('a fast double tap on Prayed sends one request and counts one prayer', async () => {
  backend.result = { success: true, data: [request({ prayed_count: 2 })] };
  const view = await renderWall();

  await view.press(prayedPill(view, 2));
  // The second tap lands before the first write has answered.
  await view.press(view.getByRole('button', { name: t('prayer.prayedCount', { count: 3 }) }));

  assert.deepEqual(backend.writes, [{ op: 'add', requestId: 'req-1', type: 'prayed' }]);
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 3 }), selected: true })
  );

  await settleWrite(view, 0, { success: true });

  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 3 }), selected: true })
  );
  assert.equal(backend.writes.length, 1);
});

test('once a tap is confirmed, the next tap withdraws it', async () => {
  backend.result = { success: true, data: [request({ prayed_count: 2 })] };
  const view = await renderWall();
  await view.press(prayedPill(view, 2));
  await settleWrite(view, 0, { success: true });

  await view.press(prayedPill(view, 3));

  assert.deepEqual(backend.writes[1], { op: 'remove', requestId: 'req-1', type: 'prayed' });
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 2 }), selected: false })
  );
});

test('Prayed and Encouraged on one request are separate taps', async () => {
  backend.result = { success: true, data: [request()] };
  const view = await renderWall();

  await view.press(prayedPill(view, 0));
  await view.press(view.getByRole('button', { name: t('prayer.encouragedCount', { count: 0 }) }));

  assert.deepEqual(
    backend.writes.map(({ op, type }) => `${op}:${type}`),
    ['add:prayed', 'add:encouraged']
  );
});

test('a failed tap rolls back to what the server last confirmed, not to a stale copy', async () => {
  backend.result = {
    success: true,
    data: [request({ prayed_count: 3, viewer_prayed: true })],
  };
  const view = await renderWall();

  // Withdraw the prayer; while that write is in flight, a refresh shows two more prayers.
  await view.press(prayedPill(view, 3));
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 2 }), selected: false })
  );
  backend.pages = [
    { success: true, data: [request({ prayed_count: 5, viewer_prayed: true })], nextCursor: null },
  ];
  await pullToRefresh(view);
  await settleWrite(view, 0, { success: false, error: 'Network request failed' });

  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 5 }), selected: true })
  );
  assert.ok(harness.rn.__recorded.announcements.includes(t('common.somethingWentWrong')));
});

test('a confirmed tap that a refresh already counted is not counted twice', async () => {
  backend.result = { success: true, data: [request({ prayed_count: 1 })] };
  const view = await renderWall();

  await view.press(prayedPill(view, 1));
  backend.pages = [
    { success: true, data: [request({ prayed_count: 2, viewer_prayed: true })], nextCursor: null },
  ];
  await pullToRefresh(view);
  await settleWrite(view, 0, { success: true });

  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 2 }), selected: true })
  );
});

test('reaching the end of the wall loads the next page after the last request', async () => {
  const cursor = { created_at: '2026-09-20T10:00:00.123456+00:00', id: 'req-1' };
  backend.pages = [
    { success: true, data: [request({ id: 'req-1', content: 'Newest' })], nextCursor: cursor },
    {
      success: true,
      data: [request({ id: 'req-0', content: 'Older' })],
      nextCursor: null,
    },
  ];
  const view = await renderWall();

  const [list] = view.queryAllByType('FlatList');
  await view.fire(list, 'onEndReached');
  await view.flush();

  assert.deepEqual(backend.listCalls, [['group-1'], ['group-1', { before: cursor }]]);
  assert.ok(view.getByText('Newest'));
  assert.ok(view.getByText('Older'));

  // The last page has no cursor, so reaching the end again asks for nothing more.
  await view.fire(view.queryAllByType('FlatList')[0], 'onEndReached');
  await view.flush();
  assert.equal(backend.listCalls.length, 2);
});
