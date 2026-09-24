import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  createSupabaseFake,
  makeFakeSession,
  makeFakeUser,
  type SupabaseQueryCall,
} from '../../testing/supabaseFake';
import type { PrayerRequest } from '../supabase/types';

/**
 * `mockSupabaseModule` fixes `isSupabaseConfigured()` at install time and every
 * exported function branches on it, so the barrel is mocked directly with a
 * mutable flag. Auth state is driven through the fake's own session.
 */
const fake = createSupabaseFake();
const backend = { configured: true };
const supabaseExports = {
  supabase: fake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => fake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

let prayer: typeof import('./prayerService');

const originalGetUser = fake.auth.handlers.getUser;
const filtersOf = (call: SupabaseQueryCall) =>
  call.steps.filter((step) => step.method === 'eq').map((step) => step.args);
const lastCall = (table: string) => {
  const calls = fake.callsFor(table);
  const call = calls[calls.length - 1];
  assert.ok(call, `expected a query against ${table}`);
  return call;
};

const request = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: 'req-1',
  group_id: 'group-1',
  user_id: 'user-1',
  content: 'Pray for my neighbour',
  is_answered: false,
  answered_at: null,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const failGetUser = (message: string) => {
  fake.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: { message },
  });
};

const EMPTY_PAGE = { success: true, data: [], nextCursor: null };

/** PostgREST's answer while list_prayer_requests is not deployed yet. */
const listRpcMissing = (error: { code?: string; message: string }, status = 404) =>
  fake.respondToRpc('list_prayer_requests', () => ({ data: null, error, status }));

/** A row as list_prayer_requests returns it. */
const rpcRow = (overrides: Record<string, unknown> = {}) => ({
  ...request(),
  hidden_at: null,
  hidden_reason: null,
  prayed_count: 0,
  encouraged_count: 0,
  viewer_has_prayed: false,
  viewer_has_encouraged: false,
  ...overrides,
});

before(async () => {
  prayer = await import('./prayerService');
});

beforeEach(() => {
  fake.reset();
  fake.auth.handlers.getUser = originalGetUser;
  fake.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-1' }) }));
  backend.configured = true;
  // The listing tests below "Listing (fallback)" exercise the two-query path the app keeps for
  // a backend without the RPC; the RPC tests script it explicitly.
  listRpcMissing({
    code: 'PGRST202',
    message: 'Could not find the function public.list_prayer_requests in the schema cache',
  });
});

// ─── Listing (server-side counts) ───────────────────────────────────────────

test('the wall is read in one call that counts on the server, a page at a time', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({ data: [] }));

  assert.deepEqual(await prayer.listPrayerRequests('group-9'), EMPTY_PAGE);

  assert.deepEqual(lastCall('rpc:list_prayer_requests').payload, {
    p_group_id: 'group-9',
    // One more than the page so the service knows whether another page exists.
    p_limit: prayer.PRAYER_REQUEST_PAGE_SIZE + 1,
    p_before_created_at: null,
    p_before_id: null,
  });
  assert.deepEqual(fake.callsFor('prayer_requests'), []);
  assert.deepEqual(fake.callsFor('prayer_interactions'), []);
});

test('server counts and the viewer flags reach the wall as they came back', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({
    data: [
      rpcRow({
        id: 'req-1',
        prayed_count: 1204,
        encouraged_count: 3,
        viewer_has_prayed: true,
        viewer_has_encouraged: false,
      }),
      rpcRow({ id: 'req-2', hidden_at: '2026-01-03T00:00:00Z', hidden_reason: 'reports' }),
    ],
  }));

  const result = await prayer.listPrayerRequests('group-1');

  assert.deepEqual(result, {
    success: true,
    nextCursor: null,
    data: [
      {
        ...request({ id: 'req-1' }),
        hidden_at: null,
        hidden_reason: null,
        prayed_count: 1204,
        encouraged_count: 3,
        viewer_prayed: true,
        viewer_encouraged: false,
      },
      {
        ...request({ id: 'req-2' }),
        hidden_at: '2026-01-03T00:00:00Z',
        hidden_reason: 'reports',
        prayed_count: 0,
        encouraged_count: 0,
        viewer_prayed: false,
        viewer_encouraged: false,
      },
    ],
  });
});

