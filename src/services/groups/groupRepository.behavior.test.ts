import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';
import type { Group, GroupProgress } from '../../types/course';
import type { SyncedGroupSummaryRecord } from './groupRepository';

// The repository blends locally-created groups (the real, MMKV-backed
// fourFieldsStore) with synced ones supplied through injected loaders, so MMKV is
// the only thing that needs mocking here.
const mmkv = mockMmkvStorage(mock);

let repository: typeof import('./groupRepository');
let useFourFieldsStore: typeof import('../../stores/fourFieldsStore').useFourFieldsStore;

before(async () => {
  repository = await import('./groupRepository');
  ({ useFourFieldsStore } = await import('../../stores/fourFieldsStore'));
});

const makeSyncedGroup = (
  overrides: Partial<SyncedGroupSummaryRecord> = {}
): SyncedGroupSummaryRecord => ({
  id: 'synced-1',
  name: 'Synced Harvest Group',
  join_code: 'SYNC42',
  current_course_id: 'gospel-course',
  current_lesson_id: 'gospel-2',
  group_members: [
    { user_id: 'leader-remote', role: 'leader', joined_at: '2026-03-11T00:00:00.000Z' },
    { user_id: 'member-remote', role: 'member', joined_at: '2026-03-11T01:00:00.000Z' },
  ],
  ...overrides,
});

const localGroups = (): Group[] => useFourFieldsStore.getState().groups;
const localProgress = (): Record<string, GroupProgress> =>
  useFourFieldsStore.getState().groupProgress;

beforeEach(() => {
  useFourFieldsStore.setState(useFourFieldsStore.getInitialState(), true);
  mmkv.store.clear();
});

// ---------------------------------------------------------------------------
// getGroupRepositoryMode
// ---------------------------------------------------------------------------

test('the repository is local-only while the sync rollout flag is off', () => {
  assert.equal(
    repository.getGroupRepositoryMode({
      syncFeatureEnabled: false,
      backendConfigured: true,
      signedIn: true,
    }),
    'local-only'
  );
});

test('the repository is local-only when the build has no backend, flag or not', () => {
  assert.equal(
    repository.getGroupRepositoryMode({
      syncFeatureEnabled: true,
      backendConfigured: false,
      signedIn: true,
    }),
    'local-only'
  );
});

test('the repository asks for sign-in only once the rollout and backend are both ready', () => {
  assert.equal(
    repository.getGroupRepositoryMode({
      syncFeatureEnabled: true,
      backendConfigured: true,
      signedIn: false,
    }),
    'signin-required'
  );
});

test('the repository is sync-enabled with the rollout, the backend and a signed-in reader', () => {
  assert.equal(
    repository.getGroupRepositoryMode({
      syncFeatureEnabled: true,
      backendConfigured: true,
      signedIn: true,
    }),
    'sync-enabled'
  );
});

// ---------------------------------------------------------------------------
// summary builders
// ---------------------------------------------------------------------------

test('a locally created group is summarised from the fourFields store, tagged local', () => {
  const created = useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');
  useFourFieldsStore.getState().joinGroup(created.joinCode, 'member-1', 'Bo');

  assert.deepEqual(repository.buildLocalGroupSummary(localGroups()[0]), {
    id: created.id,
    name: 'Harvest',
    joinCode: created.joinCode,
    memberCount: 2,
    currentCourseId: 'entry-course',
    currentLessonId: 'entry-1',
    source: 'local',
  });
});

test('a synced group summary maps snake_case columns onto the shared shape', () => {
  assert.deepEqual(repository.buildSyncedGroupSummary(makeSyncedGroup()), {
    id: 'synced-1',
    name: 'Synced Harvest Group',
    joinCode: 'SYNC42',
    memberCount: 2,
    currentCourseId: 'gospel-course',
    currentLessonId: 'gospel-2',
    source: 'synced',
  });
});

test('a synced group with no members summarises as a zero-member group', () => {
  assert.equal(
    repository.buildSyncedGroupSummary(makeSyncedGroup({ group_members: [] })).memberCount,
    0
  );
});

