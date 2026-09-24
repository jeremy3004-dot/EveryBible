import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeHarnessOptions,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// Behaviour of the public chapter-feedback endpoint (verify_jwt = false): who may submit,
// what is stored, how it is throttled, and how recordings are accepted.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SERVICE_KEY = 'service-role-key';
const ANON_KEY = 'anon-key';
const COUNCIL_CODE = 'council-code';

const validBody = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'jhn',
  chapter: 3,
  sentiment: 'down',
  comment: '  Verse 16 reads awkwardly.  ',
  interfaceLanguage: 'en',
  participantName: '  Miriam ',
  participantRole: 'Church leader',
  participantIdNumber: 'client-chosen-42',
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.9',
};

// Smallest byte sequence the server-side M4A container check accepts: ftyp, moov, mdat.
const box = (type: string) => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32BE(12, 0);
  bytes.write(type, 4, 'latin1');
  return bytes;
};
const recording = Buffer.concat([box('ftyp'), box('moov'), box('mdat')]);
const audio = (overrides: Record<string, unknown> = {}) => ({
  bucket: 'chapter-feedback-audio',
  mimeType: 'audio/mp4',
  durationMs: 1500,
  sizeBytes: recording.length,
  createdAt: '2026-09-24T08:00:00.000Z',
  base64Data: recording.toString('base64'),
  ...overrides,
});

interface Scenario {
  recentCount?: number;
  rateError?: boolean;
  insertError?: boolean;
  userId?: string | null;
  download?: Blob | null;
  env?: EdgeHarnessOptions['env'];
  /** Answer of consume_feedback_submission_budget(); unscripted means "not deployed". */
  budget?: EdgeQueryResult;
  /** Answer of each insert, in order, given the row it tried to write. */
  insert?: (row: Record<string, unknown>) => EdgeQueryResult;
  /** Answer of the lookup of an already-saved submission by its client submission id. */
  existing?: EdgeQueryResult;
}

const BUDGET_RPC = 'rpc:consume_feedback_submission_budget';

function endpoint(scenario: Scenario = {}) {
  const storage: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string, result: unknown = { data: {}, error: null }) =>
    (...args: unknown[]) => {
      storage.push({ method, args });
      return result;
    };
  const harness = loadEdgeFunction(ENTRY, {
    env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY, ...scenario.env },
    getUser: (token) => ({
      data: { user: token === 'valid-token' && scenario.userId ? { id: scenario.userId } : null },
      error: null,
    }),
    respond: (call) => {
      if (call.table === BUDGET_RPC) return scenario.budget ?? {};
      if (call.table !== 'chapter_feedback_submissions') return {};
      const insertStep = call.steps.find((step) => step.method === 'insert');
      if (insertStep && scenario.insert) {
        return scenario.insert(insertStep.args[0] as Record<string, unknown>);
      }
      if (
        call.steps.some((step) => step.method === 'eq' && step.args[0] === 'client_submission_id')
      ) {
        return scenario.existing ?? { data: null };
      }
      if (insertStep) {
        return scenario.insertError
          ? { error: { message: 'insert failed' } }
          : { data: { id: 'feedback-1', created_at: '2026-09-24T08:00:00.000Z' } };
      }
      return scenario.rateError
        ? { error: { message: 'counter offline' } }
        : { count: scenario.recentCount ?? 0 };
    },
    storage: {
      'chapter-feedback-audio:upload': record('upload'),
      'chapter-feedback-audio:remove': record('remove'),
      'chapter-feedback-audio:download': record('download', {
        data: scenario.download === undefined ? new Blob([recording]) : scenario.download,
        error: scenario.download === null ? { message: 'not found' } : null,
      }),
    },
  });
  const send = (body: unknown, token?: string) =>
    harness.handle(
      new Request('https://functions.example/submit-chapter-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.9',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
    );
  const feedbackCalls = () =>
    harness.calls.filter((call) => call.table === 'chapter_feedback_submissions');
  const inserts = () =>
    feedbackCalls()
      .flatMap((call) => call.steps)
      .filter((step) => step.method === 'insert')
      .map((step) => step.args[0] as Record<string, unknown>);
  const rateQuery = (): EdgeQueryCall | undefined =>
    feedbackCalls().find((call) =>
      call.steps.some((step) => step.method === 'select' && step.args[0] === 'id')
    );
  return { harness, send, inserts, rateQuery, storage };
}