test('a full page returns a cursor to the next one and drops the look-ahead row', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({
    data: [
      rpcRow({ id: 'req-3', created_at: '2026-01-03T00:00:00.123456+00:00' }),
      rpcRow({ id: 'req-2', created_at: '2026-01-02T00:00:00.654321+00:00' }),
      rpcRow({ id: 'req-1', created_at: '2026-01-01T00:00:00+00:00' }),
    ],
  }));

  const result = await prayer.listPrayerRequests('group-1', { limit: 2 });

  assert.deepEqual(
    result.data?.map((row) => row.id),
    ['req-3', 'req-2']
  );
  assert.deepEqual(result.nextCursor, {
    created_at: '2026-01-02T00:00:00.654321+00:00',
    id: 'req-2',
  });
});

test('the next page continues from the cursor', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({ data: [rpcRow()] }));

  const result = await prayer.listPrayerRequests('group-1', {
    limit: 10,
    before: { created_at: '2026-01-02T00:00:00.654321+00:00', id: 'req-2' },
  });

  assert.equal(result.nextCursor, null);
  assert.deepEqual(lastCall('rpc:list_prayer_requests').payload, {
    p_group_id: 'group-1',
    p_limit: 11,
    p_before_created_at: '2026-01-02T00:00:00.654321+00:00',
    p_before_id: 'req-2',
  });
});

test('a page size is kept between 1 and 100', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({ data: [] }));

  await prayer.listPrayerRequests('group-1', { limit: 0 });
  assert.equal((lastCall('rpc:list_prayer_requests').payload as { p_limit: number }).p_limit, 2);
  await prayer.listPrayerRequests('group-1', { limit: 5000 });
  assert.equal((lastCall('rpc:list_prayer_requests').payload as { p_limit: number }).p_limit, 101);
});

test('a failing listing call is reported, not retried the old way', async () => {
  fake.respondToRpc('list_prayer_requests', () => ({
    data: null,
    error: { code: '57014', message: 'canceling statement due to statement timeout' },
    status: 500,
  }));

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'canceling statement due to statement timeout',
  });
  assert.deepEqual(fake.callsFor('prayer_requests'), []);
});

for (const [label, error, status] of [
  ['PGRST202', { code: 'PGRST202', message: 'Could not find the function' }, 404],
  ['42883', { code: '42883', message: 'function list_prayer_requests does not exist' }, 400],
  ['a 404', { message: 'Not Found' }, 404],
] as const) {
  test(`while the listing function is missing (${label}) the wall uses the two-query path`, async () => {
    listRpcMissing(error, status);
    fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
    fake.respondTo('prayer_interactions', () => ({
      data: [{ request_id: 'req-1', type: 'prayed', user_id: 'user-1' }],
    }));

    const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];

    assert.deepEqual(
      [only.prayed_count, only.viewer_prayed],
      [1, true],
      'counts come from the old queries'
    );
  });
}

// ─── Listing (fallback) ─────────────────────────────────────────────────────

test('the fallback pages requests with the same size and cursor', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [] }));

  await prayer.listPrayerRequests('group-1', {
    limit: 10,
    before: { created_at: '2026-01-02T00:00:00.654321+00:00', id: 'req-2' },
  });

  const call = lastCall('prayer_requests');
  assert.deepEqual(
    call.steps.filter((step) => ['order', 'limit', 'or'].includes(step.method)),
    [
      { method: 'order', args: ['created_at', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: false }] },
      {
        method: 'or',
        args: [
          'created_at.lt."2026-01-02T00:00:00.654321+00:00",' +
            'and(created_at.eq."2026-01-02T00:00:00.654321+00:00",id.lt."req-2")',
        ],
      },
      { method: 'limit', args: [11] },
    ]
  );
});

