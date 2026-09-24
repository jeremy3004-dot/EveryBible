import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  buildRemoteReadingPlanProgressPayload,
  isEnrolmentEndedBy,
  mergePlanProgress,
  normalizeRemoteReadingPlanProgress,
  reconcileFetchedPlanProgress,
  type RemoteReadingPlanProgressRow,
} from './readingPlanModel';
import type { PlanSessionKey, UserReadingPlanProgress } from './types';

// ---------------------------------------------------------------------------
// Randomised checks of reading-plan progress sync: mergePlanProgress, the
// payload sent to merge_reading_plan_progress (migrations 20260924035821 /
// 20260924051658), the server merge itself (modelled in TypeScript), and the
// unenrol tombstone rule (20260924023340).
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=5000 node --test --import tsx \
//     src/services/plans/readingPlanModel.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 200),
};

const USER_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const BASE_MS = Date.parse('2026-09-20T06:00:00.000Z');
const SESSIONS: PlanSessionKey[] = ['morning', 'midday', 'evening'];
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------
// The SQL contract, in TypeScript.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isTimestamptz = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const jsonTypeof = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object'
        ? 'object'
        : typeof value;

/**
 * What merge_reading_plan_progress refuses (22023 / 42501), plus what the
 * statement itself would raise while casting the rows (jsonb_to_recordset) or
 * writing them (the current_session CHECK). Returns null when accepted.
 */
function validateMergePlanPayload(rows: unknown, callerId = USER_ID): string | null {
  const p = JSON.parse(JSON.stringify(rows)) as unknown;
  if (!Array.isArray(p)) return '22023 not an array';
  if (p.length > 100) return '22023 more than 100 plans';
  for (const row of p as Record<string, unknown>[]) {
    if (jsonTypeof(row) === 'object' && row.user_id != null) {
      if (String(row.user_id).toLowerCase() !== callerId) return '42501 another account';
    }
  }
  const slugs = new Set<string>();
  for (const row of p as Record<string, unknown>[]) {
    if (jsonTypeof(row) !== 'object') return '22023 row not an object';
    if (typeof row.plan_slug !== 'string') return '22023 plan_slug';
    const slug = row.plan_slug.trim();
    if ([...slug].length < 1 || [...slug].length > 200) return '22023 plan_slug length';
    for (const key of ['completed_entries', 'completed_sessions']) {
      if (row[key] !== undefined && !['object', 'null'].includes(jsonTypeof(row[key]))) {
        return `22023 ${key}`;
      }
    }
    slugs.add(slug);
    if (row.plan_id != null && !(typeof row.plan_id === 'string' && UUID.test(row.plan_id))) {
      return '22P02 plan_id';
    }
    for (const key of ['started_at', 'completed_at']) {
      if (row[key] != null && !isTimestamptz(row[key])) return `22007 ${key}`;
    }
    if (
      row.current_day != null &&
      !(Number.isInteger(row.current_day) && Math.abs(row.current_day as number) <= 2 ** 31 - 1)
    ) {
      return '22P02 current_day';
    }
    if (row.is_completed != null && typeof row.is_completed !== 'boolean')
      return '22P02 is_completed';
    if (row.current_session != null && !SESSIONS.includes(row.current_session as PlanSessionKey)) {
      return '23514 current_session';
    }
  }
  if (slugs.size !== p.length) return '22023 duplicate plan_slug';
  return null;
}

interface ServerPlanRow {
  started_at: string;
  completed_entries: Record<string, string>;
  completed_sessions: Record<string, string>;
  current_day: number;
  current_session: PlanSessionKey | null;
  is_completed: boolean;
  completed_at: string | null;
  synced_at: string;
}

