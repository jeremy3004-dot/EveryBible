import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBibleMediaUrl, resolveBibleMediaObjectKey } from './bible-media';

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