test("the fallback reads interactions past PostgREST's 1000-row cap", async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
  const pageRows = (count: number) =>
    Array.from({ length: count }, () => ({ request_id: 'req-1', type: 'prayed', user_id: 'x' }));
  fake.respondTo('prayer_interactions', (call) => {
    const [from] = call.steps.find((step) => step.method === 'range')?.args as [number, number];
    return { data: from === 0 ? pageRows(1000) : pageRows(7) };
  });

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];

  assert.equal(only.prayed_count, 1007);
  assert.deepEqual(
    fake
      .callsFor('prayer_interactions')
      .map((call) => call.steps.find((step) => step.method === 'range')?.args),
    [
      [0, 999],
      [1000, 1999],
    ]
  );
});

test('a build without a backend shows an empty prayer wall rather than an error', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), EMPTY_PAGE);
  assert.deepEqual(fake.calls, []);
});

test('a signed-out reader browsing a group sees an empty prayer wall', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), EMPTY_PAGE);
  assert.deepEqual(fake.calls, []);
});

test('an auth failure while listing is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'JWT expired',
  });
});

test('requests are fetched for the group, newest first', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [] }));

  await prayer.listPrayerRequests('group-9');

  const call = lastCall('prayer_requests');
  assert.equal(call.operation, 'select');
  assert.equal(call.columns, '*');
  assert.deepEqual(filtersOf(call), [['group_id', 'group-9']]);
  assert.deepEqual(call.steps.find((step) => step.method === 'order')?.args, [
    'created_at',
    { ascending: false },
  ]);
});

test('a group with no prayer requests skips the interactions query entirely', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [] }));

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), EMPTY_PAGE);
  assert.deepEqual(fake.callsFor('prayer_interactions'), []);
});

test('a null request payload is treated as an empty prayer wall', async () => {
  fake.respondTo('prayer_requests', () => ({ data: null }));

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), EMPTY_PAGE);
});

test('each request carries its aggregated prayed and encouraged counts', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: [request({ id: 'req-1' }), request({ id: 'req-2' })],
  }));
  fake.respondTo('prayer_interactions', () => ({
    data: [
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'req-1', type: 'encouraged' },
      { request_id: 'req-2', type: 'encouraged' },
    ],
  }));

  const result = await prayer.listPrayerRequests('group-1');

  assert.deepEqual(
    result.data?.map(({ id, prayed_count, encouraged_count }) => ({
      id,
      prayed_count,
      encouraged_count,
    })),
    [
      { id: 'req-1', prayed_count: 2, encouraged_count: 1 },
      { id: 'req-2', prayed_count: 0, encouraged_count: 1 },
    ]
  );
});

test('interactions are fetched only for the listed requests', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: [request({ id: 'req-1' }), request({ id: 'req-2' })],
  }));
  fake.respondTo('prayer_interactions', () => ({ data: [] }));

  await prayer.listPrayerRequests('group-1');

  const call = lastCall('prayer_interactions');
  assert.equal(call.columns, 'request_id, type, user_id');
  assert.deepEqual(call.steps.find((step) => step.method === 'in')?.args, [
    'request_id',
    ['req-1', 'req-2'],
  ]);
});

