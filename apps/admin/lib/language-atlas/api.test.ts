import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Route = { GET: (...args: unknown[]) => Promise<Response> };

function loadRoute(
  detail: boolean,
  authorized: boolean,
  fail = false,
  authFailure = false,
  largeIndex = false
) {
  const filename = new URL(
    `../../app/api/language-atlas/${detail ? '[id]/' : ''}route.ts`,
    import.meta.url
  );
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const calls: string[] = [];
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse: Response },
    '@/lib/admin-auth': {
      getAdminIdentity: async () => {
        calls.push('auth');
        if (authFailure) throw new Error('private authentication configuration missing');
        return authorized ? { role: 'super_admin' } : null;
      },
    },
    '@/lib/language-atlas/server': {
      getAtlasIndex: async () => {
        calls.push('index');
        if (fail) throw new Error('/private/sensitive/path: corrupt snapshot');
        return largeIndex
          ? { schemaVersion: 1, records: [{ id: 'iso:eng' }], notes: ['x'.repeat(4_700_000)] }
          : { schemaVersion: 1, records: [{ id: 'iso:eng' }] };
      },
      getAtlasDetail: async (id: string) => {
        calls.push(`detail:${id}`);
        if (fail) throw new Error('/private/sensitive/path: corrupt snapshot');
        return id === 'iso:eng' ? { id, biography: 'English language record.' } : null;
      },
    },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    ReadableStream,
    TextEncoder,
  });
  return { route: exports as Route, calls };
}

for (const detail of [false, true]) {
  const args = detail
    ? [new Request('https://admin.example/api/language-atlas/iso%3Aeng'), { params: Promise.resolve({ id: 'iso:eng' }) }]
    : [];

  test(`${detail ? 'detail' : 'index'} denies non-admin access before loading a snapshot`, async () => {
    const { route, calls } = loadRoute(detail, false);
    const response = await route.GET(...args);
    assert.equal(response.status, 401);
    assert.deepEqual(calls, ['auth']);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  });

  test(`${detail ? 'detail' : 'index'} returns data only after admin authentication`, async () => {
    const { route, calls } = loadRoute(detail, true);
    const response = await route.GET(...args);
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['auth', detail ? 'detail:iso:eng' : 'index']);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
    const body = await response.json();
    assert.equal(detail ? body.id : body.records[0].id, 'iso:eng');
  });

  test(`${detail ? 'detail' : 'index'} gives a retryable error without exposing server paths`, async () => {
    const { route } = loadRoute(detail, true, true);
    const response = await route.GET(...args);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /sensitive|private\/|corrupt snapshot/);
    assert.match(body, /unavailable/i);
  });

  test(`${detail ? 'detail' : 'index'} keeps authentication service failures private`, async () => {
    const { route, calls } = loadRoute(detail, false, false, true);
    const response = await route.GET(...args);
    assert.equal(response.status, 503);
    assert.deepEqual(calls, ['auth']);
    assert.doesNotMatch(await response.text(), /private|configuration/);
  });
}

test('unknown record IDs produce a JSON 404', async () => {
  const { route } = loadRoute(true, true);
  const response = await route.GET(new Request('https://admin.example'), {
    params: Promise.resolve({ id: 'iso:missing' }),
  });
  assert.equal(response.status, 404);
});

test('the complete index stays streamable above Vercel’s 4.5 MB response limit', async () => {
  const { route } = loadRoute(false, true, false, false, true);
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.ok(response.body, 'index response should use a streaming body');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const payload = await response.arrayBuffer();
  assert.ok(payload.byteLength > 4_500_000);
});