// ---------------------------------------------------------------------------
// buildGroupRepositorySnapshot
// ---------------------------------------------------------------------------

test('local-only mode hides synced groups but still lists every local one', () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: false,
    backendConfigured: true,
    signedIn: true,
    syncedGroups: [makeSyncedGroup()],
  });

  assert.equal(snapshot.mode, 'local-only');
  assert.equal(snapshot.localGroups.length, 1);
  assert.deepEqual(snapshot.syncedGroups, []);
});

test('sign-in-required mode keeps local groups visible and shows whatever synced rows it was given', () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: false,
    syncedGroups: [],
  });

  assert.equal(snapshot.mode, 'signin-required');
  assert.equal(snapshot.localGroups.length, 1);
  assert.deepEqual(snapshot.syncedGroups, []);
});

test('sync-enabled mode keeps local and synced groups in separate sections', () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    syncedGroups: [makeSyncedGroup()],
  });

  assert.deepEqual(
    snapshot.localGroups.map((group) => group.source),
    ['local']
  );
  assert.deepEqual(
    snapshot.syncedGroups.map((group) => group.source),
    ['synced']
  );
});

test('a reader with no groups at all gets two empty sections', () => {
  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    syncedGroups: [],
  });

  assert.deepEqual(snapshot, { mode: 'sync-enabled', localGroups: [], syncedGroups: [] });
});

// ---------------------------------------------------------------------------
// loadGroupRepositorySnapshot
// ---------------------------------------------------------------------------

test('loading a sync-enabled snapshot fetches the synced groups once', async () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');
  let calls = 0;

  const snapshot = await repository.loadGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    listSyncedGroups: async () => {
      calls += 1;
      return [makeSyncedGroup()];
    },
  });

  assert.equal(calls, 1);
  assert.equal(snapshot.mode, 'sync-enabled');
  assert.deepEqual(
    snapshot.syncedGroups.map((group) => group.id),
    ['synced-1']
  );
});

test('loading never hits the network while the sync rollout flag is off', async () => {
  let calls = 0;

  const snapshot = await repository.loadGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: false,
    backendConfigured: true,
    signedIn: true,
    listSyncedGroups: async () => {
      calls += 1;
      return [makeSyncedGroup()];
    },
  });

  assert.equal(calls, 0);
  assert.equal(snapshot.mode, 'local-only');
});

test('loading never hits the network when the build has no backend', async () => {
  let calls = 0;

  await repository.loadGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: true,
    backendConfigured: false,
    signedIn: true,
    listSyncedGroups: async () => {
      calls += 1;
      return [];
    },
  });

  assert.equal(calls, 0);
});

test('loading never hits the network for a signed-out reader', async () => {
  let calls = 0;

  const snapshot = await repository.loadGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: false,
    listSyncedGroups: async () => {
      calls += 1;
      return [];
    },
  });

  assert.equal(calls, 0);
  assert.equal(snapshot.mode, 'signin-required');
});

test('loading without a synced-group loader still returns the local section', async () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const snapshot = await repository.loadGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
  });

  assert.equal(snapshot.mode, 'sync-enabled');
  assert.equal(snapshot.localGroups.length, 1);
  assert.deepEqual(snapshot.syncedGroups, []);
});

test('a failing synced-group fetch rejects rather than silently dropping the section', async () => {
  await assert.rejects(
    repository.loadGroupRepositorySnapshot({
      localGroups: [],
      syncFeatureEnabled: true,
      backendConfigured: true,
      signedIn: true,
      listSyncedGroups: async () => {
        throw new Error('permission denied for table groups');
      },
    }),
    /permission denied for table groups/
  );
});

// ---------------------------------------------------------------------------
// buildGroupDetailSnapshot
// ---------------------------------------------------------------------------

