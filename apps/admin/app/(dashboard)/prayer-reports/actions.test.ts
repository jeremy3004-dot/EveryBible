/**
 * Prayer wall moderation actions on the admin Reports page. Admin gating for every export is
 * covered by app/serverBoundaryAuth.test.ts; here the caller is a super_admin.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import {
  captureRedirect,
  createSupabaseFake,
  formData,
  mockModule,
  mockNextServerRuntime,
  stepArgs,
  type SupabaseQueryCall,
} from '../../../lib/testing/adminTestHarness';

const ADMIN = { email: 'ops@everybible.app', id: 'admin-1', name: 'Ops Lead', role: 'super_admin' };

const service = createSupabaseFake();
mockModule(mock, '@/lib/admin-auth', { requireAdminIdentity: async () => ADMIN });
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });
const next = mockNextServerRuntime(mock);

const {
  addPrayerFilterTermAction,
  banPrayerAuthorAction,
  deletePrayerRequestAction,
  hidePrayerRequestAction,
  removePrayerFilterTermAction,
  restorePrayerRequestAction,
  unbanPrayerAuthorAction,
} = await import('./actions');

const REQUEST = {
  id: 'req-1',
  group_id: 'group-1',
  user_id: 'user-a',
  content: 'the reported text',
};

let requestRow: typeof REQUEST | null = REQUEST;
let hiddenByBan: Array<{ id: string }> = [];

beforeEach(() => {
  service.reset();
  next.revalidatedPaths.length = 0;
  requestRow = REQUEST;
  hiddenByBan = [{ id: 'req-1' }, { id: 'req-2' }];
  service.respondTo('prayer_requests', (call: SupabaseQueryCall) => {
    if (
      call.operation === 'update' &&
      stepArgs(call, 'eq').some(([column]) => column === 'user_id')
    ) {
      return { data: hiddenByBan };
    }
    return { data: requestRow };
  });
  service.respondTo('prayer_request_reports', () => ({ data: null }));
  service.respondTo('prayer_wall_bans', (call: SupabaseQueryCall) => ({
    data: call.operation === 'delete' ? { user_id: 'user-a' } : null,
  }));
  service.respondTo('prayer_content_filter_terms', (call: SupabaseQueryCall) => ({
    data:
      call.operation === 'delete'
        ? { id: 7, term: 'word', match_mode: 'word', language: 'en' }
        : { id: 8 },
  }));
  service.respondTo('admin_audit_logs', () => ({ data: null }));
});

const callsOf = (table: string, operation: string) =>
  service.callsFor(table).filter((call) => call.operation === operation);
const auditRows = () =>
  service.callsFor('admin_audit_logs').map((call) => call.payload as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Hide / restore
// ---------------------------------------------------------------------------

test('hiding a request marks it hidden by an admin and closes its open reports', async () => {
  const url = await captureRedirect(() =>
    hidePrayerRequestAction(
      formData({ requestId: 'req-1', returnTo: '/prayer-reports?status=all' })
    )
  );

  assert.equal(url, '/prayer-reports?status=all&notice=Request%20hidden');
  const [update] = callsOf('prayer_requests', 'update');
  const payload = update.payload as Record<string, unknown>;
  assert.equal(payload.hidden_reason, 'admin');
  assert.match(String(payload.hidden_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(stepArgs(update, 'eq'), [['id', 'req-1']]);

  const [reports] = callsOf('prayer_request_reports', 'update');
  assert.deepEqual(
    { ...(reports.payload as Record<string, unknown>), reviewed_at: 'now' },
    { status: 'actioned', reviewed_at: 'now', reviewed_by: 'admin-1' }
  );
  assert.deepEqual(stepArgs(reports, 'eq'), [
    ['request_id', 'req-1'],
    ['status', 'open'],
  ]);

  assert.deepEqual(auditRows(), [
    {
      action: 'prayer_wall.request.hide',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'req-1',
      entity_type: 'prayer_request',
      metadata: { authorId: 'user-a', groupId: 'group-1' },
      summary: 'Hid prayer request req-1 by user-a.',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/prayer-reports']);
});

test('restoring a request un-hides it and dismisses its open reports', async () => {
  const url = await captureRedirect(() =>
    restorePrayerRequestAction(formData({ requestId: 'req-1' }))
  );

  assert.equal(url, '/prayer-reports?notice=Request%20restored');
  assert.deepEqual(callsOf('prayer_requests', 'update')[0].payload, {
    hidden_at: null,
    hidden_reason: null,
  });
  assert.equal(
    (callsOf('prayer_request_reports', 'update')[0].payload as { status: string }).status,
    'dismissed'
  );
  assert.equal(auditRows()[0].action, 'prayer_wall.request.restore');
});

test('acting on a request that no longer exists reports it and writes no audit row', async () => {
  requestRow = null;

  const url = await captureRedirect(() => hidePrayerRequestAction(formData({ requestId: 'gone' })));

  assert.equal(url, '/prayer-reports?error=That%20request%20no%20longer%20exists');
  assert.deepEqual(callsOf('prayer_request_reports', 'update'), []);
  assert.deepEqual(auditRows(), []);
});

test('a returnTo outside the Reports page is ignored', async () => {
  const url = await captureRedirect(() =>
    hidePrayerRequestAction(formData({ requestId: 'req-1', returnTo: 'https://evil.example/' }))
  );

  assert.equal(url, '/prayer-reports?notice=Request%20hidden');
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('deleting needs the confirmation box ticked', async () => {
  const url = await captureRedirect(() =>
    deletePrayerRequestAction(formData({ requestId: 'req-1' }))
  );

  assert.equal(url, '/prayer-reports?error=Tick%20the%20box%20to%20confirm%20the%20delete');
  assert.deepEqual(service.calls, []);
});

test('deleting a request removes it and keeps its text in the audit log as evidence', async () => {
  const url = await captureRedirect(() =>
    deletePrayerRequestAction(formData({ requestId: 'req-1', confirm: 'yes' }))
  );

  assert.equal(url, '/prayer-reports?notice=Request%20deleted');
  const [remove] = callsOf('prayer_requests', 'delete');
  assert.deepEqual(stepArgs(remove, 'eq'), [['id', 'req-1']]);
  assert.deepEqual(auditRows(), [
    {
      action: 'prayer_wall.request.delete',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'req-1',
      entity_type: 'prayer_request',
      metadata: { authorId: 'user-a', content: 'the reported text', groupId: 'group-1' },
      summary: 'Deleted prayer request req-1 by user-a.',
    },
  ]);
});

// ---------------------------------------------------------------------------
// Ban / unban
// ---------------------------------------------------------------------------

test('banning an author stops them posting, hides their requests and closes their reports', async () => {
  const url = await captureRedirect(() =>
    banPrayerAuthorAction(formData({ userId: 'user-a', reason: '  repeated abuse  ' }))
  );

  assert.equal(url, '/prayer-reports?notice=Author%20banned%20from%20the%20prayer%20wall');
  const [ban] = callsOf('prayer_wall_bans', 'upsert');
  assert.deepEqual(ban.payload, {
    user_id: 'user-a',
    reason: 'repeated abuse',
    banned_by: 'admin-1',
  });
  assert.deepEqual(ban.options, { onConflict: 'user_id' });

  const [hide] = callsOf('prayer_requests', 'update');
  assert.equal((hide.payload as { hidden_reason: string }).hidden_reason, 'admin');
  assert.deepEqual(stepArgs(hide, 'eq'), [['user_id', 'user-a']]);
  assert.deepEqual(stepArgs(hide, 'is'), [['hidden_at', null]]);

  const [reports] = callsOf('prayer_request_reports', 'update');
  assert.deepEqual(stepArgs(reports, 'eq'), [
    ['request_author_id', 'user-a'],
    ['status', 'open'],
  ]);
  assert.deepEqual(auditRows(), [
    {
      action: 'prayer_wall.author.ban',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'user-a',
      entity_type: 'profile',
      metadata: { hiddenRequestCount: 2, reason: 'repeated abuse' },
      summary: 'Banned user-a from the prayer wall and hid 2 of their requests.',
    },
  ]);
});

test('a ban reason over 500 characters is refused before any write', async () => {
  const url = await captureRedirect(() =>
    banPrayerAuthorAction(formData({ userId: 'user-a', reason: 'x'.repeat(501) }))
  );

  assert.equal(url, '/prayer-reports?error=The%20reason%20can%20be%20at%20most%20500%20characters');
  assert.deepEqual(service.calls, []);
});

test('unbanning an author lets them post again', async () => {
  const url = await captureRedirect(() => unbanPrayerAuthorAction(formData({ userId: 'user-a' })));

  assert.equal(url, '/prayer-reports?notice=Author%20can%20post%20again');
  assert.deepEqual(stepArgs(callsOf('prayer_wall_bans', 'delete')[0], 'eq'), [
    ['user_id', 'user-a'],
  ]);
  assert.equal(auditRows()[0].action, 'prayer_wall.author.unban');
});

// ---------------------------------------------------------------------------
// Content filter
// ---------------------------------------------------------------------------

test('adding a filter term stores it with its author', async () => {
  const url = await captureRedirect(() =>
    addPrayerFilterTermAction(formData({ term: ' phrase ', matchMode: 'word', language: 'en' }))
  );

  assert.equal(url, '/prayer-reports?notice=Filter%20term%20added');
  assert.deepEqual(callsOf('prayer_content_filter_terms', 'insert')[0].payload, {
    term: 'phrase',
    match_mode: 'word',
    language: 'en',
    created_by: 'admin-1',
  });
  assert.deepEqual(auditRows()[0].metadata, { language: 'en', matchMode: 'word', term: 'phrase' });
});

test('an invalid filter term is refused before any write', async () => {
  const url = await captureRedirect(() =>
    addPrayerFilterTermAction(formData({ term: 'word', matchMode: 'regex' }))
  );

  assert.equal(url, '/prayer-reports?error=Match%20mode%20must%20be%20word%20or%20substring');
  assert.deepEqual(service.calls, []);
});

test('removing a filter term deletes it by id', async () => {
  const url = await captureRedirect(() => removePrayerFilterTermAction(formData({ termId: '7' })));

  assert.equal(url, '/prayer-reports?notice=Filter%20term%20removed');
  assert.deepEqual(stepArgs(callsOf('prayer_content_filter_terms', 'delete')[0], 'eq'), [
    ['id', 7],
  ]);
  assert.equal(auditRows()[0].action, 'prayer_wall.filter_term.remove');
});

test('a database error is shown to the operator', async () => {
  service.respondTo('prayer_content_filter_terms', () => ({
    error: { message: 'duplicate key value violates unique constraint' },
  }));

  const url = await captureRedirect(() => addPrayerFilterTermAction(formData({ term: 'word' })));

  assert.equal(
    url,
    '/prayer-reports?error=duplicate%20key%20value%20violates%20unique%20constraint'
  );
  assert.deepEqual(auditRows(), []);
});
