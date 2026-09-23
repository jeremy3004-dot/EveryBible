import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { GET } from './route';

// The route and the real upstream feed run; only the eBible CSV fetch is faked.
const CSV = [
  '"languageCode","translationId","languageNameInEnglish","Redistributable","Copyright","OTbooks","NTbooks","downloadable","shortTitle"',
  '"eng","eng-asv","English","True","","39","27","True","American Standard Version"',
].join('\n');

const originalKey = process.env.EVERYBIBLE_UPSTREAM_API_KEY;
let fetchCount = 0;
let respond: () => Response = () => new Response(CSV);

test.beforeEach(() => {
  process.env.EVERYBIBLE_UPSTREAM_API_KEY = ' upstream-secret ';
  fetchCount = 0;
  respond = () => new Response(CSV);
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-24T12:00:00.000Z') });
  mock.method(globalThis, 'fetch', async () => {
    fetchCount += 1;
    return respond();
  });
});

test.afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

test.after(() => {
  if (originalKey === undefined) delete process.env.EVERYBIBLE_UPSTREAM_API_KEY;
  else process.env.EVERYBIBLE_UPSTREAM_API_KEY = originalKey;
});

const request = (headers: Record<string, string> = {}) =>
  new Request('https://everybible.app/api/admin/translations', { headers });

test('a matching bearer token returns the uncached translation feed', async () => {
  const response = await GET(request({ authorization: 'Bearer upstream-secret' }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  const body = (await response.json()) as {
    generatedAt: string;
    translations: { translationId: string; isAvailable: boolean }[];
  };
  assert.equal(body.generatedAt, '2026-09-24T12:00:00.000Z');
  assert.deepEqual(
    body.translations.map(({ translationId, isAvailable }) => [translationId, isAvailable]),
    [['eng-asv', true]]
  );
});

test('a matching x-api-key header is accepted as an alternative to a bearer token', async () => {
  const response = await GET(request({ 'x-api-key': 'upstream-secret' }));

  assert.equal(response.status, 200);
});

test('missing, wrong, or non-bearer credentials are rejected before any upstream fetch', async () => {
  const rejected: Record<string, string>[] = [
    {},
    { authorization: 'Bearer wrong' },
    { authorization: 'upstream-secret' },
    { authorization: 'Basic upstream-secret' },
    { 'x-api-key': 'wrong' },
    { 'x-api-key': 'upstream-secret-extra' },
  ];
  for (const headers of rejected) {
    const response = await GET(request(headers));
    assert.equal(response.status, 401, JSON.stringify(headers));
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
  assert.equal(fetchCount, 0);
});

test('every request is rejected when no API key is configured', async () => {
  for (const configured of [undefined, '', '   ']) {
    if (configured === undefined) delete process.env.EVERYBIBLE_UPSTREAM_API_KEY;
    else process.env.EVERYBIBLE_UPSTREAM_API_KEY = configured;

    const blank: Record<string, string>[] = [{}, { authorization: 'Bearer ' }, { 'x-api-key': '' }];
    for (const headers of blank) {
      const response = await GET(request(headers));
      assert.equal(response.status, 401);
    }
  }
  assert.equal(fetchCount, 0);
});

test('an upstream failure is returned as a 500 with its message', async () => {
  respond = () => new Response('down', { status: 502 });

  const response = await GET(request({ authorization: 'Bearer upstream-secret' }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to load eBible translation feed (502)',
  });
});
