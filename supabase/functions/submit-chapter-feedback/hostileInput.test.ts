import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against the public chapter-feedback endpoint (verify_jwt =
// false). The fake database refuses what Postgres refuses in the columns this endpoint writes
// (text holding a NUL byte or a lone surrogate, a timestamptz it cannot read), so a client
// mistake that slips past validation shows up as the 500 it would be in production.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const COUNCIL_CODE = '900900';
const USER_ID = '5d7a1c9e-2b3f-4e6a-8c1d-0f9e8b7a6c5d';

type Row = Record<string, unknown>;

const valid: Row = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'jhn',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads awkwardly.',
  interfaceLanguage: 'en',
  participantName: 'Miriam',
  participantRole: 'Church leader',
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.9',
};

const box = (type: string) => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32BE(12, 0);
  bytes.write(type, 4, 'latin1');
  return bytes;
};
const recording = Buffer.concat([box('ftyp'), box('moov'), box('mdat')]);
const audio = (overrides: Row = {}): Row => ({
  bucket: 'chapter-feedback-audio',
  mimeType: 'audio/mp4',
  durationMs: 1500,
  sizeBytes: recording.length,
  createdAt: '2026-09-24T08:00:00.000Z',
  base64Data: recording.toString('base64'),
  ...overrides,
});

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function postgresRejects(call: EdgeQueryCall): EdgeQueryResult | undefined {
  const insert = call.steps.find((step) => step.method === 'insert')?.args[0] as Row | undefined;
  if (!insert) return undefined;
  for (const value of Object.values(insert)) {
    if (typeof value === 'string' && (value.includes('\u0000') || LONE_SURROGATE.test(value))) {
      return { error: { code: '22P05', message: 'unsupported Unicode escape sequence' } };
    }
  }
  const createdAt = insert.audio_response_created_at;
  if (createdAt != null && !(typeof createdAt === 'string' && PG_TIMESTAMP.test(createdAt))) {
    return { error: { code: '22007', message: 'invalid input syntax for type timestamp' } };
  }
  return undefined;
}

function endpoint(options: { attempts?: number; attemptsError?: boolean } = {}) {
  const storage: Array<{ method: string; args: unknown[] }> = [];
  const harness = loadEdgeFunction(ENTRY, {
    env: { SCRIPTURE_COUNCIL_PASSCODE: COUNCIL_CODE },
    getUser: (token) => ({
      data: { user: token === 'valid-token' ? { id: USER_ID } : null },
      error: token === 'valid-token' ? null : { message: 'invalid JWT' },
    }),
    respond: (call) => {
      if (call.table === 'translator_review_attempts') {
        if (call.steps.some((step) => step.method === 'insert')) return {};
        return options.attemptsError
          ? { error: { message: 'counter offline' } }
          : { count: options.attempts ?? 0 };
      }
      if (call.table !== 'chapter_feedback_submissions') return {};
      const rejected = postgresRejects(call);
      if (rejected) return rejected;
      if (call.steps.some((step) => step.method === 'insert')) {
        return { data: { id: 'feedback-1', created_at: '2026-09-24T08:00:00.000Z' } };
      }
      return { count: 0 };
    },
    storage: {
      'chapter-feedback-audio:upload': (...args: unknown[]) => {
        storage.push({ method: 'upload', args });
        return { data: {}, error: null };
      },
      'chapter-feedback-audio:remove': (...args: unknown[]) => {
        storage.push({ method: 'remove', args });
        return { data: {}, error: null };
      },
    },
  });
  const request = async (
    body: BodyInit | null,
    init: { method?: string; token?: string; contentType?: string | null } = {}
  ) => {
    const response = await harness.handle(
      new Request('https://functions.example/submit-chapter-feedback', {
        method: init.method ?? 'POST',
        headers: {
          ...(init.contentType === null
            ? {}
            : { 'Content-Type': init.contentType ?? 'application/json' }),
          'cf-connecting-ip': '203.0.113.9',
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        },
        body,
      })
    );
    const text = await response.text();
    return { status: response.status, text, json: JSON.parse(text) as Row };
  };
  const inserts = () =>
    harness.calls
      .filter((call) => call.table === 'chapter_feedback_submissions')
      .flatMap((call) => call.steps)
      .filter((step) => step.method === 'insert')
      .map((step) => step.args[0] as Row);
  const attemptsRecorded = () =>
    harness.calls.filter(
      (call) =>
        call.table === 'translator_review_attempts' &&
        call.steps.some((step) => step.method === 'insert')
    ).length;
  return {
    harness,
    storage,
    request,
    inserts,
    attemptsRecorded,
    send: (body: unknown, token?: string) => request(JSON.stringify(body), { token }),
  };
}

// --- Transport -----------------------------------------------------------------------------

test('GET, PUT, PATCH and DELETE are a JSON 405 before any client is created', async () => {
  const h = endpoint();
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const result = await h.request(method === 'GET' ? null : JSON.stringify(valid), { method });
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
  }
  assert.equal(h.harness.clientsCreated.length, 0);
});

