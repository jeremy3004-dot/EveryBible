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

// The real queue over an in-memory MMKV, a scripted reporting policy and the
// Supabase fake, so each test asserts what is persisted and what is sent.
const mmkv = mockMmkvStorage(mock);
mockReactNative(mock, { os: 'android', version: 34 });
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
});

test('a fatal error is persisted synchronously with the current screen and device details', async () => {
  const queue = await load();
  const error = new TypeError('verses is undefined');
  error.stack = 'TypeError: verses is undefined\n    at VerseList (index.android.bundle:1:500)';

  queue.queueCrashReport({ error, kind: 'fatal' });

  const [report] = persistedQueue();
  assert.equal(persistedQueue().length, 1);
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

  const [first, second] = persistedQueue();
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

  const [report] = persistedQueue();
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
  assert.equal(sent[0].name, 'report-app-errors');
  assert.equal(sent[0].authorization, 'Bearer test-public-key');
  assert.equal(sent[0].reports[0].message, 'offline failure');
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
  assert.equal(sent[0].reports[0].kind, 'fatal');
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
  assert.equal(persisted[0].message, 'old 1');
  assert.equal(persisted[19].message, 'newest');
});
