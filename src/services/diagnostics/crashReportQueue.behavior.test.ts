import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSupabaseModule,
  sourcePath,
} from '../../testing/mockModules';
import {
  createSupabaseFake,
  makeFakeSession,
  type SupabaseFakeError,
} from '../../testing/supabaseFake';
import type { AppErrorReport } from './crashReportModel';
import { assertDefined } from '../../utils/assertDefined';

// The real queue over an in-memory MMKV, a scripted reporting policy and the
// Supabase fake, so each test asserts what is persisted and what is sent.
const mmkv = mockMmkvStorage(mock);
const rn = mockReactNative(mock, { os: 'android', version: 34 });
// One-shot connectivity read used by the launch flush (before the reporting policy exists).
const goodNetwork = {
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
};
let networkState: unknown = goodNetwork;
let networkFetches = 0;
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    default: {
      fetch: async () => {
        networkFetches += 1;
        return networkState;
      },
    },
  },
});
const backend = createSupabaseFake();
mockSupabaseModule(mock, backend);
mockModule(mock, createRequire(import.meta.url).resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '1.0.9' }, nativeBuildVersion: '483' } },
});
let currentRoute: string | null = 'BibleReader';
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    getCurrentRoute: () => (currentRoute ? { name: currentRoute } : undefined),
  },
});

let reportingAllowed = false;
const policyListeners = new Set<() => void>();
mockModule(mock, sourcePath('services/analytics/reportingPolicy.ts'), {
  canReportUsage: () => reportingAllowed,
  subscribeToReportingPolicy: (listener: () => void) => {
    policyListeners.add(listener);
    return () => policyListeners.delete(listener);
  },
});
const setReportingAllowed = (value: boolean) => {
  reportingAllowed = value;
  for (const listener of policyListeners) listener();
};

type Sent = { name: string; reports: AppErrorReport[]; authorization?: string };
const sent: Sent[] = [];
let respond: () => { error: SupabaseFakeError | null } = () => ({ error: null });
// supabase-js FunctionsHttpError carries the HTTP response as `context`.
const httpError = (message: string, status: number) =>
  ({ message, context: { status } }) as SupabaseFakeError;
backend.respondToFunction((name, options) => {
  const { body, headers } = options as {
    body: { reports: AppErrorReport[] };
    headers?: Record<string, string>;
  };
  sent.push({ name, reports: body.reports, authorization: headers?.Authorization });
  return respond();
});

const QUEUE_KEY = 'diagnostics-crash-report-queue-v1';
const persistedQueue = (): AppErrorReport[] => JSON.parse(mmkv.store.get(QUEUE_KEY) ?? '[]');
const load = () => import('./crashReportQueue');
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  const queue = await load();
  queue.resetCrashReportSessionForTests();
  mmkv.store.clear();
  sent.length = 0;
  reportingAllowed = false;
  respond = () => ({ error: null });
  currentRoute = 'BibleReader';
  backend.auth.setSession(null);
  rn.AppState.currentState = 'active';
  networkState = goodNetwork;
  networkFetches = 0;
});

