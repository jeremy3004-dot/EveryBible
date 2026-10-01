import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock);
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
const prompts: Array<(text: string) => Promise<void>> = [];
(harness.rn.Alert as unknown as { prompt: (...args: unknown[]) => void }).prompt = (...args) => {
  prompts.push(args[2] as (text: string) => Promise<void>);
};

type WriteResult = { success: boolean; error?: string };
type ListResult = {
  success: boolean;
  data?: unknown[];
  error?: string;
  nextCursor?: { created_at: string; id: string } | null;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// The wall lives only on the server; posts wait for its moderation, so nothing is cached.
const backend = {
  offline: false,
  result: { success: false, error: 'Failed to fetch' } as ListResult,
  /** Answers for the next listPrayerRequests calls, in order; `result` once they run out. */
  pages: [] as Array<ListResult | Promise<ListResult>>,
  listCalls: [] as unknown[][],
  writes: [] as Array<{ op: 'add' | 'remove'; requestId: string; type: string }>,
  /** Each write waits for the test to settle it. */
  pendingWrites: [] as Array<ReturnType<typeof deferred<WriteResult>>>,
  mutations: [] as Array<{ op: string; args: unknown[] }>,
  mutationResult: { success: false } as WriteResult & { data?: unknown },
  pendingMutation: null as ReturnType<typeof deferred<WriteResult & { data?: unknown }>> | null,
  mutationThrows: false,
  pendingOffline: null as ReturnType<typeof deferred<boolean>> | null,
};
const mutation =
  (op: string) =>
  async (...args: unknown[]) => {
    backend.mutations.push({ op, args });
    if (backend.mutationThrows) throw new Error('network failure');
    return backend.pendingMutation?.promise ?? backend.mutationResult;
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
  createPrayerRequest: mutation('create'),
  updatePrayerRequest: mutation('edit'),
  deletePrayerRequest: mutation('delete'),
  markPrayerAnswered: mutation('answer'),
  reportPrayerRequest: mutation('report'),
  blockUser: mutation('block'),
});
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.pendingOffline?.promise ?? backend.offline,
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
  backend.mutations = [];
  backend.mutationResult = { success: false };
  backend.pendingMutation = null;
  backend.mutationThrows = false;
  backend.pendingOffline = null;
  prompts.length = 0;
  harness.authStore.setState({
    user: { uid: 'viewer-1', displayName: 'Lydia' },
    authGeneration: 1,
  });
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
async function showAction(view: WallView, label: string) {
  let node = view.getByText('Pray for my neighbour');
  while (typeof node.props.onLongPress !== 'function' && node.parent) node = node.parent;
  await view.fire(node, 'onLongPress');
  const sheet = harness.rn.__recorded.actionSheets.at(-1)!;
  const options = (sheet.options as { options: string[] }).options;
  await act(async () => (sheet.callback as (index: number) => void)(options.indexOf(label)));
  await view.flush();
}

const prayedPill = (view: WallView, count: number) =>
  view.getByRole('button', { name: t('prayer.prayedCount', { count }) });

async function settleWrite(view: WallView, index: number, result: WriteResult) {
  assertDefined(backend.pendingWrites[index], 'backend.pendingWrites[index]').resolve(result);
  await view.flush();
  await view.flush();
}

