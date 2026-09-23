import test, { mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSupabaseModule,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

mock.timers.enable({ apis: ['setTimeout'] });
const rn = mockReactNative(mock);
const key = 'analytics-usage-queue-v1';
const mmkv = mockMmkvStorage(mock, {
  [key]: JSON.stringify([
    {
      event_id: '11111111-1111-4111-8111-111111111111',
      event_name: 'restored',
      device_platform: 'ios',
      app_version: '1',
      queued_at: '2026-01-01T00:00:00Z',
      event_properties: {},
      session_id: null,
    },
  ]),
});
const backend = createSupabaseFake();
mockSupabaseModule(mock, backend);
let network: ((state: unknown) => void) | undefined;
let removed = 0;
let refresh: () => Promise<unknown> = async () => good;
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    default: {
      refresh: () => refresh(),
      addEventListener: (listener: typeof network) => {
        network = listener;
        return () => {
          removed++;
        };
      },
    },
  },
});
mockModule(mock, createRequire(import.meta.url).resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '1' } } },
});
let geoCalls = 0;
let resolveGeo: () => Promise<null> = async () => null;
mockModule(mock, sourcePath('services/analytics/geoContext.ts'), {
  getCachedGeoContext: () => null,
  attachGeoContext: <T>(event: T) => event,
  resolveGeoContext: () => {
    geoCalls++;
    return resolveGeo();
  },
});
let currentUid: string | null = 'original-user';
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: currentUid ? { uid: currentUid } : null }) },
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const good = {
  isConnected: true,
  isInternetReachable: null,
  details: { isConnectionExpensive: false },
};
after(() => mock.timers.reset());

test('optional reporting waits durably for foreground suitable connectivity and cleans up', async () => {
  const queue = await import('./usageQueue');
  await queue.flushUsageQueue();
  assert.equal(geoCalls, 0, 'unknown startup connectivity must not resolve geo');
  assert.equal(queue.getPendingUsageEventCount(), 1);
  const stop = queue.installUsageQueueReporting();
  network?.({ ...good, isConnected: false });
  for (let i = 0; i < 22; i++) queue.enqueueUsageEvent('offline', {}, null);
  mock.timers.tick(300_000);
  await settle();
  assert.equal(geoCalls, 0);
  assert.equal(JSON.parse(mmkv.store.get(key)!).length, 23);
  network?.({ ...good, isInternetReachable: false });
  await queue.flushUsageQueue();
  assert.equal(geoCalls, 0);
  network?.({ ...good, details: { isConnectionExpensive: true } });
  await queue.flushUsageQueue();
  assert.equal(geoCalls, 0);
  rn.AppState.emit('background');
  network?.(good);
  await settle();
  assert.equal(geoCalls, 0);
  backend.respondToFunction(() => ({ data: {}, error: null }));
  currentUid = 'different-user';
  rn.AppState.emit('active');
  network?.(good);
  network?.(good);
  await settle();
  assert.equal(backend.functionCalls.length, 1);
  const delivered = (
    backend.functionCalls[0].options as {
      body: { events: Array<{ attribution_user_id: string | null }> };
    }
  ).body.events;
  assert.equal(delivered[0].attribution_user_id, null);
  assert.ok(delivered.slice(1).every((event) => event.attribution_user_id === 'original-user'));
  assert.equal(queue.getPendingUsageEventCount(), 0);

  // Another AppState listener may flush before our listener gets its turn.
  rn.AppState.currentState = 'background';
  queue.enqueueUsageEvent('early-background-listener', {}, null);
  const beforeBackground = geoCalls;
  await queue.flushUsageQueue();
  assert.equal(geoCalls, beforeBackground);
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await settle();
  backend.functionCalls.length = 1;

  let finishGeo!: () => void;
  resolveGeo = () =>
    new Promise((resolve) => {
      finishGeo = () => resolve(null);
    });
  queue.enqueueUsageEvent('interrupted', {}, null);
  const flushing = queue.flushUsageQueue();
  rn.AppState.emit('background');
  finishGeo();
  await flushing;
  assert.equal(
    backend.functionCalls.length,
    1,
    'do not start upload after backgrounding during geo'
  );
  assert.equal(queue.getPendingUsageEventCount(), 1);
  resolveGeo = async () => null;
  rn.AppState.emit('active');
  await settle();
  assert.equal(queue.getPendingUsageEventCount(), 0);
  let acknowledge!: () => void;
  backend.respondToFunction(
    () =>
      new Promise((resolve) => {
        acknowledge = () => resolve({ data: {}, error: null });
      })
  );
  queue.enqueueUsageEvent('already-sent', {}, null);
  const sent = queue.flushUsageQueue();
  await settle();
  network?.({ ...good, isConnected: false });
  queue.enqueueUsageEvent('keep-offline', {}, null);
  acknowledge();
  await sent;
  assert.equal(
    queue.getPendingUsageEventCount(),
    1,
    'acknowledge the started batch, retain later events'
  );
  const calls = backend.functionCalls.length;
  mock.timers.tick(300_000);
  await settle();
  assert.equal(backend.functionCalls.length, calls);
  stop();
  assert.equal(removed, 1);
  network?.(good);
  rn.AppState.emit('active');
  queue.enqueueUsageEvent('after-stop', {}, null);
  mock.timers.tick(300_000);
  await queue.flushUsageQueue();
  assert.equal(queue.getPendingUsageEventCount(), 2);
  backend.respondToFunction(() => ({ data: {}, error: null }));
  const stopAgain = queue.installUsageQueueReporting();
  network?.(good);
  await settle();
  assert.equal(queue.getPendingUsageEventCount(), 0, 'remount resumes durable pending work');
  stopAgain();
});

