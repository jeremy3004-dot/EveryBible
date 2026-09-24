import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against the translator review endpoint (verify_jwt = false,
// passcode-gated). The fake database answers the way PostgREST does when a value cannot be
// cast to its column (uuid, integer, bigint, boolean, or text holding a NUL byte), so a client
// mistake that slips past validation shows up as the 500 it would be in production.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SHARED = '424242';
const FEEDBACK_ID = '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e';
const FEEDBACK_TABLE = 'chapter_feedback_submissions';
const ATTEMPTS_TABLE = 'translator_review_attempts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const castError = (message: string): EdgeQueryResult => ({ error: { code: '22P02', message } });

/** What Postgres would refuse in this call, if anything. */
function postgresRejects(call: EdgeQueryCall): EdgeQueryResult | undefined {
  for (const step of call.steps) {
    const values = step.method === 'rpc' ? Object.values((step.args[0] ?? {}) as object) : [];
    if (step.method === 'eq') values.push(step.args[1]);
    if (values.some((value) => typeof value === 'string' && value.includes('\u0000'))) {
      return { error: { code: '22021', message: 'invalid byte sequence for encoding "UTF8"' } };
    }
    if (
      call.table === FEEDBACK_TABLE &&
      step.method === 'eq' &&
      step.args[0] === 'id' &&
      !UUID.test(String(step.args[1]))
    ) {
      return castError('invalid input syntax for type uuid');
    }
    if (step.method === 'eq' && step.args[0] === 'chapter') {
      const chapter = step.args[1];
      if (!Number.isInteger(chapter) || Math.abs(chapter as number) > 2 ** 31 - 1) {
        return { error: { code: '22003', message: 'value out of range for type integer' } };
      }
    }
    if (step.method === 'update') {
      const note = (step.args[0] as Record<string, unknown>).scripture_council_fixed_note;
      if (typeof note === 'string' && note.includes('\u0000')) {
        return { error: { code: '22021', message: 'invalid byte sequence' } };
      }
    }
    if (step.method === 'rpc') {
      const args = (step.args[0] ?? {}) as Record<string, unknown>;
      if (Array.isArray(args.p_ids) && !args.p_ids.every((id) => UUID.test(String(id)))) {
        return castError('invalid input syntax for type uuid');
      }
      const chapter = args.p_chapter;
      if (chapter != null && (!Number.isInteger(chapter) || (chapter as number) > 2 ** 31 - 1)) {
        return { error: { code: '22003', message: 'value out of range for type integer' } };
      }
      // Postgres reads 1, 'yes', 'on' and friends as booleans; anything else fails the cast.
      const booleanLiteral = /^(?:t|true|f|false|y|yes|n|no|on|off|1|0)$/i;
      for (const flag of [args.p_positive_only, args.p_summary_only]) {
        if (flag != null && typeof flag !== 'boolean' && !booleanLiteral.test(String(flag))) {
          return castError('invalid input syntax for type boolean');
        }
      }
      const cursor = args.p_cursor as Record<string, unknown> | null | undefined;
      if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
        for (const key of ['snapshot', 'sequence']) {
          const value = cursor[key];
          if (value != null && !/^-?\d{1,18}$/.test(String(value))) {
            return castError('invalid input syntax for type bigint');
          }
        }
      }
    }
  }
  return undefined;
}

const run = async (body: unknown, options: { method?: string; raw?: string } = {}) => {
  const harness = loadEdgeFunction(ENTRY, {
    env: { TRANSLATOR_REVIEW_PASSCODE: SHARED, SCRIPTURE_COUNCIL_PASSCODE: '900900' },
    respond: (call) => {
      const rejected = postgresRejects(call);
      if (rejected) return rejected;
      const insert = call.steps.some((step) => step.method === 'insert');
      if (call.table === ATTEMPTS_TABLE) return insert ? {} : { count: 0 };
      if (call.table === FEEDBACK_TABLE && call.steps.some((s) => s.method === 'maybeSingle')) {
        return { data: { id: FEEDBACK_ID, translation_id: 'bsb', sentiment: 'down' } };
      }
      if (call.table === 'rpc:chapter_feedback_review_v2') {
        return { data: { chapters: [], rows: [], nextCursor: null, positiveCount: 0 } };
      }
      return {};
    },
  });
  const method = options.method ?? 'POST';
  const response = await harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method,
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      ...(method === 'GET' || method === 'HEAD'
        ? {}
        : { body: options.raw ?? JSON.stringify(body) }),
    })
  );
  const text = await response.text();
  const json = JSON.parse(text) as Record<string, unknown>;
  const touched = (table: string) => harness.calls.filter((call) => call.table === table);
  const failedAttempts = touched(ATTEMPTS_TABLE).filter((call) =>
    call.steps.some((step) => step.method === 'insert')
  ).length;
  return { status: response.status, json, text, harness, touched, failedAttempts };
};