test('a missing or non-JSON Content-Type does not change how the body is read', async () => {
  const h = endpoint();
  for (const contentType of [null, 'text/plain', 'multipart/form-data']) {
    const result = await h.request(JSON.stringify(valid), { contentType });
    assert.equal(result.status, 200, String(contentType));
  }
});

test('bodies of the wrong JSON type are a 400 and nothing is written', async () => {
  const h = endpoint();
  for (const body of ['', 'null', '[]', '[{}]', '42', '"feedback"', 'true', '{"a":']) {
    const result = await h.request(body);
    assert.equal(result.status, 400, body);
    assert.equal(result.json.success, false);
  }
  assert.deepEqual(h.inserts(), []);
  assert.deepEqual(h.storage, []);
});

test('a 10 MB body is a 413 before auth, storage or database work', async () => {
  const h = endpoint();
  const result = await h.request(JSON.stringify({ ...valid, comment: 'x'.repeat(10e6) }), {
    token: 'valid-token',
  });
  assert.equal(result.status, 413);
  assert.deepEqual(h.harness.calls, []);
  assert.deepEqual(h.storage, []);
});

// --- Text Postgres refuses -----------------------------------------------------------------

test('a NUL byte in any stored text field is a 400 and nothing is written', async () => {
  for (const field of [
    'translationId',
    'translationLanguage',
    'interfaceLanguage',
    'participantName',
    'participantRole',
    'comment',
    'contentLanguageCode',
    'contentLanguageName',
    'sourceScreen',
    'appPlatform',
    'appVersion',
  ]) {
    const h = endpoint();
    const result = await h.send({ ...valid, [field]: 'bad\u0000value' });
    assert.equal(result.status, 400, field);
    assert.deepEqual(result.json, {
      success: false,
      error: 'Text fields must not contain control or invalid characters',
    });
    assert.deepEqual(h.inserts(), [], field);
  }
});

test('a lone surrogate in a stored text field is a 400', async () => {
  const h = endpoint();
  const result = await h.send({ ...valid, comment: 'half an emoji \ud83d' });
  assert.equal(result.status, 400);
  assert.deepEqual(h.inserts(), []);
});

test('text fields other than the comment and names are capped at 128 characters', async () => {
  for (const field of [
    'translationId',
    'translationLanguage',
    'interfaceLanguage',
    'contentLanguageCode',
    'contentLanguageName',
    'sourceScreen',
    'appPlatform',
    'appVersion',
  ]) {
    const h = endpoint();
    const result = await h.send({ ...valid, [field]: 'x'.repeat(129) });
    assert.equal(result.status, 400, field);
    assert.deepEqual(result.json, {
      success: false,
      error: 'Text fields must be 128 characters or fewer',
    });
    assert.deepEqual(h.inserts(), [], field);
  }
});

test('emoji, RTL, zero-width and combining text is stored exactly as sent', async () => {
  const h = endpoint();
  const comment = 'الآية ١٦ 📖 a​b é';
  const result = await h.send({ ...valid, comment, participantName: 'מרים 🙂' });
  assert.equal(result.status, 200);
  assert.equal(h.inserts()[0].comment, comment);
  assert.equal(h.inserts()[0].participant_name, 'מרים 🙂');
});

// --- Types and shapes ----------------------------------------------------------------------

test('wrong types for required fields are a 400 with no write', async () => {
  const h = endpoint();
  for (const overrides of [
    { translationId: 42 },
    { bookId: ['JHN'] },
    { chapter: '3' },
    { chapter: 3.5 },
    { chapter: -1 },
    { chapter: 1e308 },
    { sentiment: true },
    { interfaceLanguage: { en: true } },
    { participantName: 7 },
    { comment: 'x'.repeat(2001) },
  ]) {
    const result = await h.send({ ...valid, ...overrides });
    assert.equal(result.status, 400, JSON.stringify(overrides).slice(0, 60));
  }
  assert.deepEqual(h.inserts(), []);
});

test('an audio response of the wrong shape is a 400, never an upload', async () => {
  const h = endpoint();
  for (const audioResponse of [
    'recording',
    [audio()],
    { ...audio(), bucket: 'avatars' },
    { ...audio(), durationMs: Infinity },
    { ...audio(), sizeBytes: -1 },
    { ...audio(), base64Data: 12345 },
  ]) {
    const result = await h.send({ ...valid, audioResponse });
    assert.equal(result.status, 400, JSON.stringify(audioResponse).slice(0, 60));
  }
  assert.deepEqual(h.storage, []);
  assert.deepEqual(h.inserts(), []);
});

test('an audio createdAt that is not an ISO timestamp string is a 400 before any upload', async () => {
  const h = endpoint();
  // V8's Date.parse reads 12345 and '1' as dates (year 12345, 2001), which Postgres does not.
  for (const createdAt of [
    12345,
    '1',
    'Tue',
    { at: 1 },
    '2026-09-24T25:61:00Z',
    '+275760-09-13T00:00:00.000Z',
    'Thu, 24 Sep 2026 08:00:00 GMT',
  ]) {
    const result = await h.send({ ...valid, audioResponse: audio({ createdAt }) });
    assert.equal(result.status, 400, JSON.stringify(createdAt));
    assert.deepEqual(result.json, {
      success: false,
      error: 'audio response createdAt must be an ISO timestamp',
    });
  }
  assert.deepEqual(h.storage, []);
});

