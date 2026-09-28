/** Startup preference ownership through actual authStore.setSession, Bible store and service.
 * Native pack/database and Supabase boundaries are fake; unrelated sibling-store effects
 * are stubbed so the real auth generation and Bible reset remain the focus. */
import test, { beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import {
  installBibleStoreDoubles,
  flushAsyncWork,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';
import { createSupabaseFake, makeFakeSession } from '../testing/supabaseFake';
const mmkv = mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);
const fake = createSupabaseFake();
const api = {
  supabase: fake.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => (await fake.client.auth.getUser()).data.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), api);
mockModule(mock, sourcePath('services/supabase/client.ts'), api);
for (const [path, name] of [
  ['progressStore', 'useProgressStore'],
  ['readingPlansStore', 'readingPlansStore'],
  ['translatorReviewStore', 'useTranslatorReviewStore'],
] as const) {
  mockModule(mock, sourcePath(`stores/${path}.ts`), {
    [name]: { getState: () => ({ resetForSignOut: () => {}, clearPendingUnenrolls: () => {} }) },
  });
}
for (const path of ['annotationStore', 'libraryStore', 'gatherStore', 'fourFieldsStore']) {
  mockModule(mock, sourcePath(`stores/${path}.ts`), {});
}
async function admit(userId: string | null, accessToken?: string) {
  const { useAuthStore } = await import('./authStore');
  const session = userId
    ? makeFakeSession({
        user: { id: userId } as never,
        ...(accessToken ? { access_token: accessToken } : {}),
      })
    : null;
  fake.auth.setSession(session);
  useAuthStore.getState().setSession(session);
  assert.equal(useAuthStore.getState().user?.uid ?? null, userId);
}
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
beforeEach(async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { useAuthStore } = await import('./authStore');
  await flushAsyncWork();
  doubles.reset();
  fake.reset();
  fake.auth.setSession(null);
  mmkv.store.delete('bible.textPackInstallJournal.v1');
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
    },
    true
  );
});
after(() => mock.reset());

test('late A startup preference GET cannot select A Bible after account B arrives', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  await flushAsyncWork();
  mmkv.store.delete('bible.textPackInstallJournal.v1');
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
    },
    true
  );
  await admit('account-A');
  const started = deferred();
  const response = deferred();
  fake.respondTo('user_translation_preferences', async (call) => {
    assert.deepEqual(call.steps.find((step) => step.method === 'eq')?.args, [
      'user_id',
      'account-A',
    ]);
    started.resolve();
    await response.promise;
    return {
      data: {
        user_id: 'account-A',
        primary_translation: 'asv',
        synced_at: '2026-09-27T00:00:00.000Z',
      },
    };
  });
  const reconciliation = reconcilePrimaryTranslationPreference();
  await started.promise;
  await admit('account-B');
  // The actual authStore boundary resets the Bible choice stamp synchronously.
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
  response.resolve();
  await reconciliation;
  assert.equal((await fake.client.auth.getUser()).data.user?.id, 'account-B');
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
  assert.equal(JSON.parse(mmkv.store.get('bible-storage')!).state.currentTranslation, 'bsb');
});

test('late A startup pack completion cannot select A Bible after account B arrives', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  await flushAsyncWork();
  doubles.reset();
  mmkv.store.delete('bible.textPackInstallJournal.v1');
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      translations: [
        ...useBibleStore.getInitialState().translations,
        makeRuntimeTranslation({ id: 'account-a-primary' }),
      ],
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
    },
    true
  );
  await admit('account-A');
  fake.respondTo('user_translation_preferences', () => ({
    data: {
      user_id: 'account-A',
      primary_translation: 'account-a-primary',
      synced_at: '2026-09-27T00:00:00.000Z',
    },
  }));
  const started = deferred();
  const transfer = deferred();
  doubles.cloud.run = async () => {
    started.resolve();
    await transfer.promise;
    return 'file:///packs/account-a-primary.db';
  };
  const reconciliation = reconcilePrimaryTranslationPreference();
  await started.promise;
  await admit('account-B');
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
  transfer.resolve();
  await reconciliation;
  assert.equal((await fake.client.auth.getUser()).data.user?.id, 'account-B');
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
  assert.equal(
    useBibleStore.getState().translations.find((row) => row.id === 'account-a-primary')
      ?.isDownloaded,
    true
  );
  assert.equal(JSON.parse(mmkv.store.get('bible-storage')!).state.currentTranslation, 'bsb');
});
test('startup upload admitted under A cannot resolve its destination UID as B', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  await flushAsyncWork();
  fake.reset();
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
    },
    true
  );
  await admit('account-A');
  useBibleStore.getState().setCurrentTranslation('bsb'); // A's newer local choice needs upload.
  const started = deferred();
  const lookup = deferred();
  let lookups = 0;
  fake.auth.handlers.getUser = async () => {
    if (++lookups === 2) {
      started.resolve();
      await lookup.promise;
    }
    return { data: { user: fake.auth.user }, error: null };
  };
  fake.respondTo('user_translation_preferences', (call) => {
    const uid = call.steps.find((step) => step.method === 'eq')?.args[1];
    return call.operation === 'select'
      ? {
          data: {
            user_id: uid,
            primary_translation: uid === 'account-A' ? 'asv' : 'ylt',
            synced_at: '2026-09-27T00:00:00.000Z',
          },
        }
      : { data: null };
  });
  const reconciling = reconcilePrimaryTranslationPreference();
  await started.promise;
  await admit('account-B');
  lookup.resolve();
  await reconciling;
  const writes = fake.calls.filter((call) => call.operation === 'upsert');
  assert.equal(writes.length, 0, `stale upload payload: ${JSON.stringify(writes[0]?.payload)}`);
});

