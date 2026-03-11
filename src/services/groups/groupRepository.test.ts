import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupDetailSnapshot, buildGroupRepositorySnapshot } from './groupRepository';
import type { Group } from '../../types/course';
import type { SyncedGroup } from './groupService';

const localGroup: Group = {
  id: 'local-1',
  name: 'Local Harvest Group',
  joinCode: 'ABC123',
  createdAt: 1710000000000,
  createdBy: 'leader-1',
  currentCourseId: 'entry-course',
  currentLessonId: 'entry-1',
  members: [
    {
      id: 'leader-1',
      name: 'Leader',
      role: 'leader',
      joinedAt: 1710000000000,
    },
    {
      id: 'member-1',
      name: 'Member',
      role: 'member',
      joinedAt: 1710003600000,
    },
  ],
};

const syncedGroup: SyncedGroup = {
  id: 'synced-1',
  name: 'Synced Harvest Group',
  join_code: 'SYNC42',
  leader_id: 'leader-remote',
  current_course_id: 'gospel-course',
  current_lesson_id: 'gospel-2',
  archived_at: null,
  created_at: '2026-03-11T00:00:00.000Z',
  updated_at: '2026-03-11T00:00:00.000Z',
  group_members: [
    {
      group_id: 'synced-1',
      user_id: 'leader-remote',
      role: 'leader',
      joined_at: '2026-03-11T00:00:00.000Z',
    },
    {
      group_id: 'synced-1',
      user_id: 'member-remote',
      role: 'member',
      joined_at: '2026-03-11T01:00:00.000Z',
    },
  ],
};

test('keeps the repository in local-only mode when sync rollout is disabled', () => {
  const snapshot = buildGroupRepositorySnapshot({
    syncFeatureEnabled: false,
    backendConfigured: true,
    signedIn: true,
    localGroups: [localGroup],
    syncedGroups: [syncedGroup],
  });

  assert.equal(snapshot.mode, 'local-only');
  assert.deepEqual(snapshot.localGroups.map((group) => group.id), ['local-1']);
  assert.deepEqual(snapshot.syncedGroups, []);
});

test('surfaces sign-in-required status without hiding local groups', () => {
  const snapshot = buildGroupRepositorySnapshot({
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: false,
    localGroups: [localGroup],
    syncedGroups: [syncedGroup],
  });

  assert.equal(snapshot.mode, 'signin-required');
  assert.equal(snapshot.localGroups[0]?.source, 'local');
  assert.deepEqual(snapshot.syncedGroups.map((group) => group.id), ['synced-1']);
});

test('maps synced groups into a separate repository section when sync is enabled', () => {
  const snapshot = buildGroupRepositorySnapshot({
    syncFeatureEnabled: true,
    backendConfigured: true,
    signedIn: true,
    localGroups: [localGroup],
    syncedGroups: [syncedGroup],
  });

  assert.equal(snapshot.mode, 'sync-enabled');
  assert.deepEqual(snapshot.localGroups[0], {
    id: 'local-1',
    name: 'Local Harvest Group',
    joinCode: 'ABC123',
    memberCount: 2,
    currentCourseId: 'entry-course',
    currentLessonId: 'entry-1',
    source: 'local',
  });
  assert.deepEqual(snapshot.syncedGroups[0], {
    id: 'synced-1',
    name: 'Synced Harvest Group',
    joinCode: 'SYNC42',
    memberCount: 2,
    currentCourseId: 'gospel-course',
    currentLessonId: 'gospel-2',
    source: 'synced',
  });
});

test('builds a local group detail snapshot with progress and named members intact', () => {
  const snapshot = buildGroupDetailSnapshot({
    localGroup,
    localProgress: {
      groupId: 'local-1',
      completedLessons: ['entry-1', 'entry-2'],
      notes: {},
    },
    syncedGroup: null,
    currentUserId: 'leader-1',
  });

  assert.deepEqual(snapshot, {
    id: 'local-1',
    name: 'Local Harvest Group',
    joinCode: 'ABC123',
    memberCount: 2,
    currentCourseId: 'entry-course',
    currentLessonId: 'entry-1',
    source: 'local',
    isLeader: true,
    completedLessonCount: 2,
    members: [
      {
        id: 'leader-1',
        name: 'Leader',
        role: 'leader',
        joinedAt: 1710000000000,
      },
      {
        id: 'member-1',
        name: 'Member',
        role: 'member',
        joinedAt: 1710003600000,
      },
    ],
  });
});

test('builds a synced group detail snapshot without inventing local progress', () => {
  const snapshot = buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup,
    currentUserId: 'leader-remote',
  });

  assert.deepEqual(snapshot, {
    id: 'synced-1',
    name: 'Synced Harvest Group',
    joinCode: 'SYNC42',
    memberCount: 2,
    currentCourseId: 'gospel-course',
    currentLessonId: 'gospel-2',
    source: 'synced',
    isLeader: true,
    completedLessonCount: null,
    members: [
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
    ],
  });
});
