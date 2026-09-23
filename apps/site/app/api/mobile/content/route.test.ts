import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { GET } from './route';

// The route builds a real supabase-js client; only the network is faked, so
// the RPC URL, service-role headers and error mapping are all exercised.
const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
}

let requests: RecordedRequest[] = [];
let respond: () => Response = () => Response.json(null);

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  requests = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method, headers: request.headers });
    return respond();
  });
});

test.afterEach(() => {
  mock.restoreAll();
});

test.after(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

const payload = {
  generatedAt: '2026-09-24T00:00:00.000Z',
  verseOfDay: {
    id: 'votd-1',
    title: null,
    verseText: 'Be still, and know that I am God.',
    referenceLabel: 'Psalm 46:10',
    translationId: 'bsb',
    imageUrl: null,
    startsAt: null,
    endsAt: null,
  },
  images: [],
};

test('GET returns the live mobile content payload uncached', async () => {
  respond = () => Response.json(payload);

  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(await response.json(), payload);
});

test('GET calls the get_live_mobile_content RPC with the service-role key', async () => {
  respond = () => Response.json(payload);

  await GET();

  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://project.supabase.test/rest/v1/rpc/get_live_mobile_content');
  assert.equal(request.headers.get('apikey'), 'service-role');
  assert.equal(request.headers.get('authorization'), 'Bearer service-role');
});

test('GET returns 500 with the RPC error message when Supabase fails', async () => {
  respond = () => Response.json({ message: 'permission denied', code: '42501' }, { status: 403 });

  const response = await GET();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to load shared mobile content: permission denied',
  });
});

test('GET returns 500 when the contract returns no payload', async () => {
  respond = () => Response.json(null);

  const response = await GET();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Shared mobile content contract returned no payload',
  });
});

test('GET returns 500 without a network call when the server env is missing', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await GET();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Site server env is missing required environment variables: SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.equal(requests.length, 0);
});
