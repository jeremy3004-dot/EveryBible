import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeQueryResult } from '../_testing/edgeFunctionHarness';

// What the public chapter-feedback endpoint refuses, and the defaults it fills in, for
// requests index.test.ts does not already cover. Every refusal must happen before anything is
// uploaded or stored.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

const validBody = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads awkwardly.',
  interfaceLanguage: 'en',
  participantName: 'Miriam',
  participantRole: 'Church leader',
  sourceScreen: 'reader',
};

// A minimal M4A container (ftyp, moov, mdat) whose mdat carries `mediaBytes` of payload, so
// the total length (and therefore the base64 padding) can be chosen.
const box = (type: string, payload = 4) => {
  const bytes = Buffer.alloc(8 + payload);
  bytes.writeUInt32BE(8 + payload, 0);
  bytes.write(type, 4, 'latin1');
  return bytes;
};
const recordingOf = (mediaBytes: number) =>
  Buffer.concat([box('ftyp'), box('moov'), box('mdat', mediaBytes)]);

const audio = (bytes: Buffer, overrides: Record<string, unknown> = {}) => ({
  bucket: 'chapter-feedback-audio',
  mimeType: 'audio/mp4',
  durationMs: 1500,
  sizeBytes: bytes.length,
  createdAt: '2026-09-24T08:00:00.000Z',
  base64Data: bytes.toString('base64'),
  ...overrides,
});

interface Scenario {
  feedbackResult?: (kind: 'rate' | 'insert') => EdgeQueryResult;
}

function endpoint(scenario: Scenario = {}) {
  const storage: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      storage.push({ method, args });
      return { data: {}, error: null };
    };
  const harness = loadEdgeFunction(ENTRY, {
    respond: (call) => {
      if (call.table !== 'chapter_feedback_submissions') return {};
      const kind = call.steps.some((step) => step.method === 'insert') ? 'insert' : 'rate';
      return (
        scenario.feedbackResult?.(kind) ??
        (kind === 'insert' ? { data: { id: 'feedback-1' } } : { count: 0 })
      );
    },
    storage: {
      'chapter-feedback-audio:upload': record('upload'),
      'chapter-feedback-audio:remove': record('remove'),
    },
  });
  const send = (body: unknown, method = 'POST') =>
    harness.handle(
      new Request('https://functions.example/submit-chapter-feedback', {
        method,
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      })
    );
  const inserts = () =>
    harness.calls
      .filter((call) => call.table === 'chapter_feedback_submissions')
      .flatMap((call) => call.steps)
      .filter((step) => step.method === 'insert')
      .map((step) => step.args[0] as Record<string, unknown>);
  return { harness, send, inserts, storage };
}

const expectRefusal = async (body: unknown, error: string, label = JSON.stringify(body)) => {
  const h = endpoint();
  const response = await h.send(body);
  assert.equal(response.status, 400, label.slice(0, 120));
  assert.deepEqual(await response.json(), { success: false, error }, label.slice(0, 120));
  assert.deepEqual(h.inserts(), [], label.slice(0, 120));
  assert.deepEqual(h.storage, [], label.slice(0, 120));
};

test('a CORS preflight is answered without touching the database', async () => {
  const h = endpoint();

  const response = await h.send(null, 'OPTIONS');

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(h.harness.calls, []);
});

test('only POST requests are accepted', async () => {
  const h = endpoint();

  const response = await h.send(null, 'GET');

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { success: false, error: 'Method not allowed' });
  assert.deepEqual(h.harness.calls, []);
});

test('feedback that does not say which translation, book or interface it is about is refused', async () => {
  const required =
    'translationId, translationLanguage, bookId, chapter, sentiment, and interfaceLanguage are required';
  for (const field of ['translationId', 'translationLanguage', 'bookId', 'interfaceLanguage']) {
    await expectRefusal({ ...validBody, [field]: '  ' }, required, field);
    await expectRefusal({ ...validBody, [field]: 42 }, required, `${field} as a number`);
  }
});

test('a body that is not JSON is refused as missing its required fields', async () => {
  const h = endpoint();

  const response = await h.harness.handle(
    new Request('https://functions.example/submit-chapter-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: '{"translationId": "bsb", ',
    })
  );

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /are required$/);
  assert.deepEqual(h.inserts(), []);
});

test('a name or role longer than 120 characters is refused', async () => {
  const error = 'participantName and participantRole must be 120 characters or fewer';
  await expectRefusal({ ...validBody, participantName: 'n'.repeat(121) }, error);
  await expectRefusal({ ...validBody, participantRole: 'r'.repeat(121) }, error);
});

test('the chapter must be a whole number', async () => {
  const error = 'chapter must be an integer greater than or equal to 1';
  for (const chapter of [undefined, '3', 2.5, -1]) {
    await expectRefusal({ ...validBody, chapter }, error, String(chapter));
  }
});

test('feedback must be a thumbs-up or a thumbs-down', async () => {
  for (const sentiment of [undefined, 'meh', 'UP']) {
    await expectRefusal(
      { ...validBody, sentiment },
      "sentiment must be either 'up' or 'down'",
      String(sentiment)
    );
  }
});

