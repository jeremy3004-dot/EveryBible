/**
 * Behaviour of the admin "App errors" loader (lib/app-errors.ts) through the real module
 * loader, with only the admin gate and the service-role Supabase client replaced.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { createSupabaseFake, mockModule } from './testing/adminTestHarness';

const service = createSupabaseFake();
const authRejection = new Error('Admin identity required');
let authorized = true;
let serviceClientCreations = 0;

mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    if (!authorized) throw authRejection;
    return { id: 'admin-1', role: 'super_admin' };
  },
});
mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => {
    serviceClientCreations += 1;
    return service.client;
  },
});

const appErrors = await import('./app-errors');

beforeEach(() => {
  service.reset();
  authorized = true;
  serviceClientCreations = 0;
});

test('a non-admin is refused before the service-role client is created', async () => {
  authorized = false;
  await assert.rejects(appErrors.getAppErrorSummary(7), (error) => error === authRejection);
  assert.equal(serviceClientCreations, 0);
  assert.deepEqual(service.calls, []);
});

test('only the 7- and 30-day windows are accepted', () => {
  assert.equal(appErrors.normalizeAppErrorWindow('30'), 30);
  assert.equal(appErrors.normalizeAppErrorWindow(['7', '30']), 7);
  for (const untrusted of [undefined, '', '90', '7; drop', '-7', null]) {
    assert.equal(appErrors.normalizeAppErrorWindow(untrusted), 7, String(untrusted));
  }
});

test('the summary RPC is asked for the selected UTC window including today', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T21:15:00.000Z') });
  await appErrors.getAppErrorSummary(30);
  const [call] = service.callsFor('rpc:get_admin_app_error_summary');
  assert.deepEqual(call.payload, { p_since: '2026-08-26T00:00:00.000Z', p_limit: 50 });
});

test('an empty or missing payload renders as an empty summary', async () => {
  service.respondToRpc('get_admin_app_error_summary', () => ({ data: null }));
  assert.deepEqual(await appErrors.getAppErrorSummary(7), {
    windowDays: 7,
    totals: { reports: 0, fatal: 0, installs: 0, fingerprints: 0 },
    byVersion: [],
    byPlatform: [],
    fingerprints: [],
  });
});

test('rows are coerced and breakdowns are sorted by count', async () => {
  service.respondToRpc('get_admin_app_error_summary', () => ({
    data: {
      totals: { reports: '14', fatal: 3, installs: '9', fingerprints: 2 },
      byVersion: { '1.0.8': 4, '1.0.9': '10' },
      byPlatform: { ios: 5, android: 9 },
      fingerprints: [
        {
          fingerprint: 'abc123',
          errorName: 'TypeError',
          message: 'x is undefined',
          screen: 'BibleReader',
          kind: 'boundary',
          stackFrames: ['VerseList (main.jsbundle:1:10)', 42],
          componentStack: 'VerseList < BibleReader',
          reportCount: '12',
          fatalCount: 0,
          installCount: 8,
          firstSeen: '2026-09-20T00:00:00Z',
          lastSeen: '2026-09-24T00:00:00Z',
          byVersion: { '1.0.9': 10, '1.0.8': 2 },
          byPlatform: { android: 12 },
        },
        { fingerprint: null },
      ],
    },
  }));

  const summary = await appErrors.getAppErrorSummary(7);
  assert.deepEqual(summary.totals, { reports: 14, fatal: 3, installs: 9, fingerprints: 2 });
  assert.deepEqual(summary.byVersion, [
    { label: '1.0.9', count: 10 },
    { label: '1.0.8', count: 4 },
  ]);
  assert.deepEqual(summary.byPlatform, [
    { label: 'android', count: 9 },
    { label: 'ios', count: 5 },
  ]);
  assert.equal(summary.fingerprints.length, 1);
  assert.deepEqual(summary.fingerprints[0], {
    fingerprint: 'abc123',
    errorName: 'TypeError',
    message: 'x is undefined',
    screen: 'BibleReader',
    kind: 'boundary',
    stackFrames: ['VerseList (main.jsbundle:1:10)'],
    componentStack: 'VerseList < BibleReader',
    reportCount: 12,
    fatalCount: 0,
    installCount: 8,
    firstSeen: '2026-09-20T00:00:00Z',
    lastSeen: '2026-09-24T00:00:00Z',
    byVersion: [
      { label: '1.0.9', count: 10 },
      { label: '1.0.8', count: 2 },
    ],
    byPlatform: [{ label: 'android', count: 12 }],
  });
});

test('an RPC error surfaces to the route error boundary', async () => {
  service.respondToRpc('get_admin_app_error_summary', () => ({
    error: { message: 'function does not exist' },
  }));
  await assert.rejects(appErrors.getAppErrorSummary(7), /Unable to load app errors/);
});
