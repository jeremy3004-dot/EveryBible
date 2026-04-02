import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPublicRuntimeConfig } from '../startup/publicRuntimeConfig';
import { resolveBibleAssetUrl } from './bibleAssetBaseUrl';

test('buildPublicRuntimeConfig reads the optional Bible asset base URL', () => {
  const config = buildPublicRuntimeConfig({
    env: {
      EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: ' https://cdn.everybible.app ',
    },
  });

  assert.equal(config.EXPO_PUBLIC_BIBLE_ASSET_BASE_URL, 'https://cdn.everybible.app');
});

test('resolveBibleAssetUrl keeps absolute URLs unchanged', () => {
  assert.equal(
    resolveBibleAssetUrl('https://pub.example.com/text/engwebp.sqlite', 'https://cdn.everybible.app'),
    'https://pub.example.com/text/engwebp.sqlite'
  );
});

test('resolveBibleAssetUrl resolves relative Bible pack paths against the configured asset base', () => {
  assert.equal(
    resolveBibleAssetUrl('/text/engwebp.sqlite', 'https://cdn.everybible.app/'),
    'https://cdn.everybible.app/text/engwebp.sqlite'
  );
});