/** Pull to refresh: the RefreshControl is a prop of the list, not a child, so drive its handler. */
async function pullToRefresh(view: WallView) {
  const [list] = view.queryAllByType('FlatList');
  const control = assertDefined(list, 'list').props.refreshControl as ReactElement<{
    onRefresh: () => Promise<void>;
  }>;
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

test('signing out clears the prior account prayer wall immediately', async () => {
  backend.result = { success: true, data: [request({ content: 'A private group prayer' })] };
  const view = await renderWall();
  assert.ok(view.getByText('A private group prayer'));
  backend.result = { success: true, data: [] };
  await act(async () => {
    harness.authStore.setState({ user: null });
  });
  await view.flush();
  assert.equal(view.queryByText('A private group prayer'), null);
});

test('switching accounts reloads prayer interaction flags for the new viewer', async () => {
  backend.result = { success: true, data: [request({ prayed_count: 3, viewer_prayed: true })] };
  const view = await renderWall();
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 3 }), selected: true })
  );
  backend.result = { success: true, data: [request({ prayed_count: 3, viewer_prayed: false })] };
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'viewer-2', displayName: 'Priscilla' } });
  });
  await view.flush();
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 3 }), selected: false })
  );
  assert.equal(backend.listCalls.length, 2);
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
  await view.fire(assertDefined(list, 'list'), 'onEndReached');
  await view.flush();

  assert.deepEqual(backend.listCalls, [['group-1'], ['group-1', { before: cursor }]]);
  assert.ok(view.getByText('Newest'));
  assert.ok(view.getByText('Older'));

  // The last page has no cursor, so reaching the end again asks for nothing more.
  await view.fire(
    assertDefined(view.queryAllByType('FlatList')[0], "view.queryAllByType('FlatList')[0]"),
    'onEndReached'
  );
  await view.flush();
  assert.equal(backend.listCalls.length, 2);
});

test('a prior viewer interaction completion cannot clear the new viewer pending interaction', async () => {
  backend.result = { success: true, data: [request()] };
  const view = await renderWall();
  await view.press(prayedPill(view, 0));
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
  );
  await view.flush();
  await view.press(prayedPill(view, 0));
  assert.equal(backend.writes.length, 2);
  await settleWrite(view, 0, { success: false });
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 1 }), selected: true })
  );
  assert.deepEqual(harness.rn.__recorded.announcements, []);
  await settleWrite(view, 1, { success: true });
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 1 }), selected: true })
  );
});

test('a first page completed after account replacement cannot show the old viewer prayers', async () => {
  const old = deferred<ListResult>();
  backend.pages = [old.promise];
  const view = await renderWall();
  backend.result = { success: true, data: [request({ content: 'New account prayer' })] };
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
  );
  await view.flush();
  await act(async () =>
    old.resolve({ success: true, data: [request({ content: 'Old private prayer' })] })
  );
  await view.flush();
  assert.ok(view.getByText('New account prayer'));
  assert.equal(view.queryByText('Old private prayer'), null);
});

test('submitting in the same tick sends one prayer and a thrown service error allows retry', async () => {
  backend.result = { success: true, data: [] };
  backend.mutationThrows = true;
  const view = await renderWall();
  await view.fire(
    view.getByLabelText(t('prayer.requestPlaceholder')),
    'onChangeText',
    'Pray for peace'
  );
  const onPress = view.getByRole('button', { name: t('prayer.submitRequest') }).props
    .onPress as () => Promise<void>;
  await act(async () => {
    await Promise.all([onPress(), onPress()]);
  });
  assert.equal(backend.mutations.length, 1);
  assert.equal(harness.rn.__recorded.alerts.length, 1);
  backend.mutationThrows = false;
  backend.mutationResult = {
    success: true,
    data: request({ content: 'Pray for peace', user_id: 'viewer-1' }),
  };
  await view.press(view.getByRole('button', { name: t('prayer.submitRequest') }));
  assert.ok(view.getByText('Pray for peace'));
  assert.equal(view.getByLabelText(t('prayer.requestPlaceholder')).props.value, '');
});

test('a submitted prayer finishing after sign-out cannot resurrect the list or draft', async () => {
  backend.result = { success: true, data: [] };
  backend.pendingMutation = deferred();
  const view = await renderWall();
  await view.fire(
    view.getByLabelText(t('prayer.requestPlaceholder')),
    'onChangeText',
    'Old private draft'
  );
  let submitting: Promise<void> = Promise.resolve();
  await act(async () => {
    submitting = (
      view.getByRole('button', { name: t('prayer.submitRequest') }).props
        .onPress as () => Promise<void>
    )();
  });
  await act(async () => harness.authStore.setState({ user: null, authGeneration: 2 }));
  await view.flush();
  await act(async () => {
    backend.pendingMutation?.resolve({
      success: true,
      data: request({ content: 'Old private draft' }),
    });
    await submitting;
  });
  assert.equal(view.queryByText('Old private draft'), null);
  assert.equal(view.getByLabelText(t('prayer.requestPlaceholder')).props.value, '');
});