test('each request says whether the viewer already prayed or encouraged, so a reopened wall shows it', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: [request({ id: 'req-1' }), request({ id: 'req-2' })],
  }));
  fake.respondTo('prayer_interactions', () => ({
    data: [
      { request_id: 'req-1', type: 'prayed', user_id: 'user-1' },
      { request_id: 'req-1', type: 'encouraged', user_id: 'someone-else' },
      { request_id: 'req-2', type: 'encouraged', user_id: 'user-1' },
      { request_id: 'req-2', type: 'prayed', user_id: 'someone-else' },
    ],
  }));

  const result = await prayer.listPrayerRequests('group-1');

  assert.deepEqual(
    result.data?.map(({ id, viewer_prayed, viewer_encouraged }) => ({
      id,
      viewer_prayed,
      viewer_encouraged,
    })),
    [
      { id: 'req-1', viewer_prayed: true, viewer_encouraged: false },
      { id: 'req-2', viewer_prayed: false, viewer_encouraged: true },
    ]
  );
});

test('a request with no interactions reports zero counts', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
  fake.respondTo('prayer_interactions', () => ({ data: [] }));

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];
  assert.equal(only.prayed_count, 0);
  assert.equal(only.encouraged_count, 0);
});

test('interactions for requests outside the page are ignored', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
  fake.respondTo('prayer_interactions', () => ({
    data: [
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'deleted-request', type: 'prayed' },
    ],
  }));

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];
  assert.equal(only.prayed_count, 1);
});

test('an unrecognised interaction type is counted in neither column', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
  fake.respondTo('prayer_interactions', () => ({
    data: [{ request_id: 'req-1', type: 'amened' }],
  }));

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];
  assert.deepEqual(
    { prayed: only.prayed_count, encouraged: only.encouraged_count },
    {
      prayed: 0,
      encouraged: 0,
    }
  );
});

test('a null interactions payload leaves every count at zero', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request({ id: 'req-1' })] }));
  fake.respondTo('prayer_interactions', () => ({ data: null }));

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];
  assert.equal(only.prayed_count, 0);
});

// QUESTION: `countMap[request.id]?.prayed ?? 0` in listPrayerRequests can never
// take its fallback — countMap is keyed from the very rows being mapped, and a
// missing id coerces to the same "undefined" key on both sides. Kept as defensive
// code; this test pins the user-visible behaviour (no crash, no leaked counts).
test('a request row without an id still renders, with zero counts', async () => {
  const malformed = { ...request(), id: undefined } as unknown as PrayerRequest;
  fake.respondTo('prayer_requests', () => ({ data: [malformed] }));
  fake.respondTo('prayer_interactions', () => ({
    data: [{ request_id: 'req-1', type: 'prayed' }],
  }));

  const [only] = (await prayer.listPrayerRequests('group-1')).data ?? [];
  assert.deepEqual(
    { prayed: only.prayed_count, encouraged: only.encouraged_count },
    { prayed: 0, encouraged: 0 },
    'a row the counts map cannot key on must not crash the prayer wall'
  );
});

test('an RLS failure on the requests query is reported instead of an empty wall', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'new row violates row-level security policy' },
  }));

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'new row violates row-level security policy',
  });
});

test('a failure on the interactions query is reported rather than showing wrong counts', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [request()] }));
  fake.respondTo('prayer_interactions', () => ({
    data: null,
    error: { message: 'permission denied for table prayer_interactions' },
  }));

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'permission denied for table prayer_interactions',
  });
});

test('a network exception while listing is reported with its message', async () => {
  fake.respondTo('prayer_requests', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'Network request failed',
  });
});

test('a non-Error thrown while listing is reported as an unknown error', async () => {
  fake.respondTo('prayer_requests', () => {
    throw 'boom';
  });

  assert.deepEqual(await prayer.listPrayerRequests('group-1'), {
    success: false,
    error: 'Unknown error',
  });
});

// ─── Creating ────────────────────────────────────────────────────────────────

test('submitting a prayer request stores the trimmed content against the author and group', async () => {
  const created = request({ content: 'Pray for my neighbour' });
  fake.respondTo('prayer_requests', () => ({ data: created }));

  const result = await prayer.createPrayerRequest('group-9', '  Pray for my neighbour  ');

  assert.deepEqual(result, { success: true, data: created });
  const call = lastCall('prayer_requests');
  assert.equal(call.operation, 'insert');
  assert.deepEqual(call.payload, {
    group_id: 'group-9',
    user_id: 'user-1',
    content: 'Pray for my neighbour',
    is_answered: false,
  });
  assert.equal(call.single, true);
});

