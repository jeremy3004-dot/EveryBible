import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSupabaseModule,
  sourcePath,
} from './mockModules';
import { createSupabaseFake, makeFakeSession } from './supabaseFake';

// One mock configuration per file (ESM caches modules): install everything at
// module scope, then load the modules under test with dynamic imports.
const mmkv = mockMmkvStorage(mock, {
  'gather-storage': JSON.stringify({
    state: { completedLessons: { 'foundation-1': ['seeded-lesson'] }, infoBannerDismissed: true },
    version: 0,
  }),
});
const rn = mockReactNative(mock, { os: 'android', version: 34, width: 360, height: 800 });
const supabaseFake = createSupabaseFake();
let backendConfigured = true;
mockSupabaseModule(mock, supabaseFake, { configured: () => backendConfigured });
// expo-* packages pull in expo-modules-core, which reads __DEV__ at import time.
// Always replace them; never let the real package load under Node.
mockModule(mock, 'expo-file-system/legacy', {
  getInfoAsync: async () => ({ exists: false }),
  readAsStringAsync: async () => '',
});

test('sourcePath resolves repo files relative to src/', () => {
  assert.match(sourcePath('stores/mmkvStorage.ts'), /\/src\/stores\/mmkvStorage\.ts$/);
});

test('a persisted Zustand store loads through the real loader with the MMKV mock', async () => {
  const { useGatherStore } = await import('../stores/gatherStore');

  // Persist middleware hydrates synchronously from the seeded storage.
  assert.equal(useGatherStore.getState().isLessonComplete('foundation-1', 'seeded-lesson'), true);
  assert.equal(useGatherStore.getState().infoBannerDismissed, true);

  useGatherStore.getState().markLessonComplete('foundation-1', 'second');

  const persisted = JSON.parse(mmkv.store.get('gather-storage') ?? '{}');
  assert.deepEqual(persisted.state.completedLessons, {
    'foundation-1': ['seeded-lesson', 'second'],
  });
});

test('react-native consumers see the stub values', async () => {
  const platform = await import('../utils/platform');

  assert.equal(platform.isAndroid, true);
  assert.equal(platform.isIOS, false);
  assert.equal(platform.screenWidth, 360);
  assert.equal(platform.isTablet, false);
  assert.equal(rn.Platform.OS, 'android');
});

test('services importing the supabase barrel talk to the fake', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: { id: 'user-9' } as never }));
  const { getCurrentUserId, isSupabaseConfigured } = await import('../services/supabase');
  const { getGroupImageUrl } = await import('../services/storage/storageService');

  assert.equal(isSupabaseConfigured(), true);
  assert.equal(await getCurrentUserId(), 'user-9');
  assert.equal(
    getGroupImageUrl('group-9'),
    `${supabaseFake.storage.publicUrlBase}/group-images/group-9/cover.jpg`
  );
  assert.equal(supabaseFake.storageCalls[0]?.method, 'getPublicUrl');
});

test('a configured getter lets one file flip the backend off without re-mocking', async () => {
  const { getCurrentUserId, isSupabaseConfigured } = await import('../services/supabase');
  backendConfigured = false;

  assert.equal(isSupabaseConfigured(), false);
  assert.equal(await getCurrentUserId(), null);

  backendConfigured = true;
  assert.equal(isSupabaseConfigured(), true);
});
