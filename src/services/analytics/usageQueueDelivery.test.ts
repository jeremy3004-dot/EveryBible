import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { User } from '../../types';

function queueHarness(seed?: string) {
  const disk = new Map<string, string>();
  if (seed) disk.set('analytics-usage-queue-v1', seed);
  const calls: Array<{ body: { events: Array<Record<string, unknown>> } }> = [];
  let send: () => Promise<unknown> = async () => ({ data: { ok: true }, error: null });
  let nextId = 0;
  let user: User | null = null;
  const dependencies: string[] = [];
  const exports = {} as typeof import('./usageQueue');
  const timers = new Map<number, () => void>();
  const compiled = ts.transpileModule(
    readFileSync(new URL('./usageQueue.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }
  ).outputText;
  runInNewContext(compiled, {
    exports,
    Date,
    console,
    setTimeout: (fn: () => void) => {
      const id = timers.size + 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` },
    require: (name: string) => {
      dependencies.push(name);
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === 'expo-constants') return { default: { expoConfig: { version: '1.0.7' } } };
      if (name === '../../stores/authStore')
        return { useAuthStore: { getState: () => ({ user }) } };
      if (name === '../../stores/mmkvStorage')
        return {
          mmkvInstance: {
            getString: (key: string) => disk.get(key),
            set: (key: string, value: string) => disk.set(key, value),
            delete: (key: string) => disk.delete(key),
          },
        };
      if (name === './geoContext')
        return {
          resolveGeoContext: async () => null,
          getCachedGeoContext: () => null,
          attachGeoContext: (event: unknown) => event,
        };
      if (name === '../supabase')
        return {
          isSupabaseConfigured: () => true,
          supabase: {
            auth: { getSession: async () => ({ data: { session: null } }) },
            functions: {
              invoke: async (_: string, options: (typeof calls)[number]) => {
                calls.push(options);
                return send();
              },
            },
          },
        };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    api: exports,
    disk,
    calls,
    timers,
    dependencies,
    setUser: (value: User | null) => {
      user = value;
    },
    setSend: (fn: typeof send) => {
      send = fn;
    },
  };
}

function signedInUser(uid: string): User {
  return {
    uid,
    email: null,
    displayName: null,
    photoURL: null,
    createdAt: 0,
    lastActive: 0,
  };
}

test('signed-in events capture the production user uid at enqueue without eager auth loading', async () => {
  const h = queueHarness();
  assert.equal(h.dependencies.includes('../../stores/authStore'), false);
  h.setUser(signedInUser('original-user'));
  h.api.enqueueUsageEvent('session_started', {}, 'session');

  const persisted = JSON.parse(h.disk.get('analytics-usage-queue-v1') ?? '[]');
  assert.equal(persisted[0].attribution_user_id, 'original-user');
  assert.equal(h.dependencies.includes('../../stores/authStore'), true);
  await h.api.flushUsageQueue();
  assert.equal(h.calls[0].body.events[0].attribution_user_id, 'original-user');
});

test('guest events remain anonymous when a user signs in before delivery', async () => {
  const h = queueHarness();
  h.api.enqueueUsageEvent('session_started', {}, 'session');
  h.setUser(signedInUser('later-user'));

  await h.api.flushUsageQueue();
  assert.equal(h.calls[0].body.events[0].attribution_user_id, null);
});

for (const nextUser of [signedInUser('next-user'), null]) {
  test(`queued identity survives ${nextUser ? 'account changes' : 'signout'} before delivery`, async () => {
    const h = queueHarness();
    h.setUser(signedInUser('original-user'));
    h.api.enqueueUsageEvent('session_started', {}, 'session');
    h.setUser(nextUser);

    await h.api.flushUsageQueue();
    assert.equal(h.calls[0].body.events[0].attribution_user_id, 'original-user');
  });
}

test('queued identity survives a restart with another account signed in', async () => {
  const original = queueHarness();
  original.setUser(signedInUser('original-user'));
  original.api.enqueueUsageEvent('session_started', {}, 'session');
  const restarted = queueHarness(original.disk.get('analytics-usage-queue-v1'));
  restarted.setUser(signedInUser('next-user'));

  await restarted.api.flushUsageQueue();
  assert.equal(restarted.calls[0].body.events[0].attribution_user_id, 'original-user');
  assert.equal(restarted.dependencies.includes('../../stores/authStore'), false);
});

test('in-flight events stay durable until the server acknowledges them', async () => {
  const h = queueHarness();
  let acknowledge!: (value: unknown) => void;
  h.setSend(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      })
  );
  h.api.enqueueUsageEvent('session_started', {}, 'session');
  const flushing = h.api.flushUsageQueue();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.parse(h.disk.get('analytics-usage-queue-v1') ?? '[]').length, 1);
  h.api.enqueueUsageEvent('reading_ended', { duration_seconds: 30 }, 'session');
  acknowledge({ data: { ok: true }, error: null });
  await flushing;
  assert.equal(h.api.getPendingUsageEventCount(), 1, 'events arriving during delivery survive');
});

test('temporary rate limits and repeated offline failures retain the same event ID', async () => {
  const h = queueHarness();
  h.api.enqueueUsageEvent('reading_ended', { duration_seconds: 60 }, 'session');
  h.setSend(async () => ({ error: { message: 'Rate limit', context: { status: 429 } } }));
  await h.api.flushUsageQueue();
  assert.equal(h.api.getPendingUsageEventCount(), 1);
  h.setSend(async () => ({ error: { message: 'Offline' } }));
  for (let i = 0; i < 10; i++) await h.api.flushUsageQueue();
  assert.equal(h.api.getPendingUsageEventCount(), 1);
  assert.ok(h.calls[0].body.events[0].event_id);
  assert.equal(new Set(h.calls.map((c) => c.body.events[0].event_id)).size, 1);
});

test('concurrent flushes send a batch only once and batches stay bounded', async () => {
  const h = queueHarness();
  let acknowledge!: (value: unknown) => void;
  h.setSend(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      })
  );
  for (let i = 0; i < 150; i++) h.api.enqueueUsageEvent('session_started', {}, 'session');
  const flushing = h.api.flushUsageQueue();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].body.events.length <= 100);
  acknowledge({ data: { ok: true }, error: null });
  await flushing;
});

test('a low-volume session schedules delivery before backgrounding', () => {
  const h = queueHarness();
  h.api.enqueueUsageEvent('session_started', {}, 'session');
  assert.ok(h.timers.size > 0);
});