test('a fatal error is persisted synchronously with the current screen and device details', async () => {
  const queue = await load();
  const error = new TypeError('verses is undefined');
  error.stack = 'TypeError: verses is undefined\n    at VerseList (index.android.bundle:1:500)';

  queue.queueCrashReport({ error, kind: 'fatal' });

  assert.equal(persistedQueue().length, 1);
  const report = assertDefined(persistedQueue()[0], 'the persisted crash report');
  assert.equal(report.kind, 'fatal');
  assert.equal(report.is_fatal, true);
  assert.equal(report.screen, 'BibleReader');
  assert.deepEqual(report.stack_frames, ['VerseList (index.android.bundle:1:500)']);
  assert.deepEqual(
    {
      app_version: report.app_version,
      build_number: report.build_number,
      platform: report.platform,
      os_version: report.os_version,
    },
    { app_version: '1.0.9', build_number: '483', platform: 'android', os_version: '34' }
  );
  assert.match(report.install_id ?? '', /^[0-9a-f-]{36}$/);
  assert.match(
    report.report_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  assert.equal(sent.length, 0, 'a dying app must not start network work');
});

test('the install id is stable across reports and never a user id', async () => {
  const queue = await load();
  backend.auth.setSession(makeFakeSession());
  queue.queueCrashReport({ error: new Error('one'), kind: 'error' });
  queue.queueCrashReport({ error: new Error('two'), kind: 'error' });

  const [firstReport, secondReport] = persistedQueue();
  const first = assertDefined(firstReport, 'the first queued report');
  const second = assertDefined(secondReport, 'the second queued report');
  assert.equal(first.install_id, second.install_id);
  assert.ok(!JSON.stringify(persistedQueue()).includes(backend.auth.user?.id ?? 'no-user'));
});

test('the same error is queued once per session', async () => {
  const queue = await load();
  for (let i = 0; i < 5; i++) {
    queue.queueCrashReport({
      error: new Error('row 42 failed'),
      kind: 'boundary',
      screen: 'Home',
    });
  }
  queue.queueCrashReport({ error: new Error('row 7 failed'), kind: 'boundary', screen: 'Home' });

  assert.equal(persistedQueue().length, 1);
});

test('reports are capped per day across sessions', async () => {
  const queue = await load();
  for (let i = 0; i < 25; i++) {
    queue.resetCrashReportSessionForTests({ keepStorage: true });
    queue.queueCrashReport({
      error: new Error(`distinct failure ${'x'.repeat(i)}`),
      kind: 'error',
    });
  }
  assert.equal(persistedQueue().length, 10);
});

test('boundary reports carry the screen and component names, not the raw stack', async () => {
  const queue = await load();
  queue.queueCrashReport({
    error: new Error('bad render'),
    kind: 'boundary',
    screen: 'PlanDetail',
    componentStack: '\n    in PlanDay (at PlanDetail.tsx:12)\n    in PlanDetail',
  });

  const report = assertDefined(persistedQueue()[0], 'the persisted crash report');
  assert.equal(report.screen, 'PlanDetail');
  assert.equal(report.component_stack, 'PlanDay < PlanDetail');
});

test('queued reports wait for the reporting policy, then send anonymously and clear', async () => {
  const queue = await load();
  backend.auth.setSession(makeFakeSession({ access_token: 'user-jwt' }));
  queue.queueCrashReport({ error: new Error('offline failure'), kind: 'error' });
  await settle();
  assert.equal(sent.length, 0);

  const stop = queue.installCrashReporting();
  setReportingAllowed(true);
  await settle();
  await settle();

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.name, 'report-app-errors');
  assert.equal(sent[0]?.authorization, 'Bearer test-public-key');
  assert.equal(sent[0]?.reports[0]?.message, 'offline failure');
  assert.deepEqual(persistedQueue(), []);
  stop();
});

test('a report from a previous launch is sent when reporting starts', async () => {
  const queue = await load();
  queue.queueCrashReport({ error: new Error('crashed last time'), kind: 'fatal' });
  queue.resetCrashReportSessionForTests({ keepStorage: true });
  reportingAllowed = true;

  const stop = queue.installCrashReporting();
  await settle();
  await settle();

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.reports[0]?.kind, 'fatal');
  stop();
});

test('a throttled or failed upload keeps the reports for later', async () => {
  const queue = await load();
  reportingAllowed = true;
  respond = () => ({ error: httpError('Too many', 429) });
  queue.queueCrashReport({ error: new Error('keep me'), kind: 'error' });
  const result = await queue.flushCrashReports();

  assert.equal(result.success, false);
  assert.equal(persistedQueue().length, 1);
});

test('a rejected payload is dropped so it cannot wedge the queue', async () => {
  const queue = await load();
  reportingAllowed = true;
  respond = () => ({ error: httpError('Bad request', 400) });
  queue.queueCrashReport({ error: new Error('malformed'), kind: 'error' });
  await queue.flushCrashReports();

  assert.deepEqual(persistedQueue(), []);
});

test('corrupt persisted state is ignored instead of throwing inside an error handler', async () => {
  const queue = await load();
  mmkv.store.set(QUEUE_KEY, '{not json');
  mmkv.store.set('diagnostics-crash-report-budget-v1', '"nope"');

  assert.doesNotThrow(() =>
    queue.queueCrashReport({ error: new Error('still works'), kind: 'error' })
  );
  assert.equal(persistedQueue().length, 1);
});

test('the pending queue keeps only the newest reports', async () => {
  const queue = await load();
  const { buildCrashReport } = await import('./crashReportModel');
  const stale = Array.from({ length: 20 }, (_, i) =>
    buildCrashReport({
      error: new Error(`old ${i}`),
      kind: 'error',
      screen: null,
      occurredAt: Date.now(),
      reportId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      device: {
        appVersion: '1',
        buildNumber: null,
        platform: 'ios',
        osVersion: null,
        installId: null,
      },
    })
  );
  mmkv.store.set(QUEUE_KEY, JSON.stringify([...stale, { report_id: 'not-a-report' }]));
  queue.queueCrashReport({ error: new Error('newest'), kind: 'error' });

  const persisted = persistedQueue();
  assert.equal(persisted.length, 20);
  assert.equal(persisted[0]?.message, 'old 1');
  assert.equal(persisted[19]?.message, 'newest');
});

