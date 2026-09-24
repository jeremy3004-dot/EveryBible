import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction } from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against the public crash-report collector. Client mistakes are
// a small JSON 4xx; nothing Postgres would refuse may reach the upsert, because one refused
// value fails the whole batch and the device retries it forever.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

type Row = Record<string, unknown>;

const report = (overrides: Row = {}): Row => ({
  report_id: '11111111-2222-4333-8444-555555555555',
  occurred_at: new Date().toISOString(),
  kind: 'error',
  error_name: 'TypeError',
  message: 'x is undefined',
  app_version: '1.0.9',
  platform: 'ios',
  ...overrides,
});
const OTHER_ID = '22222222-3333-4444-8555-666666666666';

function endpoint(rpc?: () => Promise<{ data: unknown; error: unknown }>) {
  const harness = loadEdgeFunction(ENTRY, {
    respond: (call) =>
      call.table === 'rpc:consume_app_error_ingest_budget'
        ? { data: [{ allowed: true, retry_after_seconds: 0 }] }
        : { data: null, error: null },
    ...(rpc
      ? {
          client: {
            rpc,
            from: () => ({ upsert: async () => ({ error: null }) }),
          },
        }
      : {}),
  });
  const rows = (): Row[] =>
    harness.calls
      .filter((call) => call.table === 'app_error_reports')
      .flatMap(
        (call) => (call.steps.find((step) => step.method === 'upsert')?.args[0] as Row[]) ?? []
      );
  const post = async (body: BodyInit, method = 'POST') => {
    const response = await harness.handle(
      new Request('https://collector.example', {
        method,
        headers: { 'cf-connecting-ip': '203.0.113.7' },
        body,
      })
    );
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      json: (text ? JSON.parse(text) : null) as Row,
    };
  };
  return { harness, rows, post, send: (reports: unknown[]) => post(JSON.stringify({ reports })) };
}

test('PUT, PATCH and DELETE are refused with a JSON 405', async () => {
  const h = endpoint();
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const result = await h.post('{}', method);
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { error: 'Method not allowed' });
  }
  assert.deepEqual(h.harness.calls, []);
});

test('bodies of the wrong JSON type are a 400 and charge nothing', async () => {
  const h = endpoint();
  for (const body of ['', 'null', '[]', '42', '"reports"', '{"reports":{}}', '{"reports":[]}']) {
    const result = await h.post(body);
    assert.equal(result.status, 400, body);
    assert.deepEqual(result.json, { error: 'Request body must include 1-20 reports' });
  }
  assert.deepEqual(h.harness.calls, []);
});

test('a 5 MB body is a 413 before parsing or charging the budget', async () => {
  const h = endpoint();
  const result = await h.post(JSON.stringify({ reports: [report({ message: 'x'.repeat(5e6) })] }));
  assert.equal(result.status, 413);
  assert.deepEqual(h.harness.calls, []);
});

test('a NUL byte in the message is stored as a replacement character, not a failed batch', async () => {
  const h = endpoint();
  const result = await h.send([report({ message: 'bad\u0000byte' })]);
  assert.equal(result.status, 200);
  assert.equal(h.rows()[0].message, 'bad�byte');
});

test('lone surrogates in the message are replaced so the row is valid UTF-8', async () => {
  const h = endpoint();
  const result = await h.send([report({ message: 'a\ud800b\udc00c' })]);
  assert.equal(result.status, 200);
  assert.equal(h.rows()[0].message, 'a�b�c');
});

test('truncating a long message never splits an emoji into a lone surrogate', async () => {
  const h = endpoint();
  // 498 characters of text the scrubber keeps, so the 500-character cut lands inside an emoji.
  const result = await h.send([report({ message: `${'a '.repeat(249)}${'📖'.repeat(10)}` })]);
  assert.equal(result.status, 200);
  const message = String(h.rows()[0].message);
  assert.ok(message.length <= 500);
  assert.doesNotMatch(message, /[\ud800-\udbff](?![\udc00-\udfff])/);
});

test('emoji, RTL and zero-width text in the message is kept', async () => {
  const h = endpoint();
  await h.send([report({ message: 'خطأ 📖 a​b' })]);
  assert.equal(h.rows()[0].message, 'خطأ 📖 a​b');
});

test('prototype-pollution keys and extra fields are ignored and pollute nothing', async () => {
  const h = endpoint();
  const result = await h.post(
    '{"__proto__":{"polluted":1},"reports":[{"report_id":"11111111-2222-4333-8444-555555555555",' +
      `"occurred_at":"${new Date().toISOString()}","kind":"error","user_id":"u","email":"a@b.co",` +
      '"__proto__":{"install_id":"0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3"},"constructor":{"x":1}}]}'
  );
  assert.equal(result.status, 200);
  assert.equal(({} as Row).polluted, undefined);
  const row = h.rows()[0];
  assert.equal(row.install_id, null);
  assert.equal('user_id' in row, false);
  assert.equal('email' in row, false);
});

test('wrong types for every field are dropped or defaulted without a 500', async () => {
  const h = endpoint();
  const result = await h.send([
    report({
      error_name: 42,
      message: { text: 'x' },
      stack_frames: 'not-a-list',
      component_stack: ['A'],
      screen: 7,
      app_version: null,
      build_number: false,
      platform: ['ios'],
      os_version: 1e309,
      install_id: 'not-a-uuid',
    }),
    report({ report_id: 123 }),
    report({ report_id: OTHER_ID, kind: { kind: 'fatal' } }),
    report({ report_id: OTHER_ID, occurred_at: 'soon' }),
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { ok: true, inserted: 1, rejected: 3 });
  const row = h.rows()[0];
  assert.equal(row.error_name, 'Error');
  assert.equal(row.message, '');
  assert.deepEqual(row.stack_frames, []);
  assert.equal(row.platform, 'other');
  assert.equal(row.app_version, 'unknown');
});

test('a far-future occurred_at is clamped to receipt time', async () => {
  const h = endpoint();
  const before = Date.now();
  await h.send([report({ occurred_at: '+275760-09-13T00:00:00.000Z' })]);
  const stored = Date.parse(String(h.rows()[0].occurred_at));
  assert.ok(stored >= before && stored <= Date.now());
});

test('a budget RPC that throws refuses writes with 503 and Retry-After', async () => {
  const h = endpoint(async () => {
    throw new Error('connection terminated');
  });
  const result = await h.send([report()]);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('Retry-After'), '60');
  assert.deepEqual(result.json, { error: 'Error reporting is temporarily unavailable' });
});

test('a budget RPC that returns an unexpected shape refuses writes with 503', async () => {
  for (const data of [null, 'yes', [{ allowed: 'true' }], [], { allowed: 1 }]) {
    const h = endpoint(async () => ({ data, error: null }));
    const result = await h.send([report()]);
    assert.equal(result.status, 503, JSON.stringify(data));
  }
});
