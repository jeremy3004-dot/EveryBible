/** Real reader load, persisted Bible/progress stores and shipped progress sync. */
import test, { beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import { installBibleStoreDoubles, flushAsyncWork } from './__tests__/bibleStoreDoubles';
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
  const { useProgressStore } = await import('./progressStore');
  const { useAuthStore } = await import('./authStore');
  await flushAsyncWork();
  doubles.reset();
  fake.reset();
  fake.auth.setSession(null);
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useBibleStore.setState(useBibleStore.getInitialState(), true);
  useProgressStore.setState(useProgressStore.getInitialState(), true);
});
after(() => mock.reset());

for (const mode of ['plan', 'audio-only'] as const) {
  test(`newer unread ${mode} position survives older remote read position`, async () => {
    const { useBibleStore } = await import('./bibleStore');
    const { useProgressStore } = await import('./progressStore');
    const { loadReaderChapter } = await import('../screens/bible/readerChapterLoader');
    const { syncProgress } = await import('../services/sync/syncService');
    await flushAsyncWork();
    fake.reset();
    await admit('account-A');
    useProgressStore.setState({
      chaptersRead: { JHN_3: Date.parse('2026-09-01T12:00:00.000Z') },
      streakDays: 1,
      lastReadDate: '2026-09-01',
    });
    // Actual reader lifecycle setters run on navigation, before its text loader.
    useBibleStore.getState().setCurrentBook('JHN');
    useBibleStore.getState().setCurrentChapter(10);
    await loadReaderChapter({
      translationId: mode === 'plan' ? 'bsb' : 'audio-only',
      bookId: 'JHN',
      chapter: 10,
      translation: { hasText: mode === 'plan' },
      currentVerseCount: 0,
      returnToPlanOnComplete: mode === 'plan',
      requestIdRef: { current: 0 },
      prefetchTaskRef: { current: null },
      getChapter: async () => [{ text: 'chapter text' }] as never,
      prefetchNextChapter: async () => {},
      runAfterInteractions: () => ({ cancel: () => {} }),
      markChapterRead: useProgressStore.getState().markChapterRead,
      recoverMissingInstalledPack: async () => {},
      setIsLoading: () => {},
      setError: () => {},
      setVerses: useBibleStore.getState().setVerses,
      setVersesChapterKey: () => {},
      t: (key) => key,
    });
    assert.equal(useBibleStore.getState().currentChapter, 10);
    assert.equal(useProgressStore.getState().chaptersRead.JHN_10, undefined);
    fake.respondTo('user_progress', () => ({
      data: {
        user_id: 'account-A',
        chapters_read: { JHN_3: Date.parse('2026-09-01T12:00:00.000Z') },
        streak_days: 1,
        last_read_date: '2026-09-01',
        current_book: 'JHN',
        current_chapter: 3,
        synced_at: '2026-09-01T12:00:00.000Z',
        position_updated_at: Date.parse('2026-09-01T12:00:00.000Z'),
      },
    }));
    fake.respondToRpc('merge_user_progress', (call) => ({
      data: {
        id: 'progress-A',
        ...(call.payload as { p_progress: object }).p_progress,
      },
    }));
    const result = await syncProgress();
    assert.equal(result.success, true);
    assert.equal(useBibleStore.getState().currentChapter, 10);
    assert.equal(JSON.parse(mmkv.store.get('bible-storage')!).state.currentChapter, 10);
  });
}

function oldRemote(chapter = 3) {
  return {
    id: 'progress-A',
    user_id: 'account-A',
    chapters_read: { JHN_3: Date.parse('2026-09-01T12:00:00.000Z') },
    streak_days: 1,
    last_read_date: '2026-09-01',
    current_book: 'JHN',
    current_chapter: chapter,
    synced_at: '2026-09-01T12:00:00.000Z',
  };
}

