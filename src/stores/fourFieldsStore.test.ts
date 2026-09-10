import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import type { Group } from '../types/course';

// One mock configuration per file: this persisted store only needs MMKV.
const mmkv = mockMmkvStorage(mock);

let useFourFieldsStore: typeof import('./fourFieldsStore').useFourFieldsStore;

before(async () => {
  ({ useFourFieldsStore } = await import('./fourFieldsStore'));
});

const state = () => useFourFieldsStore.getState();
const readPersisted = () => JSON.parse(mmkv.store.get('four-fields-storage') ?? '{}');

/** Seed the MMKV slot the way a previous app version would have left it. */
const seedStorage = (persistedState: unknown, version: number) => {
  mmkv.store.set('four-fields-storage', JSON.stringify({ state: persistedState, version }));
};

const makeStoredGroup = (overrides: Partial<Group> = {}): Group => ({
  id: 'group-stored',
  name: 'Stored Group',
  joinCode: 'ABC234',
  createdAt: 1_710_000_000_000,
  createdBy: 'leader-1',
  currentCourseId: 'entry-course',
  currentLessonId: 'entry-1',
  members: [
    { id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 1_710_000_000_000 },
    { id: 'member-1', name: 'Member', role: 'member', joinedAt: 1_710_003_600_000 },
  ],
  ...overrides,
});

beforeEach(() => {
  useFourFieldsStore.setState(useFourFieldsStore.getInitialState(), true);
  mmkv.store.clear();
});

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

test('creating a group stores it with the creator as its only leader member', () => {
  const group = state().createGroup('Harvest Group', 'user-1', 'Ada');

  assert.equal(group.name, 'Harvest Group');
  assert.equal(group.createdBy, 'user-1');
  assert.equal(group.currentCourseId, 'entry-course');
  assert.equal(group.currentLessonId, 'entry-1');
  assert.deepEqual(group.members, [
    { id: 'user-1', name: 'Ada', role: 'leader', joinedAt: group.members[0].joinedAt },
  ]);
  assert.deepEqual(state().groups, [group]);
});

test('creating a group makes it the active group and seeds empty progress for it', () => {
  const group = state().createGroup('Harvest Group', 'user-1', 'Ada');

  assert.equal(state().activeGroupId, group.id);
  assert.deepEqual(state().getGroupProgress(group.id), {
    groupId: group.id,
    completedLessons: [],
    notes: {},
  });
});

test('creating a group persists the group and its progress to MMKV', () => {
  const group = state().createGroup('Harvest Group', 'user-1', 'Ada');

  const persisted = readPersisted();
  assert.equal(persisted.version, 1);
  assert.deepEqual(persisted.state.groups, [group]);
  assert.equal(persisted.state.activeGroupId, group.id);
  assert.deepEqual(persisted.state.groupProgress[group.id].completedLessons, []);
});

test('a generated join code is six characters drawn from the unambiguous alphabet', () => {
  const group = state().createGroup('Harvest Group', 'user-1', 'Ada');

  assert.match(group.joinCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
});

// generateJoinCode / generateId read Math.random directly with no injection seam,
// so uniqueness is asserted statistically rather than against a seeded sequence.
test('repeated group creation yields distinct ids and join codes', () => {
  const created = Array.from({ length: 50 }, (_, index) =>
    state().createGroup(`Group ${index}`, `user-${index}`, `Member ${index}`)
  );

  assert.equal(new Set(created.map((group) => group.id)).size, 50);
  assert.equal(new Set(created.map((group) => group.joinCode)).size, 50);
  assert.equal(state().groups.length, 50);
});

test('creating a second group appends it and moves the active group pointer', () => {
  const first = state().createGroup('First', 'user-1', 'Ada');
  const second = state().createGroup('Second', 'user-1', 'Ada');

  assert.deepEqual(
    state().groups.map((group) => group.id),
    [first.id, second.id]
  );
  assert.equal(state().activeGroupId, second.id);
});

// ---------------------------------------------------------------------------
// joinGroup
// ---------------------------------------------------------------------------

test('joining by code adds the caller as a member and activates the group', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  const joined = state().joinGroup(group.joinCode, 'user-2', 'Bo');

  assert.equal(joined, true);
  assert.deepEqual(
    state()
      .getGroup(group.id)
      ?.members.map((member) => [member.id, member.role]),
    [
      ['leader-1', 'leader'],
      ['user-2', 'member'],
    ]
  );
  assert.equal(state().activeGroupId, group.id);
});

