import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeHarnessOptions,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// How review-chapter-feedback treats malformed, out-of-policy and failing requests: the gates
// in front of every read and mutation, the council unlock, and the legacy list shape. The
// shared passcode is used with its default scope (bsb); team scoping is in teamAccess.test.ts.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SHARED = '424242';
const COUNCIL = '900900';
const FEEDBACK_ID = '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e';
const FEEDBACK_TABLE = 'chapter_feedback_submissions';
const ATTEMPTS_TABLE = 'translator_review_attempts';
const USES_TABLE = 'translator_shared_passcode_uses';
const GENERIC_ERROR = 'Unable to load feedback review. Please try again later.';

const operation = (call: EdgeQueryCall) =>
  call.steps.find((step) => ['select', 'insert', 'update'].includes(step.method))?.method;

interface Scenario {
  /** Answers a call before the defaults; return undefined to fall through. */
  respond?: (call: EdgeQueryCall) => EdgeQueryResult | undefined;
  /** The feedback row the resolve/reopen existence check finds. */
  existing?: { sentiment: 'up' | 'down' };
  getUser?: EdgeHarnessOptions['getUser'];
  storage?: EdgeHarnessOptions['storage'];
  token?: string;
  method?: string;
}

const run = async (body: unknown, scenario: Scenario = {}) => {
  const harness = loadEdgeFunction(ENTRY, {
    env: { TRANSLATOR_REVIEW_PASSCODE: SHARED, SCRIPTURE_COUNCIL_PASSCODE: COUNCIL },
    getUser: scenario.getUser,
    storage: scenario.storage,
    respond: (call) => {
      const scripted = scenario.respond?.(call);
      if (scripted) return scripted;
      if (call.table === ATTEMPTS_TABLE) return operation(call) === 'insert' ? {} : { count: 0 };
      if (call.table === FEEDBACK_TABLE && call.steps.some((s) => s.method === 'maybeSingle')) {
        return {
          data: {
            id: FEEDBACK_ID,
            translation_id: 'bsb',
            sentiment: scenario.existing?.sentiment ?? 'down',
          },
        };
      }
      return {};
    },
  });
  const method = scenario.method ?? 'POST';
  const response = await harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method,
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        ...(scenario.token ? { Authorization: `Bearer ${scenario.token}` } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })
  );
  const text = await response.text();
  const json = (text.startsWith('{') ? JSON.parse(text) : text) as Record<string, unknown>;
  const touched = (table: string) => harness.calls.filter((call) => call.table === table);
  const updates = touched(FEEDBACK_TABLE).filter((call) => operation(call) === 'update');
  const updateArgs = () =>
    updates[0]?.steps.find((step) => step.method === 'update')?.args[0] as Record<string, unknown>;
  const failedAttempts = touched(ATTEMPTS_TABLE).filter((c) => operation(c) === 'insert').length;
  return {
    response,
    status: response.status,
    json,
    harness,
    touched,
    updates,
    updateArgs,
    failedAttempts,
  };
};

const resolveBody = (overrides: Record<string, unknown> = {}) => ({
  passcode: SHARED,
  action: 'resolve',
  feedbackId: FEEDBACK_ID,
  translationId: 'bsb',
  resolution: 'fixed',
  note: 'Reworded verse 16.',
  ...overrides,
});

// --- Transport ---------------------------------------------------------------------------

test('a CORS preflight is answered without touching the database', async () => {
  const result = await run(null, { method: 'OPTIONS' });

  assert.equal(result.status, 200);
  assert.equal(result.json, 'ok');
  assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(result.harness.calls, []);
});

test('only POST requests are accepted', async () => {
  const result = await run(null, { method: 'GET' });

  assert.equal(result.status, 405);
  assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
  assert.deepEqual(result.harness.calls, []);
});

// --- Council access ------------------------------------------------------------------------

test('a council unlock is checked against the council passcode, not translator codes', async () => {
  const result = await run({
    accessRole: 'scripture_council',
    validateOnly: true,
    passcode: COUNCIL,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true });
  assert.deepEqual(result.touched('translator_team_passcodes'), []);
});

