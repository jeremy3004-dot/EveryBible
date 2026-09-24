import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction } from '../_testing/edgeFunctionHarness';

// Behaviour of the public crash-report collector, with a stateful stand-in for the database
// (the budget RPC and app_error_reports).
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

type BudgetMode = 'normal' | 'over' | 'down';

function endpoint(options: { budgetMode?: BudgetMode; writeError?: unknown } = {}) {
  const stored = new Map<string, Record<string, unknown>>();
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const upserts: Array<{ table: string; options: unknown }> = [];
  const client = {
    auth: {
      getUser: async () => {
        throw new Error('crash reports must never look up a user');
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (options.budgetMode === 'down') return { data: null, error: { message: 'no such fn' } };
      if (options.budgetMode === 'over') {
        return { data: [{ allowed: false, retry_after_seconds: 120 }], error: null };
      }
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    },
    from: (table: string) => ({
      upsert: async (rows: Array<Record<string, unknown>>, upsertOptions: unknown) => {
        upserts.push({ table, options: upsertOptions });
        if (options.writeError) return { error: options.writeError };
        for (const row of rows) if (!stored.has(String(row.id))) stored.set(String(row.id), row);
        return { error: null };
      },
    }),
  };
  const harness = loadEdgeFunction(ENTRY, { client });
  const report = (overrides: Record<string, unknown> = {}) => ({
    report_id: '11111111-2222-4333-8444-555555555555',
    occurred_at: new Date().toISOString(),
    kind: 'boundary',
    is_fatal: false,
    error_name: 'TypeError',
    message: 'x is undefined',
    stack_frames: ['VerseList (main.jsbundle:1:10)'],
    component_stack: 'VerseList < BibleReader',
    screen: 'BibleReader',
    fingerprint: 'client',
    app_version: '1.0.9',
    build_number: '440',
    platform: 'ios',
    os_version: '18.2',
    install_id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3',
    ...overrides,
  });
  const post = (body: string, headers: Record<string, string> = {}) =>
    harness.handle(
      new Request('https://collector.example', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.7',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig',
          ...headers,
        },
        body,
      })
    );
  return {
    stored,
    rpcCalls,
    upserts,
    report,
    harness,
    send: (reports: unknown[], headers?: Record<string, string>) =>
      post(JSON.stringify({ reports }), headers),
    post,
  };
}

test('valid reports are stored without any user or network identity', async () => {
  const h = endpoint();
  const response = await h.send([
    h.report(),
    h.report({ report_id: '21111111-2222-4333-8444-555555555555', kind: 'fatal' }),
  ]);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, inserted: 2, rejected: 0 });
  assert.equal(h.stored.size, 2);
  const row = h.stored.get('21111111-2222-4333-8444-555555555555');
  assert.equal(row?.is_fatal, true);
  assert.match(String(row?.fingerprint), /^[0-9a-f]{16}$/);
  assert.equal(h.upserts[0].table, 'app_error_reports');
  assert.deepEqual(h.upserts[0].options, { onConflict: 'id', ignoreDuplicates: true });
  const serialized = JSON.stringify([...h.stored.values()]);
  assert.ok(!serialized.includes('203.0.113.7'));
  assert.ok(!/user_id|geo_/.test(serialized));
});

test('a retried upload does not duplicate reports', async () => {
  const h = endpoint();
  await h.send([h.report()]);
  await h.send([h.report()]);
  assert.equal(h.stored.size, 1);
});

test('the budget is charged per source under its own key namespace', async () => {
  const h = endpoint();
  await h.send([h.report()]);
  await h.send([h.report()], { 'cf-connecting-ip': '198.51.100.1' });
  // A spoofed forwarding header must not mint a new throttle key.
  await h.send([h.report()], { 'x-forwarded-for': '192.0.2.99' });

  assert.equal(h.rpcCalls[0].fn, 'consume_app_error_ingest_budget');
  assert.equal(h.rpcCalls[0].args.p_report_count, 1);
  const keys = h.rpcCalls.map((call) => call.args.p_client_key);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[0], keys[2]);
  assert.match(String(keys[0]), /^[0-9a-f]{64}$/);
});

test('an over-budget source is refused with Retry-After and nothing is written', async () => {
  const h = endpoint({ budgetMode: 'over' });
  const response = await h.send([h.report()]);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '120');
  assert.equal(h.stored.size, 0);
});

test('when the limiter is unavailable the endpoint refuses rather than writing unthrottled', async () => {
  const h = endpoint({ budgetMode: 'down' });
  const response = await h.send([h.report()]);
  assert.equal(response.status, 503);
  assert.equal(h.stored.size, 0);
});

test('malformed or oversized bodies are rejected before the budget or any write', async () => {
  const h = endpoint();
  assert.equal((await h.post('not json')).status, 400);
  assert.equal((await h.post(JSON.stringify({ reports: [] }))).status, 400);
  assert.equal((await h.post(JSON.stringify({ reports: 'x' }))).status, 400);
  const tooMany = Array.from({ length: 21 }, () => h.report());
  assert.equal((await h.send(tooMany)).status, 400);
  const huge = JSON.stringify({ reports: [h.report({ message: 'x'.repeat(70 * 1024) })] });
  assert.equal((await h.post(huge)).status, 413);
  assert.equal(h.rpcCalls.length, 0);
  assert.equal(h.stored.size, 0);
});

test('individual bad reports are dropped and counted while the rest are kept', async () => {
  const h = endpoint();
  const response = await h.send([
    h.report(),
    h.report({ report_id: 'nope' }),
    h.report({
      report_id: '31111111-2222-4333-8444-555555555555',
      occurred_at: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
    }),
  ]);
  assert.deepEqual(await response.json(), { ok: true, inserted: 1, rejected: 2 });
});

test('a batch where every report is rejected is acknowledged so the device can clear it', async () => {
  const h = endpoint();
  const response = await h.send([h.report({ kind: 'warning' })]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, inserted: 0, rejected: 1 });
  assert.equal(h.upserts.length, 0);
});

test('a database failure is logged but not echoed to the public caller', async () => {
  const h = endpoint({ writeError: { message: 'relation "app_error_reports" does not exist' } });
  const response = await h.send([h.report()]);
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes('relation'));
  assert.ok(h.harness.loggedErrors.some((line) => line.includes('does not exist')));
});

test('only POST writes; GET is a health check and other methods are refused', async () => {
  const h = endpoint();
  const get = await h.harness.handle(new Request('https://collector.example', { method: 'GET' }));
  assert.equal(get.status, 200);
  const put = await h.harness.handle(
    new Request('https://collector.example', { method: 'PUT', body: '{}' })
  );
  assert.equal(put.status, 405);
  const options = await h.harness.handle(
    new Request('https://collector.example', { method: 'OPTIONS' })
  );
  assert.equal(options.status, 200);
});