test('join codes are matched case-insensitively', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  assert.equal(state().joinGroup(group.joinCode.toLowerCase(), 'user-2', 'Bo'), true);
  assert.equal(state().getGroup(group.id)?.members.length, 2);
});

test('joining with an unknown code fails and leaves every group untouched', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');
  state().setActiveGroup(null);

  assert.equal(state().joinGroup('ZZZZZZ', 'user-2', 'Bo'), false);
  assert.equal(state().getGroup(group.id)?.members.length, 1);
  assert.equal(state().activeGroupId, null);
});

test('joining a group the user already belongs to is rejected without duplicating them', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  assert.equal(state().joinGroup(group.joinCode, 'leader-1', 'Ada'), false);
  assert.equal(state().getGroup(group.id)?.members.length, 1);
});

test('joining persists the enlarged member list', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');
  state().joinGroup(group.joinCode, 'user-2', 'Bo');

  assert.equal(readPersisted().state.groups[0].members.length, 2);
});

// ---------------------------------------------------------------------------
// leaveGroup
// ---------------------------------------------------------------------------

test('a member leaving is removed while the group and its progress survive', () => {
  useFourFieldsStore.setState({
    groups: [makeStoredGroup()],
    activeGroupId: 'group-stored',
    groupProgress: {
      'group-stored': { groupId: 'group-stored', completedLessons: ['entry-1'], notes: {} },
    },
  });

  state().leaveGroup('group-stored', 'member-1');

  assert.deepEqual(
    state()
      .getGroup('group-stored')
      ?.members.map((member) => member.id),
    ['leader-1']
  );
  assert.deepEqual(state().getGroupProgress('group-stored')?.completedLessons, ['entry-1']);
});

test('leaving always clears the active group pointer when it pointed at that group', () => {
  useFourFieldsStore.setState({
    groups: [makeStoredGroup()],
    activeGroupId: 'group-stored',
  });

  state().leaveGroup('group-stored', 'member-1');

  assert.equal(state().activeGroupId, null);
});

test('leaving a group other than the active one keeps the active pointer intact', () => {
  useFourFieldsStore.setState({
    groups: [makeStoredGroup(), makeStoredGroup({ id: 'group-other', joinCode: 'DEF345' })],
    activeGroupId: 'group-other',
  });

  state().leaveGroup('group-stored', 'member-1');

  assert.equal(state().activeGroupId, 'group-other');
});

test('when the leader leaves the earliest-joined remaining member is promoted', () => {
  useFourFieldsStore.setState({
    groups: [
      makeStoredGroup({
        members: [
          { id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 100 },
          { id: 'late', name: 'Late', role: 'member', joinedAt: 300 },
          { id: 'early', name: 'Early', role: 'member', joinedAt: 200 },
        ],
      }),
    ],
  });

  state().leaveGroup('group-stored', 'leader-1');

  assert.deepEqual(
    state()
      .getGroup('group-stored')
      ?.members.map((member) => [member.id, member.role]),
    [
      ['late', 'member'],
      ['early', 'leader'],
    ]
  );
});

test('the last member leaving deletes the group and its progress entry', () => {
  useFourFieldsStore.setState({
    groups: [
      makeStoredGroup({
        members: [{ id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 100 }],
      }),
      makeStoredGroup({ id: 'group-keep', joinCode: 'DEF345' }),
    ],
    activeGroupId: 'group-stored',
    groupProgress: {
      'group-stored': { groupId: 'group-stored', completedLessons: ['entry-1'], notes: {} },
      'group-keep': { groupId: 'group-keep', completedLessons: [], notes: {} },
    },
  });

  state().leaveGroup('group-stored', 'leader-1');

  assert.deepEqual(
    state().groups.map((group) => group.id),
    ['group-keep']
  );
  assert.deepEqual(Object.keys(state().groupProgress), ['group-keep']);
  assert.equal(state().activeGroupId, null);
  assert.equal(readPersisted().state.groups.length, 1);
});

test('deleting an emptied group keeps an active pointer aimed elsewhere', () => {
  useFourFieldsStore.setState({
    groups: [
      makeStoredGroup({
        members: [{ id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 100 }],
      }),
      makeStoredGroup({ id: 'group-active', joinCode: 'DEF345' }),
    ],
    activeGroupId: 'group-active',
    groupProgress: {
      'group-stored': { groupId: 'group-stored', completedLessons: [], notes: {} },
    },
  });

  state().leaveGroup('group-stored', 'leader-1');

  assert.deepEqual(
    state().groups.map((group) => group.id),
    ['group-active']
  );
  assert.equal(state().activeGroupId, 'group-active');
  assert.deepEqual(state().groupProgress, {});
});

