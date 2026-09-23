import assert from 'node:assert/strict';
import test from 'node:test';

import { GET, HEAD } from './[...assetPath]/route';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('GET redirects a valid asset path to the R2 custom domain', async () => {
  const response = await GET(new Request('https://everybible.app/api/media/audio/test.mp3'), {
    params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://media.everybible.app/audio/test.mp3');
  assert.equal(response.body, null);
});

test('GET preserves nested text-pack keys in the redirect target', async () => {
  const response = await GET(
    new Request('https://everybible.app/api/media/text/engbsb/engbsb-2026.03.24-v1.db'),
    {
      params: Promise.resolve({
        assetPath: ['text', 'engbsb', 'engbsb-2026.03.24-v1.db'],
      }),
    }
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get('location'),
    'https://media.everybible.app/text/engbsb/engbsb-2026.03.24-v1.db'
  );
});

test('HEAD redirects a valid asset path to the R2 custom domain', async () => {
  const response = await HEAD(
    new Request('https://everybible.app/api/media/audio/test.mp3', { method: 'HEAD' }),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://media.everybible.app/audio/test.mp3');
  assert.equal(response.body, null);
});

test('redirect base URL can be overridden via BIBLE_MEDIA_CDN_BASE_URL', async () => {
  process.env.BIBLE_MEDIA_CDN_BASE_URL = 'https://cdn.example.test/';

  const response = await GET(new Request('https://everybible.app/api/media/audio/test.mp3'), {
    params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://cdn.example.test/audio/test.mp3');
});

test('GET returns 404 for an unsafe asset path', async () => {
  const response = await GET(new Request('https://everybible.app/api/media/'), {
    params: Promise.resolve({ assetPath: ['..'] }),
  });

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
});

test('GET returns 404 when a decoded %2F hides traversal inside one segment', async () => {
  const response = await GET(
    new Request('https://everybible.app/api/media/audio/..%2F..%2Fsecret.mp3'),
    { params: Promise.resolve({ assetPath: ['audio', '../../secret.mp3'] }) }
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
});

test('GET percent-encodes decoded key segments so non-ASCII and reserved characters redirect', async () => {
  // Route params arrive decoded; a raw non-Latin-1 character cannot be placed
  // in a header, and a raw '?' or '#' would truncate the object key.
  const response = await GET(
    new Request('https://everybible.app/api/media/audio/%E0%A4%A8%E0%A5%87/a%20b%3F.mp3'),
    { params: Promise.resolve({ assetPath: ['audio', 'ने', 'a b?.mp3'] }) }
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get('location'),
    'https://media.everybible.app/audio/%E0%A4%A8%E0%A5%87/a%20b%3F.mp3'
  );
});

test('redirects are cacheable at the edge', async () => {
  const response = await GET(new Request('https://everybible.app/api/media/audio/test.mp3'), {
    params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }),
  });

  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
  );
});

test('GET returns 404 when the catch-all has no segments', async () => {
  const response = await HEAD(new Request('https://everybible.app/api/media', { method: 'HEAD' }), {
    params: Promise.resolve({}),
  });

  assert.equal(response.status, 404);
});