test('submitting a prayer request without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before submitting a prayer request', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'You must be signed in to submit a prayer request',
  });
  assert.deepEqual(fake.calls, []);
});

test('an auth failure while submitting is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'JWT expired',
  });
});

test('a rejected insert surfaces the database error', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'You are not a member of this group' },
  }));

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'You are not a member of this group',
  });
});

test('posting past the server rate limit is reported as rate_limited so the wall can explain it', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'prayer_request_rate_limited', code: 'PT429' },
  }));

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'prayer_request_rate_limited',
    code: 'rate_limited',
  });
});

test('a network exception while submitting is reported with its message', async () => {
  fake.respondTo('prayer_requests', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Editing ─────────────────────────────────────────────────────────────────

test('editing a prayer request writes the trimmed content scoped to its author', async () => {
  const updated = request({ content: 'Updated' });
  fake.respondTo('prayer_requests', () => ({ data: updated }));

  const result = await prayer.updatePrayerRequest('req-1', '  Updated  ');

  assert.deepEqual(result, { success: true, data: updated });
  const call = lastCall('prayer_requests');
  assert.equal(call.operation, 'update');
  assert.equal((call.payload as { content: string }).content, 'Updated');
  assert.match((call.payload as { updated_at: string }).updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(filtersOf(call), [
    ['id', 'req-1'],
    ['user_id', 'user-1'],
  ]);
});

test('editing a prayer request without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.updatePrayerRequest('req-1', 'text'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before editing a prayer request', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.updatePrayerRequest('req-1', 'text'), {
    success: false,
    error: 'You must be signed in to edit a prayer request',
  });
});

test('an auth failure while editing is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.updatePrayerRequest('req-1', 'text'), {
    success: false,
    error: 'JWT expired',
  });
});

test('editing someone else request is rejected by RLS and surfaced', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'JSON object requested, multiple (or no) rows returned' },
  }));

  assert.deepEqual(await prayer.updatePrayerRequest('req-1', 'text'), {
    success: false,
    error: 'JSON object requested, multiple (or no) rows returned',
  });
});

test('a network exception while editing is reported with its message', async () => {
  fake.respondTo('prayer_requests', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.updatePrayerRequest('req-1', 'text'), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Answering ───────────────────────────────────────────────────────────────

test('marking a prayer answered records the same timestamp for answered_at and updated_at', async () => {
  const answered = request({ is_answered: true });
  fake.respondTo('prayer_requests', () => ({ data: answered }));

  const result = await prayer.markPrayerAnswered('req-1');

  assert.deepEqual(result, { success: true, data: answered });
  const payload = lastCall('prayer_requests').payload as {
    is_answered: boolean;
    answered_at: string;
    updated_at: string;
  };
  assert.equal(payload.is_answered, true);
  assert.equal(payload.answered_at, payload.updated_at);
  assert.deepEqual(filtersOf(lastCall('prayer_requests')), [
    ['id', 'req-1'],
    ['user_id', 'user-1'],
  ]);
});

test('marking a prayer answered without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.markPrayerAnswered('req-1'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before marking a prayer answered', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.markPrayerAnswered('req-1'), {
    success: false,
    error: 'You must be signed in to mark a prayer as answered',
  });
});

test('an auth failure while marking a prayer answered is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.markPrayerAnswered('req-1'), {
    success: false,
    error: 'JWT expired',
  });
});

test('a rejected answer update surfaces the database error', async () => {
  fake.respondTo('prayer_requests', () => ({ data: null, error: { message: 'not your prayer' } }));

  assert.deepEqual(await prayer.markPrayerAnswered('req-1'), {
    success: false,
    error: 'not your prayer',
  });
});

