import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReadingPlanProgress } from '../../services/plans/types';
import {
  applyProgressUpdate,
  completeDay,
  completeRecurringDay,
  completeSession,
  createProgressRecord,
  removePlanDayResumeEntries,
  removePlanFromCollections,
  replaceProgressCollections,
  withoutKey,
} from './planProgressModel';

const NOW = '2026-09-01T12:00:00.000Z';

const row = (
  planId: string,
  overrides: Partial<ReadingPlanProgress> = {}
): ReadingPlanProgress => ({
  id: `row-${planId}`,
  plan_id: planId,
  started_at: '2026-08-01T00:00:00.000Z',
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const sessionOptions = {
  completionKey: '2:morning',
  dayCompletionKey: '2',
  totalDays: 2,
  isFinalSession: false,
  advanceDayOnCompletion: true,
  nextSessionKey: 'evening' as const,
};

test('a new enrolment starts no earlier than the leave it follows', () => {
  const leftAt = Date.now() + 60_000;

  const progress = createProgressRecord('plan-a', leftAt + 1);

  assert.equal(progress.started_at, new Date(leftAt + 1).toISOString());
  assert.equal(progress.synced_at, progress.started_at);
  assert.deepEqual(
    { ...progress, started_at: '', synced_at: '' },
    row('plan-a', { id: 'reading-plan-progress-plan-a', started_at: '', synced_at: '' })
  );
});

test('storing a row enrols the plan once and keeps completedPlanIds in step with it', () => {
  const empty = { enrolledPlanIds: [], completedPlanIds: [], progressByPlanId: {} };

  const done = applyProgressUpdate(empty, row('plan-a', { is_completed: true }));
  const reopened = applyProgressUpdate(done, row('plan-a', { completed_sessions: undefined }));

  assert.deepEqual(done.enrolledPlanIds, ['plan-a']);
  assert.deepEqual(done.completedPlanIds, ['plan-a']);
  assert.deepEqual(reopened.enrolledPlanIds, ['plan-a']);
  assert.deepEqual(reopened.completedPlanIds, []);
  assert.deepEqual(reopened.progressByPlanId['plan-a']?.completed_sessions, {});
});

test('removing a plan drops its row, its ids and only its own day resumes', () => {
  const state = replaceProgressCollections([row('plan-a', { is_completed: true }), row('plan-b')]);

  assert.deepEqual(removePlanFromCollections(state, 'plan-a'), {
    enrolledPlanIds: ['plan-b'],
    completedPlanIds: [],
    progressByPlanId: { 'plan-b': row('plan-b') },
  });
  assert.deepEqual(
    removePlanDayResumeEntries(
      {
        planDayResumeByKey: {
          'plan-a:1': { bookId: 'GEN', chapter: 1 },
          'plan-ab:1': { bookId: 'EXO', chapter: 2 },
        },
      },
      'plan-a'
    ),
    { planDayResumeByKey: { 'plan-ab:1': { bookId: 'EXO', chapter: 2 } } }
  );
});

test('withoutKey returns the same record when the key is absent', () => {
  const record = { a: '1' };

  assert.equal(withoutKey(record, 'b'), record);
  assert.deepEqual(withoutKey(record, 'a'), {});
});

test('completing the last day finishes a fixed-length plan and advances past it', () => {
  const progress = completeDay(
    row('plan-a', { completed_entries: { '1': 'x' }, current_session: 'evening' }),
    2,
    2,
    NOW
  );

  assert.deepEqual(progress, {
    ...row('plan-a'),
    completed_entries: { '1': 'x', '2': NOW },
    current_session: null,
    current_day: 3,
    is_completed: true,
    completed_at: NOW,
    synced_at: NOW,
  });
});

test('a non-final session records its tick and points at the next session', () => {
  const progress = completeSession(row('plan-a'), 2, 'morning', sessionOptions, NOW);

  assert.deepEqual(progress, {
    ...row('plan-a'),
    completed_sessions: { '2:morning': NOW },
    current_day: 2,
    current_session: 'evening',
    synced_at: NOW,
  });
});

test('the final session completes the day, and only a fixed-length plan finishes', () => {
  const final = { ...sessionOptions, completionKey: '2:evening', isFinalSession: true };
  const existing = row('plan-a', { completed_entries: { '1': 'x' } });

  const fixed = completeSession(existing, 2, 'evening', final, NOW);
  const recurring = completeSession(
    existing,
    2,
    'evening',
    { ...final, advanceDayOnCompletion: false },
    NOW
  );

  assert.deepEqual(
    [fixed.current_day, fixed.current_session, fixed.is_completed, fixed.completed_at],
    [3, null, true, NOW]
  );
  assert.deepEqual(fixed.completed_entries, { '1': 'x', '2': NOW });
  assert.deepEqual(
    [recurring.current_day, recurring.is_completed, recurring.completed_at],
    [2, false, null]
  );
  assert.deepEqual(recurring.completed_entries, { '1': 'x', '2': NOW });
});

test('a recurring day is keyed by its completion key and never finishes the plan', () => {
  const progress = completeRecurringDay(
    row('plan-a', { is_completed: true, completed_at: 'x', current_session: 'midday' }),
    '2026-09-01',
    0,
    NOW
  );

  assert.deepEqual(progress, {
    ...row('plan-a'),
    completed_entries: { '2026-09-01': NOW },
    current_day: 1,
    synced_at: NOW,
  });
});