const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

test('an anonymous participant with a name and role is saved to chapter_feedback_submissions', async () => {
  const h = endpoint();

  const response = await h.send(validBody);

  assert.equal(response.status, 200);
  const [row] = h.inserts();
  assert.equal(h.inserts().length, 1);
  assert.deepEqual(
    {
      user_id: row.user_id,
      participant_name: row.participant_name,
      participant_role: row.participant_role,
      participant_id_number: row.participant_id_number,
      contributor_category: row.contributor_category,
      book_id: row.book_id,
      chapter: row.chapter,
      comment: row.comment,
      export_status: row.export_status,
    },
    {
      user_id: null,
      participant_name: 'Miriam',
      participant_role: 'Church leader',
      participant_id_number: null,
      contributor_category: 'community',
      book_id: 'JHN',
      chapter: 3,
      comment: 'Verse 16 reads awkwardly.',
      export_status: 'exported',
    }
  );
  assert.match(String(row.client_ip_hash), /^[0-9a-f]{64}$/);
  assert.ok(!String(row.client_ip_hash).includes('203.0.113.9'));
  // Only the feedback table and the submission budget are touched: no account-preference
  // gate, no other export.
  assert.deepEqual(
    [...new Set(h.harness.calls.map((call) => call.table))],
    ['chapter_feedback_submissions', BUDGET_RPC]
  );
});

test('a participant without a name or role is turned away', async () => {
  for (const missing of ['participantName', 'participantRole']) {
    const h = endpoint();
    const response = await h.send({ ...validBody, [missing]: '   ' });
    assert.equal(response.status, 400);
    assert.equal(await errorOf(response), 'participantName and participantRole are required');
    assert.deepEqual(h.inserts(), []);
  }
});

test('the book and chapter must exist in the canon', async () => {
  for (const [body, error] of [
    [{ ...validBody, bookId: 'XYZ' }, 'bookId is not a recognized Bible book'],
    [{ ...validBody, chapter: 22 }, 'chapter is out of range for this book'],
    [{ ...validBody, chapter: 0 }, 'chapter must be an integer greater than or equal to 1'],
  ] as const) {
    const h = endpoint();
    const response = await h.send(body);
    assert.equal(response.status, 400);
    assert.equal(await errorOf(response), error);
    assert.deepEqual(h.inserts(), []);
  }
});

test('the service-role client does the writes; a bearer token is checked with the anon key', async () => {
  const anonymous = endpoint();
  await anonymous.send(validBody);
  assert.deepEqual(
    anonymous.harness.clientsCreated.map((client) => client.key),
    [SERVICE_KEY]
  );

  const signedIn = endpoint({ userId: 'user-1' });
  const response = await signedIn.send(validBody, 'valid-token');
  assert.equal(response.status, 200);
  assert.deepEqual(
    signedIn.harness.clientsCreated.map((client) => client.key),
    [SERVICE_KEY, ANON_KEY]
  );
  assert.equal(signedIn.inserts()[0].user_id, 'user-1');
});

test('an unrecognised token is not a refusal: the feedback is saved without an account', async () => {
  const h = endpoint({ userId: null });

  const response = await h.send(validBody, 'expired-token');

  assert.equal(response.status, 200);
  assert.equal(h.inserts()[0].user_id, null);
});

// ── Rate limiting ────────────────────────────────────────────────────────────

test('anonymous submitters are throttled on their hashed address, not the names they send', async () => {
  const h = endpoint();
  await h.send(validBody);

  const scope = h.rateQuery()!.steps.filter((step) => ['eq', 'is'].includes(step.method));
  assert.deepEqual(scope, [
    { method: 'is', args: ['user_id', null] },
    { method: 'eq', args: ['client_ip_hash', h.inserts()[0].client_ip_hash] },
  ]);
});