test('a local group detail carries member names, roles and its completed-lesson count', () => {
  const created = useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');
  useFourFieldsStore.getState().joinGroup(created.joinCode, 'member-1', 'Bo');
  useFourFieldsStore.getState().markGroupLessonComplete(created.id, 'entry-1');

  const detail = repository.buildGroupDetailSnapshot({
    localGroup: localGroups()[0],
    localProgress: localProgress()[created.id],
    syncedGroup: null,
    currentUserId: 'leader-1',
  });

  assert.equal(detail?.source, 'local');
  assert.equal(detail?.isLeader, true);
  assert.equal(detail?.completedLessonCount, 1);
  assert.deepEqual(
    detail?.members.map((member) => [member.id, member.name, member.role]),
    [
      ['leader-1', 'Ada', 'leader'],
      ['member-1', 'Bo', 'member'],
    ]
  );
});

test('a local group member who is not the leader is not marked as one', () => {
  const created = useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');
  useFourFieldsStore.getState().joinGroup(created.joinCode, 'member-1', 'Bo');

  const detail = repository.buildGroupDetailSnapshot({
    localGroup: localGroups()[0],
    localProgress: null,
    syncedGroup: null,
    currentUserId: 'member-1',
  });

  assert.equal(detail?.isLeader, false);
});

test('a local group with no recorded progress reports zero completed lessons, not null', () => {
  useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const detail = repository.buildGroupDetailSnapshot({
    localGroup: localGroups()[0],
    localProgress: null,
    syncedGroup: null,
    currentUserId: 'leader-1',
  });

  assert.equal(detail?.completedLessonCount, 0);
});

test('a local group always wins over a synced group of the same id', () => {
  useFourFieldsStore.getState().createGroup('Local wins', 'leader-1', 'Ada');

  const detail = repository.buildGroupDetailSnapshot({
    localGroup: localGroups()[0],
    localProgress: null,
    syncedGroup: makeSyncedGroup(),
    currentUserId: 'leader-1',
  });

  assert.equal(detail?.name, 'Local wins');
  assert.equal(detail?.source, 'local');
});

test('a synced group detail maps members by user id and leaves names to be resolved later', () => {
  const detail = repository.buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup: makeSyncedGroup(),
    currentUserId: 'leader-remote',
  });

  assert.equal(detail?.source, 'synced');
  assert.equal(detail?.isLeader, true);
  assert.deepEqual(detail?.members, [
    {
      id: 'leader-remote',
      name: null,
      role: 'leader',
      joinedAt: Date.parse('2026-03-11T00:00:00.000Z'),
    },
    {
      id: 'member-remote',
      name: null,
      role: 'member',
      joinedAt: Date.parse('2026-03-11T01:00:00.000Z'),
    },
  ]);
});

test('a synced group detail never invents a local completed-lesson count', () => {
  const detail = repository.buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup: makeSyncedGroup(),
    currentUserId: 'member-remote',
  });

  assert.equal(detail?.completedLessonCount, null);
  assert.equal(detail?.isLeader, false);
});

test('a group that exists neither locally nor remotely has no detail snapshot', () => {
  assert.equal(
    repository.buildGroupDetailSnapshot({
      localGroup: null,
      localProgress: null,
      syncedGroup: null,
      currentUserId: 'user-1',
    }),
    null
  );
});

// ---------------------------------------------------------------------------
// loadGroupDetailSnapshot
// ---------------------------------------------------------------------------

test('a local group is resolved from the store without touching the network', async () => {
  const created = useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');
  useFourFieldsStore.getState().markGroupLessonComplete(created.id, 'entry-1');
  let calls = 0;

  const detail = await repository.loadGroupDetailSnapshot({
    groupId: created.id,
    localGroups: localGroups(),
    localProgress: localProgress(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'leader-1',
    getSyncedGroup: async () => {
      calls += 1;
      return makeSyncedGroup();
    },
  });

  assert.equal(calls, 0);
  assert.equal(detail?.source, 'local');
  assert.equal(detail?.completedLessonCount, 1);
});

test('a group id that is not local falls through to the synced loader', async () => {
  const detail = await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'leader-remote',
    getSyncedGroup: async (groupId) => makeSyncedGroup({ id: groupId }),
  });

  assert.equal(detail?.id, 'synced-1');
  assert.equal(detail?.source, 'synced');
});