test('an old native action sheet callback cannot edit or delete after account change', async () => {
  backend.result = { success: true, data: [request({ user_id: 'viewer-1' })] };
  const view = await renderWall();
  const card = view.getByText('Pray for my neighbour').parent!;
  let actionNode = card;
  while (typeof actionNode.props.onLongPress !== 'function' && actionNode.parent)
    actionNode = actionNode.parent;
  await view.fire(actionNode, 'onLongPress');
  const sheet = harness.rn.__recorded.actionSheets.at(-1)!;
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
  );
  await act(async () =>
    (sheet.callback as (index: number) => void)(
      (sheet.options as { options: string[] }).options.indexOf(t('common.delete'))
    )
  );
  assert.deepEqual(backend.mutations, []);
  assert.deepEqual(harness.rn.__recorded.alerts, []);
});

test('an older page resolving after account replacement cannot append private prayers', async () => {
  const cursor = { created_at: '2026-09-20T10:00:00Z', id: 'req-1' };
  const page = deferred<ListResult>();
  backend.pages = [{ success: true, data: [request()], nextCursor: cursor }, page.promise];
  const view = await renderWall();
  const list = assertDefined(
    view.queryAllByType('FlatList')[0],
    "view.queryAllByType('FlatList')[0]"
  );
  let loading: Promise<void> = Promise.resolve();
  await act(async () => {
    loading = (list.props.onEndReached as () => Promise<void>)();
  });
  backend.result = { success: true, data: [request({ content: 'New viewer prayer' })] };
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
  );
  await view.flush();
  await act(async () => {
    page.resolve({
      success: true,
      data: [request({ id: 'old', content: 'Older private prayer' })],
    });
    await loading;
  });
  assert.ok(view.getByText('New viewer prayer'));
  assert.equal(view.queryByText('Older private prayer'), null);
});

test('an old connectivity result cannot replace a new account successful wall', async () => {
  backend.pendingOffline = deferred();
  const view = await renderWall();
  backend.result = { success: true, data: [request()] };
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
  );
  await view.flush();
  await act(async () => backend.pendingOffline?.resolve(true));
  await view.flush();
  assert.ok(view.getByText('Pray for my neighbour'));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
});

test('a new auth generation for the same user reloads flags and clears the old draft', async () => {
  backend.result = { success: true, data: [request({ viewer_prayed: true, prayed_count: 1 })] };
  const view = await renderWall();
  await view.fire(
    view.getByLabelText(t('prayer.requestPlaceholder')),
    'onChangeText',
    'Old session draft'
  );
  backend.result = { success: true, data: [request()] };
  await act(async () => harness.authStore.setState({ authGeneration: 3 }));
  await view.flush();
  assert.equal(view.getByLabelText(t('prayer.requestPlaceholder')).props.value, '');
  assert.ok(
    view.getByRole('button', { name: t('prayer.prayedCount', { count: 0 }), selected: false })
  );
  assert.equal(backend.listCalls.length, 2);
});

for (const action of ['edit', 'delete', 'block'] as const) {
  test(`a stale native ${action} confirmation cannot write after account replacement`, async () => {
    backend.result = {
      success: true,
      data: [request({ user_id: action === 'block' ? 'someone-else' : 'viewer-1' })],
    };
    const view = await renderWall();
    await showAction(
      view,
      t(
        action === 'edit'
          ? 'common.edit'
          : action === 'delete'
            ? 'common.delete'
            : 'prayer.blockAuthor'
      )
    );
    const confirm =
      action === 'edit'
        ? () => assertDefined(prompts[0], 'prompts[0]')('Changed text')
        : assertDefined(
            (
              harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{
                onPress?: () => Promise<void>;
              }>
            )[1],
            '( harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ on'
          ).onPress!;
    const shownAlerts = harness.rn.__recorded.alerts.length;
    await act(async () =>
      harness.authStore.setState({ user: { uid: 'viewer-2' }, authGeneration: 2 })
    );
    await act(async () => {
      await confirm();
    });
    assert.deepEqual(backend.mutations, []);
    assert.equal(harness.rn.__recorded.alerts.length, shownAlerts);
  });
}