/** merge_reading_plan_progress's ON CONFLICT DO UPDATE for one row. */
function serverMergePlanRow(
  stored: ServerPlanRow | null,
  payload: Record<string, unknown>,
  nowIso: string
): ServerPlanRow {
  const p = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const incoming: ServerPlanRow = {
    started_at: (p.started_at as string) ?? nowIso,
    completed_entries: (p.completed_entries as Record<string, string>) ?? {},
    completed_sessions: (p.completed_sessions as Record<string, string>) ?? {},
    current_day: Math.max((p.current_day as number) ?? 1, 1),
    current_session: (p.current_session as PlanSessionKey) ?? null,
    is_completed: (p.is_completed as boolean) ?? false,
    completed_at: (p.completed_at as string) ?? null,
    synced_at: nowIso,
  };
  if (!stored) return incoming;
  return {
    started_at: stored.started_at,
    completed_entries: { ...stored.completed_entries, ...incoming.completed_entries },
    completed_sessions: { ...stored.completed_sessions, ...incoming.completed_sessions },
    current_day: Math.max(stored.current_day, incoming.current_day),
    current_session:
      stored.current_day > incoming.current_day
        ? stored.current_session
        : incoming.current_day > stored.current_day
          ? incoming.current_session
          : (incoming.current_session ?? stored.current_session),
    is_completed: stored.is_completed || incoming.is_completed,
    completed_at: incoming.completed_at ?? stored.completed_at,
    synced_at: nowIso,
  };
}

