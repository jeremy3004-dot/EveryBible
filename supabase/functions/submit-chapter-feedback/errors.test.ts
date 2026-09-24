import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeHarnessOptions } from '../_testing/edgeFunctionHarness';

// Audit 2026-09-24 L7: this endpoint runs with verify_jwt = false, so anyone on the internet
// can reach its error paths. Database and configuration details go to the function log only.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const DB_DETAIL =
  'duplicate key value violates unique constraint "chapter_feedback_submissions_pkey"';

const validBody = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'up',
  interfaceLanguage: 'en',
  participantName: 'Reader',
  participantRole: 'Community member',
  sourceScreen: 'reader',
};

// Smallest byte sequence the server-side M4A container check accepts: ftyp, moov, mdat.
const box = (type: string) => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32BE(12, 0);
  bytes.write(type, 4, 'latin1');
  return bytes;
};
const minimalRecording = Buffer.concat([box('ftyp'), box('moov'), box('mdat')]);

const submit = (options: EdgeHarnessOptions, body: unknown = validBody) => {
  const harness = loadEdgeFunction(ENTRY, options);
  const response = harness.handle(
    new Request('https://functions.example/submit-chapter-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify(body),
    })
  );
  return { harness, response };
};

test('a failed insert returns a generic error and logs the database detail', async () => {
  const { harness, response } = submit({
    respond: (call) =>
      call.steps.some((step) => step.method === 'insert')
        ? { error: { code: '23505', message: DB_DETAIL } }
        : { count: 0 },
  });

  const result = await response;
  const body = await result.json();

  assert.equal(result.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.saved, false);
  assert.doesNotMatch(
    JSON.stringify(body),
    /duplicate key|constraint|chapter_feedback_submissions/
  );
  assert.ok(harness.loggedErrors.some((line) => line.includes(DB_DETAIL)));
});

test('a failed audio upload returns a generic error and logs the storage detail', async () => {
  const { harness, response } = submit(
    {
      respond: () => ({ count: 0 }),
      storage: {
        'chapter-feedback-audio:upload': () => ({
          data: null,
          error: { message: 'new row violates row-level security policy for table "objects"' },
        }),
      },
    },
    {
      ...validBody,
      audioResponse: {
        bucket: 'chapter-feedback-audio',
        mimeType: 'audio/mp4',
        durationMs: 1500,
        sizeBytes: minimalRecording.length,
        createdAt: new Date().toISOString(),
        base64Data: minimalRecording.toString('base64'),
      },
    }
  );

  const result = await response;
  const body = await result.json();

  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(body), /row-level security|objects/);
  assert.ok(harness.loggedErrors.some((line) => line.includes('row-level security')));
});

test('missing server configuration is not described to the caller', async () => {
  const { harness, response } = submit({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });

  const result = await response;
  const body = await result.json();

  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(body), /SUPABASE_SERVICE_ROLE_KEY|secret/i);
  assert.ok(harness.loggedErrors.some((line) => line.includes('SUPABASE_SERVICE_ROLE_KEY')));
});

test('validation errors still explain what the caller must fix', async () => {
  const { response } = submit({}, { ...validBody, bookId: 'XYZ' });

  const result = await response;

  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), {
    success: false,
    error: 'bookId is not a recognized Bible book',
  });
});

// Public endpoint (verify_jwt = false): the body used to be parsed with req.json() with no size
// bound. The largest valid request carries a 5 MB recording as base64 (about 7 MB).
test('a request body over the size limit is refused before auth, storage or database work', async () => {
  const { harness, response } = submit({}, { ...validBody, padding: 'x'.repeat(8 * 1024 * 1024) });

  const result = await response;

  assert.equal(result.status, 413);
  assert.equal((await result.json()).saved, false);
  assert.deepEqual(harness.calls, []);
});

test('a maximum-size 5 MB recording still fits within the size limit', async () => {
  const size = 5 * 1024 * 1024;
  const recording = Buffer.alloc(size);
  let offset = 0;
  for (const [type, length] of [
    ['ftyp', 12],
    ['moov', 12],
    ['mdat', size - 24],
  ] as const) {
    recording.writeUInt32BE(length, offset);
    recording.write(type, offset + 4, 'latin1');
    offset += length;
  }
  const { response } = submit(
    {
      respond: (call) =>
        call.steps.some((s) => s.method === 'insert') ? { data: { id: 'f1' } } : { count: 0 },
    },
    {
      ...validBody,
      audioResponse: {
        bucket: 'chapter-feedback-audio',
        mimeType: 'audio/mp4',
        durationMs: 60000,
        sizeBytes: size,
        createdAt: new Date().toISOString(),
        base64Data: recording.toString('base64'),
      },
    }
  );

  const result = await response;

  assert.equal(result.status, 200);
  assert.equal((await result.json()).saved, true);
});