test('a comment longer than 2000 characters is refused', async () => {
  await expectRefusal(
    { ...validBody, comment: 'c'.repeat(2001) },
    'comment must be 2000 characters or fewer'
  );
});

test('a recording without a usable creation time is refused', async () => {
  const bytes = recordingOf(4);
  for (const createdAt of [undefined, 'yesterday']) {
    await expectRefusal(
      { ...validBody, audioResponse: audio(bytes, { createdAt }) },
      'audio response createdAt must be an ISO timestamp',
      String(createdAt)
    );
  }
});

test('a recording duration that is not a whole number of milliseconds is refused', async () => {
  await expectRefusal(
    { ...validBody, audioResponse: audio(recordingOf(4), { durationMs: 1500.5 }) },
    'audio response duration must be between 0.5 and 60 seconds'
  );
});

test('upload data that is not an M4A recording is refused before upload', async () => {
  const text = Buffer.from('this is not a recording at all!!');
  await expectRefusal(
    { ...validBody, audioResponse: audio(text) },
    'Audio response is not a complete M4A recording. Please record it again.'
  );
});

test('upload data that is not strict base64 is refused', async () => {
  const bytes = recordingOf(4);
  const base64 = bytes.toString('base64');
  for (const base64Data of [
    `${base64.slice(0, 8)} ${base64.slice(8)}`,
    `${base64}A`,
    '*'.repeat(48),
  ]) {
    await expectRefusal(
      { ...validBody, audioResponse: audio(bytes, { base64Data, sizeBytes: null }) },
      'audio response size must be 5 MB or smaller',
      base64Data
    );
  }
});

test('the declared size must match the decoded recording exactly, padding included', async () => {
  // 37 bytes encode with "==" padding and 38 bytes with "=", so an off-by-one in the padding
  // arithmetic would accept the wrong declared size or refuse the right one.
  for (const mediaBytes of [5, 6]) {
    const bytes = recordingOf(mediaBytes);
    assert.match(bytes.toString('base64'), mediaBytes === 5 ? /[^=]==$/ : /[^=]=$/);

    const accepted = endpoint();
    const ok = await accepted.send({ ...validBody, audioResponse: audio(bytes) });
    assert.equal(ok.status, 200, `${bytes.length} bytes`);
    assert.equal(accepted.inserts()[0]?.audio_response_size_bytes, bytes.length);

    await expectRefusal(
      { ...validBody, audioResponse: audio(bytes, { sizeBytes: bytes.length + 1 }) },
      'audio response size does not match upload data',
      `${bytes.length} bytes declared one larger`
    );
  }
});

test('a recording with no declared size is stored with its size unknown', async () => {
  const h = endpoint();

  const response = await h.send({
    ...validBody,
    audioResponse: audio(recordingOf(4), { sizeBytes: null }),
  });

  assert.equal(response.status, 200);
  assert.equal(h.inserts()[0]?.audio_response_size_bytes, null);
  assert.equal(h.storage[0]?.method, 'upload');
});

test('a translation id with no safe path characters is filed under "unknown"', async () => {
  const h = endpoint();

  const response = await h.send({
    ...validBody,
    translationId: '***',
    audioResponse: audio(recordingOf(4)),
  });

  assert.equal(response.status, 200);
  const [path] = h.storage[0]?.args as [string];
  assert.match(path, /^anonymous\/unknown\/jhn\/3\/\d+-[0-9a-f-]{36}\.m4a$/);
  // The row keeps the translation id as sent; only the storage path is sanitised.
  assert.equal(h.inserts()[0]?.translation_id, '***');
});

test('feedback that does not name its screen is recorded as coming from the reader', async () => {
  const h = endpoint();

  const response = await h.send({ ...validBody, sourceScreen: '   ' });

  assert.equal(response.status, 200);
  assert.equal(h.inserts()[0]?.source_screen, 'reader');
});

test('a rate counter that reports no count is treated as no recent submissions', async () => {
  const h = endpoint({
    feedbackResult: (kind) => (kind === 'rate' ? { count: null } : { data: { id: 'feedback-9' } }),
  });

  const response = await h.send(validBody);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saved: true,
    exported: true,
    feedbackId: 'feedback-9',
  });
});

test('an insert that returns no row is a failure, and the uploaded recording is removed', async () => {
  const h = endpoint({
    feedbackResult: (kind) => (kind === 'rate' ? { count: 0 } : { data: null, error: null }),
  });

  const response = await h.send({ ...validBody, audioResponse: audio(recordingOf(4)) });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    saved: false,
    exported: false,
    error: 'Unable to save feedback right now. Please try again later.',
  });
  const upload = h.storage.find((call) => call.method === 'upload');
  const remove = h.storage.find((call) => call.method === 'remove');
  assert.deepEqual(remove?.args, [[upload?.args[0]]]);
  assert.ok(h.harness.loggedErrors.some((line) => line.includes('no row returned')));
});
