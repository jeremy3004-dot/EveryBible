import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeHarnessOptions } from '../_testing/edgeFunctionHarness';

// Audit 2026-09-24 L7: this endpoint runs with verify_jwt = false behind a shared passcode.
// Database and configuration details go to the function log only.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const PASSCODE = 'translator-passcode';
const DB_DETAIL = 'column chapter_feedback_submissions.scripture_council_fixed_by does not exist';

const review = (options: EdgeHarnessOptions, body: unknown) => {
  const harness = loadEdgeFunction(ENTRY, {
    ...options,
    env: { TRANSLATOR_REVIEW_PASSCODE: PASSCODE, ...options.env },
  });
  const response = harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
  return { harness, response };
};

const failFeedbackQueries: EdgeHarnessOptions['respond'] = (call) =>
  call.table === 'chapter_feedback_submissions'
    ? { error: { code: '42703', message: DB_DETAIL } }
    : { count: 0 };

test('a failed lookup during a resolve returns a generic error and logs the detail', async () => {
  const { harness, response } = review(
    { respond: failFeedbackQueries },
    {
      passcode: PASSCODE,
      action: 'resolve',
      feedbackId: '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e',
      translationId: 'bsb',
      resolution: 'fixed',
    }
  );

  const result = await response;
  const body = await result.json();

  assert.equal(result.status, 500);
  assert.equal(body.success, false);
  assert.doesNotMatch(JSON.stringify(body), /column|does not exist|scripture_council_fixed_by/);
  assert.ok(harness.loggedErrors.some((line) => line.includes(DB_DETAIL)));
});

test('a failed chapter query returns a generic error and logs the detail', async () => {
  const { harness, response } = review(
    { respond: failFeedbackQueries },
    { passcode: PASSCODE, translationId: 'bsb', bookId: 'JHN', chapter: 3 }
  );

  const result = await response;

  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), /column|does not exist/);
  assert.ok(harness.loggedErrors.some((line) => line.includes(DB_DETAIL)));
});

test('missing server configuration is not described to the caller', async () => {
  const { harness, response } = review(
    { env: { SUPABASE_SERVICE_ROLE_KEY: undefined } },
    { passcode: PASSCODE, validateOnly: true }
  );

  const result = await response;

  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), /SUPABASE_SERVICE_ROLE_KEY|secret/i);
  assert.ok(harness.loggedErrors.some((line) => line.includes('SUPABASE_SERVICE_ROLE_KEY')));
});

test('a wrong passcode is still refused with its specific message', async () => {
  const { response } = review(
    { respond: () => ({ count: 0 }) },
    { passcode: 'wrong', validateOnly: true }
  );

  const result = await response;

  assert.equal(result.status, 403);
  assert.deepEqual(await result.json(), { success: false, error: 'Translator access denied' });
});

// This endpoint is public (verify_jwt = false) and every request, valid passcode or not, used to
// be parsed with request.json() with no size bound. The largest real request (500 feedback ids
// for a bulk review) is about 20 KB.
test('a request body over the size limit is refused before any database access', async () => {
  const { harness, response } = review(
    { respond: () => ({ count: 0 }) },
    { passcode: PASSCODE, validateOnly: true, padding: 'x'.repeat(256 * 1024) }
  );

  const result = await response;

  assert.equal(result.status, 413);
  assert.equal((await result.json()).success, false);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.clientsCreated, []);
});

test('a malformed JSON body is a client error, not a logged server failure', async () => {
  const { harness, response } = review({ respond: () => ({ count: 0 }) }, '{"passcode":');

  const result = await response;

  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { success: false, error: 'Invalid request body' });
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.loggedErrors, []);
});

test('a full 500-id bulk review request fits within the size limit', async () => {
  const feedbackIds = Array.from({ length: 500 }, () => crypto.randomUUID());
  const { response } = review(
    { respond: () => ({ count: 0 }) },
    { passcode: PASSCODE, validateOnly: true, feedbackIds, note: 'n'.repeat(1000) }
  );

  assert.equal((await response).status, 200);
});