test('same-position rerenders and cloud echoes do not remint local choice stamps', async (t) => {
  const { useBibleStore } = await import('./bibleStore');
  const now = Date.parse('2026-09-28T12:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  const state = useBibleStore.getState();
  state.setReadingPosition({ bookId: 'GEN', chapter: 1 });
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now);
  state.setReadingPosition({ bookId: 'GEN', chapter: 1 });
  state.setCurrentBook('GEN');
  state.setCurrentChapter(1);
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now);
  state.setReadingPosition({ bookId: 'JHN', chapter: 10 });
  state.setReadingPosition({ bookId: 'GEN', chapter: 1 });
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now + 2);
  state.applySyncedReadingPosition({ bookId: 'GEN', chapter: 1, updatedAt: now + 20 });
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now + 20);
  state.applySyncedReadingPosition({ bookId: 'GEN', chapter: 1, updatedAt: now + 20 });
  state.setReadingPosition({ bookId: 'GEN', chapter: 1 });
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now + 20);
  const persisted = JSON.parse(mmkv.store.get('bible-storage')!).state;
  assert.equal(persisted.readingPositionUpdatedAt, now + 20);
  const { sanitizePersistedBibleState } = await import('./persistedStateSanitizers');
  assert.equal(sanitizePersistedBibleState(persisted).readingPositionUpdatedAt, now + 20);
  state.resetForSignOut();
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, null);
});

test('atomic cross-book position admission never publishes the previous book chapter', async () => {
  const { useBibleStore } = await import('./bibleStore');
  useBibleStore.getState().setReadingPosition({ bookId: 'GEN', chapter: 50 });
  const observed: Array<[string, number]> = [];
  const stop = useBibleStore.subscribe((state) =>
    observed.push([state.currentBook, state.currentChapter])
  );
  useBibleStore.getState().setReadingPosition({ bookId: 'JUD', chapter: 1 });
  stop();
  assert.deepEqual(observed, [['JUD', 1]]);
});

test('an old RPC cannot bounce unread local position on repeated syncs and reports incomplete position', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { syncProgress } = await import('../services/sync/syncService');
  await admit('account-A');
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
  const chosenAt = useBibleStore.getState().readingPositionUpdatedAt;
  fake.respondTo('user_progress', () => ({ data: oldRemote() }));
  fake.respondToRpc('merge_user_progress', () => ({
    data: { ...oldRemote(), synced_at: new Date().toISOString() },
  }));
  for (let i = 0; i < 2; i++) {
    const result = await syncProgress();
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /try again later/i);
    assert.equal(useBibleStore.getState().currentChapter, 10);
    assert.equal(useBibleStore.getState().readingPositionUpdatedAt, chosenAt);
  }
  assert.equal(fake.calls.filter((call) => call.table === 'rpc:merge_user_progress').length, 2);
});

test('a newer local position chosen while upload is pending survives RPC readback', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { syncProgress } = await import('../services/sync/syncService');
  await admit('account-A');
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
  fake.respondTo('user_progress', () => ({
    data: { ...oldRemote(), position_updated_at: Date.parse('2026-09-01T12:00:00.000Z') },
  }));
  const started = deferred();
  const upload = deferred();
  fake.respondToRpc('merge_user_progress', async (call) => {
    started.resolve();
    await upload.promise;
    return { data: { id: 'progress-A', ...(call.payload as { p_progress: object }).p_progress } };
  });
  const pending = syncProgress();
  await started.promise;
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 11 });
  const latest = useBibleStore.getState().readingPositionUpdatedAt;
  upload.resolve();
  assert.equal((await pending).success, true);
  assert.equal(useBibleStore.getState().currentChapter, 11);
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, latest);
});

for (const missingColumn of ['position_updated_at', 'position_updated_for']) {
  for (const storesSelectedTuple of [true, false]) {
    test(`${missingColumn} missing-column plain upsert fallback ${storesSelectedTuple ? 'succeeds when its tuple is stored' : 'reports incomplete when selected position was not stored'}`, async () => {
      const { useBibleStore } = await import('./bibleStore');
      const { syncProgress } = await import('../services/sync/syncService');
      await admit('account-A');
      useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
      fake.respondToRpc('merge_user_progress', () => ({
        error: { code: 'PGRST202', message: 'merge_user_progress missing' },
        status: 404,
      }));
      fake.respondTo('user_progress', (call) => {
        if (call.operation === 'select') return { data: oldRemote() };
        const payload = call.payload as Record<string, unknown>;
        if ('position_updated_at' in payload)
          return {
            error: { code: 'PGRST204', message: `Could not find the ${missingColumn} column` },
          };
        return { data: storesSelectedTuple ? { id: 'progress-A', ...payload } : oldRemote() };
      });
      const result = await syncProgress();
      assert.equal(result.success, storesSelectedTuple);
      assert.equal(useBibleStore.getState().currentChapter, 10);
      const writes = fake.calls.filter(
        (call) => call.operation === 'upsert' && call.table === 'user_progress'
      );
      assert.equal(writes.length, 2);
      assert.equal('position_updated_at' in (writes[1]?.payload as object), false);
      assert.equal('position_updated_for' in (writes[1]?.payload as object), false);
      assert.equal((writes[0]?.payload as Record<string, unknown>).position_updated_for, 'JHN_10');
    });
  }
}