test('a wrong council passcode is refused and counted as a failed attempt', async () => {
  const result = await run({
    accessRole: 'scripture_council',
    validateOnly: true,
    passcode: SHARED,
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.json, { success: false, error: 'Council access denied' });
  assert.equal(result.failedAttempts, 1);
});

test('the council role can only unlock; it cannot read or change feedback', async () => {
  const result = await run({
    accessRole: 'scripture_council',
    passcode: COUNCIL,
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.json, { success: false, error: 'Translator access required' });
  assert.deepEqual(result.harness.calls, []);
});

// --- Passcode gate -------------------------------------------------------------------------

test('an unreadable attempt counter refuses the request before any passcode is checked', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true },
    {
      respond: (call) =>
        call.table === ATTEMPTS_TABLE ? { error: { message: 'counter offline' } } : undefined,
    }
  );

  assert.equal(result.status, 503);
  assert.deepEqual(result.json, {
    success: false,
    error: 'Unable to verify translator access. Try again later.',
  });
  assert.deepEqual(result.touched('translator_team_passcodes'), []);
});

// With claim_passcode_attempt() deployed, the attempt is reserved before the passcode is
// checked (security review 2026-09-24, pass 2): a locked-out caller is refused even with the
// right code, and nothing else is recorded afterwards.
const CLAIM_RPC = 'rpc:claim_passcode_attempt';
const claimed = (claim: EdgeQueryResult) => (call: EdgeQueryCall) =>
  call.table === CLAIM_RPC ? claim : undefined;

test('a locked-out caller is refused before the passcode is evaluated, even when it is right', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true },
    {
      respond: claimed({ data: null }),
    }
  );

  assert.equal(result.status, 429);
  assert.deepEqual(result.json, { success: false, error: 'Too many attempts. Try again later.' });
  assert.deepEqual(result.touched('translator_team_passcodes'), []);
  assert.deepEqual(result.touched(ATTEMPTS_TABLE), []);
});

test('the claim is made with the lockout budget and this caller’s hashed address', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true },
    {
      respond: claimed({ data: 'attempt-1' }),
    }
  );

  const [claim] = result.touched(CLAIM_RPC);
  const args = claim.steps[0].args[0] as Record<string, unknown>;
  assert.equal(args.p_threshold, 10);
  assert.equal(args.p_window_seconds, 900);
  assert.match(String(args.p_ip_hash), /^[0-9a-f]{64}$/);
  assert.ok(!String(args.p_ip_hash).includes('203.0.113.7'));
});

test('a right passcode releases its claimed attempt, so it never counts as a failure', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true },
    {
      respond: claimed({ data: 'attempt-1' }),
    }
  );

  assert.equal(result.status, 200);
  const writes = result.touched(ATTEMPTS_TABLE);
  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0].steps.map((step) => step.method),
    ['delete', 'eq']
  );
  assert.deepEqual(writes[0].steps[1].args, ['id', 'attempt-1']);
});

test('a wrong passcode keeps its claimed attempt and records nothing more', async () => {
  const result = await run(
    { passcode: '000000', validateOnly: true },
    {
      respond: claimed({ data: 'attempt-1' }),
    }
  );

  assert.equal(result.status, 403);
  assert.equal(result.failedAttempts, 0, 'the claim already recorded the failure');
  assert.ok(
    result.touched(ATTEMPTS_TABLE).every((call) => call.steps[0]?.method === 'select'),
    'the claimed row is neither deleted nor duplicated'
  );
});

test('a claim that errors (other than a missing function) fails closed', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true },
    {
      respond: claimed({ error: { code: '57014', message: 'statement timeout' } }),
    }
  );

  assert.equal(result.status, 503);
  assert.deepEqual(result.touched('translator_team_passcodes'), []);
});

test('a passcode sent as a number is never coerced into a match', async () => {
  const result = await run({ passcode: Number(SHARED), validateOnly: true });

  assert.equal(result.status, 403);
  assert.deepEqual(result.json, { success: false, error: 'Translator access denied' });
  assert.equal(result.failedAttempts, 1);
});

test('a wrong code that cannot be recorded is refused as unavailable, not denied', async () => {
  const result = await run(
    { passcode: 'wrong', validateOnly: true },
    {
      respond: (call) =>
        call.table === ATTEMPTS_TABLE && operation(call) === 'insert'
          ? { error: { message: 'insert failed' } }
          : undefined,
    }
  );

  assert.equal(result.status, 503);
});