test('a far-future audio createdAt is stored as the time of receipt', async () => {
  const h = endpoint();
  const before = Date.now();
  const result = await h.send({
    ...valid,
    audioResponse: audio({ createdAt: '9999-12-31T23:59:59Z' }),
  });
  assert.equal(result.status, 200);
  const stored = String(h.inserts()[0].audio_response_created_at);
  assert.match(stored, PG_TIMESTAMP);
  assert.ok(Date.parse(stored) >= before && Date.parse(stored) <= Date.now(), stored);
});

test('an ISO createdAt with an offset is stored in UTC', async () => {
  const h = endpoint();
  const result = await h.send({
    ...valid,
    audioResponse: audio({ createdAt: '2026-09-24T13:45:00+05:45' }),
  });
  assert.equal(result.status, 200);
  assert.equal(h.inserts()[0].audio_response_created_at, '2026-09-24T08:00:00.000Z');
});

test('extra and snake_case fields cannot set stored columns', async () => {
  const h = endpoint();
  const result = await h.send({
    ...valid,
    user_id: USER_ID,
    userId: USER_ID,
    export_status: 'failed',
    client_ip_hash: 'chosen',
    participant_id_number: '42',
    contributor_category: 'scripture_council',
    scripture_council_resolution: 'fixed',
  });
  assert.equal(result.status, 200);
  const row = h.inserts()[0];
  assert.equal(row.user_id, null);
  assert.equal(row.export_status, 'exported');
  assert.notEqual(row.client_ip_hash, 'chosen');
  assert.equal(row.participant_id_number, null);
  assert.equal(row.contributor_category, 'community');
  assert.equal('scripture_council_resolution' in row, false);
});

test('prototype-pollution keys cannot claim council attribution or pollute', async () => {
  const h = endpoint();
  const raw = JSON.stringify(valid).replace(
    /^\{/,
    '{"__proto__":{"contributorCategory":"scripture_council","councilPasscode":"900900"},' +
      '"constructor":{"prototype":{"polluted":true}},'
  );
  const result = await h.request(raw);
  assert.equal(result.status, 200);
  assert.equal(h.inserts()[0].contributor_category, 'community');
  assert.equal(({} as Row).polluted, undefined);
});

// --- Auth ----------------------------------------------------------------------------------

test('a garbage, expired or anon-key token is saved unattributed, never refused', async () => {
  for (const token of ['garbage', 'anon-key', 'eyJhbGciOiJIUzI1NiJ9.e30.expired']) {
    const h = endpoint();
    const result = await h.send(valid, token);
    assert.equal(result.status, 200, token);
    assert.equal(h.inserts()[0].user_id, null, token);
  }
});

test('a verified user cannot attach another user’s preuploaded recording', async () => {
  const h = endpoint();
  const result = await h.send(
    {
      ...valid,
      audioResponse: audio({
        base64Data: undefined,
        path: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip.m4a',
      }),
    },
    'valid-token'
  );
  assert.equal(result.status, 400);
  assert.deepEqual(result.json, {
    success: false,
    error: 'audio response path is invalid for this user',
  });
});

// --- Council passcode ----------------------------------------------------------------------

test('council passcodes of the wrong type, length or alphabet are 403, counted, not echoed', async () => {
  for (const councilPasscode of [900900, ['900900'], '', '9009', '9009000', 'abcdef', null]) {
    const h = endpoint();
    const result = await h.send({
      ...valid,
      contributorCategory: 'scripture_council',
      councilPasscode,
    });
    assert.equal(result.status, 403, JSON.stringify(councilPasscode));
    assert.deepEqual(result.json, {
      success: false,
      saved: false,
      error: 'Council access denied',
    });
    assert.equal(h.attemptsRecorded(), 1);
    assert.doesNotMatch(result.text, /900900/);
    assert.deepEqual(h.inserts(), []);
  }
});

test('a locked-out address is refused before the council passcode is compared', async () => {
  const h = endpoint({ attempts: 10 });
  const result = await h.send({
    ...valid,
    contributorCategory: 'scripture_council',
    councilPasscode: COUNCIL_CODE,
  });
  assert.equal(result.status, 429);
  assert.equal(h.attemptsRecorded(), 0);
  assert.deepEqual(h.inserts(), []);
});

test('an unreadable attempt counter refuses council submissions with 503', async () => {
  const h = endpoint({ attemptsError: true });
  const result = await h.send({
    ...valid,
    contributorCategory: 'scripture_council',
    councilPasscode: COUNCIL_CODE,
  });
  assert.equal(result.status, 503);
  assert.deepEqual(h.inserts(), []);
});