test('same-tick report submissions send once and a thrown error permits retry', async () => {
  backend.result = { success: true, data: [request()] };
  backend.pendingMutation = deferred();
  const view = await renderWall();
  await showAction(view, t('prayer.report'));
  await view.press(view.getByRole('radio', { name: t('prayer.reportReasonSpam') }));
  const submit = view.getByRole('button', { name: t('prayer.reportSend') }).props
    .onPress as () => void;
  await act(async () => {
    submit();
    submit();
  });
  assert.equal(backend.mutations.length, 1);
  await act(async () => backend.pendingMutation?.reject(new Error('network failure')));
  await view.flush();
  assert.equal(harness.rn.__recorded.alerts.length, 1);
  backend.pendingMutation = null;
  backend.mutationResult = { success: true };
  await view.press(view.getByRole('button', { name: t('prayer.reportSend') }));
  await view.flush();
  assert.equal(backend.mutations.length, 2);
  assert.equal(view.queryByText('Pray for my neighbour'), null);
  assert.equal(view.queryByLabelText(t('prayer.reportNotePlaceholder')), null);
});

test('a submitted prayer rejection after unmount cannot show an alert', async () => {
  backend.result = { success: true, data: [] };
  backend.pendingMutation = deferred();
  const view = await renderWall();
  await view.fire(view.getByLabelText(t('prayer.requestPlaceholder')), 'onChangeText', 'Prayer');
  let submitting: Promise<void> = Promise.resolve();
  await act(async () => {
    submitting = (
      view.getByRole('button', { name: t('prayer.submitRequest') }).props
        .onPress as () => Promise<void>
    )();
  });
  await view.unmount();
  await act(async () => {
    backend.pendingMutation?.reject(new Error('network failure'));
    await submitting;
  });
  assert.deepEqual(harness.rn.__recorded.alerts, []);
});

for (const newerDraft of ['Second prayer draft', 'First prayer']) {
  test(`pending submission preserves a newer editable draft (${newerDraft}) when the old request succeeds`, async () => {
    backend.result = {
      success: true,
      data: [request({ id: 'existing', content: 'Existing prayer' })],
    };
    backend.pendingMutation = deferred();
    const view = await renderWall();
    await view.fire(
      view.getByLabelText(t('prayer.requestPlaceholder')),
      'onChangeText',
      'First prayer'
    );
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = (
        view.getByRole('button', { name: t('prayer.submitRequest') }).props
          .onPress as () => Promise<void>
      )();
    });
    assert.equal(view.getByLabelText(t('prayer.requestPlaceholder')).props.editable, true);
    await view.fire(
      view.getByLabelText(t('prayer.requestPlaceholder')),
      'onChangeText',
      'Second prayer draft'
    );
    if (newerDraft === 'First prayer') {
      await view.fire(
        view.getByLabelText(t('prayer.requestPlaceholder')),
        'onChangeText',
        newerDraft
      );
    }
    await act(async () => {
      backend.pendingMutation?.resolve({
        success: true,
        data: request({ content: 'First prayer' }),
      });
      await pending;
    });
    assert.equal(view.getByLabelText(t('prayer.requestPlaceholder')).props.value, newerDraft);
    assert.equal(backend.mutations.length, 1);
    assert.ok(view.getByText('First prayer'));
    const rows = assertDefined(
      view.queryAllByType('FlatList')[0],
      "view.queryAllByType('FlatList')[0]"
    ).props.data as Array<{ id: string }>;
    assert.deepEqual(
      rows.map((row) => row.id),
      ['req-1', 'existing']
    );
  });
}