test('leaving an unknown group is a no-op', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');
  const before = state().groups;

  state().leaveGroup('does-not-exist', 'leader-1');

  assert.equal(state().groups, before);
  assert.equal(state().activeGroupId, group.id);
});

test('a non-member leaving keeps the roster and does not re-promote a leader', () => {
  useFourFieldsStore.setState({ groups: [makeStoredGroup()] });

  state().leaveGroup('group-stored', 'stranger');

  assert.deepEqual(
    state()
      .getGroup('group-stored')
      ?.members.map((member) => [member.id, member.role]),
    [
      ['leader-1', 'leader'],
      ['member-1', 'member'],
    ]
  );
});

// ---------------------------------------------------------------------------
// setActiveGroup / lesson pointer
// ---------------------------------------------------------------------------

test('setting the active group updates the pointer and persists it', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  state().setActiveGroup(null);
  assert.equal(state().activeGroupId, null);
  assert.equal(readPersisted().state.activeGroupId, null);

  state().setActiveGroup(group.id);
  assert.equal(state().activeGroupId, group.id);
});

test('getActiveGroup returns null when nothing is active and null for a dangling pointer', () => {
  assert.equal(state().getActiveGroup(), null);

  useFourFieldsStore.setState({ activeGroupId: 'ghost' });
  assert.equal(state().getActiveGroup(), null);
});

test('getActiveGroup resolves the pointer to the stored group', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  assert.deepEqual(state().getActiveGroup(), group);
});

test('updating the group lesson moves only that group forward', () => {
  useFourFieldsStore.setState({
    groups: [makeStoredGroup(), makeStoredGroup({ id: 'group-other', joinCode: 'DEF345' })],
  });

  state().updateGroupLesson('group-stored', 'gospel-course', 'gospel-2');

  assert.deepEqual(
    state().groups.map((group) => [group.currentCourseId, group.currentLessonId]),
    [
      ['gospel-course', 'gospel-2'],
      ['entry-course', 'entry-1'],
    ]
  );
  assert.equal(readPersisted().state.groups[0].currentLessonId, 'gospel-2');
});

test('updating the lesson of an unknown group changes nothing', () => {
  useFourFieldsStore.setState({ groups: [makeStoredGroup()] });

  state().updateGroupLesson('ghost', 'gospel-course', 'gospel-2');

  assert.equal(state().getGroup('group-stored')?.currentLessonId, 'entry-1');
});

// ---------------------------------------------------------------------------
// group progress: completions and notes
// ---------------------------------------------------------------------------

test('marking a group lesson complete creates the progress record on first use', () => {
  state().markGroupLessonComplete('group-stored', 'entry-1');

  assert.deepEqual(state().getGroupProgress('group-stored'), {
    groupId: 'group-stored',
    completedLessons: ['entry-1'],
    notes: {},
  });
});

test('completed group lessons accumulate in completion order', () => {
  state().markGroupLessonComplete('group-stored', 'entry-1');
  state().markGroupLessonComplete('group-stored', 'entry-2');

  assert.deepEqual(state().getGroupProgress('group-stored')?.completedLessons, [
    'entry-1',
    'entry-2',
  ]);
});

test('marking the same group lesson complete twice is idempotent', () => {
  state().markGroupLessonComplete('group-stored', 'entry-1');
  const first = state().groupProgress;

  state().markGroupLessonComplete('group-stored', 'entry-1');

  assert.equal(state().groupProgress, first);
});

test('marking a lesson complete preserves notes already recorded for that group', () => {
  state().addGroupNote('group-stored', 'entry-1', 'Looking back went well');
  state().markGroupLessonComplete('group-stored', 'entry-1');

  assert.deepEqual(state().getGroupProgress('group-stored'), {
    groupId: 'group-stored',
    completedLessons: ['entry-1'],
    notes: { 'entry-1': 'Looking back went well' },
  });
});

test('adding a group note creates the progress record and persists the note', () => {
  state().addGroupNote('group-stored', 'entry-1', 'Session notes');

  assert.deepEqual(state().getGroupProgress('group-stored')?.notes, {
    'entry-1': 'Session notes',
  });
  assert.equal(
    readPersisted().state.groupProgress['group-stored'].notes['entry-1'],
    'Session notes'
  );
});