for (const change of ['unchanged', 'token refresh', 'same UID new login'] as const) {
  test(`pending saved preference ${change} respects real auth generation`, async () => {
    const { useBibleStore } = await import('./bibleStore');
    const { useAuthStore } = await import('./authStore');
    const { reconcilePrimaryTranslationPreference } =
      await import('../services/translations/runtimeTranslationBootstrap');
    await admit('account-A');
    const generation = useAuthStore.getState().authGeneration;
    const started = deferred();
    const response = deferred();
    const stamp = '2026-09-27T00:00:00.000Z';
    fake.respondTo('user_translation_preferences', async () => {
      started.resolve();
      await response.promise;
      return { data: { user_id: 'account-A', primary_translation: 'asv', synced_at: stamp } };
    });
    const reconciliation = reconcilePrimaryTranslationPreference();
    await started.promise;
    if (change === 'same UID new login') {
      await admit(null);
      await admit('account-A', 'new-login-token');
      assert.ok(useAuthStore.getState().authGeneration > generation);
    } else if (change === 'token refresh') {
      await admit('account-A', 'refreshed-token');
      assert.equal(useAuthStore.getState().authGeneration, generation);
    }
    response.resolve();
    await reconciliation;
    assert.equal(
      useBibleStore.getState().currentTranslation,
      change === 'same UID new login' ? 'bsb' : 'asv'
    );
    assert.equal(
      useBibleStore.getState().currentTranslationChosenAt,
      change === 'same UID new login' ? null : stamp
    );
  });
}

test('failed account-A pack does not select its regional fallback for B', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  useBibleStore.setState({
    translations: [
      ...useBibleStore.getState().translations.filter((row) => row.id !== 'hincv'),
      makeRuntimeTranslation({ id: 'account-a-primary', language: 'Hindi' }),
      makeRuntimeTranslation({
        id: 'hincv',
        language: 'Hindi',
        isDownloaded: true,
        textPackLocalPath: 'file:///packs/hincv.db',
      }),
    ],
  });
  await admit('account-A');
  fake.respondTo('user_translation_preferences', () => ({
    data: {
      user_id: 'account-A',
      primary_translation: 'account-a-primary',
      synced_at: '2026-09-27T00:00:00.000Z',
    },
  }));
  const started = deferred();
  const transfer = deferred();
  doubles.cloud.run = async () => {
    started.resolve();
    await transfer.promise;
    throw new Error('transfer failed');
  };
  const reconciliation = reconcilePrimaryTranslationPreference();
  await started.promise;
  await admit('account-B');
  transfer.resolve();
  await reconciliation;
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
});

test('account change during startup upload merge read cannot dispatch an upsert', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  await admit('account-A');
  useBibleStore.getState().setCurrentTranslation('bsb');
  const started = deferred();
  const merge = deferred();
  let reads = 0;
  fake.respondTo('user_translation_preferences', async (call) => {
    assert.equal(call.operation, 'select');
    assert.deepEqual(call.steps.find((step) => step.method === 'eq')?.args, [
      'user_id',
      'account-A',
    ]);
    if (++reads === 2) {
      started.resolve();
      await merge.promise;
    }
    return {
      data: {
        user_id: 'account-A',
        primary_translation: 'asv',
        synced_at: '2026-09-27T00:00:00.000Z',
      },
    };
  });
  const reconciliation = reconcilePrimaryTranslationPreference();
  await started.promise;
  await admit('account-B');
  merge.resolve();
  await reconciliation;
  assert.equal(fake.calls.filter((call) => call.operation === 'upsert').length, 0);
});

test('current startup owner uploads its local choice to its own row', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap');
  await admit('account-A');
  useBibleStore.getState().setCurrentTranslation('bsb');
  const stamp = useBibleStore.getState().currentTranslationChosenAt;
  fake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'select'
      ? {
          data: {
            user_id: 'account-A',
            primary_translation: 'asv',
            secondary_translation: 'ylt',
            synced_at: '2026-09-27T00:00:00.000Z',
          },
        }
      : { data: null }
  );
  await reconcilePrimaryTranslationPreference();
  const writes = fake.calls.filter((call) => call.operation === 'upsert');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.payload, {
    user_id: 'account-A',
    primary_translation: 'bsb',
    secondary_translation: 'ylt',
    audio_translation: null,
    synced_at: stamp,
  });
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, stamp);
});

test('a stale expected startup owner fails before user lookup', async () => {
  const { setUserTranslationPreferences } =
    await import('../services/translations/translationService');
  await admit('account-A');
  let lookups = 0;
  fake.auth.handlers.getUser = async () => {
    lookups++;
    return { data: { user: fake.auth.user }, error: null };
  };
  const result = await setUserTranslationPreferences(
    { primary: 'asv' },
    { userId: 'account-A', isCurrent: () => false }
  );
  assert.equal(result.success, false);
  assert.equal(lookups, 0);
  assert.equal(fake.calls.length, 0);
});
