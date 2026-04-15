import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  resolveSmartDownloadTarget,
} from './site-links.ts';

test('resolveSmartDownloadTarget sends Android devices to Google Play', () => {
  const target = resolveSmartDownloadTarget(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36'
  );

  assert.equal(target, EVERYBIBLE_GOOGLE_PLAY_URL);
});

test('resolveSmartDownloadTarget sends iPhone devices to the App Store', () => {
  const target = resolveSmartDownloadTarget(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
  );

  assert.equal(target, EVERYBIBLE_APP_STORE_URL);
});

test('resolveSmartDownloadTarget sends desktop browsers back to the website download section', () => {
  const target = resolveSmartDownloadTarget(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/123.0 Safari/537.36'
  );

  assert.equal(target, 'https://everybible.app/#download');
});