test('re-adding a note for the same lesson overwrites it and leaves other lessons alone', () => {
  state().addGroupNote('group-stored', 'entry-1', 'First pass');
  state().addGroupNote('group-stored', 'entry-2', 'Other lesson');
  state().addGroupNote('group-stored', 'entry-1', 'Revised');

  assert.deepEqual(state().getGroupProgress('group-stored')?.notes, {
    'entry-1': 'Revised',
    'entry-2': 'Other lesson',
  });
});

test('progress for one group never leaks into another', () => {
  state().markGroupLessonComplete('group-a', 'entry-1');
  state().addGroupNote('group-b', 'entry-1', 'B note');

  assert.deepEqual(state().getGroupProgress('group-a')?.completedLessons, ['entry-1']);
  assert.deepEqual(state().getGroupProgress('group-b')?.completedLessons, []);
  assert.deepEqual(state().getGroupProgress('group-a')?.notes, {});
});

test('getGroupProgress is undefined for a group that has recorded nothing', () => {
  assert.equal(state().getGroupProgress('never-used'), undefined);
});

// ---------------------------------------------------------------------------
// getters
// ---------------------------------------------------------------------------

test('getGroup is undefined for an unknown id', () => {
  assert.equal(state().getGroup('nope'), undefined);
});

test('getGroupByCode finds a group case-insensitively and is undefined otherwise', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');

  assert.deepEqual(state().getGroupByCode(group.joinCode.toLowerCase()), group);
  assert.equal(state().getGroupByCode('ZZZZZZ'), undefined);
});

// ---------------------------------------------------------------------------
// resetForSignOut
// ---------------------------------------------------------------------------

test('resetForSignOut clears every per-user field back to its initial value', () => {
  const group = state().createGroup('Harvest Group', 'leader-1', 'Ada');
  state().markGroupLessonComplete(group.id, 'entry-1');
  state().addGroupNote(group.id, 'entry-1', 'notes');
  useFourFieldsStore.setState({
    completedLessons: { 'entry-course': ['entry-1'] },
    practiceCompleted: { 'entry-1': true },
    taughtCompleted: { 'entry-1': true },
    currentField: 'gospel',
    currentCourseId: 'entry-course',
    currentLessonId: 'entry-1',
  });

  state().resetForSignOut();

  assert.deepEqual(
    {
      completedLessons: state().completedLessons,
      practiceCompleted: state().practiceCompleted,
      taughtCompleted: state().taughtCompleted,
      currentField: state().currentField,
      currentCourseId: state().currentCourseId,
      currentLessonId: state().currentLessonId,
      groups: state().groups,
      activeGroupId: state().activeGroupId,
      groupProgress: state().groupProgress,
    },
    {
      completedLessons: {},
      practiceCompleted: {},
      taughtCompleted: {},
      currentField: 'entry',
      currentCourseId: null,
      currentLessonId: null,
      groups: [],
      activeGroupId: null,
      groupProgress: {},
    }
  );
});

test('resetForSignOut wipes the persisted snapshot too, so the next account starts clean', () => {
  state().createGroup('Harvest Group', 'leader-1', 'Ada');

  state().resetForSignOut();

  assert.deepEqual(readPersisted().state.groups, []);
  assert.equal(readPersisted().state.activeGroupId, null);
  assert.deepEqual(readPersisted().state.groupProgress, {});
});

test('resetForSignOut leaves the group actions callable afterwards', () => {
  state().resetForSignOut();

  const group = state().createGroup('Fresh', 'user-9', 'Cy');
  assert.deepEqual(state().groups, [group]);
});

// ---------------------------------------------------------------------------
// hydration and migration
// ---------------------------------------------------------------------------

test('a version-1 snapshot hydrates groups, progress and the active pointer verbatim', async () => {
  const stored = makeStoredGroup();
  seedStorage(
    {
      groups: [stored],
      activeGroupId: stored.id,
      groupProgress: {
        [stored.id]: {
          groupId: stored.id,
          completedLessons: ['entry-1'],
          notes: { 'entry-1': 'n' },
        },
      },
      currentField: 'discipleship',
      completedLessons: { 'entry-course': ['entry-1'] },
      practiceCompleted: { 'entry-1': true },
      taughtCompleted: {},
      currentCourseId: 'entry-course',
      currentLessonId: 'entry-1',
    },
    1
  );

  await useFourFieldsStore.persist.rehydrate();

  assert.deepEqual(state().groups, [stored]);
  assert.equal(state().activeGroupId, stored.id);
  assert.equal(state().currentField, 'discipleship');
  assert.deepEqual(state().getGroupProgress(stored.id)?.completedLessons, ['entry-1']);
});