test('a network exception while marking a prayer answered is reported with its message', async () => {
  fake.respondTo('prayer_requests', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.markPrayerAnswered('req-1'), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Deleting ────────────────────────────────────────────────────────────────

test('deleting a prayer request goes by id alone, so the group leader can remove any request', async () => {
  // RLS (prayer_delete_creator_or_leader) decides who may delete: the author or the leader.
  fake.respondTo('prayer_requests', () => ({ data: [{ id: 'req-1' }] }));

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), { success: true });
  const call = lastCall('prayer_requests');
  assert.equal(call.operation, 'delete');
  assert.deepEqual(filtersOf(call), [['id', 'req-1']]);
  assert.equal(call.columns, 'id');
});

test('a delete that RLS lets remove nothing is reported as a failure, not a success', async () => {
  fake.respondTo('prayer_requests', () => ({ data: [] }));

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'Prayer request was not deleted',
  });
});

test('deleting a prayer request without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before deleting a prayer request', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'You must be signed in to delete a prayer request',
  });
});

test('an auth failure while deleting is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'JWT expired',
  });
});

test('a rejected delete surfaces the database error', async () => {
  fake.respondTo('prayer_requests', () => ({ error: { message: 'not your prayer' } }));

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'not your prayer',
  });
});

test('a network exception while deleting is reported with its message', async () => {
  fake.respondTo('prayer_requests', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.deletePrayerRequest('req-1'), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Interactions ────────────────────────────────────────────────────────────

test('praying for a request upserts one interaction per user, type and request', async () => {
  const interaction = {
    id: 'int-1',
    request_id: 'req-1',
    user_id: 'user-1',
    type: 'prayed' as const,
    created_at: '2026-01-02T00:00:00.000Z',
  };
  fake.respondTo('prayer_interactions', () => ({ data: interaction }));

  const result = await prayer.addInteraction('req-1', 'prayed');

  assert.deepEqual(result, { success: true, data: interaction });
  const call = lastCall('prayer_interactions');
  assert.equal(call.operation, 'upsert');
  assert.deepEqual(call.payload, { request_id: 'req-1', user_id: 'user-1', type: 'prayed' });
  assert.deepEqual(call.options, {
    onConflict: 'request_id,user_id,type',
    ignoreDuplicates: true,
  });
  assert.equal(call.maybeSingle, true);
});

test('praying twice is silently ignored and still reported as success', async () => {
  fake.respondTo('prayer_interactions', () => ({ data: null }));

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: true,
    data: undefined,
  });
});

test('encouraging a request records the encouraged interaction type', async () => {
  fake.respondTo('prayer_interactions', () => ({ data: null }));

  await prayer.addInteraction('req-1', 'encouraged');

  assert.equal((lastCall('prayer_interactions').payload as { type: string }).type, 'encouraged');
});

test('interacting without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before interacting', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: false,
    error: 'You must be signed in to interact with a prayer request',
  });
});

test('an auth failure while interacting is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: false,
    error: 'JWT expired',
  });
});

test('a rejected interaction upsert surfaces the database error', async () => {
  fake.respondTo('prayer_interactions', () => ({
    data: null,
    error: { message: 'You are not a member of this group' },
  }));

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: false,
    error: 'You are not a member of this group',
  });
});

test('a network exception while interacting is reported with its message', async () => {
  fake.respondTo('prayer_interactions', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.addInteraction('req-1', 'prayed'), {
    success: false,
    error: 'Network request failed',
  });
});

test('withdrawing an interaction deletes only the current user own row of that type', async () => {
  fake.respondTo('prayer_interactions', () => ({ data: null }));

  assert.deepEqual(await prayer.removeInteraction('req-1', 'encouraged'), { success: true });
  const call = lastCall('prayer_interactions');
  assert.equal(call.operation, 'delete');
  assert.deepEqual(filtersOf(call), [
    ['request_id', 'req-1'],
    ['user_id', 'user-1'],
    ['type', 'encouraged'],
  ]);
});