for (const outcome of ['success', 'failure', 'throw']) {
  test(`an old report ${outcome} cannot dismiss a reopened report draft`, async () => {
    backend.result = {
      success: true,
      data: [request(), request({ id: 'req-2', content: 'Another prayer' })],
    };
    backend.pendingMutation = deferred();
    const view = await renderWall();
    await showAction(view, t('prayer.report'));
    await view.press(view.getByRole('radio', { name: t('prayer.reportReasonSpam') }));
    await view.press(view.getByRole('button', { name: t('prayer.reportSend') }));
    const modal = view.queryAllByType('Modal').find((node) => node.props.visible)!;
    assert.ok(modal);
    await view.fire(modal, 'onRequestClose');
    let card = view.getByText('Another prayer');
    while (typeof card.props.onLongPress !== 'function' && card.parent) card = card.parent;
    await view.fire(card, 'onLongPress');
    const sheet = harness.rn.__recorded.actionSheets.at(-1)!;
    const options = (sheet.options as { options: string[] }).options;
    await act(async () =>
      (sheet.callback as (index: number) => void)(options.indexOf(t('prayer.report')))
    );
    await view.flush();
    await view.fire(
      view.getByLabelText(t('prayer.reportNotePlaceholder')),
      'onChangeText',
      'Reopened draft'
    );
    await view.press(view.getByRole('radio', { name: t('prayer.reportReasonOther') }));
    const alertsBefore = harness.rn.__recorded.alerts.length;
    await act(async () => {
      if (outcome === 'throw') backend.pendingMutation?.reject(new Error('network failure'));
      else backend.pendingMutation?.resolve({ success: outcome === 'success' });
    });
    await view.flush();
    assert.equal(
      view.getByLabelText(t('prayer.reportNotePlaceholder')).props.value,
      'Reopened draft'
    );
    assert.equal(harness.rn.__recorded.alerts.length, alertsBefore);
    assert.equal(view.getByRole('button', { name: t('prayer.reportSend') }).props.disabled, false);
    assert.equal(view.queryByText('Pray for my neighbour') === null, outcome === 'success');
    assert.ok(view.getByText('Another prayer'));
  });
}

for (const snapshotOutcome of ['success', 'failure', 'throw']) {
  test(`an older refresh ${snapshotOutcome} cannot remove a newly confirmed prayer`, async () => {
    backend.result = { success: true, data: [request()] };
    const view = await renderWall();
    const refresh = deferred<ListResult>();
    backend.pages.push(refresh.promise);
    const [list] = view.queryAllByType('FlatList');
    const control = assertDefined(list, 'list').props.refreshControl as ReactElement<{
      onRefresh: () => Promise<void>;
    }>;
    let refreshing: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshing = control.props.onRefresh();
    });
    await view.fire(
      view.getByLabelText(t('prayer.requestPlaceholder')),
      'onChangeText',
      'New confirmed prayer'
    );
    backend.mutationResult = {
      success: true,
      data: request({ id: 'new', content: 'New confirmed prayer', user_id: 'viewer-1' }),
    };
    await view.press(view.getByRole('button', { name: t('prayer.submitRequest') }));
    assert.ok(view.getByText('New confirmed prayer'));
    await act(async () => {
      if (snapshotOutcome === 'throw') refresh.reject(new Error('network failure'));
      else
        refresh.resolve(
          snapshotOutcome === 'success' ? { success: true, data: [request()] } : { success: false }
        );
      await refreshing;
    });
    assert.ok(view.getByText('New confirmed prayer'));
    const updated = assertDefined(
      view.queryAllByType('FlatList')[0],
      "view.queryAllByType('FlatList')[0]"
    ).props.refreshControl as ReactElement<{
      refreshing: boolean;
    }>;
    assert.equal(updated.props.refreshing, false);
  });
}

