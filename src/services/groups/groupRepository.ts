import type { Group, GroupProgress } from '../../types/course';

export type GroupSource = 'local' | 'synced';
export type GroupRepositoryMode = 'local-only' | 'signin-required' | 'sync-enabled';

export interface SyncedGroupSummaryRecord {
  id: string;
  name: string;
  join_code: string;
  current_course_id: string;
  current_lesson_id: string;
  group_members: Array<{ user_id: string }>;
}

export interface GroupSummary {
  id: string;
  name: string;
  joinCode: string;
  memberCount: number;
  currentCourseId: string;
  currentLessonId: string;
  source: GroupSource;
}

export interface GroupRepositorySnapshot {
  mode: GroupRepositoryMode;
  localGroups: GroupSummary[];
  syncedGroups: GroupSummary[];
}

export interface GroupDetailMember {
  id: string;
  name: string | null;
  role: 'leader' | 'member';
  joinedAt: number | null;
}

export interface GroupDetailSnapshot {
  id: string;
  name: string;
  joinCode: string;
  memberCount: number;
  currentCourseId: string;
  currentLessonId: string;
  source: GroupSource;
  isLeader: boolean;
  completedLessonCount: number | null;
  members: GroupDetailMember[];
}

export function getGroupRepositoryMode({
  syncFeatureEnabled,
  backendConfigured,
  signedIn,
}: {
  syncFeatureEnabled: boolean;
  backendConfigured: boolean;
  signedIn: boolean;
}): GroupRepositoryMode {
  if (!syncFeatureEnabled || !backendConfigured) {
    return 'local-only';
  }

  if (!signedIn) {
    return 'signin-required';
  }

  return 'sync-enabled';
}

export function buildLocalGroupSummary(group: Group): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    joinCode: group.joinCode,
    memberCount: group.members.length,
    currentCourseId: group.currentCourseId,
    currentLessonId: group.currentLessonId,
    source: 'local',
  };
}

export function buildSyncedGroupSummary(group: SyncedGroupSummaryRecord): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    joinCode: group.join_code,
    memberCount: group.group_members.length,
    currentCourseId: group.current_course_id,
    currentLessonId: group.current_lesson_id,
    source: 'synced',
  };
}

export function buildGroupDetailSnapshot({
  localGroup,
  localProgress,
  syncedGroup,
  currentUserId,
}: {
  localGroup: Group | null;
  localProgress: GroupProgress | null;
  syncedGroup: SyncedGroupSummaryRecord | null;
  currentUserId: string | null;
}): GroupDetailSnapshot | null {
  if (localGroup) {
    return {
      id: localGroup.id,
      name: localGroup.name,
      joinCode: localGroup.joinCode,
      memberCount: localGroup.members.length,
      currentCourseId: localGroup.currentCourseId,
      currentLessonId: localGroup.currentLessonId,
      source: 'local',
      isLeader: localGroup.members.some(
        (member) => member.id === currentUserId && member.role === 'leader'
      ),
      completedLessonCount: localProgress?.completedLessons.length ?? 0,
      members: localGroup.members.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    };
  }

  if (!syncedGroup) {
    return null;
  }

  return {
    id: syncedGroup.id,
    name: syncedGroup.name,
    joinCode: syncedGroup.join_code,
    memberCount: syncedGroup.group_members.length,
    currentCourseId: syncedGroup.current_course_id,
    currentLessonId: syncedGroup.current_lesson_id,
    source: 'synced',
    isLeader: syncedGroup.group_members.some(
      (member) => member.user_id === currentUserId && member.role === 'leader'
    ),
    completedLessonCount: null,
    members: syncedGroup.group_members.map((member) => ({
      id: member.user_id,
      name: null,
      role: member.role,
      joinedAt: Date.parse(member.joined_at),
    })),
  };
}

export function buildGroupRepositorySnapshot({
  localGroups,
  syncFeatureEnabled,
  backendConfigured,
  signedIn,
  syncedGroups,
}: {
  localGroups: Group[];
  syncFeatureEnabled: boolean;
  backendConfigured: boolean;
  signedIn: boolean;
  syncedGroups: SyncedGroupSummaryRecord[];
}): GroupRepositorySnapshot {
  const mode = getGroupRepositoryMode({
    syncFeatureEnabled,
    backendConfigured,
    signedIn,
  });

  return {
    mode,
    localGroups: localGroups.map(buildLocalGroupSummary),
    syncedGroups: mode === 'local-only' ? [] : syncedGroups.map(buildSyncedGroupSummary),
  };
}

export async function loadGroupRepositorySnapshot({
  localGroups,
  syncFeatureEnabled,
  backendConfigured,
  signedIn,
  listSyncedGroups,
}: {
  localGroups: Group[];
  syncFeatureEnabled: boolean;
  backendConfigured: boolean;
  signedIn: boolean;
  listSyncedGroups?: () => Promise<SyncedGroupSummaryRecord[]>;
}): Promise<GroupRepositorySnapshot> {
  const syncedGroups =
    listSyncedGroups == null ||
    !syncFeatureEnabled ||
    !backendConfigured ||
    !signedIn
      ? []
      : await listSyncedGroups();

  return buildGroupRepositorySnapshot({
    localGroups,
    syncFeatureEnabled,
    backendConfigured,
    signedIn,
    syncedGroups,
  });
}

export async function loadGroupDetailSnapshot({
  groupId,
  localGroups,
  localProgress,
  syncFeatureEnabled,
  backendConfigured,
  signedIn,
  currentUserId,
  getSyncedGroup,
}: {
  groupId: string;
  localGroups: Group[];
  localProgress: Record<string, GroupProgress>;
  syncFeatureEnabled: boolean;
  backendConfigured: boolean;
  signedIn: boolean;
  currentUserId: string | null;
  getSyncedGroup?: (groupId: string) => Promise<SyncedGroupSummaryRecord | null>;
}): Promise<GroupDetailSnapshot | null> {
  const localGroup = localGroups.find((group) => group.id === groupId) ?? null;
  if (localGroup) {
    return buildGroupDetailSnapshot({
      localGroup,
      localProgress: localProgress[groupId] ?? null,
      syncedGroup: null,
      currentUserId,
    });
  }

  if (
    getSyncedGroup == null ||
    !syncFeatureEnabled ||
    !backendConfigured ||
    !signedIn
  ) {
    return null;
  }

  const syncedGroup = await getSyncedGroup(groupId);
  return buildGroupDetailSnapshot({
    localGroup: null,
    localProgress: null,
    syncedGroup,
    currentUserId,
  });
}