const CRASH_LOG_KEY = 'diagnostics-crash-log';
const localLog = (): Array<{ message: string; isFatal: boolean }> =>
  JSON.parse(mmkv.store.get(CRASH_LOG_KEY) ?? '[]');

test('a handled error is queued with its source and shown on the Diagnostics screen', async () => {
  const queue = await load();
  queue.reportHandledError('audio.load', new Error('decoder failed for jane@example.com'));

  assert.equal(persistedQueue().length, 1);
  const report = assertDefined(persistedQueue()[0], 'the persisted crash report');
  assert.equal(report.kind, 'error');
  assert.equal(report.is_fatal, false);
  assert.equal(report.message, '[audio.load] decoder failed for <email>');
  assert.equal(report.screen, 'BibleReader');
  assert.deepEqual(
    localLog().map((entry) => [entry.message, entry.isFatal]),
    [['[audio.load] decoder failed for <email>', false]]
  );
});

test('handled errors leave room in the daily budget for crashes', async () => {
  const queue = await load();
  for (let i = 0; i < 12; i++) {
    queue.resetCrashReportSessionForTests({ keepStorage: true });
    queue.reportHandledError('sync', new Error(`distinct sync failure ${'x'.repeat(i)}`));
  }
  const handled = persistedQueue().length;
  assert.ok(handled > 0 && handled < 10, `handled errors took ${handled} of 10 daily slots`);

  queue.queueCrashReport({ error: new Error('the crash that matters'), kind: 'fatal' });
  assert.equal(persistedQueue().at(-1)?.message, 'the crash that matters');
});

test('transient network failures are not reported as handled errors', async () => {
  const queue = await load();
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  queue.reportHandledError('sync', new TypeError('Network request failed'));
  queue.reportHandledError('audio.load', abort);
  queue.reportHandledError('textPack.install', new Error('The request timed out.'));
  queue.reportHandledError('sync', { message: 'The Internet connection appears to be offline.' });

  assert.deepEqual(persistedQueue(), []);
});

test('a source label that is not a plain identifier is not sent', async () => {
  const queue = await load();
  queue.reportHandledError('jane@example.com', new Error('odd label'));

  assert.equal(persistedQueue()[0]?.message, '[unknown] odd label');
});

test('reporting a handled error never throws, even when storage fails', async () => {
  const queue = await load();
  const throwOnSet = mock.method(mmkv.mmkvInstance, 'set', () => {
    throw new Error('MMKV full');
  });
  try {
    assert.doesNotThrow(() => queue.reportHandledError('db.import', new Error('disk full')));
  } finally {
    throwOnSet.mock.restore();
  }
});

// The reporting policy is owned by the runtime effects, which mount only after onboarding.
// Without a launch flush, a crash during onboarding (or a first-launch crash loop) would
// sit in the queue until the user finished onboarding, which a crash loop prevents.
test('a pending crash is sent at launch before the reporting policy exists', async () => {
  const queue = await load();
  queue.queueCrashReport({ error: new Error('crashed during onboarding'), kind: 'fatal' });
  queue.resetCrashReportSessionForTests({ keepStorage: true });

  const result = await queue.flushPendingCrashReportsAtLaunch();

  assert.deepEqual(result, { success: true, sent: 1 });
  assert.equal(sent[0]?.reports[0]?.message, 'crashed during onboarding');
  assert.deepEqual(persistedQueue(), []);
});

test('the launch flush waits when the connection is metered or offline', async () => {
  const queue = await load();
  queue.queueCrashReport({ error: new Error('wait for wifi'), kind: 'fatal' });

  networkState = { ...goodNetwork, details: { isConnectionExpensive: true } };
  assert.equal((await queue.flushPendingCrashReportsAtLaunch()).deferred, true);
  networkState = { ...goodNetwork, isConnected: false };
  assert.equal((await queue.flushPendingCrashReportsAtLaunch()).deferred, true);

  assert.equal(sent.length, 0);
  assert.equal(persistedQueue().length, 1);
});

test('the launch flush does nothing in the background', async () => {
  const queue = await load();
  queue.queueCrashReport({ error: new Error('background launch'), kind: 'fatal' });
  rn.AppState.currentState = 'background';

  assert.equal((await queue.flushPendingCrashReportsAtLaunch()).deferred, true);
  assert.equal(sent.length, 0);
});

test('the launch flush reads nothing native when no report is pending', async () => {
  const queue = await load();

  assert.deepEqual(await queue.flushPendingCrashReportsAtLaunch(), { success: true, sent: 0 });
  assert.equal(networkFetches, 0);
});