const asRemoteRow = (planId: string, row: ServerPlanRow): RemoteReadingPlanProgressRow => ({
  id: 'server-row',
  user_id: USER_ID,
  plan_id: null,
  plan_slug: planId,
  ...row,
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const stampArb = fc.integer({ min: 0, max: 20 }).map((n) => iso(BASE_MS + n * 60_000));
const entriesArb = fc.dictionary(fc.integer({ min: 1, max: 6 }).map(String), stampArb, {
  maxKeys: 6,
  noNullPrototype: true,
});
const sessionEntriesArb = fc.dictionary(
  fc
    .tuple(fc.integer({ min: 1, max: 3 }), fc.constantFrom(...SESSIONS))
    .map(([day, session]) => `${day}:${session}`),
  stampArb,
  { maxKeys: 5, noNullPrototype: true }
);
const progressArb = (planId: string): fc.Arbitrary<UserReadingPlanProgress> =>
  fc.record({
    id: fc.constant(`reading-plan-progress-${planId}`),
    plan_id: fc.constant(planId),
    started_at: fc.constant(iso(BASE_MS)),
    completed_entries: entriesArb,
    completed_sessions: sessionEntriesArb,
    current_day: fc.integer({ min: 1, max: 7 }),
    current_session: fc.constantFrom<PlanSessionKey | null>(null, ...SESSIONS),
    is_completed: fc.boolean(),
    completed_at: fc.option(stampArb, { nil: null }),
    synced_at: stampArb,
  });

const withoutSyncedAt = ({ synced_at: _ignored, ...rest }: UserReadingPlanProgress) => rest;
const sortedKeys = (record: Record<string, unknown> | undefined) =>
  Object.keys(record ?? {}).sort();

// ---------------------------------------------------------------------------
// Merge laws
// ---------------------------------------------------------------------------

test('mergePlanProgress keeps every completed day and tick from both sides', () => {
  fc.assert(
    fc.property(progressArb('psalms-30-days'), progressArb('psalms-30-days'), (local, remote) => {
      const merged = mergePlanProgress(local, remote, iso(BASE_MS));
      assert.deepEqual(
        sortedKeys(merged.completed_entries),
        [
          ...new Set([
            ...sortedKeys(local.completed_entries),
            ...sortedKeys(remote.completed_entries),
          ]),
        ].sort()
      );
      assert.deepEqual(
        sortedKeys(merged.completed_sessions),
        [
          ...new Set([
            ...sortedKeys(local.completed_sessions),
            ...sortedKeys(remote.completed_sessions),
          ]),
        ].sort()
      );
      assert.equal(merged.current_day, Math.max(local.current_day, remote.current_day));
      assert.equal(merged.is_completed, local.is_completed || remote.is_completed);
    }),
    FC_PARAMS
  );
});

test('mergePlanProgress is commutative, associative and idempotent (apart from synced_at)', () => {
  const planArb = progressArb('psalms-30-days');
  fc.assert(
    fc.property(planArb, planArb, planArb, (a, b, c) => {
      const at = iso(BASE_MS);
      const ab = mergePlanProgress(a, b, at);
      assert.deepEqual(withoutSyncedAt(ab), withoutSyncedAt(mergePlanProgress(b, a, at)));
      assert.deepEqual(
        withoutSyncedAt(mergePlanProgress(ab, c, at)),
        withoutSyncedAt(mergePlanProgress(a, mergePlanProgress(b, c, at), at))
      );
      assert.deepEqual(withoutSyncedAt(mergePlanProgress(ab, b, at)), withoutSyncedAt(ab));
      assert.deepEqual(withoutSyncedAt(mergePlanProgress(ab, ab, at)), withoutSyncedAt(ab));
    }),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Two devices, one server row
// ---------------------------------------------------------------------------

type PlanOp =
  | { kind: 'day'; device: 0 | 1; day: number; minutes: number }
  | { kind: 'session'; device: 0 | 1; day: number; session: PlanSessionKey; minutes: number }
  | { kind: 'sync'; device: 0 | 1 };

const planOpArb: fc.Arbitrary<PlanOp> = fc.oneof(
  fc.record({
    kind: fc.constant('day' as const),
    device: fc.constantFrom(0 as const, 1 as const),
    day: fc.integer({ min: 1, max: 4 }),
    minutes: fc.integer({ min: 0, max: 30 }),
  }),
  fc.record({
    kind: fc.constant('session' as const),
    device: fc.constantFrom(0 as const, 1 as const),
    day: fc.integer({ min: 1, max: 2 }),
    session: fc.constantFrom(...SESSIONS),
    minutes: fc.integer({ min: 0, max: 30 }),
  }),
  fc.record({ kind: fc.constant('sync' as const), device: fc.constantFrom(0 as const, 1 as const) })
);

const PLAN = 'gospels-60-days';
const enrolled = (): UserReadingPlanProgress => ({
  id: `reading-plan-progress-${PLAN}`,
  plan_id: PLAN,
  started_at: iso(BASE_MS),
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: iso(BASE_MS),
});

/** readingPlansStore.markDayComplete / markSessionComplete, reduced to what sync sees. */
const applyLocalOp = (row: UserReadingPlanProgress, op: PlanOp): UserReadingPlanProgress => {
  if (op.kind === 'day') {
    const at = iso(BASE_MS + op.minutes * 60_000);
    return {
      ...row,
      completed_entries: { [op.day]: at, ...row.completed_entries },
      current_day: Math.max(row.current_day, op.day + 1),
      current_session: null,
    };
  }
  if (op.kind === 'session') {
    const at = iso(BASE_MS + op.minutes * 60_000);
    const next = SESSIONS[SESSIONS.indexOf(op.session) + 1] ?? null;
    return {
      ...row,
      completed_sessions: { [`${op.day}:${op.session}`]: at, ...row.completed_sessions },
      current_session: row.current_day === op.day ? next : row.current_session,
    };
  }
  return row;
};

/** syncPlanProgress: fold the server row in, push through the merge function, adopt the result. */
const syncPlanDevice = (
  live: UserReadingPlanProgress,
  server: ServerPlanRow | null,
  nowIso: string
): { live: UserReadingPlanProgress; server: ServerPlanRow } => {
  let next = live;
  if (server) {
    const serverRow = normalizeRemoteReadingPlanProgress(asRemoteRow(PLAN, server))!;
    next = mergePlanProgress(next, serverRow, serverRow.synced_at);
  }
  const payload = buildRemoteReadingPlanProgressPayload(next, USER_ID, true);
  assert.equal(validateMergePlanPayload([payload]), null);
  const stored = serverMergePlanRow(server, payload as unknown as Record<string, unknown>, nowIso);
  const storedRow = normalizeRemoteReadingPlanProgress(asRemoteRow(PLAN, stored))!;
  return { live: mergePlanProgress(next, storedRow, storedRow.synced_at), server: stored };
};

const runPlanScenario = (ops: PlanOp[]) => {
  let devices: [UserReadingPlanProgress, UserReadingPlanProgress] = [enrolled(), enrolled()];
  let server: ServerPlanRow | null = null;
  let clock = BASE_MS + 3_600_000;
  const done = new Set<string>();
  const ticks = new Set<string>();
  const sync = (index: 0 | 1) => {
    const result = syncPlanDevice(devices[index], server, iso((clock += 1000)));
    server = result.server;
    devices = index === 0 ? [result.live, devices[1]] : [devices[0], result.live];
  };
  for (const op of ops) {
    if (op.kind === 'sync') {
      sync(op.device);
      continue;
    }
    if (op.kind === 'day') done.add(String(op.day));
    else ticks.add(`${op.day}:${op.session}`);
    const next = applyLocalOp(devices[op.device], op);
    devices = op.device === 0 ? [next, devices[1]] : [devices[0], next];
  }
  sync(0);
  sync(1);
  sync(0);
  sync(1);
  return { devices, server: server as ServerPlanRow | null, done, ticks };
};

test('two devices converge on one plan row: every day and tick done anywhere is kept', () => {
  fc.assert(
    fc.property(fc.array(planOpArb, { minLength: 4, maxLength: 24 }), (ops) => {
      const { devices, server, done, ticks } = runPlanScenario(ops);
      assert.ok(server);
      for (const row of [...devices, server]) {
        assert.deepEqual(sortedKeys(row.completed_entries), [...done].sort());
        assert.deepEqual(sortedKeys(row.completed_sessions), [...ticks].sort());
      }
    }),
    FC_PARAMS
  );
});

test('two devices converge on the same completion times, day and next session', () => {
  fc.assert(
    fc.property(fc.array(planOpArb, { minLength: 4, maxLength: 24 }), (ops) => {
      const { devices, server } = runPlanScenario(ops);
      assert.ok(server);
      const view = (row: UserReadingPlanProgress | ServerPlanRow) => ({
        completed_entries: Object.fromEntries(Object.entries(row.completed_entries).sort()),
        completed_sessions: Object.fromEntries(Object.entries(row.completed_sessions ?? {}).sort()),
        current_day: row.current_day,
        current_session: row.current_session ?? null,
        is_completed: row.is_completed,
        completed_at: row.completed_at,
      });
      assert.deepEqual(view(devices[0]), view(devices[1]));
      assert.deepEqual(view(devices[0]), view(server));
    }),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Tombstones
// ---------------------------------------------------------------------------

/** skip_ended_reading_plan_progress / apply_reading_plan_unenrollment, with their clamps to now(). */
const serverTreatsAsEnded = (startedAtMs: number, leftAtMs: number, nowMs: number): boolean =>
  Math.min(leftAtMs, nowMs) >= Math.min(startedAtMs, nowMs);

test('the client and the server agree on which enrolments a leave ended (honest clocks)', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (startedOffset, leftOffset, nowAhead) => {
        const started = BASE_MS + startedOffset * 1000;
        const left = BASE_MS + leftOffset * 1000;
        // Both happened before the write that reaches the server.
        const now = Math.max(started, left) + nowAhead * 1000;
        assert.equal(
          isEnrolmentEndedBy({ started_at: iso(started) }, iso(left)),
          serverTreatsAsEnded(started, left, now)
        );
      }
    ),
    FC_PARAMS
  );
});

test('a leave beats a stale enrolment, and an enrolment after the leave beats the leave', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10_000 }),
      fc.integer({ min: 1, max: 10_000 }),
      (before, after) => {
        const leftAt = iso(BASE_MS);
        assert.equal(isEnrolmentEndedBy({ started_at: iso(BASE_MS - before) }, leftAt), true);
        assert.equal(isEnrolmentEndedBy({ started_at: iso(BASE_MS + after) }, leftAt), false);
      }
    ),
    FC_PARAMS
  );
});