test('a synced loader that finds nothing yields no detail snapshot', async () => {
  const detail = await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'user-1',
    getSyncedGroup: async () => null,
  });

  assert.equal(detail, null);
});

test('a non-local group is not fetched while the sync rollout flag is off', async () => {
  let calls = 0;

  const detail = await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: false,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'user-1',
    getSyncedGroup: async () => {
      calls += 1;
      return makeSyncedGroup();
    },
  });

  assert.equal(calls, 0);
  assert.equal(detail, null);
});

test('a non-local group is not fetched when the build has no backend', async () => {
  let calls = 0;

  await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: true,
    backendConfigured: false,
    signedIn: true,
    currentUserId: 'user-1',
    getSyncedGroup: async () => {
      calls += 1;
      return makeSyncedGroup();
    },
  });

  assert.equal(calls, 0);
});

test('a non-local group is not fetched for a signed-out reader', async () => {
  let calls = 0;

  await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: false,
    currentUserId: null,
    getSyncedGroup: async () => {
      calls += 1;
      return makeSyncedGroup();
    },
  });

  assert.equal(calls, 0);
});

test('a non-local group with no synced loader yields no detail snapshot', async () => {
  const detail = await repository.loadGroupDetailSnapshot({
    groupId: 'synced-1',
    localGroups: [],
    localProgress: {},
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'user-1',
  });

  assert.equal(detail, null);
});

test('a local group is still resolved when sync is unavailable entirely', async () => {
  const created = useFourFieldsStore.getState().createGroup('Harvest', 'leader-1', 'Ada');

  const detail = await repository.loadGroupDetailSnapshot({
    groupId: created.id,
    localGroups: localGroups(),
    localProgress: localProgress(),
    syncFeatureEnabled: false,
    backendConfigured: false,
    signedIn: false,
    currentUserId: 'leader-1',
  });

  assert.equal(detail?.source, 'local');
});

test('a failing synced detail fetch rejects rather than degrading to null', async () => {
  await assert.rejects(
    repository.loadGroupDetailSnapshot({
      groupId: 'synced-1',
      localGroups: [],
      localProgress: {},
      syncFeatureEnabled: true,
      backendConfigured: true,
      signedIn: true,
      currentUserId: 'user-1',
      getSyncedGroup: async () => {
        throw new Error('row level security');
      },
    }),
    /row level security/
  );
});

// ---------------------------------------------------------------------------
// the rollout gate, exhaustively
// ---------------------------------------------------------------------------

test('the mode is decided by the flag first, the backend second and the session last', () => {
  const modes = [false, true].flatMap((syncFeatureEnabled) =>
    [false, true].flatMap((backendConfigured) =>
      [false, true].map((signedIn) => [
        [syncFeatureEnabled, backendConfigured, signedIn],
        repository.getGroupRepositoryMode({ syncFeatureEnabled, backendConfigured, signedIn }),
      ])
    )
  );

  assert.deepEqual(modes, [
    [[false, false, false], 'local-only'],
    [[false, false, true], 'local-only'],
    [[false, true, false], 'local-only'],
    [[false, true, true], 'local-only'],
    [[true, false, false], 'local-only'],
    [[true, false, true], 'local-only'],
    [[true, true, false], 'signin-required'],
    [[true, true, true], 'sync-enabled'],
  ]);
});

test('a signed-in reader behind the rollout flag never sees the synced section', () => {
  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: false,
    backendConfigured: true,
    signedIn: true,
    syncedGroups: [makeSyncedGroup()],
  });

  assert.deepEqual(snapshot, { mode: 'local-only', localGroups: [], syncedGroups: [] });
});

test('sign-in-required mode drops the synced rows only when the build has no backend', () => {
  const noBackend = repository.buildGroupRepositorySnapshot({
    localGroups: [],
    syncFeatureEnabled: true,
    backendConfigured: false,
    signedIn: true,
    syncedGroups: [makeSyncedGroup()],
  });

  assert.deepEqual(noBackend.syncedGroups, []);
  assert.equal(noBackend.mode, 'local-only');
});