test('a shared-code usage write that throws is logged and the translator carries on', async () => {
  const result = await run(
    { passcode: SHARED, validateOnly: true, translationId: 'bsb' },
    {
      respond: (call) => {
        if (call.table === USES_TABLE) throw new Error('usage table unreachable');
        return undefined;
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.ok(
    result.harness.loggedErrors.some(
      (line) =>
        line.includes('translator_shared_passcode_uses insert failed') &&
        line.includes('usage table unreachable')
    )
  );
});

// --- Resolve / reopen validation ------------------------------------------------------------

test('a resolve with a blank feedback id is refused before any lookup', async () => {
  const result = await run(resolveBody({ feedbackId: '   ' }));

  assert.equal(result.status, 400);
  assert.deepEqual(result.json, { success: false, error: 'feedbackId is required' });
  assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
});

test('a resolve with an unknown resolution is refused and changes nothing', async () => {
  const result = await run(resolveBody({ resolution: 'deleted' }));

  assert.equal(result.status, 400);
  assert.deepEqual(result.json, {
    success: false,
    error: 'resolution must be "fixed" or "no_change_needed"',
  });
  assert.deepEqual(result.updates, []);
});

test('closing thumbs-down feedback needs an explanation on current app builds', async () => {
  for (const note of [undefined, '   ']) {
    const result = await run(resolveBody({ apiVersion: 2, note }));

    assert.equal(result.status, 400);
    assert.deepEqual(result.json, { success: false, error: 'An explanation is required.' });
    assert.deepEqual(result.updates, []);
  }
});

test('closing thumbs-up feedback needs no explanation and stores no empty note', async () => {
  const result = await run(resolveBody({ apiVersion: 2, note: undefined }), {
    existing: { sentiment: 'up' },
  });

  assert.equal(result.status, 200);
  assert.equal(result.updateArgs().scripture_council_fixed_note, null);
});

test('an explanation longer than 1000 characters is refused', async () => {
  const result = await run(resolveBody({ note: 'x'.repeat(1001) }));

  assert.equal(result.status, 400);
  assert.deepEqual(result.json, { success: false, error: 'note must be 1000 characters or fewer' });
  assert.deepEqual(result.updates, []);
});

test('a failed resolve write returns a generic error and logs the detail', async () => {
  const result = await run(resolveBody(), {
    respond: (call) =>
      call.table === FEEDBACK_TABLE && operation(call) === 'update'
        ? { error: { message: 'permission denied for column scripture_council_fixed_by' } }
        : undefined,
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.json, { success: false, error: GENERIC_ERROR });
  assert.ok(result.harness.loggedErrors.some((line) => line.includes('resolve failed')));
});

test('a reviewer token that cannot be verified leaves the fix unattributed', async () => {
  const scenarios: Array<EdgeHarnessOptions['getUser']> = [
    () => ({ data: { user: null }, error: { message: 'JWT expired' } }),
    () => {
      throw new Error('auth offline');
    },
    () => ({ data: { user: null }, error: null }),
  ];

  for (const getUser of scenarios) {
    const result = await run(resolveBody(), { token: 'stale-token', getUser });

    assert.equal(result.status, 200);
    assert.equal(result.updateArgs().scripture_council_fixed_by, null);
  }
});

// --- Read validation ----------------------------------------------------------------------

test('a read that names no translation is refused', async () => {
  const result = await run({ passcode: SHARED, translationId: '  ', bookId: 'JHN', chapter: 3 });

  assert.equal(result.status, 400);
  assert.deepEqual(result.json, { success: false, error: 'translationId is required' });
  assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
});

test('a chapter read needs a book and a whole chapter number of at least one', async () => {
  const invalid = [
    { chapter: 3 },
    { bookId: 'JHN', chapter: 0 },
    { bookId: 'JHN', chapter: 2.5 },
    { bookId: 'JHN', chapter: '3' },
  ];

  for (const target of invalid) {
    const result = await run({ passcode: SHARED, translationId: 'bsb', ...target });

    assert.equal(result.status, 400, JSON.stringify(target));
    assert.deepEqual(result.json, {
      success: false,
      error: 'bookId and a valid chapter are required',
    });
    assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
  }
});

test('an unknown category or status filter is refused', async () => {
  for (const filter of [{ category: 'everyone' }, { status: 'done' }]) {
    const result = await run({
      apiVersion: 2,
      passcode: SHARED,
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      ...filter,
    });

    assert.equal(result.status, 400);
    assert.deepEqual(result.json, { success: false, error: 'Invalid feedback filter' });
    assert.deepEqual(result.touched('rpc:chapter_feedback_review_v2'), []);
  }
});

// --- Read responses ------------------------------------------------------------------------

const legacyRow = (overrides: Record<string, unknown> = {}) => ({
  contributor_category: 'community',
  id: 'row-1',
  created_at: '2026-09-20T10:00:00.000Z',
  translation_id: 'bsb',
  translation_language: 'English',
  book_id: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads oddly',
  participant_name: 'Miriam',
  participant_role: 'Church leader',
  participant_id_number: null,
  user_id: null,
  source_screen: 'reader',
  audio_response_bucket: null,
  audio_response_path: null,
  audio_response_mime_type: null,
  audio_response_size_bytes: null,
  audio_response_duration_ms: null,
  audio_response_created_at: null,
  scripture_council_resolution: null,
  scripture_council_fixed_at: null,
  scripture_council_fixed_note: null,
  ...overrides,
});

const withAudio = (id: string, path: string) =>
  legacyRow({
    id,
    audio_response_bucket: 'chapter-feedback-audio',
    audio_response_path: path,
    audio_response_mime_type: 'audio/mp4',
    audio_response_size_bytes: 2048,
    audio_response_duration_ms: 1500,
    audio_response_created_at: '2026-09-20T10:00:00.000Z',
  });

test('pre-v2 builds get hour-long recording links in the list, and none when signing fails', async () => {
  const signed: unknown[][] = [];
  const result = await run(
    { passcode: SHARED, translationId: 'bsb', bookId: 'jhn', chapter: 3 },
    {
      respond: (call) =>
        call.table === FEEDBACK_TABLE
          ? {
              data: [
                withAudio('with-link', 'user-a/one.m4a'),
                withAudio('signing-fails', 'user-a/two.m4a'),
                legacyRow({ id: 'no-audio' }),
              ],
            }
          : undefined,
      storage: {
        'chapter-feedback-audio:createSignedUrl': (...args: unknown[]) => {
          signed.push(args);
          return args[0] === 'user-a/one.m4a'
            ? { data: { signedUrl: 'https://signed.example/one' }, error: null }
            : { data: null, error: { message: 'object missing' } };
        },
      },
    }
  );

  assert.equal(result.status, 200);
  const feedback = result.json.feedback as Array<Record<string, unknown>>;
  assert.deepEqual(
    feedback.map((item) => {
      const audio = item.audioResponse as { playbackUrl: string | null } | null;
      return [item.id, audio ? audio.playbackUrl : 'no audio'];
    }),
    [
      ['with-link', 'https://signed.example/one'],
      ['signing-fails', null],
      ['no-audio', 'no audio'],
    ]
  );
  // Rows without a recording are never signed; the others get the legacy one-hour lifetime.
  assert.deepEqual(signed, [
    ['user-a/one.m4a', 3600],
    ['user-a/two.m4a', 3600],
  ]);
  // The legacy list is scoped to the requested chapter, with the book id upper-cased.
  const [query] = result.touched(FEEDBACK_TABLE);
  assert.deepEqual(
    query?.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['translation_id', 'bsb'],
      ['book_id', 'JHN'],
      ['chapter', 3],
    ]
  );
});

test('a pre-v2 chapter with no rows returns an empty list', async () => {
  const result = await run({ passcode: SHARED, translationId: 'bsb', bookId: 'JHN', chapter: 3 });

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, feedback: [] });
});

test('a v2 chapter page with no summary row reports a null summary', async () => {
  const result = await run(
    { apiVersion: 2, passcode: SHARED, translationId: 'bsb', bookId: 'JHN', chapter: 3 },
    {
      respond: (call) =>
        call.table === 'rpc:chapter_feedback_review_v2'
          ? { data: { chapters: [], rows: [], nextCursor: null, positiveCount: 0 } }
          : undefined,
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    success: true,
    summary: null,
    nextCursor: null,
    positiveCount: 0,
    feedback: [],
  });
});
