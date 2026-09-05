import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { defaultAuthPreferences } from '../../stores/persistedStateSanitizers';
import type { UserPreferences } from '../../types';
import * as syncMerge from './syncMerge';
import * as syncIdentity from './syncIdentity';
import * as syncCycle from './syncCycle';

type Row = Record<string, unknown>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function loadSyncService() {
  const auth = {
    user: { uid: 'A' },
    authGeneration: 1,
    preferences: { ...defaultAuthPreferences },
    preferencesUpdatedAt: '2026-01-01T00:00:00.000Z' as string | null,
    applySyncedPreferences: (preferences: UserPreferences, updatedAt: string | null) => {
      auth.preferences = preferences;
      auth.preferencesUpdatedAt = updatedAt;
    },
  };
  const progress = {
    chaptersRead: { GEN_1: 100 } as Record<string, number>,
    streakDays: 1,
    lastReadDate: '2026-01-01' as string | null,
    applySyncedProgress: (state: {
      chaptersRead: Record<string, number>;
      streakDays: number;
      lastReadDate: string | null;
    }) => {
      Object.assign(progress, state);
    },
  };
  const bible = {
    currentBook: 'GEN',
    currentChapter: 1,
    applySyncedReadingPosition: ({ bookId, chapter }: { bookId: string; chapter: number }) => {
      bible.currentBook = bookId;
      bible.currentChapter = chapter;
    },
  };
  const remote: Record<string, Row | null> = { user_preferences: null, user_progress: null };
  const writes: Array<{ table: string; row: Row }> = [];
  const hooks = {
    read: async (_table: string) => {},
    write: async (_table: string, _row: Row) => {},
  };
  const dependencies: Record<string, unknown> = {
    '../supabase': {
      isSupabaseConfigured: () => true,
      getCurrentUserId: async () => auth.user.uid,
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: auth.user.uid } }, error: null }) },
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              single: async () => {
                await hooks.read(table);
                return { data: remote[table], error: null };
              },
            }),
          }),
          upsert: async (row: Row) => {
            if (table !== 'profiles') {
              writes.push({ table, row });
              await hooks.write(table, row);
              remote[table] = row;
            }
            return { error: null };
          },
        }),
      },
    },
    '../../stores/authStore': { useAuthStore: { getState: () => auth } },
    '../../stores/progressStore': { useProgressStore: { getState: () => progress } },
    '../../stores/bibleStore': { useBibleStore: { getState: () => bible } },
    './syncMerge': syncMerge,
    './syncIdentity': syncIdentity,
    './syncCycle': syncCycle,
    '../plans': { getUserPlanProgress: async () => ({ success: true, data: [] }) },
  };
  const source = readFileSync(new URL('./syncService.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    setTimeout,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      return dependencies[name];
    },
  });
  return {
    auth,
    progress,
    bible,
    remote,
    writes,
    hooks,
    ...(exports as {
      syncPreferences: () => Promise<{ success: boolean }>;
      syncProgress: () => Promise<{ success: boolean }>;
      pullFromCloud: () => Promise<{ success: boolean }>;
    }),
  };
}

test('preference sync reads latest local settings after the cloud fetch', async () => {
  const runtime = loadSyncService();
  runtime.hooks.read = async () => {
    runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
    runtime.auth.preferencesUpdatedAt = '2026-01-02T00:00:00.000Z';
  };
  assert.equal((await runtime.syncPreferences()).success, true);
  assert.equal(runtime.auth.preferences.fontSize, 'large');
  assert.equal(runtime.remote.user_preferences?.font_size, 'large');
});

test('preference write acknowledgement does not roll back settings changed in flight', async () => {
  const runtime = loadSyncService();
  runtime.hooks.write = async () => {
    runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
    runtime.auth.preferencesUpdatedAt = '2026-09-05T10:00:00.000Z';
  };
  await runtime.syncPreferences();
  assert.equal(runtime.auth.preferences.fontSize, 'large');
  assert.equal(runtime.auth.preferencesUpdatedAt, '2026-09-05T10:00:00.000Z');
});

test('progress read merges chapters completed while the cloud request was pending', async () => {
  const runtime = loadSyncService();
  runtime.remote.user_progress = {
    chapters_read: { MAT_1: 200 },
    current_book: 'MAT',
    current_chapter: 1,
  };
  runtime.hooks.read = async () => {
    runtime.progress.chaptersRead = { ...runtime.progress.chaptersRead, GEN_2: 300 };
    runtime.bible.currentChapter = 2;
  };
  await runtime.syncProgress();
  assert.deepEqual(runtime.progress.chaptersRead, { GEN_1: 100, GEN_2: 300, MAT_1: 200 });
  assert.deepEqual(runtime.remote.user_progress?.chapters_read, runtime.progress.chaptersRead);
  assert.equal(runtime.bible.currentChapter, 2);
});

