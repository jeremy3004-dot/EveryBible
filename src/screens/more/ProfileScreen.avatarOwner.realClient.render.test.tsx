import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { installRenderHarness } from '../../testing/render';
import {
  mockModule,
  mockPackage,
  mockMmkvStorage,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';
import type { Session } from '@supabase/supabase-js';

const harness = installRenderHarness(mock);
const keychain = mockSecureStore(mock);
mockMmkvStorage(mock);
mockPackage(mock, 'expo-apple-authentication', {});
mockPackage(mock, 'expo-crypto', {});
mockPackage(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {},
  isErrorWithCode: () => false,
  statusCodes: {},
});
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  },
});
const useProgressStore = create(() => ({
  chaptersRead: {},
  chaptersListened: {},
  listeningMsByDate: {},
  streakDays: 0,
}));
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore,
  selectCurrentStreakDays: () => 0,
});
const useAnnotationStore = create(() => ({ annotations: [] }));
mockModule(mock, sourcePath('stores/annotationStore.ts'), { useAnnotationStore });
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => false },
  openAuthFlow: () => {},
});
mockModule(mock, sourcePath('services/analytics/analyticsService.ts'), {
  refreshEngagement: async () => {},
  getEngagementSummary: async () => ({ success: false }),
});
mockPackage(mock, 'expo-image-picker', {
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///a.jpg' }] }),
});
const uploaded: string[] = [];
mockModule(mock, sourcePath('services/storage/storageService.ts'), {
  uploadAvatar: async (uri: string) => {
    uploaded.push(uri);
    return { success: true, data: 'https://cdn.test/a-new.jpg' };
  },
});

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}
let userRead: ReturnType<typeof deferred> | null = null;
let userReadStarted: ReturnType<typeof deferred> | null = null;
let updateGate: ReturnType<typeof deferred> | null = null;
let updateStarted: ReturnType<typeof deferred> | null = null;
const updates: { authorization: string | null; avatar: unknown }[] = [];
const originalFetch = globalThis.fetch;
const user = (id: string, avatar = `https://cdn.test/${id}.jpg`) => ({
  id,
  email: `${id}@example.com`,
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: { avatar_url: avatar },
  created_at: '2026-01-01',
});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? '{}')) as {
    email?: string;
    data?: { avatar_url?: string };
  };
  const authorization = new Headers(init?.headers).get('authorization');
  const id = authorization?.includes('access-b') || body.email === 'b@example.com' ? 'b' : 'a';
  if (url.includes('/auth/v1/user') && init?.method !== 'PUT') {
    userReadStarted?.release();
    if (userRead) await userRead.promise;
  }
  if (url.includes('/auth/v1/user') && init?.method === 'PUT') {
    updates.push({ authorization, avatar: body.data?.avatar_url });
    updateStarted?.release();
    if (updateGate) await updateGate.promise;
  }
  const result = url.includes('grant_type=password')
    ? {
        access_token: `access-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: user(id),
      }
    : user(id, body.data?.avatar_url);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;
let client: typeof import('../../services/supabase/client');
let authService: typeof import('../../services/auth/authService');
let subscription: { unsubscribe: () => void };
before(async () => {
  client = await import('../../services/supabase/client');
  authService = await import('../../services/auth/authService');
  await client.supabase.auth.getSession();
  mockModule(mock, sourcePath('services/auth/index.ts'), {
    updateUserProfile: authService.updateUserProfile,
    getCurrentSession: authService.getCurrentSession,
  });
  subscription = client.supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) return;
    harness.authStore.setState({
      session,
      user: {
        uid: session.user.id,
        email: session.user.email,
        photoURL: session.user.user_metadata.avatar_url,
      },
      isAuthenticated: true,
      authGeneration: session.user.id === 'a' ? 1 : 2,
    });
  }).data.subscription;
});
after(async () => {
  subscription.unsubscribe();
  await client.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});
async function profile() {
  await authService.signInWithEmail('a@example.com', 'fake-password');
  const { ProfileScreen } = await import('./ProfileScreen');
  return harness.render(<ProfileScreen />);
}
function pressAvatar(view: Awaited<ReturnType<typeof profile>>) {
  return (
    view.getByRole('button', { name: harness.i18n.t('profile.changeAvatar') }).props
      .onPress as () => Promise<void>
  )();
}
const persisted = () =>
  JSON.parse(keychain.store.get('sb-abcdefghijklmnop-auth-token') ?? 'null') as Session | null;

test('actual Profile upload stays bound to A across a public SDK lock and B sign-in', async () => {
  const view = await profile();
  userRead = deferred();
  userReadStarted = deferred();
  const held = client.supabase.auth.getUser();
  await userReadStarted.promise;
  let pressing!: Promise<void>;
  try {
    await act(async () => {
      pressing = pressAvatar(view);
    });
    assert.deepEqual(uploaded, ['file:///a.jpg']);
    await act(async () => {
      assert.equal(
        (await authService.signInWithEmail('b@example.com', 'fake-password')).success,
        true
      );
    });
    await view.unmount();
    userRead.release();
    await held;
    await pressing;
    assert.equal(
      updates.some((request) => request.authorization === 'Bearer access-b'),
      false
    );
    assert.equal(persisted()?.user.id, 'b');
    assert.equal(persisted()?.user.user_metadata.avatar_url, 'https://cdn.test/b.jpg');
  } finally {
    userRead.release();
    userRead = null;
    userReadStarted = null;
  }
});

test('an in-flight A avatar response cannot patch or publish B session metadata', async () => {
  updates.length = 0;
  const view = await profile();
  updateGate = deferred();
  updateStarted = deferred();
  let pressing!: Promise<void>;
  try {
    await act(async () => {
      pressing = pressAvatar(view);
      await updateStarted!.promise;
    });
    await act(async () => {
      await authService.signInWithEmail('b@example.com', 'fake-password');
    });
    updateGate.release();
    await pressing;
    assert.deepEqual(updates, [
      { authorization: 'Bearer access-a', avatar: 'https://cdn.test/a-new.jpg' },
    ]);
    assert.equal(persisted()?.user.id, 'b');
    assert.equal(persisted()?.user.user_metadata.avatar_url, 'https://cdn.test/b.jpg');
    assert.equal((harness.authStore.getState().user as { uid: string } | null)?.uid, 'b');
    assert.deepEqual(harness.rn.__recorded.alerts, []);
  } finally {
    updateGate.release();
    updateGate = null;
    updateStarted = null;
  }
});

test('a current avatar update persists metadata readable by a cold installed SDK', async () => {
  const view = await profile();
  await act(async () => {
    await pressAvatar(view);
  });
  assert.equal(persisted()?.user.user_metadata.avatar_url, 'https://cdn.test/a-new.jpg');
  assert.equal(persisted()?.access_token, 'access-a');
  // A new adapter/client has no this-launch cache from the first client.
  const { createAuthSessionStorage } = await import('../../services/supabase/authSessionStorage');
  const { createClient } = await import('@supabase/supabase-js');
  const cold = createClient('https://abcdefghijklmnop.supabase.co', 'public-test-key', {
    auth: {
      storage: createAuthSessionStorage(await import('expo-secure-store'), () => {}),
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: globalThis.fetch },
  });
  try {
    const { data } = await cold.auth.getSession();
    assert.equal(data.session?.user.user_metadata.avatar_url, 'https://cdn.test/a-new.jpg');
    assert.equal(data.session?.access_token, 'access-a');
  } finally {
    await cold.auth.stopAutoRefresh();
  }
});