test('signed-in submitters are throttled on their account', async () => {
  const h = endpoint({ userId: 'user-1' });
  await h.send(validBody, 'valid-token');

  const scope = h.rateQuery()!.steps.filter((step) => ['eq', 'is'].includes(step.method));
  assert.deepEqual(scope, [{ method: 'eq', args: ['user_id', 'user-1'] }]);
});

test('the twentieth submission in an hour is refused and nothing is stored', async () => {
  const h = endpoint({ recentCount: 20 });

  const response = await h.send(validBody);

  assert.equal(response.status, 429);
  assert.deepEqual(h.inserts(), []);
});

test('if the counter cannot be read, the submission is refused rather than waved through', async () => {
  const h = endpoint({ rateError: true });

  const response = await h.send({ ...validBody, audioResponse: audio() });

  assert.equal(response.status, 503);
  assert.deepEqual(h.inserts(), []);
  assert.deepEqual(h.storage, []);
});

// ── Recordings ───────────────────────────────────────────────────────────────

// The row count above is read in one request and the row inserted in another, so parallel
// submissions all passed it (security review 2026-09-24, pass 2). An atomic budget is now
// charged before any upload.
test('an exhausted submission budget refuses the request before any upload or insert', async () => {
  const h = endpoint({ budget: { data: [{ allowed: false, retry_after_seconds: 1800 }] } });

  const response = await h.send({ ...validBody, audioResponse: audio() });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '1800');
  assert.equal(await errorOf(response), 'Too many submissions. Please try again later.');
  assert.deepEqual(h.storage, []);
  assert.deepEqual(h.inserts(), []);
});

test('the budget is charged per hashed address for anonymous and per account when signed in', async () => {
  const allowed = { data: [{ allowed: true, retry_after_seconds: 0 }] };
  const anonymous = endpoint({ budget: allowed });
  const signedIn = endpoint({ budget: allowed, userId: 'user-7' });

  assert.equal((await anonymous.send(validBody)).status, 200);
  assert.equal((await signedIn.send(validBody, 'valid-token')).status, 200);

  const argsOf = (h: ReturnType<typeof endpoint>) =>
    h.harness.calls.find((call) => call.table === BUDGET_RPC)?.steps[0].args[0] as Record<
      string,
      unknown
    >;
  const anonymousKey = String(argsOf(anonymous).p_client_key);
  assert.match(anonymousKey, /^feedback-submit:ip:[0-9a-f]{64}$/);
  assert.ok(!anonymousKey.includes('203.0.113.9'));
  assert.deepEqual(argsOf(signedIn), {
    p_client_key: 'feedback-submit:user:user-7',
    p_max_requests: 20,
    p_window_seconds: 3600,
  });
});

test('a budget that cannot be charged refuses the submission rather than waving it through', async () => {
  const h = endpoint({ budget: { error: { code: '57014', message: 'statement timeout' } } });

  const response = await h.send({ ...validBody, audioResponse: audio() });

  assert.equal(response.status, 503);
  assert.deepEqual(h.storage, []);
  assert.deepEqual(h.inserts(), []);
});

test('while the budget function is not deployed, the row count alone applies', async () => {
  const h = endpoint();

  assert.equal((await h.send(validBody)).status, 200);
  assert.equal(h.inserts().length, 1);
});

test('a recording is uploaded with the service role and linked to the saved row', async () => {
  const h = endpoint();

  const response = await h.send({ ...validBody, audioResponse: audio() });

  assert.equal(response.status, 200);
  const [upload] = h.storage;
  assert.equal(upload.method, 'upload');
  const [path, bytes, options] = upload.args as [string, Uint8Array, Record<string, unknown>];
  assert.match(path, /^anonymous\/bsb\/jhn\/3\/\d+-[0-9a-f-]{36}\.m4a$/);
  assert.deepEqual(Buffer.from(bytes), recording);
  assert.deepEqual(options, { contentType: 'audio/mp4', upsert: false });
  const [row] = h.inserts();
  assert.equal(row.audio_response_path, path);
  assert.equal(row.audio_response_bucket, 'chapter-feedback-audio');
  assert.equal(row.audio_response_duration_ms, 1500);
});

