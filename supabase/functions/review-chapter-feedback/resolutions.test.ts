import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeQueryCall } from '../_testing/edgeFunctionHarness';

// Translator resolutions and the legacy chapter summary, run on the real function. The
// shared passcode is scoped to npiulb here; team scoping is in teamAccess.test.ts.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const PASSCODE = '424242';
const FEEDBACK_ID = '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e';
const FEEDBACK_TABLE = 'chapter_feedback_submissions';

const operation = (call: EdgeQueryCall) =>
  call.steps.find((step) => ['select', 'update'].includes(step.method))?.method;

async function review(
  body: Record<string, unknown>,
  options: { rows?: unknown[]; existing?: unknown; token?: string } = {}
) {
  const harness = loadEdgeFunction(ENTRY, {
    env: {
      TRANSLATOR_REVIEW_PASSCODE: PASSCODE,
      TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS: 'npiulb',
    },
    getUser: (token) => ({
      data: { user: token === 'reviewer-token' ? { id: 'reviewer-1' } : null },
      error: null,
    }),
    respond: (call) => {
      if (call.table === 'translator_review_attempts') return { count: 0 };
      if (call.table !== FEEDBACK_TABLE) return {};
      if (operation(call) === 'update') return {};
      if (call.steps.some((step) => step.method === 'maybeSingle')) {
        return {
          data:
            options.existing === undefined
              ? { id: FEEDBACK_ID, translation_id: 'npiulb', sentiment: 'down' }
              : options.existing,
        };
      }
      return { data: options.rows ?? [] };
    },
  });
  const response = await harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify({ passcode: PASSCODE, ...body }),
    })
  );
  const updates = harness.calls.filter(
    (call) => call.table === FEEDBACK_TABLE && operation(call) === 'update'
  );
  return { status: response.status, json: await response.json(), harness, updates };
}

const scopeOf = (call: EdgeQueryCall) =>
  call.steps.filter((step) => step.method === 'eq').map((step) => step.args);

test('resolving writes the resolution, time, reviewer and note, scoped to the translation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T08:30:00.000Z') });

  const result = await review(
    {
      action: 'resolve',
      feedbackId: FEEDBACK_ID,
      translationId: 'npiulb',
      resolution: 'fixed',
      note: ' Reworded verse 4. ',
    },
    { token: 'reviewer-token' }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, feedbackId: FEEDBACK_ID, resolution: 'fixed' });
  const [update] = result.updates;
  assert.deepEqual(update.steps.find((step) => step.method === 'update')?.args[0], {
    scripture_council_resolution: 'fixed',
    scripture_council_fixed_at: '2026-09-24T08:30:00.000Z',
    scripture_council_fixed_by: 'reviewer-1',
    scripture_council_fixed_note: 'Reworded verse 4.',
  });
  assert.deepEqual(scopeOf(update), [
    ['id', FEEDBACK_ID],
    ['translation_id', 'npiulb'],
  ]);
  // The existence check is scoped the same way.
  const lookup = result.harness.calls.find(
    (call) => call.table === FEEDBACK_TABLE && operation(call) === 'select'
  )!;
  assert.deepEqual(scopeOf(lookup), [
    ['id', FEEDBACK_ID],
    ['translation_id', 'npiulb'],
  ]);
});

test('reopening clears the resolution, scoped to the translation', async () => {
  const result = await review({
    action: 'reopen',
    feedbackId: FEEDBACK_ID,
    translationId: 'npiulb',
  });

  assert.equal(result.status, 200);
  const [update] = result.updates;
  assert.deepEqual(update.steps.find((step) => step.method === 'update')?.args[0], {
    scripture_council_resolution: null,
    scripture_council_fixed_at: null,
    scripture_council_fixed_by: null,
    scripture_council_fixed_note: null,
  });
  assert.deepEqual(scopeOf(update), [
    ['id', FEEDBACK_ID],
    ['translation_id', 'npiulb'],
  ]);
});

test('a resolve or reopen that does not name its translation is refused', async () => {
  for (const action of ['resolve', 'reopen']) {
    const result = await review({ action, feedbackId: FEEDBACK_ID, resolution: 'fixed' });
    assert.equal(result.status, 400, action);
    assert.equal(result.json.error, 'translationId is required');
    assert.deepEqual(result.updates, []);
  }
});

test('feedback that is not in the named translation is not found and not changed', async () => {
  const result = await review(
    { action: 'resolve', feedbackId: FEEDBACK_ID, translationId: 'npiulb', resolution: 'fixed' },
    { existing: null }
  );

  assert.equal(result.status, 404);
  assert.deepEqual(result.updates, []);
});

test('the chapter summary counts unresolved feedback per chapter from server state', async () => {
  const result = await review(
    { translationId: 'npiulb' },
    {
      rows: [
        {
          id: 'a',
          book_id: 'JHN',
          chapter: 3,
          sentiment: 'down',
          scripture_council_resolution: null,
          audio_response_path: 'x.m4a',
        },
        {
          id: 'b',
          book_id: 'JHN',
          chapter: 3,
          sentiment: 'down',
          scripture_council_resolution: 'fixed',
          audio_response_path: null,
        },
        {
          id: 'c',
          book_id: 'JHN',
          chapter: 3,
          sentiment: 'up',
          scripture_council_resolution: null,
          audio_response_path: null,
        },
        {
          id: 'd',
          book_id: 'MRK',
          chapter: 1,
          sentiment: 'down',
          scripture_council_resolution: null,
          audio_response_path: null,
        },
      ],
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    success: true,
    truncated: false,
    chapters: [
      {
        bookId: 'JHN',
        chapter: 3,
        total: 3,
        unresolvedDown: 1,
        unresolvedUp: 1,
        feedback: [
          { id: 'a', hasAudio: true },
          { id: 'b', hasAudio: false },
          { id: 'c', hasAudio: false },
        ],
      },
      {
        bookId: 'MRK',
        chapter: 1,
        total: 1,
        unresolvedDown: 1,
        unresolvedUp: 0,
        feedback: [{ id: 'd', hasAudio: false }],
      },
    ],
  });
});