test('foreground rechecks native connectivity before reporting and ignores obsolete refresh results', async () => {
  const queue = await import('./usageQueue');
  const stop = queue.installUsageQueueReporting();
  network?.(good);
  rn.AppState.emit('background');
  queue.enqueueUsageEvent('changed-network-in-background', {}, null);
  const callsBefore = geoCalls;
  let complete!: (state: unknown) => void;
  refresh = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  rn.AppState.emit('active');
  await queue.flushUsageQueue();
  assert.equal(geoCalls, callsBefore, 'old foreground network must not start geo');
  complete({ ...good, details: { isConnectionExpensive: true } });
  await settle();
  assert.equal(geoCalls, callsBefore);
  assert.equal(queue.getPendingUsageEventCount(), 1);

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  const outdated = complete;
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  outdated(good);
  await settle();
  assert.equal(geoCalls, callsBefore, 'older foreground refresh must not permit reporting');
  network?.({ ...good, isConnected: false });
  complete(good);
  await settle();
  assert.equal(geoCalls, callsBefore, 'newer offline event wins over refresh result');
  network?.(good);
  await settle();
  assert.equal(queue.getPendingUsageEventCount(), 0);

  rn.AppState.emit('background');
  queue.enqueueUsageEvent('disposed-refresh', {}, null);
  rn.AppState.emit('active');
  stop();
  complete(good);
  await settle();
  assert.equal(queue.getPendingUsageEventCount(), 1);
  refresh = async () => good;
});

test('failed foreground refresh stays deferred until a later network event', async () => {
  const queue = await import('./usageQueue');
  const stop = queue.installUsageQueueReporting();
  network?.(good);
  await settle();
  rn.AppState.emit('background');
  queue.enqueueUsageEvent('refresh-failure', {}, null);
  let refreshCalls = 0;
  refresh = async () => {
    refreshCalls++;
    throw new Error('native state unavailable');
  };
  const callsBefore = geoCalls;
  rn.AppState.emit('active');
  await settle();
  rn.AppState.emit('active');
  mock.timers.tick(300_000);
  await queue.flushUsageQueue();
  assert.equal(refreshCalls, 1);
  assert.equal(geoCalls, callsBefore);
  assert.equal(queue.getPendingUsageEventCount(), 1);
  network?.(good);
  await settle();
  assert.equal(queue.getPendingUsageEventCount(), 0);
  stop();
});