test('a recording whose row fails to save is removed again', async () => {
  const h = endpoint({ insertError: true });

  const response = await h.send({ ...validBody, audioResponse: audio() });

  assert.equal(response.status, 500);
  const upload = h.storage.find((call) => call.method === 'upload')!;
  const remove = h.storage.find((call) => call.method === 'remove')!;
  assert.deepEqual(remove.args, [[upload.args[0]]]);
});

test('recordings are bounded before anything is uploaded', async () => {
  const oversize = 'A'.repeat(Math.ceil((5 * 1024 * 1024 * 4) / 3) + 12);
  for (const [override, error] of [
    [{ mimeType: 'audio/mpeg' }, 'audio response must use audio/mp4'],
    [{ bucket: 'avatars' }, 'audio response bucket is not supported'],
    [{ durationMs: 60_001 }, 'audio response duration must be between 0.5 and 60 seconds'],
    [{ durationMs: 400 }, 'audio response duration must be between 0.5 and 60 seconds'],
    [{ sizeBytes: 5 * 1024 * 1024 + 1 }, 'audio response size must be 5 MB or smaller'],
    [{ base64Data: oversize, sizeBytes: null }, 'audio response size must be 5 MB or smaller'],
    [{ sizeBytes: recording.length + 1 }, 'audio response size does not match upload data'],
    [{ base64Data: undefined }, 'audio responses must include upload data'],
  ] as const) {
    const h = endpoint();
    const response = await h.send({ ...validBody, audioResponse: audio(override) });
    assert.equal(response.status, 400, JSON.stringify(override).slice(0, 80));
    assert.equal(await errorOf(response), error);
    assert.deepEqual(h.storage, []);
    assert.deepEqual(h.inserts(), []);
  }
});

test('a signed-in participant may attach a recording already in their own storage folder', async () => {
  const h = endpoint({ userId: 'user-1' });

  const response = await h.send(
    { ...validBody, audioResponse: audio({ base64Data: undefined, path: 'user-1/clip.m4a' }) },
    'valid-token'
  );

  assert.equal(response.status, 200);
  assert.deepEqual(h.storage, [{ method: 'download', args: ['user-1/clip.m4a'] }]);
  assert.equal(h.inserts()[0].audio_response_path, 'user-1/clip.m4a');
});

test('a preuploaded path outside the caller’s folder, or with traversal, is refused', async () => {
  for (const path of [
    'other-user/clip.m4a',
    'user-1/../other-user/clip.m4a',
    'user-1\\..\\x.m4a',
    // Encoded or empty segments a storage URL or normaliser could resolve outside the folder.
    'user-1/%2e%2e/other-user/clip.m4a',
    'user-1//other-user/clip.m4a',
    'user-1/./clip.m4a',
    'user-1/.hidden.m4a',
    'user-1/clip.m4a?download=other',
    'user-1/clip.mp3',
    'user-1/',
  ]) {
    const h = endpoint({ userId: 'user-1' });
    const response = await h.send(
      { ...validBody, audioResponse: audio({ base64Data: undefined, path }) },
      'valid-token'
    );
    assert.equal(response.status, 400, path);
    assert.equal(await errorOf(response), 'audio response path is invalid for this user');
    assert.deepEqual(h.storage, []);
  }
});

// ── Scripture council attribution ────────────────────────────────────────────

test('council attribution is checked against the council passcode in the request body', async () => {
  const env = { SCRIPTURE_COUNCIL_PASSCODE: COUNCIL_CODE };
  const denied = endpoint({ env });
  const refused = await denied.send({
    ...validBody,
    contributorCategory: 'scripture_council',
    councilPasscode: 'wrong',
  });
  assert.equal(refused.status, 403);
  assert.deepEqual(denied.inserts(), []);

  const allowed = endpoint({ env });
  const saved = await allowed.send({
    ...validBody,
    contributorCategory: 'scripture_council',
    councilPasscode: COUNCIL_CODE,
  });
  assert.equal(saved.status, 200);
  assert.equal(allowed.inserts()[0].contributor_category, 'scripture_council');
});

