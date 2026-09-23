import assert from 'node:assert/strict';
import test from 'node:test';

import { S3Client } from '@aws-sdk/client-s3';

import {
  buildBibleMediaUrl,
  getBibleMediaClient,
  getBibleMediaEnv,
  getBibleMediaPublicBaseUrl,
  resolveBibleMediaObjectKey,
} from './bible-media';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

test.afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

test('resolveBibleMediaObjectKey joins valid asset path segments', () => {
  assert.equal(
    resolveBibleMediaObjectKey(['audio', 'npiulb', 'ACT', '1.mp3']),
    'audio/npiulb/ACT/1.mp3'
  );
});

test('resolveBibleMediaObjectKey splits a string path and drops blank and padded segments', () => {
  assert.equal(resolveBibleMediaObjectKey('/text//kjv/ kjv.db /'), 'text/kjv/kjv.db');
  assert.equal(resolveBibleMediaObjectKey(['audio', ' ', 'web', '']), 'audio/web');
});

test('resolveBibleMediaObjectKey rejects empty paths', () => {
  assert.equal(resolveBibleMediaObjectKey([]), null);
  assert.equal(resolveBibleMediaObjectKey(''), null);
  assert.equal(resolveBibleMediaObjectKey(['  ', '']), null);
});

test('resolveBibleMediaObjectKey rejects traversal attempts', () => {
  assert.equal(resolveBibleMediaObjectKey('../secrets.txt'), null);
  assert.equal(resolveBibleMediaObjectKey(['audio', '..', 'secret.mp3']), null);
  assert.equal(resolveBibleMediaObjectKey(['audio', '.', 'secret.mp3']), null);
  assert.equal(resolveBibleMediaObjectKey(['audio', '..\\secret.mp3']), null);
});

test('resolveBibleMediaObjectKey rejects traversal hidden inside a segment that contains a slash', () => {
  // A catch-all route segment can carry a decoded %2F, so one array entry may
  // itself be a multi-segment path.
  assert.equal(resolveBibleMediaObjectKey(['audio/../secret.mp3']), null);
  assert.equal(resolveBibleMediaObjectKey(['audio', 'web/../../secret.mp3']), null);
  assert.equal(resolveBibleMediaObjectKey(['text', 'kjv/kjv.db']), 'text/kjv/kjv.db');
});

test('buildBibleMediaUrl returns a stable public EveryBible media url', () => {
  assert.equal(
    buildBibleMediaUrl(['timing', 'web', 'GEN_001.json'], 'https://everybible.app/'),
    'https://everybible.app/api/media/timing/web/GEN_001.json'
  );
});

test('buildBibleMediaUrl throws for an unsafe asset path instead of building a url', () => {
  assert.throws(
    () => buildBibleMediaUrl('../secret', 'https://everybible.app'),
    /Invalid Bible media asset path/
  );
});

test('getBibleMediaPublicBaseUrl falls back to the production site and strips trailing slashes', () => {
  assert.equal(getBibleMediaPublicBaseUrl('  '), 'https://everybible.app/api/media');
  assert.equal(
    getBibleMediaPublicBaseUrl(' https://preview.example.test/// '),
    'https://preview.example.test/api/media'
  );
});

test('media urls default to NEXT_PUBLIC_SITE_URL when no site url is passed', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.everybible.test/';
  assert.equal(
    buildBibleMediaUrl('text/bsb/bible-bsb-v2.db'),
    'https://staging.everybible.test/api/media/text/bsb/bible-bsb-v2.db'
  );
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(getBibleMediaPublicBaseUrl(), 'https://everybible.app/api/media');
});

test('getBibleMediaEnv trims every R2 setting', () => {
  assert.deepEqual(
    getBibleMediaEnv({
      R2_ACCESS_KEY_ID: ' key ',
      R2_BUCKET: ' bucket\n',
      R2_ENDPOINT: ' https://r2.example.test ',
      R2_SECRET_ACCESS_KEY: '\tsecret ',
    }),
    {
      accessKeyId: 'key',
      bucket: 'bucket',
      endpoint: 'https://r2.example.test',
      secretAccessKey: 'secret',
    }
  );
});

test('getBibleMediaEnv names every missing or blank R2 setting', () => {
  assert.throws(() => getBibleMediaEnv({ R2_ACCESS_KEY_ID: 'key', R2_BUCKET: '   ' }), {
    message:
      'Bible media env is missing required environment variables: R2_BUCKET, R2_ENDPOINT, R2_SECRET_ACCESS_KEY',
  });
});

test('getBibleMediaClient reuses one S3 client per configuration', async () => {
  const env = {
    accessKeyId: 'key',
    bucket: 'bucket',
    endpoint: 'https://r2.example.test',
    secretAccessKey: 'secret',
  };
  const first = getBibleMediaClient(env);
  assert.ok(first instanceof S3Client);
  assert.equal(getBibleMediaClient({ ...env }), first);
  assert.equal(await first.config.region(), 'auto');
  assert.equal(first.config.forcePathStyle, true);

  const rotated = getBibleMediaClient({ ...env, secretAccessKey: 'rotated' });
  assert.notEqual(rotated, first);
  const credentials = await rotated.config.credentials();
  assert.equal(credentials.accessKeyId, 'key');
  assert.equal(credentials.secretAccessKey, 'rotated');
});