const read = (overrides: Record<string, unknown> = {}) => ({
  passcode: SHARED,
  translationId: 'bsb',
  bookId: 'JHN',
  chapter: 3,
  apiVersion: 2,
  ...overrides,
});

const assertNoFeedbackAccess = (result: Awaited<ReturnType<typeof run>>) => {
  assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
  assert.equal(
    result.harness.calls.some((call) => call.table.startsWith('rpc:chapter_feedback')),
    false
  );
};

// --- Transport -----------------------------------------------------------------------------

test('PUT, PATCH and DELETE are refused with a JSON 405 before any database access', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const result = await run(read(), { method });
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
    assert.deepEqual(result.harness.calls, []);
  }
});

test('bodies of the wrong JSON type are a 400 before any database access', async () => {
  for (const raw of ['', 'null', '[]', '42', '"passcode"', 'true', '{"a":']) {
    const result = await run(null, { raw });
    assert.equal(result.status, 400, raw);
    assert.deepEqual(result.json, { success: false, error: 'Invalid request body' });
    assert.deepEqual(result.harness.calls, []);
  }
});

test('a 5 MB body is refused with 413 before any database access', async () => {
  const result = await run(read({ note: 'x'.repeat(5e6) }));
  assert.equal(result.status, 413);
  assert.deepEqual(result.harness.calls, []);
});

// --- Passcodes -----------------------------------------------------------------------------

test('passcodes of the wrong type, length or alphabet are denied and counted, never echoed', async () => {
  for (const passcode of [424242, [SHARED], { code: SHARED }, '', '4242', '4242420', 'abcdef']) {
    const result = await run({ passcode, validateOnly: true });
    assert.equal(result.status, 403, JSON.stringify(passcode));
    assert.deepEqual(result.json, { success: false, error: 'Translator access denied' });
    assert.equal(result.failedAttempts, 1);
    assert.doesNotMatch(result.text, /424242/);
  }
});

test('prototype-pollution keys cannot grant access or switch the request mode', async () => {
  const result = await run(null, {
    raw: '{"__proto__":{"validateOnly":true,"accessRole":"scripture_council","passcode":"424242"}}',
  });
  assert.equal(result.status, 403);
  assert.equal(result.failedAttempts, 1);
  assert.equal(({} as Record<string, unknown>).validateOnly, undefined);
});

// --- Identifiers that reach a typed column -------------------------------------------------

test('a resolve or reopen with a feedback id that is not a UUID is a 400, not a failed query', async () => {
  for (const action of ['resolve', 'reopen']) {
    for (const feedbackId of ['not-a-uuid', `${FEEDBACK_ID}x`, "1' or '1'='1", 'a\u0000b']) {
      const result = await run({
        passcode: SHARED,
        action,
        feedbackId,
        translationId: 'bsb',
        resolution: 'fixed',
        note: 'n',
      });
      assert.equal(result.status, 400, `${action} ${feedbackId}`);
      assert.deepEqual(result.json, { success: false, error: 'feedbackId must be a UUID' });
      assertNoFeedbackAccess(result);
    }
  }
});

test('a padded but valid feedback id is trimmed before use', async () => {
  const result = await run({
    passcode: SHARED,
    action: 'reopen',
    feedbackId: `  ${FEEDBACK_ID}  `,
    translationId: 'bsb',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, feedbackId: FEEDBACK_ID, resolution: null });
});