test('migrating a legacy version-0 snapshot keeps a valid field selection', async () => {
  seedStorage({ currentField: 'multiplication', groups: [makeStoredGroup()] }, 0);

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField, 'multiplication');
  assert.equal(state().groups.length, 1);
});

test('migrating a legacy snapshot with an unknown field falls back to entry', async () => {
  seedStorage({ currentField: 'harvest-field-99', groups: [] }, 0);

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField, 'entry');
});

test('migrating a legacy snapshot with no field at all falls back to entry', async () => {
  seedStorage({ groups: [], activeGroupId: null }, 0);

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField, 'entry');
});

test('migration rewrites the stored snapshot at the current version', async () => {
  seedStorage({ currentField: 'bogus', groups: [] }, 0);

  await useFourFieldsStore.persist.rehydrate();

  const persisted = readPersisted();
  assert.equal(persisted.version, 1);
  assert.equal(persisted.state.currentField, 'entry');
});

test('an empty storage slot leaves the store on its initial state', async () => {
  await useFourFieldsStore.persist.rehydrate();

  assert.deepEqual(state().groups, []);
  assert.equal(state().currentField, 'entry');
  assert.equal(state().activeGroupId, null);
});

// Documents current behaviour. `normalizePersistedState` only runs through
// `migrate`, which zustand calls when the stored version differs from 1. A
// snapshot already stamped version 1 (i.e. anything this build wrote) bypasses
// the field sanitizer entirely. QUESTION for review: is the sanitizer meant to
// be a one-time migration, or should it also guard same-version hydration?
test('a same-version snapshot bypasses the field sanitizer and keeps an invalid field', async () => {
  seedStorage({ currentField: 'not-a-field', groups: [] }, 1);

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField as string, 'not-a-field');
});

// Same story for group shapes: there is no group sanitizer at all, so a
// half-written group survives hydration and only fails when something reads its
// members. QUESTION for review — other stores run persistedStateSanitizers here.
test('a malformed persisted group hydrates unchecked and only fails when read', async () => {
  seedStorage(
    { groups: [{ id: 'broken', name: 'Broken', joinCode: 'ABC234' }], activeGroupId: 'broken' },
    1
  );

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().groups.length, 1);
  assert.throws(() => state().joinGroup('ABC234', 'user-2', 'Bo'), { name: 'TypeError' });
});

// ---------------------------------------------------------------------------
// more legacy snapshot shapes
// ---------------------------------------------------------------------------

test('a legacy snapshot stored as null migrates to a clean initial state', async () => {
  seedStorage(null, 0);

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField, 'entry');
  assert.deepEqual(state().groups, []);
  assert.deepEqual(state().groupProgress, {});
});

test('a legacy snapshot carrying only lesson progress keeps it and gains the group fields', async () => {
  // The shape shipped before groups existed: completion maps and a field, no
  // groups/groupProgress keys at all.
  seedStorage(
    {
      completedLessons: { 'entry-course': ['entry-1'] },
      practiceCompleted: { 'entry-1': true },
      taughtCompleted: { 'entry-1': true },
      currentField: 'gospel',
      currentCourseId: 'entry-course',
      currentLessonId: 'entry-2',
    },
    0
  );

  await useFourFieldsStore.persist.rehydrate();

  assert.deepEqual(state().completedLessons, { 'entry-course': ['entry-1'] });
  assert.equal(state().currentField, 'gospel');
  assert.deepEqual(state().groups, []);
  assert.deepEqual(state().groupProgress, {});
});

test('a legacy snapshot keeps group progress for a group it also still stores', async () => {
  seedStorage(
    {
      currentField: 'church',
      groups: [makeStoredGroup()],
      activeGroupId: 'group-stored',
      groupProgress: {
        'group-stored': {
          groupId: 'group-stored',
          completedLessons: ['entry-1'],
          notes: { 'entry-1': 'went well' },
        },
      },
    },
    0
  );

  await useFourFieldsStore.persist.rehydrate();

  assert.equal(state().currentField, 'church');
  assert.deepEqual(state().getGroupProgress('group-stored')?.completedLessons, ['entry-1']);
  assert.equal(state().getActiveGroup()?.name, 'Stored Group');
});