for (const success of [true, false]) {
  test(`a ${success ? 'confirmed' : 'failed'} interaction ${success ? 'invalidates' : 'permits'} an older refresh`, async () => {
    backend.result = { success: true, data: [request()] };
    const view = await renderWall();
    const refresh = deferred<ListResult>();
    backend.pages.push(refresh.promise);
    const control = assertDefined(
      view.queryAllByType('FlatList')[0],
      "view.queryAllByType('FlatList')[0]"
    ).props.refreshControl as ReactElement<{
      onRefresh: () => Promise<void>;
    }>;
    let refreshing: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshing = control.props.onRefresh();
    });
    await view.press(prayedPill(view, 0));
    await settleWrite(view, 0, { success });
    await act(async () => {
      refresh.resolve({ success: true, data: [request({ prayed_count: 5 })] });
      await refreshing;
    });
    assert.ok(
      view.getByRole('button', {
        name: t('prayer.prayedCount', { count: success ? 1 : 5 }),
        selected: success,
      })
    );
    const updated = assertDefined(
      view.queryAllByType('FlatList')[0],
      "view.queryAllByType('FlatList')[0]"
    ).props.refreshControl as ReactElement<{
      refreshing: boolean;
    }>;
    assert.equal(updated.props.refreshing, false);
  });
}

test('a pending older page cannot restore a newly blocked author', async () => {
  const page = deferred<ListResult>();
  const cursor = { created_at: '2026-09-20T10:00:00Z', id: 'req-1' };
  backend.pages = [{ success: true, data: [request()], nextCursor: cursor }, page.promise];
  const view = await renderWall();
  let loading: Promise<void> = Promise.resolve();
  await act(async () => {
    loading = (
      assertDefined(view.queryAllByType('FlatList')[0], "view.queryAllByType('FlatList')[0]").props
        .onEndReached as () => Promise<void>
    )();
  });
  backend.mutationResult = { success: true };
  await showAction(view, t('prayer.blockAuthor'));
  const confirm = assertDefined(
    (harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ onPress?: () => Promise<void> }>)[1],
    '( harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ on'
  ).onPress!;
  await act(async () => {
    await confirm();
  });
  await act(async () => {
    page.resolve({
      success: true,
      data: [request({ id: 'older', content: 'Older prayer from blocked author' })],
    });
    await loading;
  });
  assert.equal(view.queryByText('Older prayer from blocked author'), null);
  assert.equal(view.queryByText('Pray for my neighbour'), null);
  // The discarded page releases its loading guard so the same cursor can retry.
  backend.pages.push({
    success: true,
    data: [request({ id: 'allowed', user_id: 'different', content: 'Allowed author' })],
  });
  await view.fire(
    assertDefined(view.queryAllByType('FlatList')[0], "view.queryAllByType('FlatList')[0]"),
    'onEndReached'
  );
  assert.ok(view.getByText('Allowed author'));
});

test('an older refresh cannot restore a confirmed deleted request', async () => {
  backend.result = { success: true, data: [request({ user_id: 'viewer-1' })] };
  const view = await renderWall();
  const refresh = deferred<ListResult>();
  backend.pages.push(refresh.promise);
  const control = assertDefined(
    view.queryAllByType('FlatList')[0],
    "view.queryAllByType('FlatList')[0]"
  ).props.refreshControl as ReactElement<{
    onRefresh: () => Promise<void>;
  }>;
  let refreshing: Promise<void> = Promise.resolve();
  await act(async () => {
    refreshing = control.props.onRefresh();
  });
  backend.mutationResult = { success: true };
  await showAction(view, t('common.delete'));
  const confirm = assertDefined(
    (harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ onPress?: () => Promise<void> }>)[1],
    '( harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ on'
  ).onPress!;
  await act(async () => {
    await confirm();
  });
  await act(async () => {
    refresh.resolve({ success: true, data: [request({ user_id: 'viewer-1' })] });
    await refreshing;
  });
  assert.equal(view.queryByText('Pray for my neighbour'), null);
});