test('Continue explicitly admits an unstamped legacy position without requiring a chapter change', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { syncProgress } = await import('../services/sync/syncService');
  await admit('account-A');
  mmkv.store.set(
    'bible-storage',
    JSON.stringify({
      version: 1,
      state: {
        currentBook: 'JHN',
        currentChapter: 10,
        hasReaderHistory: true,
      },
    })
  );
  await useBibleStore.persist.rehydrate();
  assert.equal(useBibleStore.getState().currentChapter, 10);
  assert.equal(useBibleStore.getState().hasReaderHistory, true);
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, null);
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
  assert.ok(useBibleStore.getState().readingPositionUpdatedAt);
  fake.respondTo('user_progress', () => ({
    data: { ...oldRemote(), position_updated_at: Date.parse('2026-09-01T12:00:00.000Z') },
  }));
  fake.respondToRpc('merge_user_progress', (call) => ({
    data: { id: 'progress-A', ...(call.payload as { p_progress: object }).p_progress },
  }));
  assert.equal((await syncProgress()).success, true);
  assert.equal(useBibleStore.getState().currentChapter, 10);
});

test('legitimate newer remote choice wins without a local remint or compatibility failure', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { syncProgress } = await import('../services/sync/syncService');
  await admit('account-A');
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
  const remoteStamp = useBibleStore.getState().readingPositionUpdatedAt! + 100;
  fake.respondTo('user_progress', () => ({
    data: { ...oldRemote(), position_updated_at: remoteStamp, position_updated_for: 'JHN_3' },
  }));
  assert.equal((await syncProgress()).success, true);
  assert.equal(useBibleStore.getState().currentChapter, 3);
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, remoteStamp);
  assert.equal(
    fake.calls.some((call) => call.table === 'rpc:merge_user_progress'),
    false
  );
});

test('ahead-of-clock prior position cannot poison the next local choice', async (t) => {
  const { useBibleStore } = await import('./bibleStore');
  const now = Date.parse('2026-09-28T12:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  useBibleStore.setState({
    currentBook: 'JHN',
    currentChapter: 10,
    hasReaderHistory: true,
    readingPositionUpdatedAt: now + 400 * 86400000,
  });
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 11 });
  assert.equal(useBibleStore.getState().readingPositionUpdatedAt, now);
  const { sanitizePersistedBibleState } = await import('./persistedStateSanitizers');
  for (const value of [0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      sanitizePersistedBibleState({
        currentBook: 'JHN',
        currentChapter: 10,
        readingPositionUpdatedAt: value,
      }).readingPositionUpdatedAt,
      null
    );
  }
});

test('a partial stamp-only RPC cannot claim a newer unread position was saved', async () => {
  const { useBibleStore } = await import('./bibleStore');
  const { syncProgress } = await import('../services/sync/syncService');
  await admit('account-A');
  useBibleStore.getState().setReadingPosition({ bookId: 'JHN', chapter: 10 });
  fake.respondTo('user_progress', () => ({ data: oldRemote() }));
  fake.respondToRpc('merge_user_progress', () => ({
    data: { ...oldRemote(), position_updated_at: Date.parse('2026-09-01T12:00:00.000Z') },
  }));
  const result = await syncProgress();
  assert.equal(result.success, false);
  assert.match(result.error ?? '', /try again later/i);
  assert.equal(useBibleStore.getState().currentChapter, 10);
});
