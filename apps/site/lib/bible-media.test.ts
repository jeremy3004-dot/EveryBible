import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBibleMediaUrl,
  resolveLegacyBibleMediaUrl,
  resolveBibleMediaObjectKey,
} from './bible-media';

test('resolveBibleMediaObjectKey joins valid asset path segments', () => {
  assert.equal(
    resolveBibleMediaObjectKey(['audio', 'npiulb', 'ACT', '1.mp3']),
    'audio/npiulb/ACT/1.mp3'
  );
});

test('resolveBibleMediaObjectKey rejects traversal attempts', () => {
  assert.equal(resolveBibleMediaObjectKey('../secrets.txt'), null);
  assert.equal(resolveBibleMediaObjectKey(['audio', '..', 'secret.mp3']), null);
});

test('buildBibleMediaUrl returns a stable public EveryBible media url', () => {
  assert.equal(
    buildBibleMediaUrl(['timing', 'web', 'GEN_001.json'], 'https://everybible.app/'),
    'https://everybible.app/api/media/timing/web/GEN_001.json'
  );
});

test('resolveLegacyBibleMediaUrl maps BSB audio to the legacy Supabase public bucket', () => {
  assert.equal(
    resolveLegacyBibleMediaUrl(
      'audio/bsb/GEN/1.m4a',
      'https://ganmududzdzpruvdulkg.supabase.co'
    ),
    'https://ganmududzdzpruvdulkg.supabase.co/storage/v1/object/public/bible-audio/bsb/GEN/1.m4a'
  );
});
