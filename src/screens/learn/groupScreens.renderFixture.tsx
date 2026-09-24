// Shared fakes for the GroupList / GroupDetail render tests. Importing this installs the mocks,
// so it must be imported before either screen (each test file is its own process).
import { mock } from 'node:test';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import type { Group } from '../../types/course';
import type { SyncedGroupSummaryRecord } from '../../services/groups/groupRepository';

export const harness = installRenderHarness(mock);
export const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

/** What the build and the backend look like to the screens; reset by `resetGroupFixture`. */
export const env = {
  backendConfigured: false,
  /** Replaced per test to script the synced-groups calls. */
  listSyncedGroups: async (): Promise<SyncedGroupSummaryRecord[]> => [],
  getSyncedGroup: async (_groupId: string): Promise<SyncedGroupSummaryRecord | null> => null,
  listPrayerRequests: async (
    _groupId: string
  ): Promise<{ success: boolean; data?: Array<{ is_answered: boolean; content: string }> }> => ({
    success: true,
    data: [],
  }),
  calls: { listSyncedGroups: 0, getSyncedGroup: [] as string[], authFlow: [] as string[] },
  leftGroups: [] as Array<[string, string]>,
};

// The feature flag is read at render time, so one mutable object serves every scenario.
const appConfig = {
  appName: 'Every Bible',
  version: '0.0.0',
  defaultTranslation: 'BSB',
  defaultBook: 'GEN',
  defaultChapter: 1,
  apiBaseUrl: '',
  features: {
    audioEnabled: true,
    multipleTranslations: true,
    socialSharing: true,
    chapterFeedbackInlineComposer: true,
    studyGroupsSync: false,
  },
};
mockModule(mock, sourcePath('constants/config.ts'), { config: appConfig });
mockModule(mock, sourcePath('services/supabase/index.ts'), {
  isSupabaseConfigured: () => env.backendConfigured,
});

export const useFourFieldsStore = create(() => ({
  groups: [] as Group[],
  groupProgress: {} as Record<string, { groupId: string; completedLessons: string[] }>,
  leaveGroup: (groupId: string, userId: string) => {
    env.leftGroups.push([groupId, userId]);
  },
}));
mockModule(mock, sourcePath('stores/fourFieldsStore.ts'), { useFourFieldsStore });

mockBarrel(mock, 'services/groups/index.ts', {
  real: [
    'buildGroupDetailSnapshot',
    'buildGroupRepositorySnapshot',
    'loadGroupDetailSnapshot',
    'getSyncedGroupServiceAvailability',
  ],
  provide: {
    listSyncedGroups: () => {
      env.calls.listSyncedGroups += 1;
      return env.listSyncedGroups();
    },
    getSyncedGroup: (groupId: string) => {
      env.calls.getSyncedGroup.push(groupId);
      return env.getSyncedGroup(groupId);
    },
  },
});
mockModule(mock, sourcePath('services/prayer/prayerService.ts'), {
  listPrayerRequests: (groupId: string) => env.listPrayerRequests(groupId),
});
mockBarrel(mock, 'utils/index.ts', { provide: { warningHaptic: () => {} } });
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  openAuthFlow: (mode = 'signIn') => {
    env.calls.authFlow.push(mode);
  },
});

export const VIEWER = { uid: 'viewer-1', displayName: 'Lydia' };

export function localGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'local-1',
    name: 'Tuesday group',
    joinCode: 'ABC234',
    createdAt: 0,
    createdBy: VIEWER.uid,
    currentCourseId: 'entry-course',
    currentLessonId: 'entry-1',
    members: [
      { id: VIEWER.uid, name: 'Lydia', role: 'leader', joinedAt: Date.UTC(2026, 8, 1) },
      { id: 'member-2', name: 'Silas', role: 'member', joinedAt: Date.UTC(2026, 8, 2) },
    ],
    ...overrides,
  };
}

export function syncedGroup(
  viewerRole: 'leader' | 'member',
  overrides: Partial<SyncedGroupSummaryRecord> = {}
): SyncedGroupSummaryRecord {
  return {
    id: 'synced-1',
    name: 'Riverside group',
    join_code: 'SYNC22',
    current_course_id: 'entry-course',
    current_lesson_id: 'entry-1',
    group_members: [
      { user_id: VIEWER.uid, role: viewerRole, joined_at: '2026-09-01T00:00:00Z' },
      {
        user_id: 'member-2',
        role: viewerRole === 'leader' ? 'member' : 'leader',
        joined_at: '2026-09-02T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

/** Sync on, backend configured, viewer signed in: the synced-groups path. */
export function enableSync() {
  env.backendConfigured = true;
  appConfig.features.studyGroupsSync = true;
  harness.authStore.setState({ user: VIEWER });
}

export function resetGroupFixture() {
  env.backendConfigured = false;
  appConfig.features.studyGroupsSync = false;
  env.listSyncedGroups = async () => [];
  env.getSyncedGroup = async () => null;
  env.listPrayerRequests = async () => ({ success: true, data: [] });
  env.calls = { listSyncedGroups: 0, getSyncedGroup: [], authFlow: [] };
  env.leftGroups = [];
  useFourFieldsStore.setState({ groups: [], groupProgress: {} });
  harness.authStore.setState({ user: null });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