test('an unreadable start or leave time never ends an enrolment', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('', 'not a date', '2026-13-45T00:00:00Z'),
      stampArb,
      (garbage, valid) => {
        assert.equal(isEnrolmentEndedBy({ started_at: garbage }, valid), false);
        assert.equal(isEnrolmentEndedBy({ started_at: valid }, garbage), false);
      }
    ),
    FC_PARAMS
  );
});

const planIdArb: fc.Arbitrary<string> = fc.constantFrom(
  'psalms-30-days',
  'gospels-60-days',
  'proverbs-31-days',
  'bible-in-1-year'
);

test('reconciling a fetch never drops local-only progress and never revives a left plan', () => {
  const rowsArb: fc.Arbitrary<UserReadingPlanProgress[]> = fc
    .uniqueArray(planIdArb, { maxLength: 4 })
    .chain((ids) =>
      ids.length === 0
        ? fc.constant<UserReadingPlanProgress[]>([])
        : fc.tuple(...ids.map((id) => progressArb(id))).map((rows) => [...rows])
    );
  fc.assert(
    fc.property(
      rowsArb,
      rowsArb,
      fc.uniqueArray(planIdArb, { maxLength: 2 }),
      (local, remote, left) => {
        const { progress, localOnlyProgress } = reconcileFetchedPlanProgress(
          local,
          remote,
          iso(BASE_MS),
          left
        );
        const ids = progress.map((row) => row.plan_id);
        assert.equal(new Set(ids).size, ids.length, 'one row per plan');
        for (const id of left) assert.equal(ids.includes(id), false, `${id} was left`);
        const remoteIds = new Set(remote.map((row) => row.plan_id));
        for (const row of local) {
          if (left.includes(row.plan_id)) continue;
          const kept = progress.find((candidate) => candidate.plan_id === row.plan_id);
          assert.ok(kept, `${row.plan_id} dropped`);
          for (const day of Object.keys(row.completed_entries)) {
            assert.ok(day in kept.completed_entries, `${row.plan_id} day ${day} dropped`);
          }
          assert.equal(
            localOnlyProgress.some((candidate) => candidate.plan_id === row.plan_id),
            !remoteIds.has(row.plan_id)
          );
        }
        for (const row of remote) {
          if (!left.includes(row.plan_id)) assert.ok(ids.includes(row.plan_id));
        }
      }
    ),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Payloads the RPC accepts
// ---------------------------------------------------------------------------

test('every plan row the app can hold becomes a payload merge_reading_plan_progress accepts', () => {
  const liveRowArb = fc
    .uniqueArray(planIdArb, { minLength: 1, maxLength: 4 })
    .chain((ids) => fc.tuple(...ids.map((id) => progressArb(id))));
  fc.assert(
    fc.property(liveRowArb, fc.boolean(), (rows, withSessions) => {
      const payload = rows.map((row) =>
        buildRemoteReadingPlanProgressPayload(row, USER_ID, withSessions)
      );
      assert.equal(validateMergePlanPayload(payload), null);
    }),
    FC_PARAMS
  );
});

test('rows read back from the server (any legacy shape) become payloads the RPC accepts', () => {
  const legacyRowArb: fc.Arbitrary<RemoteReadingPlanProgressRow> = fc.record({
    id: fc.constant('server-row'),
    user_id: fc.constant(USER_ID),
    plan_id: fc.constantFrom<string | null>(null, '0b1f7c52-8d3e-4a1b-9c2d-3e4f5a6b7c8d'),
    plan_slug: fc.constantFrom<string | null>('psalms-30-days', ' psalms-30-days ', null),
    started_at: fc.constant(iso(BASE_MS)),
    completed_entries: fc.option(entriesArb, { nil: null }),
    current_day: fc.option(fc.integer({ min: 1, max: 400 }), { nil: null }),
    is_completed: fc.option(fc.boolean(), { nil: null }),
    completed_at: fc.option(stampArb, { nil: null }),
    synced_at: fc.option(stampArb, { nil: null }),
  });
  fc.assert(
    fc.property(legacyRowArb, (row) => {
      const normalized = normalizeRemoteReadingPlanProgress(row);
      if (!normalized) return;
      const payload = buildRemoteReadingPlanProgressPayload(normalized, USER_ID, true);
      assert.equal(validateMergePlanPayload([payload]), null);
    }),
    FC_PARAMS
  );
});

test('the plan validator model refuses what the migration refuses', () => {
  const valid = {
    user_id: USER_ID,
    plan_id: null,
    plan_slug: 'psalms-30-days',
    started_at: iso(BASE_MS),
    completed_entries: {},
    completed_sessions: {},
    current_day: 1,
    current_session: null,
    is_completed: false,
    completed_at: null,
  };
  assert.equal(validateMergePlanPayload([valid]), null);
  const refusals: [unknown, string][] = [
    [{ plan_slug: 'x' }, '22023 not an array'],
    [[{ ...valid, user_id: 'someone-else' }], '42501 another account'],
    [[{ ...valid, plan_slug: '  ' }], '22023 plan_slug length'],
    [[{ ...valid, plan_slug: 'x'.repeat(201) }], '22023 plan_slug length'],
    [[{ ...valid, completed_entries: [] }], '22023 completed_entries'],
    [[valid, { ...valid, plan_slug: ' psalms-30-days' }], '22023 duplicate plan_slug'],
    [
      Array.from({ length: 101 }, (_, i) => ({ ...valid, plan_slug: `p${i}` })),
      '22023 more than 100 plans',
    ],
    [[{ ...valid, current_day: 1.5 }], '22P02 current_day'],
    [[{ ...valid, current_session: 'night' }], '23514 current_session'],
  ];
  for (const [payload, expected] of refusals) {
    assert.equal(validateMergePlanPayload(payload), expected);
  }
});

test('a year-long plan done on two devices merges into one valid payload with every day and tick', () => {
  const days = Array.from({ length: 365 }, (_, index) => String(index + 1));
  const ticks = days.flatMap((day) => SESSIONS.map((session) => `${day}:${session}`));
  const side = (offsetMs: number, keep: (index: number) => boolean): UserReadingPlanProgress => ({
    ...enrolled(),
    plan_id: 'bible-in-1-year',
    completed_entries: Object.fromEntries(
      days.filter((_, index) => keep(index)).map((day) => [day, iso(BASE_MS + offsetMs)])
    ),
    completed_sessions: Object.fromEntries(
      ticks.filter((_, index) => keep(index)).map((tick) => [tick, iso(BASE_MS + offsetMs)])
    ),
    current_day: 366,
  });
  const a = side(0, (index) => index % 2 === 0);
  const b = side(1000, (index) => index % 2 === 1 || index % 3 === 0);

  const merged = mergePlanProgress(a, b, iso(BASE_MS));
  const payload = buildRemoteReadingPlanProgressPayload(merged, USER_ID, true);

  assert.equal(validateMergePlanPayload([payload]), null);
  assert.equal(Object.keys(merged.completed_entries).length, 365);
  assert.equal(Object.keys(merged.completed_sessions ?? {}).length, 1095);
  assert.deepEqual(withoutSyncedAt(merged), withoutSyncedAt(mergePlanProgress(b, a, iso(BASE_MS))));
});
