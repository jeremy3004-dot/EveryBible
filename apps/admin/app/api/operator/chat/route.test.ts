/**
 * The admin operator chat route, loaded through the real module loader with the admin
 * session and the Gemini call replaced. The operator only runs with a Gemini key, so a
 * missing key must be reported, never papered over with another provider.
 */
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';

import { mockModule, mockNextServerRuntime } from '../../../../lib/testing/adminTestHarness';

const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let identity: { id: string; email: string; name: string; role: string } | null = null;
const chats: Array<{ apiKey: string; messages: unknown }> = [];

mockNextServerRuntime(mock);
mockModule(mock, '@/lib/admin-auth', { getAdminIdentity: async () => identity });
mockModule(mock, '@/lib/operator-tools', {
  OPERATOR_TOOL_DECLARATIONS: [],
  OPERATOR_TOOL_EXECUTORS: {},
});

const { GET, POST } = await import('./route');

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  identity = { id: 'admin-1', email: 'ops@everybible.app', name: 'Ops', role: 'super_admin' };
  chats.length = 0;
  mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { contents: unknown };
    chats.push({ apiKey: String(_url).split('key=')[1] ?? '', messages: body.contents });
    return Response.json({ candidates: [{ content: { parts: [{ text: 'All healthy.' }] } }] });
  });
});

afterEach(() => {
  mock.restoreAll();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

const ask = (messages: unknown) =>
  POST(
    new Request('https://admin.example/api/operator/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    })
  );

test('without a Gemini key the route reports it and refuses to chat, even with an OpenAI key', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai';

  const status = await (await GET()).json();
  assert.deepEqual(status, {
    available: false,
    model: 'gemini-2.5-flash',
    reason: 'missing_gemini_api_key',
  });

  const response = await ask([{ role: 'user', content: 'Is everything healthy?' }]);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'missing_gemini_api_key');
  assert.deepEqual(chats, []);
});

test('with GEMINI_API_KEY the route is available and answers through Gemini', async () => {
  process.env.GEMINI_API_KEY = 'gemini-key';

  assert.equal((await (await GET()).json()).available, true);
  const response = await ask([{ role: 'user', content: 'Is everything healthy?' }]);

  assert.equal(response.status, 200);
  assert.equal(chats.length, 1);
  assert.equal(chats[0].apiKey, 'gemini-key');
});

test('the route is closed to anyone without an admin session', async () => {
  identity = null;
  process.env.GEMINI_API_KEY = 'gemini-key';

  assert.equal((await GET()).status, 401);
  assert.equal((await ask([{ role: 'user', content: 'hi' }])).status, 401);
  assert.deepEqual(chats, []);
});
