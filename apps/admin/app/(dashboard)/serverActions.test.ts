/**
 * Behaviour of the dashboard's mutating server actions: catalog management,
 * Scripture Council feedback resolution and the engagement refresh. Admin
 * authorization itself is covered by app/serverBoundaryAuth.test.ts; here the
 * caller is always a super_admin and the tests pin what each action writes,
 * audits, revalidates and where it sends the operator.
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
} from '../../lib/testing/adminTestHarness';

const ADMIN = {
  email: 'ops@everybible.app',
  id: 'admin-1',
  name: 'Ops Lead',
  role: 'super_admin',
};

const service = createSupabaseFake();
const syncRuns: Array<string | null> = [];
let syncResult: unknown = null;
let syncFailure: Error | null = null;
const loggedErrors: unknown[][] = [];

mockModule(mock, '@/lib/admin-auth', { requireAdminIdentity: async () => ADMIN });
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });
mockModule(mock, '@/lib/upstream-sync', {
  runUpstreamTranslationSync: async (actor: string | null) => {
    syncRuns.push(actor);
    if (syncFailure) throw syncFailure;
    return syncResult;
  },
});
const next = mockNextServerRuntime(mock);

const { runTranslationSyncAction, updateTranslationMetadataAction } = await import('./actions');
const { markChapterFeedbackScriptureCouncilFixedAction } = await import('./feedback/actions');
const { refreshEngagementStats } = await import('./analytics/actions');

beforeEach(() => {
  service.reset();
  syncRuns.length = 0;
  syncResult = { runId: 'run-9', insertedCount: 3, updatedCount: 5, failedCount: 0 };
  syncFailure = null;
  next.revalidatedPaths.length = 0;
  next.revalidatedTags.length = 0;
  loggedErrors.length = 0;
});

function auditRows() {
  return service.callsFor('admin_audit_logs').map((call) => call.payload);
}

// ---------------------------------------------------------------------------
// Translation catalog
// ---------------------------------------------------------------------------

test('running the upstream sync records the acting admin, audits the run and returns to the catalog', async () => {
  const url = await captureRedirect(() => runTranslationSyncAction());

  assert.deepEqual(syncRuns, ['admin-1']);
  assert.deepEqual(auditRows(), [
    {
      action: 'translation.sync.run',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'run-9',
      entity_type: 'translation_sync_run',
      metadata: { runId: 'run-9', insertedCount: 3, updatedCount: 5, failedCount: 0 },
      summary: 'Triggered upstream translation sync (3 inserted, 5 updated).',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/', '/translations', '/health']);
  assert.equal(url, '/translations?notice=Translation sync completed successfully');
});

test('a failed upstream sync surfaces the error and records no success', async () => {
  syncFailure = new Error('Upstream API unreachable');
  await assert.rejects(runTranslationSyncAction(), /Upstream API unreachable/);
  assert.deepEqual(auditRows(), []);
  assert.deepEqual(next.revalidatedPaths, []);
});

test('saving catalog metadata without a translation id changes nothing', async () => {
  const url = await captureRedirect(() =>
    updateTranslationMetadataAction(formData({ translationId: '   ', distributionState: 'hidden' }))
  );
  assert.equal(url, '/translations?error=Missing translation id');
  assert.deepEqual(service.calls, []);
});

test('saving catalog metadata updates only the EveryBible-local columns of that translation', async () => {
  const url = await captureRedirect(() =>
    updateTranslationMetadataAction(
      formData({
        translationId: ' bsb ',
        distributionState: 'published',
        adminNotes: '  Council approved  ',
        isAvailable: 'on',
      })
    )
  );

  const [update] = service.callsFor('translation_catalog');
  assert.equal(update.operation, 'update');
  assert.deepEqual(update.payload, {
    distribution_state: 'published',
    is_available: true,
  });
  assert.deepEqual(stepArgs(update, 'eq'), [['translation_id', 'bsb']]);
  // Operator notes live in the admin-only side table, which client roles cannot read.
  const [notes] = service.callsFor('translation_catalog_admin');
  assert.equal(notes.operation, 'upsert');
  assert.deepEqual(notes.payload, { admin_notes: 'Council approved', translation_id: 'bsb' });
  assert.deepEqual(notes.options, { onConflict: 'translation_id' });
  assert.deepEqual(auditRows(), [
    {
      action: 'translation.metadata.update',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'bsb',
      entity_type: 'translation',
      metadata: {
        adminNotes: 'Council approved',
        distributionState: 'published',
        isAvailable: true,
      },
      summary: 'Updated EveryBible-local metadata for bsb.',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/translations', '/translations/bsb', '/health']);
  assert.equal(url, '/translations/bsb?notice=Translation metadata saved');
});

test('an unchecked availability box hides the translation and blank fields fall back to defaults', async () => {
  await captureRedirect(() =>
    updateTranslationMetadataAction(formData({ translationId: 'web', adminNotes: '   ' }))
  );
  assert.deepEqual(service.callsFor('translation_catalog')[0].payload, {
    distribution_state: 'draft',
    is_available: false,
  });
  assert.deepEqual(service.callsFor('translation_catalog_admin')[0].payload, {
    admin_notes: null,
    translation_id: 'web',
  });
});

test('a rejected catalog update reports the database error and is not audited', async () => {
  service.respondTo('translation_catalog', () => ({
    error: { message: 'new row violates check constraint "distribution_state"' },
  }));
  const url = await captureRedirect(() =>
    updateTranslationMetadataAction(formData({ translationId: 'bsb', distributionState: 'bogus' }))
  );
  assert.equal(
    url,
    `/translations/bsb?error=${encodeURIComponent(
      'new row violates check constraint "distribution_state"'
    )}`
  );
  assert.deepEqual(auditRows(), []);
  assert.deepEqual(next.revalidatedPaths, []);
  assert.deepEqual(service.callsFor('translation_catalog_admin'), []);
});

test('a rejected notes write still audits the catalog change that already committed', async () => {
  // The catalog update (availability, distribution state) is live before the notes upsert runs.
  // Redirecting with the error but without an audit row would leave a published/hidden flip
  // with no record of who made it.
  service.respondTo('translation_catalog_admin', () => ({
    error: {
      message: 'insert or update on table "translation_catalog_admin" violates foreign key',
    },
  }));
  const url = await captureRedirect(() =>
    updateTranslationMetadataAction(
      formData({
        translationId: 'bsb',
        adminNotes: 'Hold',
        distributionState: 'hidden',
      })
    )
  );
  assert.equal(
    url,
    `/translations/bsb?error=${encodeURIComponent(
      'insert or update on table "translation_catalog_admin" violates foreign key'
    )}`
  );
  assert.deepEqual(auditRows(), [
    {
      action: 'translation.metadata.update',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'bsb',
      entity_type: 'translation',
      metadata: {
        adminNotesError:
          'insert or update on table "translation_catalog_admin" violates foreign key',
        distributionState: 'hidden',
        isAvailable: false,
      },
      summary: 'Updated EveryBible-local metadata for bsb (admin notes were not saved).',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/translations', '/translations/bsb', '/health']);
});

test('a failed audit write does not undo or hide a committed catalog update', async (t) => {
  t.mock.method(console, 'error', (...args: unknown[]) => loggedErrors.push(args));
  service.respondTo('admin_audit_logs', () => ({ error: { message: 'audit table locked' } }));
  const url = await captureRedirect(() =>
    updateTranslationMetadataAction(formData({ translationId: 'bsb' }))
  );
  assert.equal(url, '/translations/bsb?notice=Translation metadata saved');
  assert.equal(loggedErrors.length, 1);
  assert.match(String(loggedErrors[0][0]), /FAILED to record admin action/);
});

// ---------------------------------------------------------------------------
// Scripture Council feedback resolution
// ---------------------------------------------------------------------------

const fixedRow = { id: 'feedback-1', translation_id: 'npiulb', book_id: 'GEN', chapter: 3 };

test('marking feedback fixed records who fixed it, when, and why, then audits it', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T08:30:00.000Z') });
  service.respondTo('chapter_feedback_submissions', () => ({ data: fixedRow }));

  const url = await captureRedirect(() =>
    markChapterFeedbackScriptureCouncilFixedAction(
      formData({
        feedbackId: 'feedback-1',
        note: 'Corrected verse 4 wording.',
        returnTo: '/feedback?language=Nepali',
      })
    )
  );

  const [update] = service.callsFor('chapter_feedback_submissions');
  assert.deepEqual(update.payload, {
    scripture_council_resolution: 'fixed',
    scripture_council_fixed_at: '2026-09-24T08:30:00.000Z',
    scripture_council_fixed_by: 'admin-1',
    scripture_council_fixed_note: 'Corrected verse 4 wording.',
  });
  // Only "needs work" feedback can be marked fixed.
  assert.deepEqual(stepArgs(update, 'eq'), [
    ['id', 'feedback-1'],
    ['sentiment', 'down'],
  ]);
  assert.equal(update.single, true);
  assert.deepEqual(auditRows(), [
    {
      action: 'chapter_feedback.scripture_council_fix.mark_fixed',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'feedback-1',
      entity_type: 'chapter_feedback_submission',
      metadata: {
        bookId: 'GEN',
        chapter: 3,
        fixedAt: '2026-09-24T08:30:00.000Z',
        note: 'Corrected verse 4 wording.',
        translationId: 'npiulb',
      },
      summary: 'Marked Scripture Council feedback fixed for npiulb GEN 3.',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/feedback']);
  assert.equal(url, '/feedback?language=Nepali&notice=Feedback marked fixed');
});

for (const [label, note] of [
  ['a missing', undefined],
  ['a blank', '   '],
  ['an over-long', 'x'.repeat(1001)],
] as const) {
  test(`marking feedback fixed with ${label} explanation writes nothing`, async () => {
    const url = await captureRedirect(() =>
      markChapterFeedbackScriptureCouncilFixedAction(
        formData({ feedbackId: 'feedback-1', ...(note === undefined ? {} : { note }) })
      )
    );
    assert.equal(url, '/feedback?error=An explanation of at most 1000 characters is required');
    assert.deepEqual(service.calls, []);
  });
}

test('marking feedback fixed without a feedback id writes nothing', async () => {
  const url = await captureRedirect(() =>
    markChapterFeedbackScriptureCouncilFixedAction(formData({ note: 'Done' }))
  );
  assert.equal(url, '/feedback?error=Missing feedback id');
  assert.deepEqual(service.calls, []);
});

for (const returnTo of ['https://evil.example/phish', '//evil.example', '/translations']) {
  test(`marking feedback fixed never returns the operator outside /feedback (${returnTo})`, async () => {
    service.respondTo('chapter_feedback_submissions', () => ({ data: fixedRow }));
    const url = await captureRedirect(() =>
      markChapterFeedbackScriptureCouncilFixedAction(
        formData({ feedbackId: 'feedback-1', note: 'Done', returnTo })
      )
    );
    assert.equal(url, '/feedback?notice=Feedback marked fixed');
  });
}

test('feedback that is not open "needs work" feedback is reported, not audited', async () => {
  service.respondTo('chapter_feedback_submissions', () => ({
    data: null,
    error: { message: 'JSON object requested, multiple (or no) rows returned' },
  }));
  const url = await captureRedirect(() =>
    markChapterFeedbackScriptureCouncilFixedAction(
      formData({ feedbackId: 'feedback-up', note: 'Done' })
    )
  );
  assert.equal(
    url,
    `/feedback?error=${encodeURIComponent('JSON object requested, multiple (or no) rows returned')}`
  );
  assert.deepEqual(auditRows(), []);
  assert.deepEqual(next.revalidatedPaths, []);
});

// ---------------------------------------------------------------------------
// Engagement refresh
// ---------------------------------------------------------------------------

test('refreshing engagement invokes the aggregate-engagement edge function with the service client', async () => {
  await refreshEngagementStats();
  assert.deepEqual(service.functionCalls, [
    { name: 'aggregate-engagement', options: { body: {}, method: 'POST' } },
  ]);
  assert.deepEqual(service.calls, []);
  assert.deepEqual(next.revalidatedTags, ['admin-analytics-overview']);
});

test('a failed engagement refresh is reported to the operator', async () => {
  service.respondToFunction(() => ({ error: { message: 'Edge Function returned 500' } }));
  await assert.rejects(refreshEngagementStats(), {
    message: 'Engagement refresh failed: Edge Function returned 500',
  }); // The cached overview is still dropped, so the follow-up refresh shows live data.
  assert.deepEqual(next.revalidatedTags, ['admin-analytics-overview']);
});