test('withdrawing an interaction without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.deepEqual(await prayer.removeInteraction('req-1', 'prayed'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
});

test('a signed-out visitor is asked to sign in before withdrawing an interaction', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.removeInteraction('req-1', 'prayed'), {
    success: false,
    error: 'You must be signed in to remove an interaction',
  });
});

test('an auth failure while withdrawing an interaction is reported to the caller', async () => {
  failGetUser('JWT expired');

  assert.deepEqual(await prayer.removeInteraction('req-1', 'prayed'), {
    success: false,
    error: 'JWT expired',
  });
});

test('a rejected interaction delete surfaces the database error', async () => {
  fake.respondTo('prayer_interactions', () => ({ error: { message: 'permission denied' } }));

  assert.deepEqual(await prayer.removeInteraction('req-1', 'prayed'), {
    success: false,
    error: 'permission denied',
  });
});

test('a network exception while withdrawing an interaction is reported with its message', async () => {
  fake.respondTo('prayer_interactions', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await prayer.removeInteraction('req-1', 'prayed'), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Unknown failure shapes ──────────────────────────────────────────────────

const nonErrorFailures: Array<[string, string, () => Promise<{ error?: string }>]> = [
  ['submitting', 'prayer_requests', () => prayer.createPrayerRequest('group-1', 'help')],
  ['editing', 'prayer_requests', () => prayer.updatePrayerRequest('req-1', 'text')],
  ['marking a prayer answered', 'prayer_requests', () => prayer.markPrayerAnswered('req-1')],
  ['deleting', 'prayer_requests', () => prayer.deletePrayerRequest('req-1')],
  ['interacting', 'prayer_interactions', () => prayer.addInteraction('req-1', 'prayed')],
  [
    'withdrawing an interaction',
    'prayer_interactions',
    () => prayer.removeInteraction('req-1', 'prayed'),
  ],
];

for (const [action, table, invoke] of nonErrorFailures) {
  test(`a non-Error thrown while ${action} is reported as an unknown error`, async () => {
    fake.respondTo(table, () => {
      throw 'boom';
    });

    assert.equal((await invoke()).error, 'Unknown error');
  });
}

// ─── Moderation: server refusals ─────────────────────────────────────────────

test('a request the content filter refuses is reported as content_rejected', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'prayer_request_blocked_content', code: 'PT422' },
  }));

  assert.deepEqual(await prayer.createPrayerRequest('group-1', 'help'), {
    success: false,
    error: 'prayer_request_blocked_content',
    code: 'content_rejected',
  });
});

test('an edit the content filter refuses is reported as content_rejected', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'prayer_request_blocked_content', code: 'PT422' },
  }));

  assert.equal((await prayer.updatePrayerRequest('req-1', 'text')).code, 'content_rejected');
});

test('a member banned from the wall is told so when posting or editing', async () => {
  fake.respondTo('prayer_requests', () => ({
    data: null,
    error: { message: 'prayer_wall_banned', code: 'PT403' },
  }));

  assert.equal((await prayer.createPrayerRequest('group-1', 'help')).code, 'banned');
  assert.equal((await prayer.updatePrayerRequest('req-1', 'text')).code, 'banned');
});

// ─── Moderation: reporting ───────────────────────────────────────────────────

test('reporting a request calls the report RPC with the reason and a trimmed note', async () => {
  fake.respondToRpc('report_prayer_request', () => ({ data: null }));

  assert.deepEqual(await prayer.reportPrayerRequest('req-9', 'abuse', '  mocks the group  '), {
    success: true,
  });
  assert.deepEqual(lastCall('rpc:report_prayer_request').payload, {
    p_request_id: 'req-9',
    p_reason: 'abuse',
    p_note: 'mocks the group',
  });
});

