/**
 * The admin Reports page's data: reports grouped per prayer request, the filter-term form
 * parser, and the loaders that read the service-only moderation tables.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { createSupabaseFake, formData, mockModule, stepArgs } from './testing/adminTestHarness';

const service = createSupabaseFake();
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });

const { getPrayerFilterTerms, getPrayerReportQueue, groupPrayerReports, parseFilterTermInput } =
  await import('./prayer-moderation');

const report = (overrides: Record<string, unknown> = {}) => ({
  id: 'rep-1',
  request_id: 'req-1',
  reporter_id: 'user-r1',
  request_author_id: 'user-a',
  group_id: 'group-1',
  content_snapshot: 'reported text',
  reason: 'abuse',
  note: null,
  status: 'open',
  created_at: '2026-09-24T10:00:00.000Z',
  reviewed_at: null,
  ...overrides,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  group_id: 'group-1',
  user_id: 'user-a',
  content: 'reported text',
  hidden_at: null,
  hidden_reason: null,
  created_at: '2026-09-24T09:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  service.reset();
});

// ---------------------------------------------------------------------------
// groupPrayerReports
// ---------------------------------------------------------------------------

test('reports on one request are grouped with its current state, group and author ban', () => {
  const [item, ...rest] = groupPrayerReports({
    reports: [
      report({
        id: 'rep-2',
        reporter_id: 'user-r2',
        reason: 'spam',
        note: 'ads',
        created_at: '2026-09-24T11:00:00.000Z',
      }),
      report(),
    ],
    requests: [request({ hidden_at: '2026-09-24T11:00:01.000Z', hidden_reason: 'reports' })],
    bans: [{ user_id: 'user-a', reason: 'abuse', created_at: '2026-09-24T12:00:00.000Z' }],
    groups: [{ id: 'group-1', name: 'Tuesday group' }],
  });

  assert.deepEqual(rest, []);
  assert.deepEqual(item, {
    requestId: 'req-1',
    groupId: 'group-1',
    groupName: 'Tuesday group',
    authorId: 'user-a',
    authorBanned: true,
    content: 'reported text',
    reportedContent: 'reported text',
    editedSinceReport: false,
    requestExists: true,
    hiddenAt: '2026-09-24T11:00:01.000Z',
    hiddenReason: 'reports',
    openReportCount: 2,
    latestReportAt: '2026-09-24T11:00:00.000Z',
    reports: [
      {
        id: 'rep-2',
        reporterId: 'user-r2',
        reason: 'spam',
        reasonLabel: 'Spam or advertising',
        note: 'ads',
        status: 'open',
        createdAt: '2026-09-24T11:00:00.000Z',
      },
      {
        id: 'rep-1',
        reporterId: 'user-r1',
        reason: 'abuse',
        reasonLabel: 'Harassment or hate',
        note: null,
        status: 'open',
        createdAt: '2026-09-24T10:00:00.000Z',
      },
    ],
  });
});

test('an author who edited the request after it was reported is flagged, showing both texts', () => {
  const [item] = groupPrayerReports({
    reports: [report({ content_snapshot: 'the abusive original' })],
    requests: [request({ content: 'a harmless edit' })],
    bans: [],
    groups: [],
  });

  assert.equal(item.content, 'a harmless edit');
  assert.equal(item.reportedContent, 'the abusive original');
  assert.equal(item.editedSinceReport, true);
  assert.equal(item.groupName, null);
});

test('a report whose request is gone still shows what was reported', () => {
  const [item] = groupPrayerReports({ reports: [report()], requests: [], bans: [], groups: [] });

  assert.equal(item.requestExists, false);
  assert.equal(item.content, 'reported text');
  assert.equal(item.hiddenAt, null);
});

test('requests with the most open reports come first, then the most recently reported', () => {
  const items = groupPrayerReports({
    reports: [
      report({ id: 'a', request_id: 'req-quiet', created_at: '2026-09-24T12:00:00.000Z' }),
      report({ id: 'b', request_id: 'req-busy', reporter_id: 'r1' }),
      report({ id: 'c', request_id: 'req-busy', reporter_id: 'r2' }),
      report({ id: 'd', request_id: 'req-old', created_at: '2026-09-20T12:00:00.000Z' }),
      report({
        id: 'e',
        request_id: 'req-done',
        status: 'dismissed',
        created_at: '2026-09-25T12:00:00.000Z',
      }),
    ],
    requests: [],
    bans: [],
    groups: [],
  });

  assert.deepEqual(
    items.map((item) => [item.requestId, item.openReportCount]),
    [
      ['req-busy', 2],
      ['req-quiet', 1],
      ['req-old', 1],
      ['req-done', 0],
    ]
  );
});

// ---------------------------------------------------------------------------
// parseFilterTermInput
// ---------------------------------------------------------------------------

test('a filter term is trimmed and keeps its match mode and language', () => {
  assert.deepEqual(
    parseFilterTermInput(
      formData({ term: '  Some Phrase ', matchMode: 'substring', language: 'ZH' })
    ),
    { term: 'Some Phrase', matchMode: 'substring', language: 'zh' }
  );
});

test('a filter term defaults to whole-word matching and no language', () => {
  assert.deepEqual(parseFilterTermInput(formData({ term: 'word' })), {
    term: 'word',
    matchMode: 'word',
    language: null,
  });
});

test('a blank, over-long or badly tagged filter term is refused with a reason', () => {
  assert.deepEqual(parseFilterTermInput(formData({ term: '   ' })), {
    error: 'A term of 1 to 100 characters is required',
  });
  assert.deepEqual(parseFilterTermInput(formData({ term: 'x'.repeat(101) })), {
    error: 'A term of 1 to 100 characters is required',
  });
  assert.deepEqual(parseFilterTermInput(formData({ term: 'word', matchMode: 'regex' })), {
    error: 'Match mode must be word or substring',
  });
  assert.deepEqual(parseFilterTermInput(formData({ term: 'word', language: 'english' })), {
    error: 'Language must be a 2 or 3 letter code, such as en or zh',
  });
});

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

test('the open queue reads open reports, then only the requests, bans and groups it needs', async () => {
  service.respondTo('prayer_request_reports', () => ({
    data: [report(), report({ id: 'rep-2', request_id: 'req-2', group_id: 'group-2' })],
  }));
  service.respondTo('prayer_requests', () => ({ data: [request()] }));
  service.respondTo('prayer_wall_bans', () => ({ data: [] }));
  service.respondTo('groups', () => ({ data: [{ id: 'group-1', name: 'Tuesday group' }] }));

  const queue = await getPrayerReportQueue('open');

  assert.equal(queue.items.length, 2);
  const [reportsCall] = service.callsFor('prayer_request_reports');
  assert.deepEqual(stepArgs(reportsCall, 'eq'), [['status', 'open']]);
  assert.deepEqual(stepArgs(service.callsFor('prayer_requests')[0], 'in'), [
    ['id', ['req-1', 'req-2']],
  ]);
  assert.deepEqual(stepArgs(service.callsFor('groups')[0], 'in'), [['id', ['group-1', 'group-2']]]);
});

test('the full history does not filter by status', async () => {
  service.respondTo('prayer_request_reports', () => ({ data: [] }));
  service.respondTo('prayer_wall_bans', () => ({ data: [] }));

  const queue = await getPrayerReportQueue('all');

  assert.deepEqual(queue.items, []);
  assert.deepEqual(stepArgs(service.callsFor('prayer_request_reports')[0], 'eq'), []);
  assert.deepEqual(service.callsFor('prayer_requests'), [], 'no follow-up reads for no reports');
});

test('banned authors are listed with the queue', async () => {
  service.respondTo('prayer_request_reports', () => ({ data: [] }));
  service.respondTo('prayer_wall_bans', () => ({
    data: [{ user_id: 'user-a', reason: 'abuse', created_at: '2026-09-24T12:00:00.000Z' }],
  }));

  assert.deepEqual((await getPrayerReportQueue('open')).bans, [
    { userId: 'user-a', reason: 'abuse', createdAt: '2026-09-24T12:00:00.000Z' },
  ]);
});

test('a failed read is raised rather than shown as an empty queue', async () => {
  service.respondTo('prayer_request_reports', () => ({ error: { message: 'permission denied' } }));

  await assert.rejects(
    getPrayerReportQueue('open'),
    /Unable to load prayer reports: permission denied/
  );
});

test('filter terms are listed by language, then term', async () => {
  service.respondTo('prayer_content_filter_terms', () => ({
    data: [
      {
        id: 3,
        term: 'word',
        match_mode: 'word',
        language: 'en',
        created_at: '2026-09-24T00:00:00Z',
      },
    ],
  }));

  assert.deepEqual(await getPrayerFilterTerms(), [
    { id: 3, term: 'word', matchMode: 'word', language: 'en', createdAt: '2026-09-24T00:00:00Z' },
  ]);
  assert.deepEqual(stepArgs(service.callsFor('prayer_content_filter_terms')[0], 'order'), [
    ['language', { ascending: true, nullsFirst: false }],
    ['term', { ascending: true }],
  ]);
});
