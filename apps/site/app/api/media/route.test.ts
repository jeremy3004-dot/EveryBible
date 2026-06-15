import assert from 'node:assert/strict';
import test from 'node:test';

import { GET, HEAD } from './[...assetPath]/route';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('GET redirects a valid asset path to the R2 custom domain', async () => {
  const response = await GET(
    new Request('https://everybible.app/api/media/audio/test.mp3'),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

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

  const response = await GET(
    new Request('https://everybible.app/api/media/audio/test.mp3'),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

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