test('a synced group summary keeps its own id space, distinct from local groups', () => {
  useFourFieldsStore.getState().createGroup('Tuesday Night', 'leader-1', 'Lee');

  const snapshot = repository.buildGroupRepositorySnapshot({
    localGroups: localGroups(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    syncedGroups: [makeSyncedGroup()],
  });

  assert.deepEqual(
    snapshot.localGroups.map((group) => group.source),
    ['local']
  );
  assert.deepEqual(
    snapshot.syncedGroups.map((group) => [group.id, group.source]),
    [['synced-1', 'synced']]
  );
});

// ---------------------------------------------------------------------------
// detail snapshot edges
// ---------------------------------------------------------------------------

test('a synced group is never led by nobody, so a signed-out reader is not its leader', () => {
  const detail = repository.buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup: makeSyncedGroup(),
    currentUserId: null,
  });

  assert.equal(detail?.isLeader, false);
});

test('a local group is never led by nobody either', () => {
  useFourFieldsStore.getState().createGroup('Tuesday Night', 'leader-1', 'Lee');

  const detail = repository.buildGroupDetailSnapshot({
    localGroup: localGroups()[0],
    localProgress: null,
    syncedGroup: null,
    currentUserId: null,
  });

  assert.equal(detail?.isLeader, false);
});

test('a synced group with no members at all still resolves to a snapshot', () => {
  const detail = repository.buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup: makeSyncedGroup({ group_members: [] }),
    currentUserId: 'leader-remote',
  });

  assert.deepEqual([detail?.memberCount, detail?.members, detail?.isLeader], [0, [], false]);
});

// Documents current behaviour, and the one place the `number | null` contract on
// GroupDetailMember.joinedAt can be broken: an unparseable timestamp becomes
// NaN, which is not null, so GroupDetailScreen renders "Invalid Date" instead of
// its "joined recently" fallback. Not reachable through the real backend today —
// group_members.joined_at is TIMESTAMPTZ NOT NULL DEFAULT NOW() — so this is
// flagged rather than fixed. QUESTION for review: should the parse fall back to
// null (`Number.isFinite(parsed) ? parsed : null`) to honour the contract?
test('an unparseable joined_at currently becomes NaN rather than the null the type allows', () => {
  const detail = repository.buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup: makeSyncedGroup({
      group_members: [{ user_id: 'member-remote', role: 'member', joined_at: 'not a date' }],
    }),
    currentUserId: 'member-remote',
  });

  assert.equal(Number.isNaN(detail?.members[0].joinedAt), true);
});

test('progress recorded for a different group is not counted against this one', async () => {
  const kept = useFourFieldsStore.getState().createGroup('Kept', 'leader-1', 'Lee');
  const other = useFourFieldsStore.getState().createGroup('Other', 'leader-1', 'Lee');
  useFourFieldsStore.getState().markGroupLessonComplete(other.id, 'entry-1');

  const detail = await repository.loadGroupDetailSnapshot({
    groupId: kept.id,
    localGroups: localGroups(),
    localProgress: localProgress(),
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    currentUserId: 'leader-1',
    getSyncedGroup: async () => null,
  });

  assert.equal(detail?.completedLessonCount, 0);
});

test('a local group detail counts the lessons that group has actually completed', async () => {
  const group = useFourFieldsStore.getState().createGroup('Kept', 'leader-1', 'Lee');
  useFourFieldsStore.getState().markGroupLessonComplete(group.id, 'entry-1');
  useFourFieldsStore.getState().markGroupLessonComplete(group.id, 'entry-2');

  const detail = await repository.loadGroupDetailSnapshot({
    groupId: group.id,
    localGroups: localGroups(),
    localProgress: localProgress(),
    syncFeatureEnabled: false,
    backendConfigured: false,
    signedIn: false,
    currentUserId: 'leader-1',
    getSyncedGroup: async () => null,
  });

  assert.equal(detail?.completedLessonCount, 2);
  assert.equal(detail?.isLeader, true);
});
