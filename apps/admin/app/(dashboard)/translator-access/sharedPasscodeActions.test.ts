/**
 * The admin switch that retires the old shared translator passcode without a deploy.
 * review-chapter-feedback reads public.translator_access_settings on every translator request.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import {
  RedirectSignal,
  captureRedirect,
  createSupabaseFake,
  formData,
  mockModule,
  mockNextServerRuntime,
} from '../../../lib/testing/adminTestHarness';

const ADMIN = { email: 'ops@everybible.app', id: 'admin-1', name: 'Ops Lead', role: 'super_admin' };
const SETTINGS_TABLE = 'translator_access_settings';

const service = createSupabaseFake();
let adminGate: 'admin' | 'forbidden' = 'admin';
let writeFails: string | null = null;

mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    if (adminGate === 'forbidden') throw new RedirectSignal('/login?reason=forbidden');
    return ADMIN;
  },
});
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });
const next = mockNextServerRuntime(mock);

const { setSharedPasscodeAllowedAction } = await import('./actions');

beforeEach(() => {
  service.reset();
  adminGate = 'admin';
  writeFails = null;
  next.revalidatedPaths.length = 0;
  service.respondTo(SETTINGS_TABLE, () =>
    writeFails ? { data: null, error: { message: writeFails } } : { data: { id: true } }
  );
});

const writes = () => service.callsFor(SETTINGS_TABLE).filter((call) => call.operation === 'upsert');
const auditRows = () => service.callsFor('admin_audit_logs').map((call) => call.payload);

test('switching the shared passcode off records who and when, audits it and says so', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-25T09:00:00.000Z') });

  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'false', confirm: 'yes' }))
  );

  assert.equal(
    url,
    `/translator-access?notice=${encodeURIComponent(
      'The shared passcode is off. Only team passcodes open the review queue now.'
    )}`
  );
  const [write] = writes();
  assert.deepEqual(write.payload, {
    id: true,
    shared_passcode_enabled: false,
    updated_at: '2026-09-25T09:00:00.000Z',
    updated_by: 'admin-1',
  });
  assert.deepEqual(write.options, { onConflict: 'id' });
  assert.deepEqual(auditRows(), [
    {
      action: 'translator_access.shared_passcode.disable',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'shared_passcode',
      entity_type: 'translator_access_settings',
      metadata: { allowed: false },
      summary: 'Turned off the shared translator passcode.',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/translator-access']);
});

test('switching it off without ticking the confirmation changes nothing', async () => {
  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'false' }))
  );

  assert.match(decodeURIComponent(url), /error=Tick the box to confirm/);
  assert.deepEqual(writes(), []);
  assert.deepEqual(auditRows(), []);
});

test('the shared passcode can be switched back on without a confirmation', async () => {
  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'true' }))
  );

  assert.match(decodeURIComponent(url), /notice=The shared passcode is allowed again/);
  assert.equal(
    (writes()[0].payload as { shared_passcode_enabled: boolean }).shared_passcode_enabled,
    true
  );
  assert.equal(
    (auditRows()[0] as { action: string }).action,
    'translator_access.shared_passcode.enable'
  );
});

test('an unrecognised choice changes nothing', async () => {
  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'maybe', confirm: 'yes' }))
  );

  assert.match(decodeURIComponent(url), /error=/);
  assert.deepEqual(service.calls, []);
});

test('a failed write is reported and not audited', async () => {
  writeFails = 'relation "translator_access_settings" does not exist';

  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'false', confirm: 'yes' }))
  );

  assert.match(decodeURIComponent(url), /error=Could not change the shared passcode setting/);
  assert.deepEqual(auditRows(), []);
});

test('a non-admin caller cannot flip the switch', async () => {
  adminGate = 'forbidden';

  const url = await captureRedirect(() =>
    setSharedPasscodeAllowedAction(formData({ allowed: 'false', confirm: 'yes' }))
  );

  assert.match(url, /^\/login\?reason=forbidden/);
  assert.deepEqual(service.calls, []);
});