test('concurrent settings requests coalesce into one follow-up and upload the newest edit last', async () => {
  const runtime = loadSyncService();
  const firstWrite = deferred();
  const started = deferred();
  runtime.hooks.write = async () => {
    if (runtime.writes.length === 1) {
      started.resolve();
      await firstWrite.promise;
    }
  };
  const initial = runtime.syncPreferences();
  await started.promise;
  runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
  runtime.auth.preferencesUpdatedAt = new Date(Date.now() + 1).toISOString();
  const followups = Array.from({ length: 10 }, () => runtime.syncPreferences());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.writes.length, 1, 'newer writes must wait for the active write');
  firstWrite.resolve();
  await Promise.all([initial, ...followups]);
  assert.equal(runtime.writes.length, 2, 'ten concurrent requests need only one follow-up');
  assert.equal(runtime.remote.user_preferences?.font_size, 'large');
  assert.equal(runtime.auth.preferences.fontSize, 'large');
});

test('queued old-account requests cannot apply or upload after an account switch', async () => {
  const runtime = loadSyncService();
  const read = deferred();
  const started = deferred();
  runtime.hooks.read = async () => {
    started.resolve();
    await read.promise;
  };
  const first = runtime.syncPreferences();
  await started.promise;
  const pending = runtime.syncPreferences();
  await new Promise<void>((resolve) => setImmediate(resolve));
  runtime.auth.user = { uid: 'B' };
  runtime.auth.authGeneration += 1;
  runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
  read.resolve();
  const results = await Promise.all([first, pending]);
  assert.equal(
    results.every((result) => !result.success),
    true
  );
  assert.equal(runtime.writes.length, 0);
  assert.equal(runtime.auth.preferences.fontSize, 'large');
  assert.equal((await runtime.syncPreferences()).success, true);
  assert.equal(runtime.writes[0].row.user_id, 'B');
});

test('a failed active write does not poison a pending or later preference sync', async () => {
  const runtime = loadSyncService();
  const write = deferred();
  const started = deferred();
  runtime.hooks.write = async () => {
    if (runtime.writes.length === 1) {
      started.resolve();
      await write.promise;
      throw new Error('offline');
    }
  };
  const first = runtime.syncPreferences();
  await started.promise;
  runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
  const pending = runtime.syncPreferences();
  await new Promise<void>((resolve) => setImmediate(resolve));
  write.resolve();
  assert.equal((await first).success, false);
  assert.equal((await pending).success, true);
  assert.equal(runtime.remote.user_preferences?.font_size, 'large');
  assert.equal((await runtime.syncPreferences()).success, true);
  assert.equal(runtime.writes.length, 3);
});

test('progress follow-up writes latest chapters after the active cloud write completes', async () => {
  const runtime = loadSyncService();
  const write = deferred();
  const started = deferred();
  runtime.hooks.write = async () => {
    if (runtime.writes.length === 1) {
      started.resolve();
      await write.promise;
    }
  };
  const first = runtime.syncProgress();
  await started.promise;
  runtime.progress.chaptersRead = { ...runtime.progress.chaptersRead, GEN_2: 300 };
  runtime.bible.currentChapter = 2;
  const pending = runtime.syncProgress();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.writes.length, 1);
  write.resolve();
  await Promise.all([first, pending]);
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.remote.user_progress?.current_chapter, 2);
  assert.deepEqual(runtime.remote.user_progress?.chapters_read, { GEN_1: 100, GEN_2: 300 });
});

test('initial cloud pull also preserves chapters and preferences changed during reads', async () => {
  const runtime = loadSyncService();
  await runtime.syncPreferences();
  runtime.remote.user_progress = {
    chapters_read: { MAT_1: 200 },
    current_book: 'MAT',
    current_chapter: 1,
  };
  runtime.auth.preferencesUpdatedAt = '2026-01-01T00:00:00.000Z';
  runtime.hooks.read = async (table) => {
    if (table === 'user_progress') {
      runtime.progress.chaptersRead = { ...runtime.progress.chaptersRead, GEN_2: 300 };
      runtime.bible.currentChapter = 2;
    } else {
      runtime.auth.preferences = { ...runtime.auth.preferences, fontSize: 'large' };
      runtime.auth.preferencesUpdatedAt = '2099-01-01T00:00:00.000Z';
    }
  };
  assert.equal((await runtime.pullFromCloud()).success, true);
  assert.equal(runtime.auth.preferences.fontSize, 'large');
  assert.deepEqual(runtime.progress.chaptersRead, { GEN_1: 100, GEN_2: 300, MAT_1: 200 });
  assert.equal(runtime.bible.currentChapter, 2);
});