test('an unknown contributor category is refused', async () => {
  const h = endpoint();

  const response = await h.send({ ...validBody, contributorCategory: 'admin' });

  assert.equal(response.status, 400);
  assert.equal(await errorOf(response), 'Invalid contributor category');
});

// ─── client submission ids (idempotent retries) ───────────────────────────────

const SUBMISSION_ID = '5b0c9a4e-2f7d-4c1e-9a3b-8d6f0e1c2a7b';
const DUPLICATE_SUBMISSION = {
  error: {
    code: '23505',
    message:
      'duplicate key value violates unique constraint "chapter_feedback_submissions_client_submission_id_key"',
    details: `Key (client_submission_id)=(${SUBMISSION_ID}) already exists.`,
  },
};

test('a client submission id is stored with the feedback', async () => {
  const h = endpoint();

  const response = await h.send({ ...validBody, clientSubmissionId: SUBMISSION_ID.toUpperCase() });

  assert.equal(response.status, 200);
  assert.equal(h.inserts()[0].client_submission_id, SUBMISSION_ID);
});

test('feedback from a build that sends no client submission id is saved as before', async () => {
  const h = endpoint();

  const response = await h.send(validBody);

  assert.equal(response.status, 200);
  assert.equal('client_submission_id' in h.inserts()[0], false);
});

test('a retry of a submission that was already saved succeeds with the saved row, not a copy', async () => {
  const h = endpoint({
    insert: () => DUPLICATE_SUBMISSION,
    existing: { data: { id: 'feedback-first' } },
  });

  const response = await h.send({ ...validBody, clientSubmissionId: SUBMISSION_ID });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saved: true,
    exported: true,
    feedbackId: 'feedback-first',
  });
  assert.equal(h.inserts().length, 1);
});

test('a retried recording is not left behind when the submission was already saved', async () => {
  const h = endpoint({
    insert: () => DUPLICATE_SUBMISSION,
    existing: { data: { id: 'feedback-first' } },
  });

  const response = await h.send({
    ...validBody,
    clientSubmissionId: SUBMISSION_ID,
    audioResponse: audio(),
  });

  assert.equal(response.status, 200);
  const upload = h.storage.find((call) => call.method === 'upload')!;
  const remove = h.storage.find((call) => call.method === 'remove')!;
  assert.deepEqual(remove.args, [[upload.args[0]]]);
});

test('a unique violation on another constraint is still a failure', async () => {
  const h = endpoint({
    insert: () => ({ error: { code: '23505', message: 'duplicate key value violates "other"' } }),
    existing: { data: { id: 'feedback-first' } },
  });

  const response = await h.send({ ...validBody, clientSubmissionId: SUBMISSION_ID });

  assert.equal(response.status, 500);
});

test('a duplicate whose saved row cannot be read back is a retryable failure', async () => {
  const h = endpoint({
    insert: () => DUPLICATE_SUBMISSION,
    existing: { error: { message: 'lookup failed' } },
  });

  const response = await h.send({ ...validBody, clientSubmissionId: SUBMISSION_ID });

  assert.equal(response.status, 500);
});

test('a client submission id that is not a UUID is refused before anything is written', async () => {
  const h = endpoint();

  const response = await h.send({ ...validBody, clientSubmissionId: 'not-a-uuid' });

  assert.equal(response.status, 400);
  assert.equal(await errorOf(response), 'clientSubmissionId must be a UUID');
  assert.deepEqual(h.inserts(), []);
});

test('until the client_submission_id column exists, feedback is saved without it', async () => {
  // The function can be deployed before its migration is applied.
  const h = endpoint({
    insert: (row) =>
      'client_submission_id' in row
        ? {
            error: {
              code: 'PGRST204',
              message:
                "Could not find the 'client_submission_id' column of 'chapter_feedback_submissions' in the schema cache",
            },
          }
        : { data: { id: 'feedback-1', created_at: '2026-09-24T08:00:00.000Z' } },
  });

  const response = await h.send({ ...validBody, clientSubmissionId: SUBMISSION_ID });

  assert.equal(response.status, 200);
  assert.equal(h.inserts().length, 2);
  assert.equal('client_submission_id' in h.inserts()[1], false);
});