test('a report without a note sends a null note', async () => {
  fake.respondToRpc('report_prayer_request', () => ({ data: null }));

  await prayer.reportPrayerRequest('req-9', 'spam', '   ');

  assert.deepEqual(lastCall('rpc:report_prayer_request').payload, {
    p_request_id: 'req-9',
    p_reason: 'spam',
    p_note: null,
  });
});

test('reporting past the server limit is reported as rate_limited', async () => {
  fake.respondToRpc('report_prayer_request', () => ({
    data: null,
    error: { message: 'prayer_report_rate_limited', code: 'PT429' },
  }));

  assert.deepEqual(await prayer.reportPrayerRequest('req-9', 'spam'), {
    success: false,
    error: 'prayer_report_rate_limited',
    code: 'rate_limited',
  });
});

test('a signed-out visitor is asked to sign in before reporting', async () => {
  fake.auth.setSession(null);

  assert.deepEqual(await prayer.reportPrayerRequest('req-9', 'spam'), {
    success: false,
    error: 'You must be signed in to report a prayer request',
  });
  assert.deepEqual(fake.callsFor('rpc:report_prayer_request'), []);
});

test('reporting without a backend explains the build is not configured', async () => {
  backend.configured = false;

  assert.equal(
    (await prayer.reportPrayerRequest('req-9', 'spam')).error,
    'EveryBible backend is not configured for this build yet.'
  );
});

// ─── Moderation: blocking ────────────────────────────────────────────────────

test('blocking an author stores one row for the signed-in blocker, ignoring repeats', async () => {
  fake.respondTo('user_blocks', () => ({ data: null }));

  assert.deepEqual(await prayer.blockUser('user-2'), { success: true });
  const call = lastCall('user_blocks');
  assert.equal(call.operation, 'upsert');
  assert.deepEqual(call.payload, { blocker_id: 'user-1', blocked_id: 'user-2' });
  assert.deepEqual(call.options, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
});

test('a member cannot block themselves', async () => {
  assert.deepEqual(await prayer.blockUser('user-1'), {
    success: false,
    error: 'You cannot block yourself',
  });
  assert.deepEqual(fake.callsFor('user_blocks'), []);
});

test('unblocking deletes only the signed-in member own block row', async () => {
  fake.respondTo('user_blocks', () => ({ data: null }));

  assert.deepEqual(await prayer.unblockUser('user-2'), { success: true });
  const call = lastCall('user_blocks');
  assert.equal(call.operation, 'delete');
  assert.deepEqual(filtersOf(call), [
    ['blocker_id', 'user-1'],
    ['blocked_id', 'user-2'],
  ]);
});

test('a rejected block surfaces the database error', async () => {
  fake.respondTo('user_blocks', () => ({ error: { message: 'permission denied' } }));

  assert.deepEqual(await prayer.blockUser('user-2'), {
    success: false,
    error: 'permission denied',
  });
});

test('a signed-out visitor is asked to sign in before blocking or unblocking', async () => {
  fake.auth.setSession(null);

  assert.equal((await prayer.blockUser('user-2')).error, 'You must be signed in to block someone');
  assert.equal(
    (await prayer.unblockUser('user-2')).error,
    'You must be signed in to block someone'
  );
});

const moderationCalls: Array<[string, string, () => Promise<{ error?: string }>]> = [
  ['reporting', 'rpc:report_prayer_request', () => prayer.reportPrayerRequest('req-9', 'spam')],
  ['blocking', 'user_blocks', () => prayer.blockUser('user-2')],
  ['unblocking', 'user_blocks', () => prayer.unblockUser('user-2')],
];

for (const [action, table, invoke] of moderationCalls) {
  test(`a network exception while ${action} is reported with its message`, async () => {
    fake.respondTo(table, () => {
      throw new Error('Network request failed');
    });

    assert.equal((await invoke()).error, 'Network request failed');
  });
}
