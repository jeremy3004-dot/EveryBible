import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

// Local helper instead of `mockSupabaseModule`: that helper bakes
// `isSupabaseConfigured()` in at mock time, and this file needs to flip the
// backend on and off per test (one mock configuration per file). Everything else
// is the shared Supabase fake. Candidate to fold back into mockSupabaseModule as
// a `configured: () => boolean` option.
const supabase = createSupabaseFake();
let backendConfigured = true;
const supabaseExports = {
  supabase: supabase.client,
  isSupabaseConfigured: () => backendConfigured,
  getCurrentUserId: async () => {
    if (!backendConfigured) {
      return null;
    }
    const { data } = await supabase.client.auth.getUser();
    return data.user?.id ?? null;
  },
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

// groupService uses i18n only for the push-notification copy. The real barrel
// boots i18next + expo-localization, so it is replaced with a key echo.
const i18nStub = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key}(${JSON.stringify(options)})` : key,
};
mockModule(mock, sourcePath('i18n/index.ts'), { ...i18nStub, default: i18nStub });

/**
 * Make the fake's `auth.getUser()` fail. The shared fake types its auth handlers
 * with `error: null`, so an error scenario needs this one cast.
 */
const failAuthLookup = (message: string) => {
  supabase.auth.handlers.getUser = (async () => ({
    data: { user: null },
    error: { message },
  })) as unknown as typeof supabase.auth.handlers.getUser;
};

/**
 * Pin `Math.random` to a fixed sequence so join-code generation is exact. Values
 * beyond the sequence repeat the last one; the caller restores the stub.
 */
const seedRandom = (values: number[]) => {
  let index = 0;
  return mock.method(Math, 'random', () => values[Math.min(index++, values.length - 1)]);
};

let service: typeof import('./groupService');

before(async () => {
  service = await import('./groupService');
});

/** Wait for the fire-and-forget notification chain inside recordSyncedGroupSession. */
const flushMicrotasks = async () => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

beforeEach(() => {
  supabase.reset();
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-1' }) }));
  supabase.auth.handlers.getUser = async () => ({
    data: { user: supabase.auth.user },
    error: null,
  });
  backendConfigured = true;
});

// ---------------------------------------------------------------------------
// listSyncedGroups
// ---------------------------------------------------------------------------

test('listing synced groups returns an empty list when the backend is not configured', async () => {
  backendConfigured = false;

  assert.deepEqual(await service.listSyncedGroups(), []);
  assert.deepEqual(supabase.calls, []);
});

test('listing synced groups asks for non-archived groups with their members, newest first', async () => {
  supabase.respondTo('groups', () => ({ data: [{ id: 'g1', group_members: [] }] }));

  const groups = await service.listSyncedGroups();

  assert.deepEqual(groups, [{ id: 'g1', group_members: [] }]);
  const [call] = supabase.callsFor('groups');
  assert.equal(call.columns, '*, group_members(*)');
  assert.deepEqual(
    call.steps.map((step) => [step.method, step.args]),
    [
      ['select', ['*, group_members(*)']],
      ['is', ['archived_at', null]],
      ['order', ['created_at', { ascending: false }]],
    ]
  );
});

test('listing synced groups turns a null payload into an empty list', async () => {
  supabase.respondTo('groups', () => ({ data: null }));

  assert.deepEqual(await service.listSyncedGroups(), []);
});

test('listing synced groups surfaces an RLS failure as an error', async () => {
  supabase.respondTo('groups', () => ({
    error: { message: 'permission denied for table groups', code: '42501' },
  }));

  await assert.rejects(service.listSyncedGroups(), /permission denied for table groups/);
});

// ---------------------------------------------------------------------------
// getSyncedGroup
// ---------------------------------------------------------------------------

test('getting a synced group returns null when the backend is not configured', async () => {
  backendConfigured = false;

  assert.equal(await service.getSyncedGroup('g1'), null);
  assert.deepEqual(supabase.calls, []);
});

test('getting a synced group filters by id and tolerates a missing row', async () => {
  supabase.respondTo('groups', () => ({ data: null }));

  assert.equal(await service.getSyncedGroup('g1'), null);

  const [call] = supabase.callsFor('groups');
  assert.equal(call.maybeSingle, true);
  assert.deepEqual(call.steps.find((step) => step.method === 'eq')?.args, ['id', 'g1']);
});

test('getting a synced group returns the row with its members', async () => {
  supabase.respondTo('groups', () => ({
    data: { id: 'g1', name: 'Alpha', group_members: [{ user_id: 'user-1' }] },
  }));

  const group = await service.getSyncedGroup('g1');

  assert.equal(group?.name, 'Alpha');
});

test('getting a synced group surfaces a query error', async () => {
  supabase.respondTo('groups', () => ({ error: { message: 'row level security' } }));

  await assert.rejects(service.getSyncedGroup('g1'), /row level security/);
});

// ---------------------------------------------------------------------------
// createSyncedGroup
// ---------------------------------------------------------------------------

test('creating a group refuses when the backend is not configured', async () => {
  backendConfigured = false;

  await assert.rejects(service.createSyncedGroup('Alpha'), /backend is not configured/);
});

test('creating a group refuses when nobody is signed in', async () => {
  supabase.auth.setSession(null);

  await assert.rejects(service.createSyncedGroup('Alpha'), /must be signed in to create a group/);
});

test('creating a group surfaces an auth lookup failure', async () => {
  failAuthLookup('session expired');

  await assert.rejects(service.createSyncedGroup('Alpha'), /session expired/);
});

test('creating a group trims the name and defaults the starting lesson', async () => {
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  const group = await service.createSyncedGroup('  Alpha  ');

  const insert = supabase.callsFor('groups')[0].payload as Record<string, unknown>;
  assert.equal(insert.name, 'Alpha');
  assert.equal(insert.leader_id, 'user-1');
  assert.equal(insert.current_course_id, 'entry-course');
  assert.equal(insert.current_lesson_id, 'entry-1');
  assert.equal(group.id, 'g1');
});

test('creating a group honours explicit course and lesson overrides', async () => {
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  await service.createSyncedGroup('Alpha', {
    currentCourseId: 'gospel-course',
    currentLessonId: 'gospel-2',
  });

  const insert = supabase.callsFor('groups')[0].payload as Record<string, unknown>;
  assert.equal(insert.current_course_id, 'gospel-course');
  assert.equal(insert.current_lesson_id, 'gospel-2');
});

test('creating a group generates a six-character join code from the unambiguous alphabet', async () => {
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  await service.createSyncedGroup('Alpha');

  const insert = supabase.callsFor('groups')[0].payload as { join_code: string };
  assert.match(insert.join_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
});

test('every join-code position is drawn independently from the alphabet', async () => {
  // Math.random is the only randomness seam in the service. Pinning it turns the
  // code into an exact expectation, which is what distinguishes a real per-index
  // draw from an implementation that keeps returning the same character.
  const random = seedRandom([0 / 32, 1 / 32, 2 / 32, 9 / 32, 25 / 32, 31 / 32]);
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  try {
    await service.createSyncedGroup('Alpha');
  } finally {
    random.mock.restore();
  }

  const insert = supabase.callsFor('groups')[0].payload as { join_code: string };
  assert.equal(insert.join_code, 'ABCK39');
});

test('creating a group enrols the creator as leader and returns them in the group', async () => {
  supabase.respondTo('groups', () => ({ data: { id: 'g1', name: 'Alpha' } }));

  const group = await service.createSyncedGroup('Alpha');

  const memberInsert = supabase.callsFor('group_members')[0].payload as Record<string, unknown>;
  assert.equal(memberInsert.group_id, 'g1');
  assert.equal(memberInsert.user_id, 'user-1');
  assert.equal(memberInsert.role, 'leader');
  assert.match(String(memberInsert.joined_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(group.group_members, [memberInsert]);
});

test('a duplicate join code is retried with a fresh code', async () => {
  let attempt = 0;
  supabase.respondTo('groups', () => {
    attempt += 1;
    return attempt === 1
      ? { error: { message: 'duplicate key value', code: '23505' } }
      : { data: { id: 'g1', name: 'Alpha' } };
  });

  // A fixed draw per attempt: the retry must reach for six fresh characters
  // rather than resubmitting the code the database has already rejected.
  const random = seedRandom([
    0 / 32,
    0 / 32,
    0 / 32,
    0 / 32,
    0 / 32,
    0 / 32,
    1 / 32,
    1 / 32,
    1 / 32,
    1 / 32,
    1 / 32,
    1 / 32,
  ]);

  let group: Awaited<ReturnType<typeof service.createSyncedGroup>> | null = null;
  try {
    group = await service.createSyncedGroup('Alpha');
  } finally {
    random.mock.restore();
  }

  assert.equal(group?.id, 'g1');
  assert.deepEqual(
    supabase.callsFor('groups').map((call) => (call.payload as { join_code: string }).join_code),
    ['AAAAAA', 'BBBBBB']
  );
});

test('five colliding join codes give up with a clear error', async () => {
  supabase.respondTo('groups', () => ({
    error: { message: 'duplicate key value', code: '23505' },
  }));

  await assert.rejects(service.createSyncedGroup('Alpha'), /Unable to reserve a unique join code/);
  assert.equal(supabase.callsFor('groups').length, 5);
});

test('a non-duplicate insert failure aborts creation immediately', async () => {
  supabase.respondTo('groups', () => ({
    error: { message: 'new row violates row-level security policy', code: '42501' },
  }));

  await assert.rejects(service.createSyncedGroup('Alpha'), /violates row-level security policy/);
  assert.equal(supabase.callsFor('groups').length, 1);
});

test('an insert that returns no row aborts creation with a generic message', async () => {
  supabase.respondTo('groups', () => ({ data: null, error: null }));

  await assert.rejects(service.createSyncedGroup('Alpha'), /Unable to create group/);
});

test('a failed leader enrolment rolls the new group back and reports the member error', async () => {
  supabase.respondTo('groups', () => ({ data: { id: 'g1', name: 'Alpha' } }));
  supabase.respondTo('group_members', () => ({
    error: { message: 'group_members insert denied' },
  }));

  await assert.rejects(service.createSyncedGroup('Alpha'), /group_members insert denied/);

  const rollback = supabase.callsFor('groups')[1];
  assert.equal(rollback.operation, 'delete');
  assert.deepEqual(rollback.steps.find((step) => step.method === 'eq')?.args, ['id', 'g1']);
});

// ---------------------------------------------------------------------------
// joinSyncedGroup
// ---------------------------------------------------------------------------

test('joining refuses when the backend is not configured', async () => {
  backendConfigured = false;

  await assert.rejects(service.joinSyncedGroup('abc234'), /backend is not configured/);
});

test('joining normalises the code to trimmed uppercase before calling the RPC', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: null }));

  await service.joinSyncedGroup('  abc234 ');

  assert.deepEqual(supabase.callsFor('rpc:join_group_by_code')[0].payload, {
    group_join_code: 'ABC234',
  });
});

test('joining with an unknown code resolves to null without a follow-up read', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: null }));

  assert.equal(await service.joinSyncedGroup('ABC234'), null);
  assert.deepEqual(supabase.callsFor('groups'), []);
});

test('joining returns the freshly joined group', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: 'g1' }));
  supabase.respondTo('groups', () => ({ data: { id: 'g1', name: 'Alpha', group_members: [] } }));

  const group = await service.joinSyncedGroup('ABC234');

  assert.equal(group?.id, 'g1');
  assert.deepEqual(
    supabase.callsFor('groups')[0].steps.find((step) => step.method === 'eq')?.args,
    ['id', 'g1']
  );
});

test('joining a group the reader is already in resolves to that same group', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: 'g1' }));
  supabase.respondTo('groups', () => ({
    data: { id: 'g1', name: 'Alpha', group_members: [{ user_id: 'user-1', role: 'member' }] },
  }));

  const group = await service.joinSyncedGroup('ABC234');

  assert.equal(group?.id, 'g1');
  assert.equal(supabase.callsFor('rpc:join_group_by_code').length, 1);
  assert.deepEqual(supabase.callsFor('group_members'), [], "membership is the RPC's business");
});

test('joining surfaces an RPC failure', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({
    error: { message: 'join code no longer valid' },
  }));

  await assert.rejects(service.joinSyncedGroup('ABC234'), /join code no longer valid/);
});

// ---------------------------------------------------------------------------
// leaveSyncedGroup
// ---------------------------------------------------------------------------

test('leaving refuses when the backend is not configured', async () => {
  backendConfigured = false;

  await assert.rejects(service.leaveSyncedGroup('g1'), /backend is not configured/);
});

test('leaving calls the leave_group RPC with the target group', async () => {
  supabase.respondToRpc('leave_group', () => ({ data: null }));

  await service.leaveSyncedGroup('g1');

  assert.deepEqual(supabase.callsFor('rpc:leave_group')[0].payload, { target_group_id: 'g1' });
});

test('leaving surfaces an RPC failure', async () => {
  supabase.respondToRpc('leave_group', () => ({ error: { message: 'not a member' } }));

  await assert.rejects(service.leaveSyncedGroup('g1'), /not a member/);
});

// ---------------------------------------------------------------------------
// updateSyncedGroupLesson
// ---------------------------------------------------------------------------

test('updating the group lesson refuses when the backend is not configured', async () => {
  backendConfigured = false;

  await assert.rejects(
    service.updateSyncedGroupLesson('g1', {
      current_course_id: 'gospel-course',
      current_lesson_id: 'gospel-2',
    }),
    /backend is not configured/
  );
});

test('updating the group lesson refuses when nobody is signed in, naming the action', async () => {
  supabase.auth.setSession(null);

  await assert.rejects(
    service.updateSyncedGroupLesson('g1', {
      current_course_id: 'gospel-course',
      current_lesson_id: 'gospel-2',
    }),
    /must be signed in to update a group lesson/
  );
});

test('updating the group lesson surfaces an auth lookup failure', async () => {
  failAuthLookup('token revoked');

  await assert.rejects(
    service.updateSyncedGroupLesson('g1', {
      current_course_id: 'gospel-course',
      current_lesson_id: 'gospel-2',
    }),
    /token revoked/
  );
});

test('updating the group lesson writes both pointers to the target row', async () => {
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  const group = await service.updateSyncedGroupLesson('g1', {
    current_course_id: 'gospel-course',
    current_lesson_id: 'gospel-2',
  });

  const [call] = supabase.callsFor('groups');
  assert.equal(call.operation, 'update');
  assert.deepEqual(call.payload, {
    current_course_id: 'gospel-course',
    current_lesson_id: 'gospel-2',
  });
  assert.deepEqual(call.steps.find((step) => step.method === 'eq')?.args, ['id', 'g1']);
  assert.equal(group.current_lesson_id, 'gospel-2');
});

test('updating the group lesson surfaces an RLS failure from the update', async () => {
  supabase.respondTo('groups', () => ({
    error: { message: 'new row violates row-level security policy' },
  }));

  await assert.rejects(
    service.updateSyncedGroupLesson('g1', {
      current_course_id: 'gospel-course',
      current_lesson_id: 'gospel-2',
    }),
    /violates row-level security policy/
  );
});

// ---------------------------------------------------------------------------
// recordSyncedGroupSession
// ---------------------------------------------------------------------------

test('recording a session refuses when the backend is not configured', async () => {
  backendConfigured = false;

  await assert.rejects(
    service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' }),
    /backend is not configured/
  );
});

test('recording a session refuses when nobody is signed in, naming the action', async () => {
  supabase.auth.setSession(null);

  await assert.rejects(
    service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' }),
    /must be signed in to record a session/
  );
});

test('recording a session stores the lesson, the author and empty notes by default', async () => {
  supabase.respondTo('group_sessions', (call) => ({
    data: { id: 's1', ...(call.payload as object) },
  }));
  supabase.respondTo('groups', () => ({ data: { name: 'Alpha' } }));

  const session = await service.recordSyncedGroupSession({
    groupId: 'g1',
    courseId: 'c1',
    lessonId: 'l1',
  });
  await flushMicrotasks();

  const insert = supabase.callsFor('group_sessions')[0].payload as Record<string, unknown>;
  assert.deepEqual(insert, {
    group_id: 'g1',
    course_id: 'c1',
    lesson_id: 'l1',
    created_by: 'user-1',
    notes: {},
  });
  assert.equal(session.id, 's1');
});

test('session notes are stored as given', async () => {
  supabase.respondTo('group_sessions', (call) => ({
    data: { id: 's1', ...(call.payload as object) },
  }));
  supabase.respondTo('groups', () => ({ data: { name: 'Alpha' } }));

  await service.recordSyncedGroupSession({
    groupId: 'g1',
    courseId: 'c1',
    lessonId: 'l1',
    notes: { lookBack: 'went well' },
  });
  await flushMicrotasks();

  const insert = supabase.callsFor('group_sessions')[0].payload as Record<string, unknown>;
  assert.deepEqual(insert.notes, { lookBack: 'went well' });
});

test('recording a session surfaces an insert failure', async () => {
  supabase.respondTo('group_sessions', () => ({ error: { message: 'session insert denied' } }));

  await assert.rejects(
    service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' }),
    /session insert denied/
  );
});

test('a recorded session notifies the other members with the group name and excludes the author', async () => {
  supabase.respondTo('group_sessions', () => ({ data: { id: 's1' } }));
  supabase.respondTo('groups', () => ({ data: { name: 'Alpha' } }));

  await service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' });
  await flushMicrotasks();

  assert.deepEqual(supabase.functionCalls, [
    {
      name: 'send-group-notification',
      options: {
        body: {
          group_id: 'g1',
          title: 'notifications.groupSessionTitle',
          body: 'notifications.groupSessionBody({"groupName":"Alpha"})',
          exclude_user_id: 'user-1',
        },
      },
    },
  ]);
});

test('a missing group row still notifies, with an empty group name', async () => {
  supabase.respondTo('group_sessions', () => ({ data: { id: 's1' } }));
  supabase.respondTo('groups', () => ({ data: null }));

  await service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' });
  await flushMicrotasks();

  const body = supabase.functionCalls[0].options as { body: Record<string, unknown> };
  assert.equal(body.body.body, 'notifications.groupSessionBody({"groupName":""})');
});

test('the notification is sent only after the session row is safely inserted', async () => {
  const order: string[] = [];
  supabase.respondTo('group_sessions', () => {
    order.push('insert');
    return { data: { id: 's1' } };
  });
  supabase.respondTo('groups', () => ({ data: { name: 'Alpha' } }));
  supabase.respondToFunction((name) => {
    order.push(name);
    return { data: null };
  });

  await service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' });
  await flushMicrotasks();

  assert.deepEqual(order, ['insert', 'send-group-notification']);
});

test('a session recorded without a resolvable current user notifies without an exclusion', async () => {
  supabase.respondTo('group_sessions', () => ({ data: { id: 's1' } }));
  supabase.respondTo('groups', () => {
    // The signed-in check has already passed; simulate the session evaporating
    // before the fire-and-forget notification resolves the excluded user.
    supabase.auth.setUser(null);
    return { data: { name: 'Alpha' } };
  });

  await service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' });
  await flushMicrotasks();

  const options = supabase.functionCalls[0].options as { body: Record<string, unknown> };
  assert.equal(options.body.exclude_user_id, undefined);
});

test('a push notification failure never fails the session that was already recorded', async () => {
  supabase.respondTo('group_sessions', () => ({ data: { id: 's1' } }));
  supabase.respondTo('groups', () => ({ data: { name: 'Alpha' } }));
  supabase.respondToFunction(() => {
    throw new Error('edge function unreachable');
  });

  const session = await service.recordSyncedGroupSession({
    groupId: 'g1',
    courseId: 'c1',
    lessonId: 'l1',
  });
  await flushMicrotasks();

  assert.equal(session.id, 's1');
});

test('a group-name lookup failure never fails the session that was already recorded', async () => {
  supabase.respondTo('group_sessions', () => ({ data: { id: 's1' } }));
  supabase.respondTo('groups', () => {
    throw new Error('groups unreachable');
  });

  const session = await service.recordSyncedGroupSession({
    groupId: 'g1',
    courseId: 'c1',
    lessonId: 'l1',
  });
  await flushMicrotasks();

  assert.equal(session.id, 's1');
  assert.deepEqual(supabase.functionCalls, []);
});

// ---------------------------------------------------------------------------
// what the reads do and do not guard
// ---------------------------------------------------------------------------

test('listing synced groups still queries for a signed-out reader, leaving the gate to RLS', async () => {
  supabase.auth.setSession(null);
  supabase.respondTo('groups', () => ({ data: [] }));

  assert.deepEqual(await service.listSyncedGroups(), []);
  assert.equal(supabase.callsFor('groups').length, 1);
});

test('getting a synced group still queries for a signed-out reader, leaving the gate to RLS', async () => {
  supabase.auth.setSession(null);
  supabase.respondTo('groups', () => ({ data: null }));

  assert.equal(await service.getSyncedGroup('g1'), null);
  assert.equal(supabase.callsFor('groups').length, 1);
});

test('an RLS-filtered read of a group the reader cannot see is a missing group, not an error', async () => {
  supabase.respondTo('groups', () => ({ data: null }));

  assert.equal(await service.getSyncedGroup('someone-elses-group'), null);
});

test('a network failure while listing surfaces as an error rather than an empty list', async () => {
  supabase.respondTo('groups', () => ({
    error: { message: 'TypeError: Network request failed' },
  }));

  await assert.rejects(service.listSyncedGroups(), /Network request failed/);
});

// ---------------------------------------------------------------------------
// join and leave against a hostile backend
// ---------------------------------------------------------------------------

test('a join whose follow-up read finds nothing resolves to null rather than a half group', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: 'g1' }));
  supabase.respondTo('groups', () => ({ data: null }));

  assert.equal(await service.joinSyncedGroup('ABC234'), null);
});

test('a join whose follow-up read fails surfaces that error', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: 'g1' }));
  supabase.respondTo('groups', () => ({
    error: { message: 'permission denied for table groups', code: '42501' },
  }));

  await assert.rejects(service.joinSyncedGroup('ABC234'), /permission denied for table groups/);
});

test('an empty join code is still sent to the RPC, which owns the rejection', async () => {
  supabase.respondToRpc('join_group_by_code', () => ({ data: null }));

  assert.equal(await service.joinSyncedGroup('   '), null);
  assert.deepEqual(supabase.callsFor('rpc:join_group_by_code')[0].payload, {
    group_join_code: '',
  });
});

test('leaving surfaces an RLS failure from the RPC', async () => {
  supabase.respondToRpc('leave_group', () => ({
    error: { message: 'permission denied for function leave_group', code: '42501' },
  }));

  await assert.rejects(service.leaveSyncedGroup('g1'), /permission denied for function/);
});

test('leaving does not require a client-side auth check, only the RPC', async () => {
  supabase.auth.setSession(null);
  supabase.respondToRpc('leave_group', () => ({ data: null }));

  await service.leaveSyncedGroup('g1');

  assert.equal(supabase.callsFor('rpc:leave_group').length, 1);
});

// ---------------------------------------------------------------------------
// creation failures
// ---------------------------------------------------------------------------

test('a rollback that itself fails still reports the enrolment error to the caller', async () => {
  let groupCall = 0;
  supabase.respondTo('groups', () => {
    groupCall += 1;
    return groupCall === 1
      ? { data: { id: 'g1', name: 'Alpha' } }
      : { error: { message: 'delete denied' } };
  });
  supabase.respondTo('group_members', () => ({
    error: { message: 'group_members insert denied' },
  }));

  await assert.rejects(service.createSyncedGroup('Alpha'), /group_members insert denied/);
});

test('a unique-violation on the members table is not mistaken for a join-code collision', async () => {
  supabase.respondTo('groups', () => ({ data: { id: 'g1', name: 'Alpha' } }));
  supabase.respondTo('group_members', () => ({
    error: { message: 'duplicate key value violates unique constraint', code: '23505' },
  }));

  await assert.rejects(
    service.createSyncedGroup('Alpha'),
    /duplicate key value violates unique constraint/
  );
  assert.equal(supabase.callsFor('group_members').length, 1);
});

test('a group created for a signed-in leader records that leader, not the session user id', async () => {
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'leader-9' }) }));
  supabase.respondTo('groups', (call) => ({ data: { id: 'g1', ...(call.payload as object) } }));

  const group = await service.createSyncedGroup('Alpha');

  assert.equal(group.leader_id, 'leader-9');
  assert.deepEqual(
    group.group_members.map((member) => [member.user_id, member.role]),
    [['leader-9', 'leader']]
  );
});

// ---------------------------------------------------------------------------
// session recording failures
// ---------------------------------------------------------------------------

test('an RLS failure on the session insert surfaces and sends no notification', async () => {
  supabase.respondTo('group_sessions', () => ({
    error: { message: 'new row violates row-level security policy', code: '42501' },
  }));

  await assert.rejects(
    service.recordSyncedGroupSession({ groupId: 'g1', courseId: 'c1', lessonId: 'l1' }),
    /violates row-level security policy/
  );
  await flushMicrotasks();

  assert.deepEqual(supabase.functionCalls, []);
});

test('an insert that returns no row still reports success-shaped data to the caller', async () => {
  // Documents current behaviour: `.single()` without an error but without data
  // returns null, which the service casts to GroupSessionRecord. QUESTION for
  // review — should a null row be treated as a failure instead?
  supabase.respondTo('group_sessions', () => ({ data: null }));

  const session = await service.recordSyncedGroupSession({
    groupId: 'g1',
    courseId: 'c1',
    lessonId: 'l1',
  });
  await flushMicrotasks();

  assert.equal(session, null);
});