test('a refresh which already contains the pending create result does not duplicate its confirmation', async () => {
  backend.result = { success: true, data: [] };
  const view = await renderWall();
  const created = request({ id: 'created', content: 'One confirmed prayer', user_id: 'viewer-1' });
  backend.pendingMutation = deferred();
  await view.fire(
    view.getByLabelText(t('prayer.requestPlaceholder')),
    'onChangeText',
    'One confirmed prayer'
  );
  let posting: Promise<void> = Promise.resolve();
  await act(async () => {
    posting = (
      view.getByRole('button', { name: t('prayer.submitRequest') }).props
        .onPress as () => Promise<void>
    )();
  });
  backend.pages.push({
    success: true,
    data: [
      {
        ...created,
        content: 'Freshly edited prayer',
        prayed_count: 7,
        encouraged_count: 3,
        is_answered: true,
      },
    ],
  });
  await pullToRefresh(view);
  assert.equal(view.queryAllByText('Freshly edited prayer').length, 1);
  await act(async () => {
    backend.pendingMutation?.resolve({ success: true, data: created });
    await posting;
  });
  assert.equal(view.queryAllByText('Freshly edited prayer').length, 1);
  assert.equal(view.queryAllByText('One confirmed prayer').length, 0);
  const rows = assertDefined(
    view.queryAllByType('FlatList')[0],
    "view.queryAllByType('FlatList')[0]"
  ).props.data as Array<{
    id: string;
    prayed_count: number;
    encouraged_count: number;
    is_answered: boolean;
  }>;
  assert.equal(rows.length, 1);
  assert.equal(assertDefined(rows[0], 'rows[0]').prayed_count, 7);
  assert.equal(assertDefined(rows[0], 'rows[0]').encouraged_count, 3);
  assert.equal(assertDefined(rows[0], 'rows[0]').is_answered, true);
});

test('a prayer posted while the first load is in flight does not discard the older requests', async () => {
  const first = deferred<ListResult>();
  backend.pages.push(first.promise);
  const view = await renderWall();
  const created = request({ id: 'created', content: 'Posted during load', user_id: 'viewer-1' });
  await view.fire(
    view.getByLabelText(t('prayer.requestPlaceholder')),
    'onChangeText',
    'Posted during load'
  );
  backend.mutationResult = { success: true, data: created };
  await view.press(view.getByRole('button', { name: t('prayer.submitRequest') }));
  backend.pages.push({ success: true, data: [created, request()] });
  await act(async () => {
    first.resolve({ success: true, data: [request()] });
  });
  await view.flush();
  await view.flush();
  assert.ok(view.getByText('Posted during load'));
  assert.ok(view.getByText('Pray for my neighbour'));
  const list = assertDefined(
    view.queryAllByType('FlatList')[0],
    "view.queryAllByType('FlatList')[0]"
  );
  assert.equal((list.props.data as unknown[]).length, 2);
});

test('a failed pull to refresh tells the reader and does not turn the wall into an error screen', async () => {
  backend.result = { success: true, data: [request({ user_id: 'viewer-1' })] };
  const view = await renderWall();
  backend.offline = true;
  backend.pages.push({ success: false, error: 'Failed to fetch' });
  const alertsBefore = harness.rn.__recorded.alerts.length;
  await pullToRefresh(view);
  await view.flush();
  assert.equal(harness.rn.__recorded.alerts.length, alertsBefore + 1);
  assert.equal(harness.rn.__recorded.alerts.at(-1)!.message, t('common.offlineTryAgain'));
  assert.ok(view.getByText('Pray for my neighbour'));

  // Deleting the last request now shows the empty wall, not "something went wrong".
  backend.mutationResult = { success: true };
  await showAction(view, t('common.delete'));
  const confirm = assertDefined(
    (harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ onPress?: () => Promise<void> }>)[1],
    '( harness.rn.__recorded.alerts.at(-1)!.buttons as Array<{ on'
  ).onPress!;
  await act(async () => {
    await confirm();
  });
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByText(t('prayer.noPrayers')));
});