test('an audio link request with a padded or malformed feedback id is a 400 or trimmed', async () => {
  const malformed = await run(read({ action: 'audioUrl', feedbackId: 'nope' }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.json, { success: false, error: 'feedbackId must be a UUID' });
  assertNoFeedbackAccess(malformed);

  const padded = await run(read({ action: 'audioUrl', feedbackId: ` ${FEEDBACK_ID} ` }));
  assert.equal(padded.status, 404);
  const lookup = padded.touched(FEEDBACK_TABLE)[0];
  assert.deepEqual(
    lookup.steps.find((step) => step.method === 'eq' && step.args[0] === 'id')?.args,
    ['id', FEEDBACK_ID]
  );
});

test('a bulk review with any id that is not a UUID is refused before the RPC', async () => {
  for (const feedbackIds of [['x'], [FEEDBACK_ID, ''], [FEEDBACK_ID, `${FEEDBACK_ID}\u0000`]]) {
    const result = await run(read({ action: 'reviewPositiveIds', feedbackIds }));
    assert.equal(result.status, 400, JSON.stringify(feedbackIds));
    assert.deepEqual(result.json, { success: false, error: 'Invalid response selection' });
    assertNoFeedbackAccess(result);
  }
});

test('duplicate ids in a bulk review are harmless (id = ANY(...) matches each row once)', async () => {
  const result = await run(
    read({ action: 'reviewPositiveIds', feedbackIds: [FEEDBACK_ID, FEEDBACK_ID.toUpperCase()] })
  );
  assert.equal(result.status, 200);
  assert.equal(result.touched('rpc:chapter_feedback_review_positive_ids').length, 1);
});

test('chapters beyond any book (including past the integer column range) are a 400', async () => {
  for (const chapter of [151, 2 ** 31, 1e20, Number.MAX_SAFE_INTEGER, -1]) {
    for (const body of [read({ chapter }), read({ chapter, apiVersion: undefined })]) {
      const result = await run(body);
      assert.equal(result.status, 400, `${chapter} v${body.apiVersion}`);
      assert.deepEqual(result.json, {
        success: false,
        error: 'bookId and a valid chapter are required',
      });
      assertNoFeedbackAccess(result);
    }
  }
});

test('a book id that is not a three-character book code is a 400', async () => {
  for (const bookId of ['J\u0000N', 'JOHN', 'x'.repeat(10_000), 'J N', '📖']) {
    const result = await run(read({ bookId }));
    assert.equal(result.status, 400, JSON.stringify(bookId.slice(0, 8)));
    assert.deepEqual(result.json, { success: false, error: 'bookId is not a valid book code' });
    assertNoFeedbackAccess(result);
  }
});

test('lower-case and numbered book codes are accepted', async () => {
  for (const bookId of ['jhn', '1co', '3JN']) {
    assert.equal((await run(read({ bookId }))).status, 200, bookId);
  }
});

// --- v2 page options -----------------------------------------------------------------------

test('a malformed page cursor is a 400 instead of a failed bigint cast', async () => {
  for (const cursor of [
    'next',
    [1, 2],
    { snapshot: 'abc', sequence: 1, sentiment: 'up' },
    { snapshot: 1.5, sequence: 1, sentiment: 'up' },
    { snapshot: 1e30, sequence: 1, sentiment: 'up' },
    { snapshot: 5, sequence: -1, sentiment: 'up' },
    { snapshot: 5, sequence: 1, sentiment: 'sideways' },
    { snapshot: 5, sentiment: 'up' },
  ]) {
    const result = await run(read({ cursor }));
    assert.equal(result.status, 400, JSON.stringify(cursor));
    assert.deepEqual(result.json, { success: false, error: 'Invalid page cursor' });
    assertNoFeedbackAccess(result);
  }
});

test('the cursor the server handed out is accepted as is', async () => {
  const cursor = { snapshot: 120, sequence: 97, sentiment: 'down' };
  const result = await run(read({ cursor }));
  assert.equal(result.status, 200);
  const call = result.touched('rpc:chapter_feedback_review_v2')[0];
  assert.deepEqual((call.steps[0].args[0] as { p_cursor: unknown }).p_cursor, cursor);
});

test('page flags that are not booleans are a 400', async () => {
  for (const flags of [{ positiveOnly: 'maybe' }, { summaryOnly: 1 }, { positiveOnly: {} }]) {
    const result = await run(read(flags));
    assert.equal(result.status, 400, JSON.stringify(flags));
    assert.deepEqual(result.json, { success: false, error: 'Invalid feedback filter' });
    assertNoFeedbackAccess(result);
  }
});

test('filters of the wrong type are a 400', async () => {
  for (const filters of [{ category: ['all'] }, { status: { $ne: 'x' } }, { category: null }]) {
    const result = await run(read(filters));
    assert.equal(result.status, filters.category === null ? 200 : 400, JSON.stringify(filters));
  }
});

// --- Resolution notes ----------------------------------------------------------------------

test('a resolution note holding a NUL byte is a 400 and nothing is written', async () => {
  const result = await run({
    passcode: SHARED,
    action: 'resolve',
    feedbackId: FEEDBACK_ID,
    translationId: 'bsb',
    resolution: 'fixed',
    note: 'fixed\u0000',
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.json, { success: false, error: 'note contains invalid characters' });
  const updates = result
    .touched(FEEDBACK_TABLE)
    .filter((call) => call.steps.some((step) => step.method === 'update'));
  assert.deepEqual(updates, []);
});

test('an emoji, RTL and zero-width note is stored exactly as sent', async () => {
  const note = 'تم التصحيح 📖 a​b';
  const result = await run({
    passcode: SHARED,
    action: 'resolve',
    feedbackId: FEEDBACK_ID,
    translationId: 'bsb',
    resolution: 'fixed',
    note,
  });
  assert.equal(result.status, 200);
  const update = result
    .touched(FEEDBACK_TABLE)
    .flatMap((call) => call.steps)
    .find((step) => step.method === 'update');
  assert.equal((update?.args[0] as Record<string, unknown>).scripture_council_fixed_note, note);
});

// --- Downstream failures -------------------------------------------------------------------

test('an RPC that returns an unexpected shape is a generic 500 with no detail', async () => {
  const harness = loadEdgeFunction(ENTRY, {
    env: { TRANSLATOR_REVIEW_PASSCODE: SHARED },
    respond: (call) => {
      if (call.table === ATTEMPTS_TABLE) return { count: 0 };
      if (call.table === 'rpc:chapter_feedback_review_v2') return { data: 'surprise' };
      return {};
    },
  });
  const response = await harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(read()),
    })
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Unable to load feedback review. Please try again later.',
  });
});