// Documents current behaviour: orphaned progress is not pruned on hydration.
// QUESTION for review — should migrate drop progress for groups that are gone?
test('progress for a group that is no longer stored survives hydration as an orphan', async () => {
  seedStorage(
    {
      groups: [],
      groupProgress: {
        'group-gone': { groupId: 'group-gone', completedLessons: ['entry-1'], notes: {} },
      },
    },
    0
  );

  await useFourFieldsStore.persist.rehydrate();

  assert.deepEqual(state().getGroupProgress('group-gone')?.completedLessons, ['entry-1']);
  assert.equal(state().getGroup('group-gone'), undefined);
});

// ---------------------------------------------------------------------------
// resetForSignOut against a hydrated account
// ---------------------------------------------------------------------------

test('resetForSignOut clears a hydrated account, not just one built in memory', async () => {
  seedStorage(
    {
      currentField: 'multiplication',
      completedLessons: { 'entry-course': ['entry-1'] },
      groups: [makeStoredGroup()],
      activeGroupId: 'group-stored',
      groupProgress: {
        'group-stored': { groupId: 'group-stored', completedLessons: ['entry-1'], notes: {} },
      },
    },
    1
  );
  await useFourFieldsStore.persist.rehydrate();

  state().resetForSignOut();

  assert.deepEqual(
    {
      currentField: state().currentField,
      completedLessons: state().completedLessons,
      groups: state().groups,
      activeGroupId: state().activeGroupId,
      groupProgress: state().groupProgress,
    },
    {
      currentField: 'entry',
      completedLessons: {},
      groups: [],
      activeGroupId: null,
      groupProgress: {},
    }
  );
});

test('resetForSignOut is idempotent', () => {
  state().createGroup('Tuesday Night', 'leader-1', 'Lee');

  state().resetForSignOut();
  state().resetForSignOut();

  assert.deepEqual(state().groups, []);
  assert.deepEqual(readPersisted().state.groups, []);
});

test('a second account can build its own groups immediately after a reset', () => {
  state().createGroup('First Account', 'leader-1', 'Lee');
  state().resetForSignOut();

  const group = state().createGroup('Second Account', 'leader-2', 'Sam');

  assert.deepEqual(
    state().groups.map((stored) => stored.name),
    ['Second Account']
  );
  assert.equal(state().activeGroupId, group.id);
});

// ---------------------------------------------------------------------------
// join-code uniqueness
// ---------------------------------------------------------------------------

// Documents current behaviour: join codes are random with no collision check,
// so two groups can share one. Astronomically unlikely with 32^6 codes, and the
// store is device-local, but the resolution rule matters if it ever happens.
// QUESTION for review — should createGroup re-roll on a code already in use?
test('two groups that draw the same join code both survive and the older one wins lookups', (t) => {
  t.mock.method(Math, 'random', () => 0);

  const first = state().createGroup('First', 'leader-1', 'Lee');
  const second = state().createGroup('Second', 'leader-2', 'Sam');

  assert.equal(first.joinCode, second.joinCode);
  assert.equal(state().getGroupByCode(first.joinCode)?.id, first.id);
});

test('a leaderless roster promotes the earliest joiner even when two members tie on time', () => {
  useFourFieldsStore.setState({
    groups: [
      makeStoredGroup({
        members: [
          { id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 1_000 },
          { id: 'member-a', name: 'A', role: 'member', joinedAt: 2_000 },
          { id: 'member-b', name: 'B', role: 'member', joinedAt: 2_000 },
        ],
      }),
    ],
  });

  state().leaveGroup('group-stored', 'leader-1');

  assert.deepEqual(
    state()
      .getGroup('group-stored')
      ?.members.map((member) => [member.id, member.role]),
    [
      ['member-a', 'leader'],
      ['member-b', 'member'],
    ]
  );
});

// Documents current behaviour: joinGroup upper-cases but does not trim, while
// the synced groupService trims first. QUESTION for review — should the local
// store trim too, so a pasted code with a trailing space still works?
test('a join code with surrounding whitespace is not matched by the local store', () => {
  useFourFieldsStore.setState({ groups: [makeStoredGroup()] });

  assert.equal(state().joinGroup(' abc234 ', 'user-2', 'Bo'), false);
  assert.equal(state().joinGroup('abc234', 'user-2', 'Bo'), true);
});
